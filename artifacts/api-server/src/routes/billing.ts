import { Router, type IRouter, type Request, type Response } from "express";
import { requirePlatformAuth } from "../middleware/platform-auth";
import {
  normUsername,
  getAccount,
  normalizeRole,
} from "../lib/platform-auth";
import {
  getBillingState,
  createCheckoutSession,
  isEntitled,
} from "../lib/billing";
import {
  PLAN_PRICES,
  INCLUDED_PROJECTS,
  isBillingFrequency,
  type PlanKey,
} from "../lib/billing-plans";
import { getAppBaseUrl } from "../lib/notify-email";
import { stripeConfigured } from "../lib/stripe-client";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Server-side billing access rules (mirrors the billing-details card, but
// enforced here - UI hiding is never enough):
//  - agency-managed partner clients can NEVER reach billing (the agency pays);
//  - members must be owner/admin/billing (undefined = legacy full session);
//  - master admin accounts do not subscribe.
function memberMayBill(req: Request): boolean {
  const r = req.account?.membershipRole;
  return r === undefined || r === "owner" || r === "admin" || r === "billing";
}

async function resolveBillingContext(req: Request, res: Response): Promise<{
  slug: string;
  plan: PlanKey;
} | null> {
  if (!memberMayBill(req)) {
    res.status(403).json({ error: "You do not have access to billing." });
    return null;
  }
  const slug = normUsername(req.account!.username);
  const acc = await getAccount(slug);
  if (!acc) {
    res.status(404).json({ error: "Account not found." });
    return null;
  }
  const role = normalizeRole(acc.role);
  if (role === "admin") {
    res.status(403).json({ error: "Admin accounts do not have a subscription." });
    return null;
  }
  // Agency-managed partner client: parent is an agency - billing is the
  // agency's, full stop.
  if (acc.parent) {
    const parent = await getAccount(normUsername(acc.parent));
    if (parent && normalizeRole(parent.role) === "agency") {
      res.status(403).json({ error: "Billing for this account is managed by your agency." });
      return null;
    }
  }
  return { slug, plan: role === "agency" ? "agency" : "inhouse" };
}

// --- Subscription state + plan catalogue (for the billing UI) ---------------

router.get("/platform/billing/subscription", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;
    const state = await getBillingState(ctx.slug);
    const prices = PLAN_PRICES[ctx.plan];
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: state?.status ?? "none",
      plan: state?.plan ?? null,
      frequency: state?.frequency ?? null,
      currentPeriodEnd: state?.currentPeriodEnd ?? null,
      entitled: isEntitled(state),
      applicablePlan: ctx.plan,
      includedProjects: INCLUDED_PROJECTS[ctx.plan],
      checkoutAvailable: stripeConfigured(),
      prices: {
        annual: { yearlyTotal: prices.annual.yearlyTotal },
        quarterly: {
          perQuarter: prices.quarterly.unitAmount,
          yearlyTotal: prices.quarterly.yearlyTotal,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, "billing: failed to load subscription state");
    res.status(500).json({ error: "Could not load subscription details." });
  }
});

// --- Start Stripe Checkout ---------------------------------------------------

router.post("/platform/billing/checkout", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;

    const frequency = req.body?.frequency;
    if (!isBillingFrequency(frequency)) {
      res.status(400).json({ error: "Choose annual or quarterly billing." });
      return;
    }

    const state = await getBillingState(ctx.slug);
    if (isEntitled(state)) {
      res.status(409).json({ error: "This account already has an active subscription." });
      return;
    }

    const base = getAppBaseUrl();
    const { url } = await createCheckoutSession({
      slug: ctx.slug,
      plan: ctx.plan,
      frequency,
      successUrl: `${base}/?account_section=billing&checkout=success`,
      cancelUrl: `${base}/?account_section=billing&checkout=cancelled`,
    });
    res.json({ url });
  } catch (err) {
    logger.error({ err }, "billing: failed to create checkout session");
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
});

export default router;
