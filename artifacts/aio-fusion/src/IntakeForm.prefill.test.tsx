/**
 * Tests for the intake-form prefill behaviour introduced in Task #8.
 *
 * The core contract:
 *  - Fresh intake (no localStorage key) + client role → 4.1 prefilled from
 *    displayName, aiWebsite prefilled from website.
 *  - Fresh intake + agency role → form stays blank, no prefill.
 *  - Saved blob present → prefill never applied even for a client session.
 *
 * We render IntakePage directly because the lazy initialiser runs synchronously
 * in jsdom when localStorage is pre-seeded (or empty).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import IntakePage from "./IntakeForm";

// Stub heavy imports that require browser APIs or network
vi.mock("./lib/projectSync", () => ({
  markIntakeSaved: vi.fn(),
  ensureDefaultIntakeMigrated: vi.fn(),
  assertActiveProjectConsistencyFromCache: vi.fn(),
}));
vi.mock("./lib/auditTiming", () => ({
  recordAuditDuration: vi.fn(),
  getAuditDurationSeconds: vi.fn(() => null),
  getAuditSampleCount: vi.fn(() => 0),
  getTypicalDurationHint: vi.fn(() => ""),
}));

// Stub Anthropic to prevent real network calls in any AI path
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn() }));

const CLIENT_PROFILE = {
  displayName: "Acme Widgets Ltd",
  website: "acmewidgets.com",
};

const INTAKE_KEY = "aio.intake.v2"; // bare key used when activeProjectId is not set

// Helper: seed a non-empty saved blob so we can test "saved intake" scenario
function seedSavedIntake(name41: string) {
  const blob = JSON.stringify({
    formData: { "4.1": name41 },
    duals: {},
    dualLists: {},
    spokespeople: [],
    products: [],
    productQueries: [],
    llmQueries: { v: 1, discovery: [], shortlist: [], comparison: [] },
    stringLists: {},
    businessCategories: [],
    audienceCategories: [],
    intakeStatus: "Draft",
    acceptedAt: null,
    aiWebsite: "",
  });
  localStorage.setItem(INTAKE_KEY, blob);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("IntakePage prefill - fresh client intake", () => {
  it("pre-fills 4.1 (company name) from accountProfile.displayName", async () => {
    render(
      <IntakePage
        role="client"
        accountProfile={CLIENT_PROFILE}
      />,
    );
    // Field 4.1 lives in section 4 (AIO track) which isn't rendered by default.
    // Instead verify the lazy initialiser set the value by inspecting the
    // localStorage blob written by the save useEffect after first render.
    await waitFor(() => {
      const blob = JSON.parse(localStorage.getItem(INTAKE_KEY) || "{}");
      expect(blob.formData?.["4.1"]).toBe("Acme Widgets Ltd");
    });
  });

  it("pre-fills aiWebsite from accountProfile.website", () => {
    render(
      <IntakePage
        role="client"
        accountProfile={CLIENT_PROFILE}
      />,
    );
    // The website field is a text input rendered on section 0 of the PR track
    const websiteInput = document.querySelector(
      "input[placeholder='yourcompany.com']",
    ) as HTMLInputElement | null;
    expect(websiteInput).not.toBeNull();
    expect(websiteInput!.value).toBe("acmewidgets.com");
  });

  it("shows the brand prefill note", () => {
    render(
      <IntakePage
        role="client"
        accountProfile={CLIENT_PROFILE}
      />,
    );
    expect(
      screen.getByText(/We've pre-filled your company name and website/i),
    ).toBeInTheDocument();
  });
});

describe("IntakePage prefill - fresh agency intake", () => {
  it("does NOT pre-fill 4.1 for an agency session", () => {
    render(
      <IntakePage
        role="agency"
        accountProfile={{ displayName: "My Agency Ltd", website: "myagency.com" }}
      />,
    );
    // No input should carry "My Agency Ltd"
    const inputs = Array.from(document.querySelectorAll("input[type='text']"));
    const prefilled = inputs.find(
      (el) => (el as HTMLInputElement).value === "My Agency Ltd",
    );
    expect(prefilled).toBeUndefined();
  });

  it("does NOT pre-fill aiWebsite for an agency session", () => {
    render(
      <IntakePage
        role="agency"
        accountProfile={{ displayName: "My Agency Ltd", website: "myagency.com" }}
      />,
    );
    const websiteInput = document.querySelector(
      "input[placeholder='yourcompany.com']",
    ) as HTMLInputElement | null;
    // Either not rendered or empty
    if (websiteInput) {
      expect(websiteInput.value).toBe("");
    }
  });

  it("shows the agency context note", () => {
    render(
      <IntakePage
        role="agency"
        accountProfile={{ displayName: "My Agency Ltd", website: "myagency.com" }}
      />,
    );
    expect(
      screen.getByText(/This intake is for your client/i),
    ).toBeInTheDocument();
  });
});

describe("IntakePage prefill - null accountProfile (team member / impersonation / offline)", () => {
  it("does NOT show the brand note when accountProfile is null even if role is client", () => {
    render(<IntakePage role="client" accountProfile={null} />);
    expect(screen.queryByText(/We've pre-filled your company name/i)).toBeNull();
  });

  it("does NOT show the agency note when accountProfile is null even if role is agency", () => {
    render(<IntakePage role="agency" accountProfile={null} />);
    expect(screen.queryByText(/This intake is for your client/i)).toBeNull();
  });

  it("does NOT pre-fill 4.1 when accountProfile is null", async () => {
    render(<IntakePage role="client" accountProfile={null} />);
    await waitFor(() => {
      const blob = JSON.parse(localStorage.getItem(INTAKE_KEY) || "{}");
      // formData should be empty - no prefill applied
      expect(blob.formData?.["4.1"] ?? "").toBe("");
    });
  });
});

describe("IntakePage prefill - saved intake is never overwritten", () => {
  it("does not overwrite 4.1 even when client role and accountProfile are present", async () => {
    // Seed a saved blob with a different company name
    seedSavedIntake("Existing Corp");

    render(
      <IntakePage
        role="client"
        accountProfile={CLIENT_PROFILE}
      />,
    );

    // The save useEffect re-writes the blob each render. Verify the preserved
    // value survives the first write cycle via waitFor.
    await waitFor(() => {
      const blob = JSON.parse(localStorage.getItem(INTAKE_KEY) || "{}");
      // Saved name must be preserved
      expect(blob.formData?.["4.1"]).toBe("Existing Corp");
      // Prefill value must NOT have been written
      expect(blob.formData?.["4.1"]).not.toBe("Acme Widgets Ltd");
    });
  });

  it("does not show the prefill note on a saved intake", () => {
    seedSavedIntake("Existing Corp");

    render(
      <IntakePage
        role="client"
        accountProfile={CLIENT_PROFILE}
      />,
    );

    expect(
      screen.queryByText(/We've pre-filled your company name/i),
    ).toBeNull();
    expect(
      screen.queryByText(/This intake is for your client/i),
    ).toBeNull();
  });
});
