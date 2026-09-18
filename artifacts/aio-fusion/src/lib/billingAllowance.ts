import { apiBase } from "./apiHelpers";

export type ProjectAllowance = {
  projectsUsed: number;
  projectAllowance: number;
  atLimit: boolean;
  packageCapacity?: PackageCapacity;
  /** Present when the server can identify beta-trial status. */
  trial?: {
    status?: string;
  };
};

export type PackageCapacity = {
  billingSlug: string;
  kind: "agency" | "client" | "master";
  access?: "paid" | "beta" | "free" | "none";
  included: number;
  purchased: number;
  reserved: number;
  used: number;
  remaining: number | null;
  allowance: number | null;
  overLimit: boolean;
};

/**
 * Client package capacity is reserved when the managed client is created.
 * Therefore its first project is capacity-neutral even when the agency pool is
 * full. This is only a preflight UX decision: the create endpoint remains
 * authoritative when local project state is stale.
 */
export function shouldBlockProjectCreation(
  capacity: PackageCapacity,
  options: { agencyManagedClient: boolean; ownerHasProject: boolean },
): boolean {
  // New writes cannot bypass an inactive or over-limit package. Existing hubs
  // remain readable and the server separately handles capacity-neutral moves
  // of already-live data.
  if (capacity.access === "none" || capacity.overLimit) return true;
  if (
    capacity.kind === "agency"
    && options.agencyManagedClient
  ) {
    // Managed clients have a hard one-project ceiling even if another package
    // is available elsewhere in the agency pool. Their empty reservation makes
    // only their first project capacity-neutral.
    return options.ownerHasProject;
  }
  return capacity.remaining !== null && capacity.remaining <= 0;
}

export function shouldRouteProjectCreationToManagedClients(
  account: { role?: string | null; agencyManagedClient?: boolean | null },
): boolean {
  return account.role === "agency" && account.agencyManagedClient !== true;
}

function parsePackageCapacity(value: unknown): PackageCapacity | undefined {
  if (!value || typeof value !== "object") return undefined;
  const capacity = value as Record<string, unknown>;
  if (
    typeof capacity.billingSlug !== "string"
    || !["agency", "client", "master"].includes(String(capacity.kind))
    || !["included", "purchased", "reserved", "used"].every(
      (key) => typeof capacity[key] === "number" && Number.isFinite(capacity[key]),
    )
    || !(capacity.remaining === null || (typeof capacity.remaining === "number" && Number.isFinite(capacity.remaining)))
    || !(capacity.allowance === null || (typeof capacity.allowance === "number" && Number.isFinite(capacity.allowance)))
    || typeof capacity.overLimit !== "boolean"
  ) return undefined;
  return capacity as PackageCapacity;
}

/**
 * Reads the server-calculated project allowance for the current billing
 * workspace. A null result means the preflight could not be completed; the
 * server-side project creation guard remains the authority in that case.
 */
export async function fetchProjectAllowance(): Promise<ProjectAllowance | null> {
  try {
    const capacityRes = await fetch(`${apiBase()}/api/platform/billing/capacity`, {
      credentials: "include",
      cache: "no-store",
    });
    if (capacityRes.ok) {
      const payload = (await capacityRes.json()) as { packageCapacity?: unknown; capacity?: unknown };
      const packageCapacity = parsePackageCapacity(payload.packageCapacity ?? payload.capacity);
      if (packageCapacity) {
        return {
          projectsUsed: packageCapacity.used,
          projectAllowance: packageCapacity.allowance ?? Number.MAX_SAFE_INTEGER,
          atLimit: packageCapacity.remaining !== null && packageCapacity.remaining <= 0,
          packageCapacity,
        };
      }
    }
    const res = await fetch(`${apiBase()}/api/platform/billing/subscription`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      projectsUsed?: unknown;
      projectAllowance?: unknown;
      packageCapacity?: unknown;
      capacity?: unknown;
      trial?: { status?: unknown };
    };
    if (
      typeof json.projectsUsed !== "number" ||
      typeof json.projectAllowance !== "number"
    ) {
      return null;
    }
    const packageCapacity = parsePackageCapacity(json.capacity ?? json.packageCapacity);
    return {
      projectsUsed: json.projectsUsed,
      projectAllowance: json.projectAllowance,
      atLimit: packageCapacity
        ? packageCapacity.remaining !== null && packageCapacity.remaining <= 0
        : json.projectsUsed >= json.projectAllowance,
      ...(packageCapacity ? { packageCapacity } : {}),
      ...(json.trial && typeof json.trial === "object" && typeof json.trial.status === "string"
        ? { trial: { status: json.trial.status } }
        : {}),
    };
  } catch {
    return null;
  }
}