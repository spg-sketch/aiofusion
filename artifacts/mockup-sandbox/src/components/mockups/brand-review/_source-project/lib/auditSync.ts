import type { SavedAudit } from "../LlmCheckPage";
import type { SavedDiagnostic } from "./diagnosticStore";
import { loadSavedAudits } from "../LlmCheckPage";
import { loadSavedDiagnostics } from "./diagnosticStore";

export async function syncAuditsForProject(
  clientId: string,
): Promise<SavedAudit[]> {
  return loadSavedAudits(clientId);
}

export async function syncDiagnosticsForProject(
  clientId: string,
): Promise<SavedDiagnostic[]> {
  return loadSavedDiagnostics(clientId);
}