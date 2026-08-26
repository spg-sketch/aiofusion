import { apiBase } from "./apiHelpers";

export type ProjectAllowance = {
  projectsUsed: number;
  projectAllowance: number;
  atLimit: boolean;
};

/**
 * Reads the server-calculated project allowance for the current billing
 * workspace. A null result means the preflight could not be completed; the
 * server-side project creation guard remains the authority in that case.
 */
export async function fetchProjectAllowance(): Promise<ProjectAllowance | null> {
  try {
    const res = await fetch(`${apiBase()}/api/platform/billing/subscription`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      projectsUsed?: unknown;
      projectAllowance?: unknown;
    };
    if (
      typeof json.projectsUsed !== "number" ||
      typeof json.projectAllowance !== "number"
    ) {
      return null;
    }
    return {
      projectsUsed: json.projectsUsed,
      projectAllowance: json.projectAllowance,
      atLimit: json.projectsUsed >= json.projectAllowance,
    };
  } catch {
    return null;
  }
}