import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuidedOnboardingPage } from "./GuidedOnboardingPage";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function response(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function renderSetup(
  checkoutResult?: "success" | "cancelled" | null,
  onComplete = vi.fn(async () => ({ ok: true })),
  checkoutSessionId?: string | null,
) {
  return {
    onComplete,
    ...render(
    <GuidedOnboardingPage
      checkoutResult={checkoutResult}
      checkoutSessionId={checkoutSessionId}
      onSignOut={vi.fn()}
      onRoleChanged={vi.fn()}
      onComplete={onComplete}
    />,
    ),
  };
}

describe("GuidedOnboardingPage", () => {
  it("leaves the company name blank when only the signed-in person's name exists", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "workspace_basics" } }))
      .mockResolvedValueOnce(response({
        accountProfile: { website: null },
        sessionIdentity: { userName: "Spencer Gallagher", companyName: "Spencer Gallagher" },
      })));
    renderSetup();

    const companyName = await screen.findByLabelText("Company name");
    expect(screen.getByRole("heading", { name: "New Customer Onboarding" })).toBeInTheDocument();
    expect(screen.getByText("Welcome to AIO Fusion. For faster customer onboarding, please complete the following steps.")).toBeInTheDocument();
    expect(companyName).toHaveValue("");
    expect(companyName).toHaveAttribute("placeholder", "e.g. Acme Corp");
  });

  it("prefills a genuine existing workspace profile", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "workspace_basics" } }))
      .mockResolvedValueOnce(response({
        accountProfile: { displayName: "Acme Corp", website: "https://acme.example" },
        sessionIdentity: { userName: "Spencer Gallagher", companyName: "Acme Corp" },
      })));
    renderSetup();

    expect(await screen.findByLabelText("Company name")).toHaveValue("Acme Corp");
    expect(screen.getByLabelText("Company website")).toHaveValue("https://acme.example");
  });

  it("reuses App's authoritative profile without requesting /me again", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) {
        return response({ state: { step: "workspace_basics" } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <GuidedOnboardingPage
        accountProfile={{ displayName: "Acme Corp", website: "https://acme.example" }}
        onSignOut={vi.fn()}
        onRoleChanged={vi.fn()}
        onComplete={vi.fn(async () => ({ ok: true }))}
      />,
    );

    expect(await screen.findByLabelText("Company name")).toHaveValue("Acme Corp");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/platform/onboarding");
  });

  it("keeps focus while typing into the company details fields", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "workspace_basics" } }))
      .mockResolvedValueOnce(response({ accountProfile: {} })));
    renderSetup();

    const companyName = await screen.findByLabelText("Company name");
    companyName.focus();
    fireEvent.change(companyName, { target: { value: "A" } });
    expect(document.activeElement).toBe(companyName);
    fireEvent.change(companyName, { target: { value: "Acme" } });
    expect(document.activeElement).toBe(companyName);
    expect(companyName).toHaveValue("Acme");

    const companyWebsite = screen.getByLabelText("Company website");
    companyWebsite.focus();
    fireEvent.change(companyWebsite, { target: { value: "h" } });
    expect(document.activeElement).toBe(companyWebsite);
    fireEvent.change(companyWebsite, { target: { value: "https://acme.example" } });
    expect(document.activeElement).toBe(companyWebsite);
    expect(companyWebsite).toHaveValue("https://acme.example");
  });

  it("shows the access sequence and beta skips billing", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "access" } }))
      .mockResolvedValueOnce(response({ accountProfile: {} }))
      .mockResolvedValueOnce(response({ state: { step: "first_project", accessChoice: "beta" } })));
    const { onComplete } = renderSetup();
    expect(await screen.findByText("Choose how to start")).toBeInTheDocument();
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
    const betaOption = screen.getByRole("button", { name: /60-day beta/i });
    const paidOption = screen.getByRole("button", { name: /Paid plan/i });
    expect(betaOption).toHaveAttribute("aria-pressed", "false");
    expect(paidOption).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(betaOption);
    expect(betaOption).toHaveAttribute("aria-pressed", "true");
    expect(paidOption).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("profile"));
    expect(screen.queryByText("Create your first project")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing and payment")).not.toBeInTheDocument();
  });

  it("shows billing in progress only after choosing a paid plan", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "access" } }))
      .mockResolvedValueOnce(response({ accountProfile: {} }))
      .mockResolvedValueOnce(response({ state: { step: "billing", accessChoice: "paid" } }))
      .mockResolvedValue(response({
        status: "none", applicablePlan: "inhouse", entitled: false,
        trial: { status: "eligible", startedAt: null, endsAt: null, daysRemaining: 0 },
        includedProjects: 1, checkoutAvailable: true, companyRecordComplete: false,
        projects: [], unassignedAddons: [], tierPrices: {},
        prices: { annual: { yearlyTotal: 100 }, quarterly: { perQuarter: 30, yearlyTotal: 120 } },
      })));
    renderSetup();
    expect(await screen.findByText("Choose how to start")).toBeInTheDocument();
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Paid plan/i }));
    expect(screen.getByRole("button", { name: /Paid plan/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    expect(await screen.findByText("Billing and payment")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("keeps paid checkout cancellation at the billing step", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "billing", accessChoice: "paid" } }))
      .mockResolvedValueOnce(response({ accountProfile: {} }))
      .mockResolvedValue(response({
        status: "none", applicablePlan: "inhouse", entitled: false,
        trial: { status: "eligible", startedAt: null, endsAt: null, daysRemaining: 0 },
        includedProjects: 1, checkoutAvailable: true, companyRecordComplete: false,
        projects: [], unassignedAddons: [], tierPrices: {},
        prices: { annual: { yearlyTotal: 100 }, quarterly: { perQuarter: 30, yearlyTotal: 120 } },
      })));
    renderSetup("cancelled");
    expect(await screen.findByText("Billing and payment")).toBeInTheDocument();
    expect(screen.getByText("Checkout was cancelled. No payment was taken, and you can continue here when ready.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Company and billing information")).toBeInTheDocument());
  });

  it("shows a dedicated thank-you state after paid checkout is confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) {
        return response({ state: { step: "billing", accessChoice: "paid" } });
      }
      if (url.endsWith("/api/platform/me")) return response({ accountProfile: {} });
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return response({ status: "confirmed" });
      }
      if (url.endsWith("/api/platform/billing/subscription")) return response({
        status: "active",
        plan: "inhouse",
        frequency: "annual",
        currentPeriodEnd: "2099-04-11T00:00:00.000Z",
        entitled: true,
        applicablePlan: "inhouse",
        includedProjects: 1,
        projectAllowance: 1,
        projectsUsed: 0,
        checkoutAvailable: true,
        companyRecordComplete: true,
        portalAvailable: false,
        projects: [],
        unassignedAddons: [],
        tierPrices: {},
        prices: { annual: { yearlyTotal: 100 }, quarterly: { perQuarter: 30, yearlyTotal: 120 } },
        trial: { status: "used", startedAt: null, endsAt: null, daysRemaining: 0 },
      });
      throw new Error(`Unexpected request: ${url}`);
    }));

    const { onComplete } = renderSetup("success", undefined, "cs_test_confirmed");

    expect(await screen.findByTestId("payment-success-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /thank you for signing up to AIO Fusion/i })).toBeInTheDocument();
    expect(screen.getByText("11 April 2099")).toBeInTheDocument();
    expect(screen.getByText(/your next renewal is in/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue to my account/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("billing"));
  });

  it("keeps the confirmation view stable while onboarding bootstrap is delayed", async () => {
    let releaseSetup: (value: Response) => void = () => {};
    const setupPromise = new Promise<Response>((resolve) => { releaseSetup = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) return setupPromise;
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return { ok: false, status: 202, json: async () => ({ status: "pending" }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/subscription")) {
        return response({ status: "none" });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderSetup("success", undefined, "cs_test_delayed");
    expect(await screen.findByTestId("checkout-return-loading")).toBeInTheDocument();
    expect(screen.queryByText("Billing and payment")).not.toBeInTheDocument();

    releaseSetup(response({ state: { step: "billing", accessChoice: "paid" } }));
    await waitFor(() => expect(screen.queryByTestId("checkout-return-loading")).not.toBeNull());
    expect(screen.queryByText("Billing and payment")).not.toBeInTheDocument();
  });

  it("keeps payment loading visible when confirmation finishes before onboarding bootstrap", async () => {
    let releaseSetup: (value: Response) => void = () => {};
    const setupPromise = new Promise<Response>((resolve) => { releaseSetup = resolve; });
    let subscriptionLoads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) return setupPromise;
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) return response({ status: "confirmed" });
      if (url.endsWith("/api/platform/billing/subscription")) {
        subscriptionLoads += 1;
        return response(subscriptionLoads === 1
          ? { status: "none" }
          : { status: "active", plan: "inhouse", frequency: "annual", currentPeriodEnd: null, entitled: true });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderSetup("success", undefined, "cs_test_bootstrap_slow");
    await waitFor(() => expect(subscriptionLoads).toBeGreaterThanOrEqual(2));
    expect(screen.getByTestId("checkout-return-loading")).toBeInTheDocument();
    expect(screen.queryByText("Billing and payment")).not.toBeInTheDocument();

    releaseSetup(response({ state: { step: "billing", accessChoice: "paid" } }));
    expect(await screen.findByTestId("payment-success-page")).toBeInTheDocument();
  });

  it("shows the onboarding retry state when initial bootstrap fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) {
        return { ok: false, json: async () => ({ error: "Could not load account setup." }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return { ok: false, status: 202, json: async () => ({ status: "pending" }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/subscription")) return response({ status: "none" });
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderSetup("success", undefined, "cs_test_bootstrap_failed");
    expect(await screen.findByText("Could not load account setup.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId("payment-confirmation-pending-page")).not.toBeInTheDocument();
  });

  it("keeps the confirmation view pending through a 202 before an active subscription", async () => {
    let reconcileCalls = 0;
    let subscriptionLoads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) {
        return response({ state: { step: "billing", accessChoice: "paid" } });
      }
      if (url.endsWith("/api/platform/me")) return response({ accountProfile: {} });
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        reconcileCalls += 1;
        return reconcileCalls === 1
          ? { ok: false, status: 202, json: async () => ({ status: "pending" }) } as Response
          : response({ status: "confirmed" });
      }
      if (url.endsWith("/api/platform/billing/subscription")) {
        subscriptionLoads += 1;
        return response(subscriptionLoads === 1
          ? { status: "none" }
          : { status: "active", plan: "inhouse", frequency: "annual", currentPeriodEnd: null, entitled: true });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderSetup("success", undefined, "cs_test_202");
    expect(await screen.findByTestId("payment-confirmation-pending-page")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-success-page")).not.toBeInTheDocument();

    expect(await screen.findByTestId("payment-success-page", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(reconcileCalls).toBe(2);
  });

  it("keeps failed reconciliation actionable without showing payment success", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) {
        return response({ state: { step: "billing", accessChoice: "paid" } });
      }
      if (url.endsWith("/api/platform/me")) return response({ accountProfile: {} });
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return { ok: false, status: 409, json: async () => ({ error: "Payment is still being verified." }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/subscription")) return response({ status: "none" });
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderSetup("success", undefined, "cs_test_failed");
    expect(await screen.findByText("Payment is still being verified.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try payment confirmation again/i })).toBeInTheDocument();
    expect(screen.queryByTestId("payment-success-page")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing and payment")).not.toBeInTheDocument();
  });

  it("reconciles a successful checkout return before showing the thank-you state", async () => {
    let subscriptionLoads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) {
        return response({ state: { step: "billing", accessChoice: "paid" } });
      }
      if (url.endsWith("/api/platform/me")) return response({ accountProfile: {} });
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return response({ status: "confirmed" });
      }
      if (url.endsWith("/api/platform/billing/subscription")) {
        subscriptionLoads += 1;
        return response(subscriptionLoads === 1 ? {
          status: "none", plan: null, frequency: null, currentPeriodEnd: null,
          entitled: false, applicablePlan: "agency", includedProjects: 3,
          projectAllowance: 0, projectsUsed: 0, checkoutAvailable: true,
          companyRecordComplete: true, portalAvailable: false, projects: [],
          unassignedAddons: [], tierPrices: {},
          prices: { annual: { yearlyTotal: 500 }, quarterly: { perQuarter: 150, yearlyTotal: 600 } },
          trial: { status: "eligible", startedAt: null, endsAt: null, daysRemaining: 0 },
        } : {
          status: "active", plan: "agency", frequency: "annual",
          currentPeriodEnd: "2099-04-11T00:00:00.000Z", entitled: true,
          applicablePlan: "agency", includedProjects: 3, projectAllowance: 3,
          projectsUsed: 0, checkoutAvailable: true, companyRecordComplete: true,
          portalAvailable: false, projects: [], unassignedAddons: [], tierPrices: {},
          prices: { annual: { yearlyTotal: 500 }, quarterly: { perQuarter: 150, yearlyTotal: 600 } },
          trial: { status: "used", startedAt: null, endsAt: null, daysRemaining: 0 },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderSetup("success", undefined, "cs_test_return");
    expect(await screen.findByTestId("payment-success-page")).toBeInTheDocument();
    expect(screen.getByText(/Agency\/Partner plan is active/i)).toBeInTheDocument();
    expect(subscriptionLoads).toBeGreaterThanOrEqual(2);
  });

  it("offers a safe retry when a success return has no session reference", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) return response({ state: { step: "billing", accessChoice: "paid" } });
      if (url.endsWith("/api/platform/me")) return response({ accountProfile: {} });
      if (url.endsWith("/api/platform/billing/subscription")) {
        return response({
          status: "none", plan: null, frequency: null, currentPeriodEnd: null,
          entitled: false, applicablePlan: "inhouse", includedProjects: 1,
          projectAllowance: 0, projectsUsed: 0, checkoutAvailable: true,
          companyRecordComplete: true, portalAvailable: false, projects: [],
          unassignedAddons: [], tierPrices: {},
          prices: { annual: { yearlyTotal: 100 }, quarterly: { perQuarter: 30, yearlyTotal: 120 } },
          trial: { status: "eligible", startedAt: null, endsAt: null, daysRemaining: 0 },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    renderSetup("success");
    expect(await screen.findByText(/payment return link is incomplete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try payment confirmation again/i })).toBeInTheDocument();
  });

  it("does not treat beta entitlement as paid checkout confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/onboarding")) return response({ state: { step: "billing", accessChoice: "paid" } });
      if (url.endsWith("/api/platform/me")) return response({ accountProfile: {} });
      if (url.endsWith("/api/platform/billing/subscription")) {
        return response({
          status: "none", plan: null, frequency: null, currentPeriodEnd: null,
          entitled: true, applicablePlan: "inhouse", includedProjects: 2,
          projectAllowance: 2, projectsUsed: 0, checkoutAvailable: true,
          companyRecordComplete: true, portalAvailable: false, projects: [],
          unassignedAddons: [], tierPrices: {},
          prices: { annual: { yearlyTotal: 100 }, quarterly: { perQuarter: 30, yearlyTotal: 120 } },
          trial: { status: "active", startedAt: "2099-01-01T00:00:00.000Z", endsAt: "2099-03-01T00:00:00.000Z", daysRemaining: 60 },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const { onComplete } = renderSetup("success");
    expect(await screen.findByText(/payment return link is incomplete/i)).toBeInTheDocument();
    expect(screen.queryByTestId("payment-success-page")).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});