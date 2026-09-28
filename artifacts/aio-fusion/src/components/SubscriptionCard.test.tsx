import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { daysUntilRenewal, formatSubscriptionEnd, SubscriptionCard } from "./SubscriptionCard";
import { BillingDetailsCard } from "./BillingDetailsCard";

describe("payment address guidance", () => {
  it.each([true, false])("refreshes payment eligibility only after a successful address save (success=%s)", async (saveSucceeds) => {
    let saved = false;
    const info = {
      ...activeSubscription(),
      status: "none",
      plan: "inhouse",
      applicablePlan: "inhouse",
      includedProjects: 1,
      projectAllowance: 1,
      trial: { status: "active", startedAt: "2026-09-01", endsAt: "2099-11-01", daysRemaining: 50 },
      tierPrices: {
        standard: { yearlyTotal: 10000, actionsPerMonth: 50 },
        premium: { yearlyTotal: 20000, actionsPerMonth: 100 },
        max: { yearlyTotal: 30000, actionsPerMonth: 200 },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => ({ ...info, companyRecordComplete: saved }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      if (url.endsWith("/api/platform/billing-details")) {
        if (init?.method === "POST") {
          saved = saveSucceeds;
          return {
            ok: saveSucceeds,
            json: async () => saveSucceeds
              ? { record: JSON.parse(String(init.body)) }
              : { error: "The address could not be saved." },
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            companyName: "Example Beta",
            billingEmail: "billing@example.test",
            keyAccountHolderEmail: "owner@example.test",
            country: "GB",
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<><SubscriptionCard /><BillingDetailsCard /></>);

    await screen.findByDisplayValue("Example Beta");
    const subscription = (await screen.findByRole("heading", { name: "Subscription" })).closest("#subscription-details") as HTMLElement;
    const addProject = (await screen.findByRole("heading", { name: "Add a project workspace" })).parentElement as HTMLElement;
    const payment = within(subscription).getByRole("button", { name: "Continue to payment" });
    const timing = within(subscription).getByTestId("beta-payment-timing");
    expect(timing).toHaveTextContent("Completing checkout starts your paid subscription immediately.");
    expect(timing).toHaveTextContent("Unused beta days are not added to your paid billing period or credited.");
    expect(timing).toHaveTextContent("Saving your company address alone does not start a subscription or end your trial.");
    expect(within(subscription).queryByText(/ready to continue after the trial/i)).toBeNull();
    expect(payment).toBeDisabled();
    expect(within(addProject).getByText(/Additional workspaces require a paid subscription/)).toBeTruthy();

    const addressSection = document.getElementById("company-billing-information")!;
    addressSection.scrollIntoView = vi.fn();
    fireEvent.click(within(subscription).getByRole("button", { name: "Complete company address" }));
    expect(addressSection.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByLabelText(/Address line 1/)).toHaveFocus();

    fireEvent.change(screen.getByLabelText(/Address line 1/), { target: { value: "1 Example Street" } });
    fireEvent.change(screen.getByLabelText(/Town \/ city/), { target: { value: "London" } });
    fireEvent.change(screen.getByLabelText(/Postcode/), { target: { value: "SW1A 1AA" } });
    fireEvent.click(screen.getByRole("button", { name: "Save company information" }));

    if (saveSucceeds) {
      await waitFor(() => expect(payment).toBeEnabled());
      expect(within(subscription).queryByRole("button", { name: "Complete company address" })).toBeNull();
    } else {
      await screen.findByText("The address could not be saved.");
      expect(payment).toBeDisabled();
      expect(within(subscription).getByRole("button", { name: "Complete company address" })).toBeTruthy();
    }
    // Saving an address is not a subscription purchase and must not unlock
    // extra-workspace checkout while the account is still trial-only.
    expect(within(addProject).getByRole("button", { name: "Continue to payment" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/billing/project-checkout"))).toBe(false);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


function activeSubscription() {
  return {
    status: "active",
    plan: "agency",
    frequency: "quarterly",
    currentPeriodEnd: "2099-12-16T00:00:00.000Z",
    entitled: true,
    applicablePlan: "agency",
    includedProjects: 3,
    projectAllowance: 3,
    projectsUsed: 0,
    latestInvoiceUrl: null,
    portalAvailable: true,
    checkoutAvailable: true,
    companyRecordComplete: true,
    projects: [],
     unassignedAddons: [] as { tier: "standard" | "premium" | "max"; purchasedAt: string }[],
    tierPrices: {},
    prices: {
      annual: { yearlyTotal: 500 },
      quarterly: { perQuarter: 150, yearlyTotal: 600 },
    },
    trial: { status: "used", startedAt: null, endsAt: null, daysRemaining: 0 },
  };
}

describe("billing descriptions", () => {
  it.each([
    {
      plan: "inhouse",
      annual: 400000,
      perQuarter: 115000,
      quarterlyYear: 460000,
      annualMonthly: "£333",
      quarterlyMonthly: "£383",
      annualCharge: "£4,000",
      quarterlyCharge: "£1,150",
      quarterlyTotal: "£4,600",
    },
    {
      plan: "agency",
      annual: 500000,
      perQuarter: 143750,
      quarterlyYear: 575000,
      annualMonthly: "£417",
      quarterlyMonthly: "£479",
      annualCharge: "£5,000",
      quarterlyCharge: "£1,437.50",
      quarterlyTotal: "£5,750",
    },
  ])("shows monthly equivalents and actual charges for the $plan plan without offering monthly checkout", async ({
    plan, annual, perQuarter, quarterlyYear, annualMonthly, quarterlyMonthly, annualCharge, quarterlyCharge, quarterlyTotal,
  }) => {
    const info = {
      ...activeSubscription(),
      status: "none",
      plan: null,
      applicablePlan: plan,
      entitled: false,
      prices: {
        annual: { yearlyTotal: annual },
        quarterly: { perQuarter, yearlyTotal: quarterlyYear },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: !String(input).endsWith("/api/platform/billing/checkout"),
      json: async () => String(input).endsWith("/api/platform/billing/subscription")
        ? info
        : { error: "Checkout unavailable" },
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCard />);

    const annually = await screen.findByRole("button", { name: /pay annually/i });
    const quarterly = screen.getByRole("button", { name: /pay quarterly/i });
    expect(annually).toHaveTextContent(`${annualMonthly}/mo equivalent`);
    expect(annually).toHaveTextContent(`${annualCharge} billed annually`);
    expect(quarterly).toHaveTextContent(`${quarterlyMonthly}/mo equivalent`);
    expect(quarterly).toHaveTextContent(`${quarterlyCharge} billed quarterly`);
    expect(quarterly).toHaveTextContent(`${quarterlyTotal}/yr`);
    expect(screen.getByText(/payments are taken annually or quarterly, not monthly/i)).toBeInTheDocument();

    fireEvent.click(quarterly);
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/platform/billing/checkout"))).toBe(true));
    const checkout = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/platform/billing/checkout"));
    expect(checkout?.[1]).toEqual(expect.objectContaining({ body: JSON.stringify({ frequency: "quarterly" }) }));
  });

  it("shows agency package reservations and account-appropriate purchase terms", async () => {
    const info = {
      ...activeSubscription(),
      packageCapacity: {
        billingSlug: "agency",
        kind: "agency",
        access: "paid",
        included: 3,
        purchased: 1,
        reserved: 4,
        used: 3,
        remaining: 0,
        allowance: 4,
        overLimit: false,
      },
      tierPrices: {
        standard: { yearlyTotal: 10000, actionsPerMonth: 50 },
        premium: { yearlyTotal: 20000, actionsPerMonth: 100 },
        max: { yearlyTotal: 30000, actionsPerMonth: 200 },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      json: async () => String(input).endsWith("/api/platform/billing/subscription")
        ? info
        : { invoices: [] },
    } as Response)));

    render(<SubscriptionCard />);

    const summary = await screen.findByTestId("package-capacity-summary");
    expect(summary).toHaveTextContent("3 included");
    expect(summary).toHaveTextContent("1 purchased");
    expect(summary).toHaveTextContent("4 reserved");
    expect(summary).toHaveTextContent("3 projects used");
    expect(summary).toHaveTextContent("0 remaining");
    expect(summary).toHaveTextContent("4 total allowance");
    expect(summary).toHaveTextContent("Within package allowance");
    expect(summary).toHaveTextContent("empty managed client still reserves");
    const addCard = screen.getByTestId("add-project-card");
    expect(addCard).toHaveTextContent("Add a client/project package");
    expect(addCard).toHaveTextContent("Billed annually");
    expect(addCard).toHaveTextContent("Tier upgrades are charged immediately at the prorated amount");
    expect(addCard).toHaveTextContent("Downgrades take effect at renewal");
    expect(addCard).toHaveTextContent("Cancelling a package retires its funded project");
  });

  it("describes direct-client capacity as one account with project add-ons", async () => {
    const info = {
      ...activeSubscription(),
      applicablePlan: "inhouse",
      plan: "inhouse",
      packageCapacity: {
        billingSlug: "direct-client",
        kind: "client",
        access: "paid",
        included: 1,
        purchased: 2,
        reserved: 3,
        used: 3,
        remaining: 0,
        allowance: 3,
        overLimit: false,
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      json: async () => String(input).endsWith("/api/platform/billing/subscription")
        ? info
        : { invoices: [] },
    } as Response)));

    render(<SubscriptionCard />);

    expect(await screen.findByText("1 Premium project included in this account.")).toBeInTheDocument();
    const addCard = screen.getByTestId("add-project-card");
    expect(addCard).toHaveTextContent("Add a project workspace");
    expect(addCard).toHaveTextContent("This does not create another client account");
  });

  it("does not show the beta checkout warning for an active paid subscription", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      json: async () => String(input).endsWith("/api/platform/billing/subscription")
        ? activeSubscription()
        : { invoices: [] },
    } as Response)));
    await render(<SubscriptionCard />);
    await screen.findByRole("heading", { name: "Subscription" });
    expect(screen.queryByTestId("beta-payment-timing")).toBeNull();
  });

  it("describes additional workspaces and annual billing without claiming VAT is added", async () => {
    const info = {
      ...activeSubscription(),
      tierPrices: {
        standard: { yearlyTotal: 10000, actionsPerMonth: 50 },
        premium: { yearlyTotal: 20000, actionsPerMonth: 100 },
        max: { yearlyTotal: 30000, actionsPerMonth: 200 },
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => info } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const { container } = render(<SubscriptionCard />);

    expect(await screen.findByText(
      "Add one independent project workspace for another brand, client, or programme. Billed annually. Once paid, your next new project uses the tier you choose here. This adds a separate workspace, not extra runtime capacity inside an existing project.",
    )).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/excl\.? VAT|prices exclude VAT|VAT.*checkout|tax is calculated at checkout/i);
  });

  it("uses neutral checkout-total wording for an unsubscribed plan", async () => {
    const info = { ...activeSubscription(), status: "none", plan: null, entitled: false };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => info } as Response;
      }
      throw new Error(`Unexpected request: ${input}`);
    }));

    const { container } = render(<SubscriptionCard />);

    expect(await screen.findByText(
      "Subscribe to the Agency/Partner plan. 3 Premium projects included. Review your total at checkout.",
    )).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/excl\.? VAT|prices exclude VAT|VAT.*checkout|tax is calculated at checkout/i);
  });
});

describe("subscription renewal timing", () => {
  it("formats a valid period end and counts a partial day as one day", () => {
    const now = new Date("2027-04-10T12:00:00.000Z");
    const periodEnd = "2027-04-11T00:00:00.000Z";

    expect(formatSubscriptionEnd(periodEnd)).toBe("11 April 2027");
    expect(daysUntilRenewal(periodEnd, now)).toBe(1);
  });

  it("returns zero at and after the renewal boundary", () => {
    const periodEnd = "2027-04-11T00:00:00.000Z";

    expect(daysUntilRenewal(periodEnd, new Date(periodEnd))).toBe(0);
    expect(daysUntilRenewal(periodEnd, new Date("2027-04-12T00:00:00.000Z"))).toBe(0);
  });

  it("handles missing and malformed dates without producing a date", () => {
    expect(formatSubscriptionEnd(null)).toBeNull();
    expect(formatSubscriptionEnd("not-a-date")).toBeNull();
    expect(daysUntilRenewal(null, new Date("2027-04-10T00:00:00.000Z"))).toBeNull();
    expect(daysUntilRenewal("not-a-date", new Date("2027-04-10T00:00:00.000Z"))).toBeNull();
  });
});

describe("paid checkout return hand-off", () => {
  it("shows the server-verified payment summary in Account Settings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => activeSubscription() } as Response;
      }
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return { ok: true, status: 200, json: async () => ({ status: "confirmed" }) } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SubscriptionCard checkoutResult="success" checkoutSessionId="cs_test_paid-return" />);

    expect(await screen.findByTestId("payment-success-state")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-confirmation-pending")).not.toBeInTheDocument();
    expect(screen.getByText(/your payment was successful and your subscription is now active/i)).toBeInTheDocument();

    const reconcileCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/platform/billing/reconcile-checkout"),
    );
    expect(reconcileCall).toBeTruthy();
    expect(reconcileCall?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ sessionId: "cs_test_paid-return" }),
    });
  });

  it("does not claim payment acceptance from the checkout URL flag alone", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => activeSubscription() } as Response;
      }
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: "Payment is still being verified." }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<SubscriptionCard checkoutResult="success" checkoutSessionId="cs_test_unverified" />);

    expect(await screen.findByText("Payment is still being verified.")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-success-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-confirmation-pending")).toBeInTheDocument();
  });

  it("uses the server-backed active state for a standard checkout return without a session id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => activeSubscription() } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SubscriptionCard checkoutResult="success" />);

    expect(await screen.findByText("Your subscription is active")).toBeInTheDocument();
    expect(screen.getByText(/active subscription has been verified by aio fusion/i)).toBeInTheDocument();
    expect(screen.queryByTestId("payment-confirmation-pending")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input).endsWith("/api/platform/billing/reconcile-checkout"),
    )).toBe(false);
  });
});

describe("project add-on checkout return hand-off", () => {
  function stubConfirmedAddon(
    addon: { tier: "standard" | "premium" | "max"; projectId: string | null; assigned: boolean },
    info = activeSubscription(),
  ) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => info } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "confirmed", kind: "project-addon", addon }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it.each([
    ["standard", "Standard"],
    ["premium", "Premium"],
    ["max", "Max"],
  ] as const)("renders the server-confirmed %s tier", async (tier, tierLabel) => {
    stubConfirmedAddon({ tier, projectId: null, assigned: false });

    render(<SubscriptionCard checkoutResult="success" checkoutSessionId="cs_test_addon-return" />);

    const banner = await screen.findByTestId("project-addon-success-state");
    expect(banner).toHaveTextContent(`Tier: ${tierLabel}`);
    expect(banner).toHaveTextContent("One extra workspace is now available.");
    expect(banner).toHaveTextContent(`Your next new project will use ${tierLabel}.`);
    expect(screen.queryByTestId("payment-success-state")).not.toBeInTheDocument();
  });

  it("does not show an add-on success banner while reconciliation is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => activeSubscription() } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return { ok: false, status: 202, json: async () => ({ status: "processing" }) } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<SubscriptionCard checkoutResult="success" checkoutSessionId="cs_test_addon-pending" />);

    expect(await screen.findByTestId("payment-confirmation-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("project-addon-success-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payment-success-state")).not.toBeInTheDocument();
  });

  it("keeps the main subscription banner for a main-subscription confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => activeSubscription() } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/reconcile-checkout")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "confirmed", kind: "main-subscription" }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<SubscriptionCard checkoutResult="success" checkoutSessionId="cs_test_main-return" />);

    expect(await screen.findByTestId("payment-success-state")).toBeInTheDocument();
    expect(screen.queryByTestId("project-addon-success-state")).not.toBeInTheDocument();
  });

  it("describes an assigned add-on as linked, not as an unassigned workspace", async () => {
    stubConfirmedAddon(
      { tier: "premium", projectId: "project-123", assigned: true },
      { ...activeSubscription(), unassignedAddons: [{ tier: "premium" as const, purchasedAt: "2099-01-01T00:00:00.000Z" }] },
    );

    render(<SubscriptionCard checkoutResult="success" checkoutSessionId="cs_test_attached-addon" />);

    const banner = await screen.findByTestId("project-addon-success-state");
    expect(banner).toHaveTextContent("Your Premium add-on is linked to your project.");
    expect(banner).not.toHaveTextContent("One extra workspace is now available.");
    expect(banner).not.toHaveTextContent(/your next new project will use/i);
  });
});

describe("agency project tier controls", () => {
  const tierPrices = {
    standard: { yearlyTotal: 10000, actionsPerMonth: 50 },
    premium: { yearlyTotal: 20000, actionsPerMonth: 100 },
    max: { yearlyTotal: 30000, actionsPerMonth: 200 },
  };

  type TestBillingProject = {
    id: string;
    name: string;
    tier: "standard" | "premium" | "max" | null;
    isAddon: boolean;
    addonSubscriptionId: string | null;
    pendingTier: "standard" | "premium" | "max" | null;
  };

  function agencyInfo(projects: TestBillingProject[] = []) {
    return {
      ...activeSubscription(),
      projects,
      tierPrices,
    };
  }

  function stubBilling(info: ReturnType<typeof agencyInfo>, projectTierResponse?: Response) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => info } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/project-tier")) {
        return projectTierResponse ?? {
          ok: true,
          json: async () => ({ message: "Tier updated by the billing service." }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? ""}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("shows the agency tier box with no add-ons and an included Premium project", async () => {
    stubBilling(agencyInfo([
      {
        id: "included-project",
        name: "Included client",
        tier: "premium",
        isAddon: false,
        addonSubscriptionId: null,
        pendingTier: null,
      },
    ]));

    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    expect(card).toHaveTextContent("Included Premium projects are the baseline");
    expect(within(card).getByRole("option", { name: /Max - £300\/yr/ })).toBeInTheDocument();
    expect(within(card).queryByRole("option", { name: /Standard -/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole("option", { name: /Premium -/ })).not.toBeInTheDocument();
  });

  it("keeps an empty tier box visible, disables changes, and refreshes real projects", async () => {
    const project = {
      id: "real-project",
      name: "Real client project",
      tier: "premium" as const,
      isAddon: false,
      addonSubscriptionId: null,
      pendingTier: null,
    };
    let subscriptionCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        subscriptionCalls += 1;
        return { ok: true, json: async () => agencyInfo(subscriptionCalls === 1 ? [] : [project]) } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SubscriptionCard />);

    const emptyState = await screen.findByTestId("change-tier-empty-state");
    expect(emptyState).toHaveTextContent("No client projects are available to change yet.");
    fireEvent.click(within(emptyState).getByRole("button", { name: "Refresh client projects" }));

    expect(await screen.findByRole("option", { name: /Real client project/ })).toBeInTheDocument();
    expect(subscriptionCalls).toBe(2);
  });

  it("schedules a paid add-on downgrade without requesting a charge preview", async () => {
    const newTier = "standard";
    const message = "Tier downgraded by the billing service.";
    const fetchMock = stubBilling(agencyInfo([
      {
        id: "paid-project",
        name: "Paid client project",
        tier: "max",
        isAddon: true,
        addonSubscriptionId: "addon-subscription",
        pendingTier: null,
      },
    ]), {
      ok: true,
      json: async () => ({ message }),
    } as Response);

    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    fireEvent.change(within(card).getByLabelText("Client project"), { target: { value: "paid-project" } });
    fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: newTier } });
    expect(card).toHaveTextContent("No immediate charge.");
    expect(card).toHaveTextContent("Standard and its lower allowance take effect at your next renewal at £100/year.");
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/project-tier/preview"))).toBe(false);
    fireEvent.click(within(card).getByRole("button", { name: "Change tier" }));

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/platform/billing/project-tier"));
    expect(call?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ projectId: "paid-project", tier: newTier }),
    });
  });

  it("automatically previews a paid add-on upgrade, blocks confirmation while loading, and reconciles the exact charge", async () => {
    let resolvePreview!: (response: Response) => void;
    const previewResponse = new Promise<Response>((resolve) => { resolvePreview = resolve; });
    const info = agencyInfo([{
      id: "paid-project",
      name: "Paid client project",
      tier: "premium",
      isAddon: true,
      addonSubscriptionId: "addon-subscription",
      pendingTier: null,
    }]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        return { ok: true, json: async () => info } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) {
        return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      }
      if (url.endsWith("/api/platform/billing/project-tier/preview")) return previewResponse;
      if (url.endsWith("/api/platform/billing/project-tier")) {
        return {
          ok: true,
          json: async () => ({
            message: "Tier upgraded.",
            reconciliation: { matched: true, amountPaid: 12345, currency: "gbp" },
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? ""}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    fireEvent.change(within(card).getByLabelText("Client project"), { target: { value: "paid-project" } });
    fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: "max" } });

    expect(await within(card).findByText("Calculating your exact charge with Stripe...")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Confirm upgrade" })).toBeDisabled();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
      String(input).endsWith("/api/platform/billing/project-tier/preview"),
    )).toBe(true));
    resolvePreview({
      ok: true,
      json: async () => ({
        quoteId: "quote-exact-123",
        amountDue: 12345,
        currency: "gbp",
        annualRenewalAmount: 30000,
        prorationDate: 1_800_000_000,
        expiresAt: Date.now() + 60_000,
        applied: "now",
      }),
    } as Response);

    const preview = await within(card).findByTestId("tier-charge-preview");
    expect(preview).toHaveTextContent("Due now: GBP 123.45");
    expect(preview).toHaveTextContent("Annual renewal price: GBP 300.00/year for Max.");
    const confirm = within(card).getByRole("button", { name: /Confirm upgrade - GBP.123\.45 now/ });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await within(card).findByRole("status")).toHaveTextContent(
      "Tier upgraded. Final paid invoice: GBP 123.45. This matches your approved preview.",
    );
    const changeCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/platform/billing/project-tier"),
    );
    expect(changeCall?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ projectId: "paid-project", tier: "max", quoteId: "quote-exact-123" }),
    });
  });

  it.each([
    ["server failure", { ok: false, json: async () => ({ error: "Stripe preview is unavailable." }) }],
    ["invalid response", {
      ok: true,
      json: async () => ({
        quoteId: "",
        amountDue: 12345,
        currency: "gbp",
        annualRenewalAmount: 30000,
        prorationDate: 1_800_000_000,
        expiresAt: Date.now() + 60_000,
        applied: "now",
      }),
    }],
  ] as const)("blocks confirmation and retries after a %s", async (_label, failedResponse) => {
    let previewCalls = 0;
    const info = agencyInfo([{
      id: "paid-project", name: "Paid client project", tier: "premium",
      isAddon: true, addonSubscriptionId: "addon-subscription", pendingTier: null,
    }]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) return { ok: true, json: async () => info } as Response;
      if (url.endsWith("/api/platform/billing/invoices")) return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      if (url.endsWith("/api/platform/billing/project-tier/preview")) {
        previewCalls += 1;
        if (previewCalls === 1) return failedResponse as Response;
        return {
          ok: true,
          json: async () => ({
            quoteId: "retry-quote", amountDue: 1000, currency: "gbp",
            annualRenewalAmount: 30000, prorationDate: 1_800_000_000,
            expiresAt: Date.now() + 60_000, applied: "now",
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    fireEvent.change(within(card).getByLabelText("Client project"), { target: { value: "paid-project" } });
    fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: "max" } });

    const retry = await within(card).findByRole("button", { name: "Retry charge preview" });
    expect(within(card).getByRole("button", { name: "Confirm upgrade" })).toBeDisabled();
    expect(within(card).getByRole("alert")).toHaveTextContent(
      _label === "server failure" ? "Stripe preview is unavailable." : "The charge preview was invalid.",
    );
    fireEvent.click(retry);
    expect(await within(card).findByRole("button", { name: /Confirm upgrade - GBP.10\.00 now/ })).toBeEnabled();
    expect(previewCalls).toBe(2);
  });

  it("expires a quote, blocks confirmation, and allows a fresh preview", async () => {
    let previewCalls = 0;
    const info = agencyInfo([{
      id: "paid-project", name: "Paid client project", tier: "premium",
      isAddon: true, addonSubscriptionId: "addon-subscription", pendingTier: null,
    }]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) return { ok: true, json: async () => info } as Response;
      if (url.endsWith("/api/platform/billing/invoices")) return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      if (url.endsWith("/api/platform/billing/project-tier/preview")) {
        previewCalls += 1;
        return {
          ok: true,
          json: async () => ({
            quoteId: `quote-${previewCalls}`, amountDue: 2500, currency: "gbp",
            annualRenewalAmount: 30000, prorationDate: 1_800_000_000,
            expiresAt: Date.now() + (previewCalls === 1 ? 1_000 : 60_000), applied: "now",
          }),
        } as Response;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    fireEvent.change(within(card).getByLabelText("Client project"), { target: { value: "paid-project" } });
    fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: "max" } });
    expect(await within(card).findByRole("button", { name: /Confirm upgrade - GBP.25\.00 now/ })).toBeEnabled();

    const retry = await within(card).findByRole("button", { name: "Retry charge preview" }, { timeout: 3000 });
    expect(within(card).getByText(/This charge preview has expired/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Confirm upgrade" })).toBeDisabled();
    fireEvent.click(retry);
    expect(await within(card).findByRole("button", { name: /Confirm upgrade - GBP.25\.00 now/ })).toBeEnabled();
    expect(previewCalls).toBe(2);
  });

  it("ignores a stale out-of-order preview after the tier selection changes", async () => {
    let resolvePremium!: (response: Response) => void;
    let resolveMax!: (response: Response) => void;
    const premiumResponse = new Promise<Response>((resolve) => { resolvePremium = resolve; });
    const maxResponse = new Promise<Response>((resolve) => { resolveMax = resolve; });
    const info = agencyInfo([{
      id: "paid-project", name: "Paid client project", tier: "standard",
      isAddon: true, addonSubscriptionId: "addon-subscription", pendingTier: null,
    }]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) return { ok: true, json: async () => info } as Response;
      if (url.endsWith("/api/platform/billing/invoices")) return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      if (url.endsWith("/api/platform/billing/project-tier/preview")) {
        const body = JSON.parse(String(init?.body));
        return body.tier === "premium" ? premiumResponse : maxResponse;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    fireEvent.change(within(card).getByLabelText("Client project"), { target: { value: "paid-project" } });
    fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: "premium" } });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/project-tier/preview"),
    )).toHaveLength(1));
    fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: "max" } });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/project-tier/preview"),
    )).toHaveLength(2));

    resolveMax({ ok: true, json: async () => ({
      quoteId: "max-quote", amountDue: 3000, currency: "gbp", annualRenewalAmount: 30000,
      prorationDate: 1_800_000_000, expiresAt: Date.now() + 60_000, applied: "now",
    }) } as Response);
    expect(await within(card).findByText("Due now: GBP 30.00")).toBeInTheDocument();
    resolvePremium({ ok: true, json: async () => ({
      quoteId: "stale-premium-quote", amountDue: 2000, currency: "gbp", annualRenewalAmount: 20000,
      prorationDate: 1_800_000_000, expiresAt: Date.now() + 60_000, applied: "now",
    }) } as Response);
    await waitFor(() => expect(within(card).queryByText("Due now: GBP 20.00")).toBeNull());
    expect(within(card).getByText("Annual renewal price: GBP 300.00/year for Max.")).toBeInTheDocument();
  });

  it("keeps a changed:true error visible, clears controls, and refreshes billing state", async () => {
    let subscriptionCalls = 0;
    const info = agencyInfo([{
      id: "paid-project", name: "Paid client project", tier: "premium",
      isAddon: true, addonSubscriptionId: "addon-subscription", pendingTier: null,
    }]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/billing/subscription")) {
        subscriptionCalls += 1;
        return { ok: true, json: async () => info } as Response;
      }
      if (url.endsWith("/api/platform/billing/invoices")) return { ok: true, json: async () => ({ invoices: [] }) } as Response;
      if (url.endsWith("/api/platform/billing/project-tier/preview")) return {
        ok: true,
        json: async () => ({
          quoteId: "changed-quote", amountDue: 1234, currency: "gbp", annualRenewalAmount: 30000,
          prorationDate: 1_800_000_000, expiresAt: Date.now() + 60_000, applied: "now",
        }),
      } as Response;
      if (url.endsWith("/api/platform/billing/project-tier")) return {
        ok: false,
        json: async () => ({ changed: true, error: "The tier changed, but invoice reconciliation failed." }),
      } as Response;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    const project = within(card).getByLabelText("Client project") as HTMLSelectElement;
    const tier = within(card).getByLabelText("New tier") as HTMLSelectElement;
    fireEvent.change(project, { target: { value: "paid-project" } });
    fireEvent.change(tier, { target: { value: "max" } });
    fireEvent.click(await within(card).findByRole("button", { name: /Confirm upgrade - GBP.12\.34 now/ }));

    expect(await within(card).findByRole("alert")).toHaveTextContent("The tier changed, but invoice reconciliation failed.");
    expect(project.value).toBe("");
    expect(tier.value).toBe("");
    expect(tier).toBeDisabled();
    await waitFor(() => expect(subscriptionCalls).toBe(2));
  });

  it("offers only Max for an included Premium project and uses attached project checkout", async () => {
    const originalLocation = window.location;
    let checkoutUrl = "";
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, set href(value: string) { checkoutUrl = value; }, get href() { return checkoutUrl; } },
    });
    try {
      const fetchMock = stubBilling(agencyInfo([
        {
          id: "included-project",
          name: "Included client",
          tier: "premium",
          isAddon: false,
          addonSubscriptionId: null,
          pendingTier: null,
        },
      ]));
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/platform/billing/subscription")) return { ok: true, json: async () => agencyInfo([{
          id: "included-project",
          name: "Included client",
          tier: "premium",
          isAddon: false,
          addonSubscriptionId: null,
          pendingTier: null,
        }]) } as Response;
        if (url.endsWith("/api/platform/billing/invoices")) return { ok: true, json: async () => ({ invoices: [] }) } as Response;
        if (url.endsWith("/api/platform/billing/project-checkout")) return { ok: true, json: async () => ({ url: "/checkout/included-max" }) } as Response;
        throw new Error(`Unexpected request: ${url}`);
      });

      render(<SubscriptionCard />);

      const card = await screen.findByTestId("change-tier-card");
      fireEvent.change(within(card).getByLabelText("Client project"), { target: { value: "included-project" } });
      expect(within(card).getByRole("option", { name: /Max - £300\/yr/ })).toBeInTheDocument();
      expect(within(card).queryByRole("option", { name: /Standard -/ })).not.toBeInTheDocument();
      fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: "max" } });
      fireEvent.click(within(card).getByRole("button", { name: "Continue to payment" }));

      await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/api/platform/billing/project-checkout"),
      )).toBe(true));
      const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/platform/billing/project-checkout"));
      expect(call?.[1]).toMatchObject({
        method: "POST",
        body: JSON.stringify({ projectId: "included-project", tier: "max" }),
      });
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/platform/billing/project-tier"))).toBe(false);
    } finally {
      Object.defineProperty(window, "location", { writable: true, value: originalLocation });
    }
  });

  it("keeps a backend tier-change error visible", async () => {
    stubBilling(agencyInfo([
      {
        id: "paid-project",
        name: "Paid client project",
        tier: "max",
        isAddon: true,
        addonSubscriptionId: "addon-subscription",
        pendingTier: null,
      },
    ]), {
      ok: false,
      status: 500,
      json: async () => ({ error: "Billing service is unavailable right now." }),
    } as Response);

    render(<SubscriptionCard />);

    const card = await screen.findByTestId("change-tier-card");
    fireEvent.change(within(card).getByLabelText("Client project"), { target: { value: "paid-project" } });
    fireEvent.change(within(card).getByLabelText("New tier"), { target: { value: "standard" } });
    fireEvent.click(within(card).getByRole("button", { name: "Change tier" }));

    expect(await screen.findByText("Billing service is unavailable right now.")).toBeInTheDocument();
  });
});