import type { Client } from "../types";
import { getSession as getLocalSession, getUsers as getLocalUsers } from "./auth";
import { pushProjectMeta } from "./projectSync";

export const CREATED_PROJECTS_KEY = "aio.projects.v1";
export const PROJECT_COLORS = ["#C8497A", "#1f748f", "#2896b9", "#165265", "#D4922A", "#3D9B6B"];
export const CLIENT_LOGOS_KEY = "aio.clientLogos.v1";

export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "P";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Read the most meaningful sector label for a project card directly from that
// project's stored intake data, without changing the active project. Falls back
// gracefully at every step so the card never crashes.
export function getProjectSectorLabel(projectId: string): string {
  try {
    const key = projectId === "default"
      ? "aio.intake.v2"
      : `aio.intake.v2::${projectId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return "Awaiting set-up";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.intakeStatus === "Accepted") return "Completed";
    const sectors = (parsed.businessCategories as string[] | undefined) || [];
    if (sectors.length > 0) return sectors[0];
    if (parsed.intakeStatus === "Optimised") return "Optimised";
  } catch { /* noop */ }
  return "Awaiting set-up";
}

export function loadStoredProjects(): Client[] {
  try {
    const raw = localStorage.getItem(CREATED_PROJECTS_KEY);
    if (raw) return JSON.parse(raw) as Client[];
  } catch { /* noop */ }
  return [];
}

export function saveStoredProjects(list: Client[]): void {
  try { localStorage.setItem(CREATED_PROJECTS_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

export function loadClientLogos(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CLIENT_LOGOS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* noop */ }
  return {};
}

export function saveClientLogos(map: Record<string, string>): void {
  try {
    localStorage.setItem(CLIENT_LOGOS_KEY, JSON.stringify(map));
  } catch {
    // Most likely the browser storage limit was hit by a large logo image.
    if (typeof window !== "undefined") {
      window.alert("This logo could not be saved because it is too large for browser storage. Please try a smaller image (under 1MB).");
    }
  }
}

// One-time migration: if the user already completed an intake before projects
// were saveable, that data lives under the bare "aio.intake.v2" key. Surface it
// in the hub as a real "default" project so it is not orphaned.
export function migrateLegacyIntakeToProject(): void {
  const projects = loadStoredProjects();
  if (projects.some((p) => p.id === "default")) return;
  let raw: string | null = null;
  try { raw = localStorage.getItem("aio.intake.v2"); } catch { /* noop */ }
  if (!raw) return;
  let name = "New Project";
  try {
    const fd = JSON.parse(raw).formData || {};
    if (typeof fd["4.1"] === "string" && fd["4.1"].trim()) name = fd["4.1"].trim();
  } catch { /* noop */ }
  projects.unshift({
    id: "default",
    name,
    sector: "Awaiting set-up",
    initials: deriveInitials(name),
    color: PROJECT_COLORS[0],
    contentCount: 0,
    avgScore: 0,
    scoreTrend: 0,
    activePlans: 0,
    lastActive: "Today",
    recentActivity: "Set-up saved",
  });
  saveStoredProjects(projects);
}

export function createStoredProject(name: string): Client {
  const projects = loadStoredProjects();
  const clean = name.trim() || "New Project";
  const owner = getLocalSession()?.username;
  const project: Client = {
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    sector: "Awaiting set-up",
    initials: deriveInitials(clean),
    color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    contentCount: 0,
    avgScore: 0,
    scoreTrend: 0,
    activePlans: 0,
    lastActive: "Just now",
    recentActivity: "Project created",
    createdAt: new Date().toISOString(),
    ...(owner ? { owner } : {}),
  };
  saveStoredProjects([project, ...projects]);
  return project;
}

// Hand a project to a different account (e.g. an agency assigning a project to
// one of its client sub-accounts). Updates the owner in local storage and
// returns the updated project so the caller can mirror it to the shared store.
export function assignProjectOwner(id: string, owner: string): Client | null {
  const projects = loadStoredProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated: Client = { ...projects[idx], owner };
  projects[idx] = updated;
  saveStoredProjects(projects);
  return updated;
}

// Self-heal projects that have no owner. Projects created before ownership was
// tracked (and legacy rows whose owner column is still NULL on the server) have
// no owner, so they are attributed to nobody in User Management and no agency or
// client can ever see them. Assign each to the master account so it shows under
// that account again.
//
// This deliberately runs on EVERY load rather than once behind a flag: an
// ownerless project can arrive at any time from the shared store sync (a legacy
// row the server returns to the master because NULL owner is treated as
// admin-only), long after a one-time migration would have run. A per-project,
// idempotent heal is the only thing that stops such a project silently
// "disappearing again". Only the master's browser caches an admin-role account,
// so only the master ever claims here, and the matching server-side coalesce
// only fills a NULL owner (it never reassigns a real one), so the claim is safe.
export async function migrateAssignOwnerlessToAdmin(): Promise<void> {
  try {
    const ownerless = loadStoredProjects().filter((p) => !p.owner);
    if (!ownerless.length) return;
    const admin = getLocalUsers().find((u) => u.role === "admin");
    if (!admin) return; // only the master may claim ownerless projects
    for (const p of ownerless) {
      const claimed = { ...p, owner: admin.username } as Client;
      // Persist the claim locally only once the shared store confirms it. A
      // transient push failure then leaves the project ownerless so it retries
      // on the next sync, rather than going NULL-owned on the server forever.
      const result = await pushProjectMeta(claimed as unknown as Record<string, unknown> & { id: string });
      if (!result.ok) continue;
      const current = loadStoredProjects();
      const idx = current.findIndex((x) => x.id === p.id);
      if (idx !== -1 && !current[idx].owner) {
        current[idx] = { ...current[idx], owner: admin.username };
        saveStoredProjects(current);
      }
    }
  } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Intake key migration helpers
// ---------------------------------------------------------------------------
// Self-healing intake field renumbering. Field ids double as storage keys, and
// this runs at module load (before any component reads intake data) so the
// renamed keys are in place on the very first render.

function remapIntakeContainer(obj: unknown, remap: Record<string, string>): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[remap[k] ?? k] = v;
  return out;
}

function projectHasIntakeKey(parsed: Record<string, unknown>, fieldId: string): boolean {
  const has = (o: unknown) =>
    !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, fieldId);
  return has(parsed.formData) || has(parsed.duals) || has(parsed.dualLists);
}

function applyIntakeRemap(parsed: Record<string, unknown>, remap: Record<string, string>): void {
  if (parsed.formData) parsed.formData = remapIntakeContainer(parsed.formData, remap);
  if (parsed.duals) parsed.duals = remapIntakeContainer(parsed.duals, remap);
  if (parsed.dualLists) parsed.dualLists = remapIntakeContainer(parsed.dualLists, remap);
  if (Array.isArray(parsed.optimisedFields)) {
    parsed.optimisedFields = (parsed.optimisedFields as string[]).map((id) => remap[id] ?? id);
  }
  const snap = parsed.preOptimiseSnapshot as Record<string, unknown> | null | undefined;
  if (snap && typeof snap === "object") {
    if (snap.formData) snap.formData = remapIntakeContainer(snap.formData, remap);
    if (snap.duals) snap.duals = remapIntakeContainer(snap.duals, remap);
    if (snap.dualLists) snap.dualLists = remapIntakeContainer(snap.dualLists, remap);
  }
}

// Step 1: ICP (1.11) -> 3.2. Step 2: locations (1.12) -> 3.3. Each step also
// shifts the following section-3 fields down by one to make room.
const INTAKE_RENUMBER_STEPS: { trigger: string; remap: Record<string, string> }[] = [
  { trigger: "1.11", remap: { "1.11": "3.2", "3.2": "3.3", "3.3": "3.4", "3.4": "3.5" } },
  { trigger: "1.12", remap: { "1.12": "3.3", "3.3": "3.4", "3.4": "3.5", "3.5": "3.6" } },
];

export function migrateStoredIntakeKeys(): void {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("aio.intake.v2")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
      if (!parsed || typeof parsed !== "object") continue;
      let changed = false;
      for (const step of INTAKE_RENUMBER_STEPS) {
        if (projectHasIntakeKey(parsed, step.trigger)) {
          applyIntakeRemap(parsed, step.remap);
          changed = true;
        }
      }
      if (changed) localStorage.setItem(key, JSON.stringify(parsed));
    }
  } catch { /* noop */ }
}
