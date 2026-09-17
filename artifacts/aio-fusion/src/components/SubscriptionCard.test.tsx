import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { daysUntilRenewal, formatSubscriptionEnd, SubscriptionCard } from "./SubscriptionCard";

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