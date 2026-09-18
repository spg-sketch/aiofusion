import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchProjectAllowance,
  shouldBlockProjectCreation,
  shouldRouteProjectCreationToManagedClients,
  type PackageCapacity,
} from "./billingAllowance";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchProjectAllowance", () => {
  it("uses reserved package units rather than project count for the limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      packageCapacity: {
        billingSlug: "agency",
        kind: "agency",
        access: "paid",
        included: 3,
        purchased: 1,
        reserved: 4,
        used: 2,
        remaining: 0,
        allowance: 4,
        overLimit: false,
      },
    }), { status: 200 })));

    const result = await fetchProjectAllowance();

    expect(result).toMatchObject({
      projectsUsed: 2,
      projectAllowance: 4,
      atLimit: true,
      packageCapacity: { reserved: 4, remaining: 0 },
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("/api/platform/billing/capacity");
  });

  it("keeps the legacy subscription response as a safe fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/platform/billing/capacity")
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify({ projectsUsed: 1, projectAllowance: 2 }), { status: 200 }),
    ));

    expect(await fetchProjectAllowance()).toMatchObject({
      projectsUsed: 1,
      projectAllowance: 2,
      atLimit: false,
    });
  });
});

describe("shouldBlockProjectCreation", () => {
  const fullAgency: PackageCapacity = {
    billingSlug: "agency",
    kind: "agency",
    access: "paid",
    included: 3,
    purchased: 0,
    reserved: 3,
    used: 2,
    remaining: 0,
    allowance: 3,
    overLimit: false,
  };

  it("allows an empty managed client's capacity-neutral first project", () => {
    expect(shouldBlockProjectCreation(fullAgency, {
      agencyManagedClient: true,
      ownerHasProject: false,
    })).toBe(false);
  });

  it("blocks a second managed-client project when the agency pool is full", () => {
    expect(shouldBlockProjectCreation(fullAgency, {
      agencyManagedClient: true,
      ownerHasProject: true,
    })).toBe(true);
  });

  it("blocks a managed client's second project even when the root has spare packages", () => {
    expect(shouldBlockProjectCreation({
      ...fullAgency,
      reserved: 2,
      remaining: 1,
    }, {
      agencyManagedClient: true,
      ownerHasProject: true,
    })).toBe(true);
  });

  it("does not allow an empty-client reservation to bypass inactive or over-limit access", () => {
    expect(shouldBlockProjectCreation({
      ...fullAgency,
      access: "none",
    }, {
      agencyManagedClient: true,
      ownerHasProject: false,
    })).toBe(true);
    expect(shouldBlockProjectCreation({
      ...fullAgency,
      overLimit: true,
    }, {
      agencyManagedClient: true,
      ownerHasProject: false,
    })).toBe(true);
  });

  it("blocks root/direct creation at the limit", () => {
    expect(shouldBlockProjectCreation(fullAgency, {
      agencyManagedClient: false,
      ownerHasProject: false,
    })).toBe(true);
  });
});

describe("shouldRouteProjectCreationToManagedClients", () => {
  it("routes an agency root to client selection", () => {
    expect(shouldRouteProjectCreationToManagedClients({
      role: "agency",
      agencyManagedClient: false,
    })).toBe(true);
  });

  it("does not redirect managed-client or direct-client project creation", () => {
    expect(shouldRouteProjectCreationToManagedClients({
      role: "client",
      agencyManagedClient: true,
    })).toBe(false);
    expect(shouldRouteProjectCreationToManagedClients({
      role: "client",
      agencyManagedClient: false,
    })).toBe(false);
  });
});