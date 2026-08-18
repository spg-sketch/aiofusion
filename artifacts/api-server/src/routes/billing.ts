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
  createProjectCheckoutSession,
  createPortalSession,
  listCustomerInvoices,
  getProjectAddons,
  listBillingProjects,
  changeAddonTier,
  isEntitled,
} from "../lib/billing";
import {
  PLAN_PRICES,
  PROJECT_TIER_PRICES,
  TIER_ACTION_LIMITS,
  INCLUDED_PROJECTS,
  isBillingFrequency,
  isProjectTier,
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
    const entitled = isEntitled(state);
    const [addons, projects] = await Promise.all([
      getProjectAddons(ctx.slug),
      listBillingProjects(ctx.slug),
    ]);
    const included = state?.plan ? INCLUDED_PROJECTS[state.plan] : INCLUDED_PROJECTS[ctx.plan];
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: state?.status ?? "none",
      plan: state?.plan ?? null,
      frequency: state?.frequency ?? null,
      currentPeriodEnd: state?.currentPeriodEnd ?? null,
      entitled,
      applicablePlan: ctx.plan,
      includedProjects: included,
      projectAllowance: entitled ? included + addons.length : null,
      projectsUsed: projects.length,
      portalAvailable: stripeConfigured() && !!state?.stripeCustomerId,
      checkoutAvailable: stripeConfigured(),
      projects: projects.map((p) => {
        const addon = addons.find((a) => a.projectId === p.id);
        return {
          id: p.id,
          name: p.name,
          tier: p.tier,
          isAddon: !!addon,
          addonSubscriptionId: addon?.subscriptionId ?? null,
          pendingTier: addon?.pendingTier ?? null,
        };
      }),
      unassignedAddons: addons
        .filter((a) => !a.projectId)
        .map((a) => ({ tier: a.tier, purchasedAt: a.purchasedAt })),
      tierPrices: Object.fromEntries(
        Object.entries(PROJECT_TIER_PRICES).map(([tier, p]) => [
          tier,
          { yearlyTotal: p.yearlyTotal, actionsPerMonth: TIER_ACTION_LIMITS[tier as keyof typeof TIER_ACTION_LIMITS] },
        ]),
      ),
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

// --- Customer Portal (payment method updates, cancellation) -----------------

router.post("/platform/billing/portal", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;
    const state = await getBillingState(ctx.slug);
    if (!state?.stripeCustomerId) {
      res.status(409).json({ error: "There's no billing account to manage yet - subscribe first." });
      return;
    }
    const base = getAppBaseUrl();
    const { url } = await createPortalSession(ctx.slug, `${base}/?account_section=billing`);
    res.json({ url });
  } catch (err) {
    logger.error({ err }, "billing: failed to create portal session");
    res.status(500).json({ error: "Could not open the billing portal. Please try again." });
  }
});

// --- Past invoices -----------------------------------------------------------

router.get("/platform/billing/invoices", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;
    const invoices = await listCustomerInvoices(ctx.slug);
    res.setHeader("Cache-Control", "no-store");
    res.json({ invoices });
  } catch (err) {
    logger.error({ err }, "billing: failed to list invoices");
    res.status(500).json({ error: "Could not load invoices." });
  }
});

// --- Add-a-project checkout ---------------------------------------------------

router.post("/platform/billing/project-checkout", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;

    const tier = req.body?.tier;
    if (!isProjectTier(tier)) {
      res.status(400).json({ error: "Choose a project tier: standard, premium or max." });
      return;
    }
    const state = await getBillingState(ctx.slug);
    if (!isEntitled(state)) {
      res.status(409).json({ error: "You need an active subscription before adding projects." });
      return;
    }

    // Optional: attach the add-on to an existing project (used to upgrade an
    // included project). The project must belong to this account's billing
    // subtree and must not already carry an add-on.
    let projectId: string | null = null;
    if (req.body?.projectId != null) {
      if (typeof req.body.projectId !== "string" || !req.body.projectId.trim()) {
        res.status(400).json({ error: "Invalid project." });
        return;
      }
      projectId = req.body.projectId.trim();
      const projects = await listBillingProjects(ctx.slug);
      const target = projects.find((p) => p.id === projectId);
      if (!target) {
        res.status(400).json({ error: "That project doesn't belong to this account." });
        return;
      }
      const addons = await getProjectAddons(ctx.slug);
      if (addons.some((a) => a.projectId === projectId)) {
        res.status(409).json({ error: "That project already has a purchased tier - change its tier instead." });
        return;
      }
    }

    const base = getAppBaseUrl();
    const { url } = await createProjectCheckoutSession({
      slug: ctx.slug,
      tier,
      projectId,
      successUrl: `${base}/?account_section=billing&checkout=success`,
      cancelUrl: `${base}/?account_section=billing&checkout=cancelled`,
    });
    res.json({ url });
  } catch (err) {
    logger.error({ err }, "billing: failed to create project checkout session");
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
});

// --- Change an add-on project's tier -------------------------------------------

router.post("/platform/billing/project-tier", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;

    const tier = req.body?.tier;
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
    if (!isProjectTier(tier) || !projectId) {
      res.status(400).json({ error: "Choose a project and a tier." });
      return;
    }
    const addons = await getProjectAddons(ctx.slug);
    const addon = addons.find((a) => a.projectId === projectId);
    if (!addon) {
      res.status(400).json({
        error: "Only projects with a purchased tier can be changed here. To upgrade an included project, add a new project tier to it instead.",
      });
      return;
    }
    if (addon.tier === tier && !addon.pendingTier) {
      res.status(409).json({ error: "That project is already on this tier." });
      return;
    }
    const result = await changeAddonTier({ slug: ctx.slug, subscriptionId: addon.subscriptionId, newTier: tier });
    res.json({
      ok: true,
      applied: result.applied,
      message:
        result.applied === "now"
          ? "Tier upgraded - the higher monthly action allowance applies immediately. The prorated difference has been charged to your card."
          : "Tier change scheduled - the lower price and allowance apply from your next renewal.",
    });
  } catch (err) {
    logger.error({ err }, "billing: failed to change project tier");
    res.status(500).json({ error: "Could not change the project tier. Please try again." });
  }
});

export default router;
