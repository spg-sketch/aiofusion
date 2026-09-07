import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuidedOnboardingPage } from "./GuidedOnboardingPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function response(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function renderSetup(checkoutResult?: "success" | "cancelled" | null) {
  return render(
    <GuidedOnboardingPage
      checkoutResult={checkoutResult}
      onSignOut={vi.fn()}
      onRoleChanged={vi.fn()}
      onCreateFirstProject={vi.fn(async () => ({ ok: true }))}
      onResumeFirstProject={vi.fn(async () => ({ ok: true }))}
    />,
  );
}

describe("GuidedOnboardingPage", () => {
  it("leaves the workspace name blank when only the signed-in person's name exists", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "workspace_basics" } }))
      .mockResolvedValueOnce(response({
        accountProfile: { website: null },
        sessionIdentity: { userName: "Spencer Gallagher", companyName: "Spencer Gallagher" },
      })));
    renderSetup();

    const workspaceName = await screen.findByLabelText("Workspace name");
    expect(workspaceName).toHaveValue("");
    expect(workspaceName).toHaveAttribute("placeholder", "e.g. Acme Corp");
  });

  it("prefills a genuine existing workspace profile", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "workspace_basics" } }))
      .mockResolvedValueOnce(response({
        accountProfile: { displayName: "Acme Corp", website: "https://acme.example" },
        sessionIdentity: { userName: "Spencer Gallagher", companyName: "Acme Corp" },
      })));
    renderSetup();

    expect(await screen.findByLabelText("Workspace name")).toHaveValue("Acme Corp");
    expect(screen.getByLabelText("Company website")).toHaveValue("https://acme.example");
  });

  it("shows the access sequence and beta skips billing", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ state: { step: "access" } }))
      .mockResolvedValueOnce(response({ accountProfile: {} }))
      .mockResolvedValueOnce(response({ state: { step: "first_project", accessChoice: "beta" } })));
    renderSetup();
    expect(await screen.findByText("Choose how to start")).toBeInTheDocument();
    fireEvent.click(screen.getByText("60-day beta"));
    expect(await screen.findByText("Create your first project")).toBeInTheDocument();
    expect(screen.queryByText("Billing and payment")).not.toBeInTheDocument();
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
    expect(screen.getByText(/Checkout was cancelled/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Company and billing information")).toBeInTheDocument());
  });
});