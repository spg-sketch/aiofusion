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
  finalizeCheckoutClaim,
  createProjectCheckoutSession,
  createPortalSession,
  listCustomerInvoices,
  getLatestInvoiceLink,
  getProjectAddons,
  listBillingProjects,
  changeAddonTier,
  isEntitled,
  hasPaidSubscription,
  withBillingLock,
  claimCheckout,
  releaseCheckout,
  getCheckoutErrorResponse,
  isLiveStripeMode,
  getBetaTrialSummary,
  startBetaTrial,
  BETA_TRIAL_PROJECT_CAP,
  checkoutClaimMatchesSession,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
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
import { stripeConfigured, getUncachableStripeClient } from "../lib/stripe-client";
import { logger } from "../lib/logger";
import { getCompanyBillingRecord } from "../lib/company-billing-record";

const router: IRouter = Router();

function isMissingStripeResource(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "resource_missing"
  );
}

function sendCheckoutError(res: Response, err: unknown): void {
  const known = getCheckoutErrorResponse(err);
  if (known) {
    res.status(known.status).json({ error: known.error, code: known.code });
    return;
  }
  res.status(500).json({ error: "Could not start checkout. Please try again." });
}
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
    const trial = getBetaTrialSummary(state);
    const [addons, projects, latestInvoice, companyRecord] = await Promise.all([
      getProjectAddons(ctx.slug),
      listBillingProjects(ctx.slug),
      getLatestInvoiceLink(ctx.slug),
      getCompanyBillingRecord(ctx.slug),
    ]);
    const included = state?.plan ? INCLUDED_PROJECTS[state.plan] : INCLUDED_PROJECTS[ctx.plan];
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: state?.status ?? "none",
      plan: state?.plan ?? null,
      frequency: state?.frequency ?? null,
      currentPeriodEnd: state?.currentPeriodEnd ?? null,
      entitled,
      trial: {
        ...trial,
        startedAt: trial.startedAt?.toISOString() ?? null,
        endsAt: trial.endsAt?.toISOString() ?? null,
      },
      applicablePlan: ctx.plan,
      includedProjects: included,
      // Always expose the effective allowance used by the server-side project
      // creation guard. Unsubscribed beta accounts retain the legacy cap.
      projectAllowance: trial.status === "active"
        ? BETA_TRIAL_PROJECT_CAP
        : entitled ? included + addons.length : 0,
      projectsUsed: projects.length,
      latestInvoiceUrl: latestInvoice,
      portalAvailable: stripeConfigured() && !!state?.stripeCustomerId,
      checkoutAvailable: stripeConfigured(),
      companyRecordComplete: companyRecord?.complete ?? false,
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

router.post("/platform/billing/trial", requirePlatformAuth, async (req, res) => {
  try {
    const membershipRole = req.account?.membershipRole;
    if (membershipRole && membershipRole !== "owner" && membershipRole !== "billing") {
      res.status(403).json({ error: "Only the account owner or billing contact can start the beta trial." });
      return;
    }
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;
    const state = await startBetaTrial(ctx.slug, ctx.plan);
    if (!state) {
      res.status(409).json({ error: "This account is not eligible for a new beta trial." });
      return;
    }
    const trial = getBetaTrialSummary(state);
    res.status(201).json({
      trial: {
        ...trial,
        startedAt: trial.startedAt?.toISOString() ?? null,
        endsAt: trial.endsAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "billing: failed to start beta trial");
    res.status(500).json({ error: "Could not start the beta trial. Please try again." });
  }
});

// --- Start Stripe Checkout ---------------------------------------------------

router.post("/platform/billing/checkout", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;

    const frequency = req.body?.frequency;
    const onboarding = req.body?.onboarding === true;
    if (!isBillingFrequency(frequency)) {
      res.status(400).json({ error: "Choose annual or quarterly billing." });
      return;
    }
    const companyRecord = await getCompanyBillingRecord(ctx.slug);
    if (!companyRecord?.complete) {
      res.status(409).json({
        error: "Complete and save your company and billing information before continuing to payment.",
        code: "COMPANY_RECORD_INCOMPLETE",
      });
      return;
    }

    // Serialise within this process AND guard against cross-process races with
    // a durable DB claim. This prevents two simultaneous checkout sessions
    // creating duplicate subscriptions for the same account.
    //
    // The in-process billing lock (withBillingLock) prevents same-process
    // races. claimCheckout inserts a row in platform_meta so that a second
    // server process racing at the same moment is turned away too.
    //
    // The claim is NOT released after the URL is returned - it is held open
    // until the webhook (checkout.session.completed) releases it via the
    // claim token stored in the Stripe session metadata. This ensures no
    // second process can race in while the session tab is still active.
    // If session creation fails the claim is released immediately so the
    // user can retry.
    let billingSlug: string;
    let claimToken: string;
    try {
      const lockResult = await withBillingLock(ctx.slug, async (bs) => {
        const state = await getBillingState(bs);
        if (hasPaidSubscription(state)) return { entitled: true, billingSlug: bs };
        let result = await claimCheckout(bs, frequency);
        if (
          !result.claimed &&
          result.existingUrl &&
          result.existingSessionId &&
          result.existingClaimToken
        ) {
          const existingSessionId = result.existingSessionId;
          const existingClaimToken = result.existingClaimToken;
          const existingUrl = result.existingUrl;
          const storedExistingFrequency = result.existingFrequency;
          const stripe = await getUncachableStripeClient();
          let existingSession;
          try {
            existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
          } catch (err) {
            // A sandbox checkout cannot be retrieved with the newly connected
            // live key. It can never take a real payment, so retire only that
            // specific test-mode claim and let the live checkout proceed.
            if (
              existingSessionId.startsWith("cs_test_") &&
              isMissingStripeResource(err) &&
              (await isLiveStripeMode())
            ) {
              logger.info(
                { slug: bs, sessionId: existingSessionId },
                "billing: replacing sandbox checkout claim after switching to live Stripe",
              );
              await releaseCheckout(bs, existingClaimToken);
              result = await claimCheckout(bs, frequency);
            } else {
              throw err;
            }
          }

          if (existingSession) {
            const metadataFrequency = existingSession.metadata?.["frequency"];
            const existingFrequency =
              storedExistingFrequency ??
              (isBillingFrequency(metadataFrequency) ? metadataFrequency : undefined);

            // The checkout.session.expired webhook normally clears this claim.
            // If that webhook is delayed or missed, never reuse the dead URL:
            // release the token we just verified and start a fresh checkout.
            if (existingSession.status === "expired") {
              await releaseCheckout(bs, existingClaimToken);
              result = await claimCheckout(bs, frequency);
            } else if (existingSession.status === "complete") {
              // Do not release a completed session before its completion webhook
              // has applied the entitlement. Holding the claim prevents a second
              // subscription from being opened during that short window.
              return { entitled: false, completedCheckout: true, billingSlug: bs };
            } else if (existingFrequency && existingFrequency !== frequency) {
              try {
                await stripe.checkout.sessions.expire(existingSessionId);
              } catch (err) {
                // Stripe may expire the session between our retrieve and expire
                // calls. Re-read once: expired is safe to replace, complete is
                // still protected, and any open/error state must remain locked.
                existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
                if (existingSession.status === "complete") {
                  return { entitled: false, completedCheckout: true, billingSlug: bs };
                }
                if (existingSession.status !== "expired") {
                  logger.warn(
                    {
                      err,
                      slug: bs,
                      sessionId: existingSessionId,
                      existingFrequency,
                      requestedFrequency: frequency,
                    },
                    "billing: could not replace open checkout after billing frequency changed",
                  );
                  return { entitled: false, switchFailed: true, billingSlug: bs };
                }
              }
              await releaseCheckout(bs, existingClaimToken);
              result = await claimCheckout(bs, frequency);
            } else if (existingFrequency && !storedExistingFrequency) {
              result = {
                claimed: false,
                existingUrl,
                existingSessionId,
                existingClaimToken,
                existingFrequency,
              };
            }
          }
        }
        return { entitled: false, claimResult: result, billingSlug: bs };
      });

      if (lockResult.entitled) {
        res.status(409).json({ error: "This account already has an active subscription." });
        return;
      }
      if ("switchFailed" in lockResult && lockResult.switchFailed) {
        res.status(409).json({
          error: "Your earlier checkout could not be replaced yet. Please wait a moment, refresh this page, and choose the billing option again.",
        });
        return;
      }
      if ("completedCheckout" in lockResult && lockResult.completedCheckout) {
        res.status(409).json({
          error: "Your earlier checkout has completed and is still being confirmed. Please refresh this page in a moment.",
        });
        return;
      }
      const claimResult = lockResult.claimResult!;
      if (!claimResult.claimed) {
        // Another process has an open checkout session. If it has already been
        // created, reuse its URL so the user lands on the same Stripe page
        // instead of seeing a generic error.
        if (claimResult.existingUrl && claimResult.existingFrequency === frequency) {
          res.json({ url: claimResult.existingUrl });
          return;
        }
        // Legacy claims may not carry frequency. If the Stripe metadata lookup
        // above found the same value, reuse is safe even though the DB row is old.
        if (claimResult.existingUrl && !claimResult.existingFrequency && claimResult.existingSessionId) {
          const stripe = await getUncachableStripeClient();
          const existingSession = await stripe.checkout.sessions.retrieve(claimResult.existingSessionId);
          if (existingSession.metadata?.["frequency"] === frequency) {
            res.json({ url: claimResult.existingUrl });
            return;
          }
        }
        res.status(409).json({ error: "A checkout is already in progress for this account. Please wait a moment and try again." });
        return;
      }
      billingSlug = lockResult.billingSlug;
      claimToken = claimResult.claimToken;
    } catch (err) {
      logger.error({ err }, "billing: failed to claim checkout slot");
      res.status(500).json({ error: "Could not start checkout. Please try again." });
      return;
    }

    let sessionId: string | undefined;
    try {
    const base = getAppBaseUrl();
      const session = await createCheckoutSession({
        slug: billingSlug,
        plan: ctx.plan,
        frequency,
        successUrl: onboarding
          ? `${base}/?checkout=success&onboarding=1&session_id={CHECKOUT_SESSION_ID}`
          : `${base}/?account_section=billing&checkout=success`,
        cancelUrl: onboarding
          ? `${base}/?checkout=cancelled&onboarding=1`
          : `${base}/?account_section=billing&checkout=cancelled`,
        claimToken,
      });
      const url = session.url;
      sessionId = session.sessionId;

      // Finalization is REQUIRED for the durable-claim safety to hold.
      // Without persisting the session id (and verifying the claim is still
      // ours), the claim remains a pre-session record that can be TTL-preempted,
      // allowing a second process to open another session while this one is still
      // open on Stripe.  finalizeCheckoutClaim throws if 0 rows were updated
      // (claim preempted between session creation and this write).
      await finalizeCheckoutClaim(billingSlug, claimToken, sessionId, url, frequency);

      res.json({ url });
      // Claim is now held until checkout.session.completed fires. Do NOT release here.
    } catch (err) {
      if (sessionId) {
        // A session was created but could not be finalized into the claim.
        // Expire the Stripe session so the URL cannot be used. Only release the
        // claim if expiry is confirmed - if expiry fails the session could still
        // complete, so the claim must stay locked until the webhook fires.
        let sessionExpired = false;
        try {
          const stripe = await getUncachableStripeClient();
          await stripe.checkout.sessions.expire(sessionId);
          sessionExpired = true;
        } catch (expErr) {
          logger.error(
            { expErr, slug: billingSlug, sessionId },
            "billing: could not expire session after finalization failure - claim left locked until webhook fires",
          );
        }
        if (sessionExpired) {
          await releaseCheckout(billingSlug, claimToken).catch((releaseErr) => {
            logger.warn({ releaseErr, slug: billingSlug }, "billing: could not release checkout claim after confirmed session expiry (non-fatal)");
          });
        }
      } else {
        // No session was ever created - safe to release the claim immediately.
        await releaseCheckout(billingSlug, claimToken).catch((releaseErr) => {
          logger.warn({ releaseErr, slug: billingSlug }, "billing: could not release checkout claim after pre-session error (non-fatal)");
        });
      }
      throw err;
    }
  } catch (err) {
    logger.error({ err }, "billing: failed to create checkout session");
    sendCheckoutError(res, err);
  }
});

router.post("/platform/billing/reconcile-checkout", requirePlatformAuth, async (req, res) => {
  try {
    const ctx = await resolveBillingContext(req, res);
    if (!ctx) return;
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId)) {
      res.status(400).json({ error: "The payment confirmation link is incomplete. Return to billing and try again." });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    const slug = normUsername(String(session.metadata?.["slug"] ?? session.client_reference_id ?? ""));
    const plan = session.metadata?.["plan"];
    const frequency = session.metadata?.["frequency"];
    const claimToken = session.metadata?.["claim_tok"] ?? "";
    const kind = session.metadata?.["kind"];
    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
    const current = await getBillingState(ctx.slug);
    const alreadyApplied = !!subscriptionId
      && current?.stripeSubscriptionId === subscriptionId
      && hasPaidSubscription(current);

    // Add-on checkouts do not have the main-plan claim token.  They are tied
    // to the already-paid account customer instead, and the response below is
    // only produced from the durable add-on record after fulfilment.  Never
    // use a projectId or tier supplied in the request body (or infer one from
    // the account's current plan).
    if (kind === "project-addon") {
      const sessionCustomerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      if (
        session.mode !== "subscription"
        || slug !== ctx.slug
        || !current
        || !hasPaidSubscription(current)
        || !current.stripeCustomerId
        || sessionCustomerId !== current.stripeCustomerId
      ) {
        logger.warn(
          { requestedSlug: ctx.slug, sessionId, sessionSlug: slug, sessionCustomerId },
          "billing: rejected mismatched project add-on checkout return",
        );
        res.status(403).json({ error: "This payment does not belong to the signed-in workspace." });
        return;
      }

      const tier = session.metadata?.["tier"];
      if (!isProjectTier(tier)) {
        // Do not fall back to the client request, current project tier, or
        // another metadata value when Stripe metadata is malformed.
        res.status(409).json({ error: "This project payment could not be verified." });
        return;
      }
      if (!subscriptionId) {
        res.status(202).json({ status: "processing" });
        return;
      }

      // Stripe creates these subscriptions as active (or trialing, if the
      // account has a trial configured).  An incomplete/cancelled/etc.
      // subscription is not an add-on grant, even if the Checkout Session
      // says complete.
      const subscriptionStatus =
        typeof session.subscription === "object" && session.subscription
          ? session.subscription.status
          : undefined;
      if (
        subscriptionStatus !== undefined
        && subscriptionStatus !== "active"
        && subscriptionStatus !== "trialing"
      ) {
        res.status(202).json({ status: "processing" });
        return;
      }
    }

    if (
      kind !== undefined
      && kind !== "main-subscription"
      && kind !== "project-addon"
    ) {
      res.status(403).json({ error: "This payment type cannot be confirmed here." });
      return;
    }
    if (
      kind !== "project-addon"
      && (
        session.mode !== "subscription"
        || slug !== ctx.slug
        || plan !== ctx.plan
        || !isBillingFrequency(frequency)
      )
    ) {
      logger.warn({ requestedSlug: ctx.slug, sessionId, sessionSlug: slug, plan }, "billing: rejected mismatched checkout return");
      res.status(403).json({ error: "This payment does not belong to the signed-in workspace." });
      return;
    }
    if (
      kind !== "project-addon"
      && !alreadyApplied
      && (!claimToken || !(await checkoutClaimMatchesSession(ctx.slug, sessionId, claimToken)))
    ) {
      res.status(409).json({ error: "This checkout can no longer be matched to the payment started by this workspace." });
      return;
    }
    if (session.status !== "complete") {
      res.status(202).json({ status: "processing" });
      return;
    }
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      res.status(409).json({ error: "Stripe has not confirmed payment for this checkout yet." });
      return;
    }

    if (!alreadyApplied) {
      await handleCheckoutCompleted({
        id: `return:${session.id}`,
        type: "checkout.session.completed",
        data: { object: session },
      } as unknown as import("stripe").default.Event);
    }
    if (kind === "project-addon") {
      const addons = await getProjectAddons(ctx.slug);
      const addon = addons.find((candidate) => candidate.subscriptionId === subscriptionId);
      // A completed/paid Stripe session is not itself proof of an app grant:
      // the durable add-on record is the source of truth for this response.
      if (
        !addon
        || addon.tier !== session.metadata?.["tier"]
        || (addon.projectId !== null && typeof addon.projectId !== "string")
      ) {
        res.status(202).json({ status: "processing" });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({
        status: "confirmed",
        kind: "project-addon",
        addon: {
          tier: addon.tier,
          projectId: addon.projectId,
          assigned: addon.projectId !== null,
        },
      });
      return;
    }
    if (session.subscription && typeof session.subscription !== "string") {
      await handleSubscriptionUpdated({
        id: `return-subscription:${session.id}`,
        type: "customer.subscription.updated",
        data: { object: session.subscription },
      } as unknown as import("stripe").default.Event);
    }
    const state = await getBillingState(ctx.slug);
    if (!state || !hasPaidSubscription(state)) {
      res.status(202).json({ status: "processing" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: "confirmed",
      kind: "main-subscription",
      subscription: {
        plan: state.plan,
        frequency: state.frequency,
        currentPeriodEnd: state.currentPeriodEnd?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (isMissingStripeResource(err)) {
      res.status(404).json({ error: "Stripe could not find this checkout session." });
      return;
    }
    logger.error({ err }, "billing: failed to reconcile checkout return");
    res.status(500).json({ error: "Payment confirmation is temporarily unavailable. Please try again." });
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
    const companyRecord = await getCompanyBillingRecord(ctx.slug);
    if (!companyRecord?.complete) {
      res.status(409).json({
        error: "Complete and save your company and billing information before continuing to payment.",
        code: "COMPANY_RECORD_INCOMPLETE",
      });
      return;
    }

    const tier = req.body?.tier;
    if (!isProjectTier(tier)) {
      res.status(400).json({ error: "Choose a project tier: standard, premium or max." });
      return;
    }
    const state = await getBillingState(ctx.slug);
    if (!hasPaidSubscription(state)) {
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
      successUrl: `${base}/?account_section=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/?account_section=billing&checkout=cancelled`,
    });
    res.json({ url });
  } catch (err) {
    logger.error({ err }, "billing: failed to create project checkout session");
    sendCheckoutError(res, err);
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
