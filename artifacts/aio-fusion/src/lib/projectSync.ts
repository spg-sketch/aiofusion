// ---------------------------------------------------------------------------
// Shared project sync.
//
// Projects, their Set-Up (intake) answers and logos used to live only in the
// browser's localStorage, so the same login on a different device (or a
// colleague on the same login) never saw the same projects. The authenticated
// server list is now authoritative. localStorage remains a synchronous cache,
// but it may only contain projects returned for the current server session.
//
// The UI still reads localStorage synchronously. This module's job is to keep
// localStorage and the server in step: pull on load, push on change.
// ---------------------------------------------------------------------------

const PROJECTS_KEY = "aio.projects.v1";
const LOGOS_KEY = "aio.clientLogos.v1";
// Per-project timestamp of the last intake save/pull on THIS device, used to
// decide whether the server copy or the local copy is newer.
const INTAKE_TIMES_KEY = "aio.intake.updatedAt.v1";

const ACTIVE_PROJECT_KEY = "aio.activeProjectId";

// ---------------------------------------------------------------------------
// Active-project integrity check
// ---------------------------------------------------------------------------

// Module-level cache of project IDs currently accessible to the signed-in
// user. Updated via setKnownProjectIds after every project sync so that the
// check inside setActiveProjectId always compares against the latest list.
let _knownProjectIds: Set<string> = new Set();
let _knownProjectIdsLoaded = false;

// Register the set of project IDs that are valid for the current user. Call
// this after every project sync (syncProjectsOnLoad) so the integrity check
// inside setActiveProjectId stays current.
export function setKnownProjectIds(ids: string[]): void {
  _knownProjectIds = new Set(ids);
  _knownProjectIdsLoaded = true;
}

export function isKnownProjectId(id: string): boolean {
  return _knownProjectIdsLoaded && _knownProjectIds.has(id);
}

// Pure utility: reads aio.activeProjectId from localStorage and clears it with
// a console warning when the stored ID is not in projectIds. A missing ID (no
// value stored) is a no-op. This function is called only with an authoritative
// server list, so an empty list clears any stale pointer too.
export function assertActiveProjectConsistency(projectIds: string[]): void {
  const ids = new Set(projectIds);
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return;
  }
  if (!stored) return;
  if (!ids.has(stored)) {
    console.warn(
      `[AIO] Active project ID "${stored}" is not in the current user's project list. Clearing stale value.`,
    );
    try {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    } catch {
      /* noop */
    }
  }
}

// Convenience wrapper used inside setActiveProjectId (IntakeForm.tsx): runs
// the consistency check against the module-level cache so the caller does not
// need to pass the list explicitly on every switch.
export function assertActiveProjectConsistencyFromCache(): void {
  if (!_knownProjectIdsLoaded) return;
  assertActiveProjectConsistency([..._knownProjectIds]);
}

type StoredProject = Record<string, unknown> & { id: string; name?: string };

const apiBase = () => (import.meta.env.DEV ? `https://${window.location.host}` : "");

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* noop */
  }
  return fallback;
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

// Resolve the localStorage key for a project's intake blob. Every project now
// uses its own namespaced key, including the legacy "default" project, so it can
// no longer share (and collide on) the bare "aio.intake.v2" key across devices.
function intakeKey(id: string): string {
  return id ? `aio.intake.v2::${id}` : "aio.intake.v2";
}

// One-time copy of the legacy bare-key intake into the namespaced "default" key.
// The "default" project used to read/write the bare "aio.intake.v2" key, which a
// blank copy on another device could collide with and wipe. We move it onto its
// own key, but never delete the bare key and never overwrite an existing
// namespaced copy, so this can only ever preserve data, never lose it.
export function ensureDefaultIntakeMigrated(): void {
  try {
    if (localStorage.getItem("aio.intake.v2::default") != null) return;
    const bare = localStorage.getItem("aio.intake.v2");
    if (bare != null) localStorage.setItem("aio.intake.v2::default", bare);
  } catch {
    /* noop */
  }
}

// True when an intake blob carries no real answers (e.g. a blank Draft). Mirrors
// the server-side guard: an intake counts as populated if any Set-Up answer,
// category list or dual-field entry has a value. Used so a blank Draft is never
// pushed up over, nor pulled down over, a populated Set-Up.
function intakeIsEmpty(intake: unknown): boolean {
  if (intake == null || typeof intake !== "object") return true;
  const obj = intake as Record<string, unknown>;
  const fd = obj.formData;
  if (fd && typeof fd === "object") {
    for (const v of Object.values(fd as Record<string, unknown>)) {
      if (typeof v === "string") {
        if (v.trim() !== "") return false;
      } else if (Array.isArray(v)) {
        if (v.length > 0) return false;
      } else if (v != null && v !== false) {
        return false;
      }
    }
  }
  for (const key of ["businessCategories", "mediaCategories", "audienceCategories"]) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > 0) return false;
  }
  const duals = obj.duals;
  if (duals && typeof duals === "object" && Object.keys(duals as object).length > 0) {
    return false;
  }
  return true;
}

function getIntakeTimes(): Record<string, number> {
  return readJson<Record<string, number>>(INTAKE_TIMES_KEY, {});
}

function setIntakeTime(id: string, when: number): void {
  const map = getIntakeTimes();
  map[id] = when;
  writeJson(INTAKE_TIMES_KEY, map);
}

// --- Server calls (all fire-and-forget safe: never throw) ------------------

type ServerProject = {
  id: string;
  name?: string | null;
  data: StoredProject;
  logo: string | null;
  /** Authoritative owner from the server's owner column (reassignments update
   * this column, not the data blob), so it must win over data.owner. */
  owner?: string | null;
  updatedAt: string | null;
};

// The placeholder used for a project that has no real name yet. Treated as
// "not a real name" when resolving, so a stale placeholder never wins over a
// genuine name from another source.
const GENERIC_PROJECT_NAME = "New Project";

// Pick the best display name from a list of candidates. A real (non-empty,
// non-placeholder) name always wins; only if none exists do we fall back to any
// non-empty value and finally the generic placeholder. This is what stops a
// stale "New Project" in one source from clobbering a genuine name in another.
function pickName(...candidates: string[]): string {
  const cleaned = candidates.map((c) => (typeof c === "string" ? c.trim() : ""));
  const real = cleaned.find((c) => c && c !== GENERIC_PROJECT_NAME);
  if (real) return real;
  const anyNonEmpty = cleaned.find((c) => c);
  return anyNonEmpty || GENERIC_PROJECT_NAME;
}

function hydrateServerProject(sp: ServerProject, fallbackName = ""): StoredProject {
  const data: Record<string, unknown> =
    sp.data && typeof sp.data === "object" ? (sp.data as Record<string, unknown>) : {};
  const dataId = typeof data.id === "string" ? data.id : "";
  const dataName = typeof data.name === "string" ? data.name : "";
  const colName = typeof sp.name === "string" ? sp.name : "";
  return {
    ...data,
    id: dataId || sp.id,
    // Prefer a real name (server data, then the recovered column name, then the
    // caller's local fallback) over a stale placeholder or empty value, so the
    // merge never overwrites a good name with "New Project".
    name: pickName(dataName, colName, fallbackName),
    // The owner column is authoritative: assigning a project to another account
    // updates the column but leaves the stale creator inside the data blob, so
    // the column must overwrite it or the new owner never sees the project.
    ...(typeof sp.owner === "string" && sp.owner.trim()
      ? { owner: sp.owner.trim().toLowerCase() }
      : {}),
  };
}

async function pullProjects(signal?: AbortSignal): Promise<{ projects: ServerProject[]; deletedIds: string[] } | null | "unauthorized"> {
  const invalidatedIds = new Set<string>();
  pendingProjectReads.add(invalidatedIds);
  try {
    const resp = await fetch(`${apiBase()}/api/store/projects`, { credentials: "include", signal });
    if (resp.status === 401) return "unauthorized";
    if (!resp.ok) return null;
    const json = (await resp.json()) as { projects?: ServerProject[]; deletedIds?: string[] };
    return {
      projects: (json.projects ?? []).filter((p) => !invalidatedIds.has(p.id)),
      deletedIds: [...new Set([...(json.deletedIds ?? []), ...invalidatedIds])],
    };
  } catch {
    return null;
  } finally {
    pendingProjectReads.delete(invalidatedIds);
  }
}

export type PushProjectResult = { ok: boolean; limitReached?: boolean; error?: string };

export type ProjectReconciliationAudit = {
  serverProjectIds: string[];
  localOnly: Array<{
    id: string;
    name: string;
    recovered: boolean;
    error?: string;
  }>;
};

export async function pushProjectMeta(
  project: StoredProject,
  logo?: string | null,
  options: { signal?: AbortSignal; owner?: string } = {},
): Promise<PushProjectResult> {
  try {
    const res = await fetch(`${apiBase()}/api/store/projects/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: options.signal,
      body: JSON.stringify({
        id: project.id,
        name: typeof project.name === "string" ? project.name : "",
        data: project,
        logo: logo ?? null,
        ...(options.owner ? { owner: options.owner } : {}),
      }),
    });
    if (res.ok) return { ok: true };
    try {
      const json = (await res.json()) as { error?: string; limitReached?: boolean };
      return { ok: false, limitReached: json.limitReached === true, error: json.error };
    } catch {
      return { ok: false };
    }
  } catch {
    return { ok: false }; // will retry on next change/sync
  }
}

// Compare this browser's cache with the active server records. Legacy browser
// records are not account-bound, so unmatched entries can be reported but must
// never be uploaded into whichever account happens to be signed in now.
export async function auditAndRecoverLocalProjects(): Promise<
  ProjectReconciliationAudit | null | "unauthorized"
> {
  const invalidatedIds = new Set<string>();
  pendingProjectReads.add(invalidatedIds);
  try {
    return await recoverLocalProjects(invalidatedIds);
  } finally {
    pendingProjectReads.delete(invalidatedIds);
  }
}

async function recoverLocalProjects(invalidatedIds: Set<string>): Promise<
  ProjectReconciliationAudit | null | "unauthorized"
> {
  const server = await pullProjects();
  if (server === "unauthorized" || server === null) return server;

  const activeIds = new Set(server.projects.map((project) => project.id));
  const deletedIds = new Set(server.deletedIds);
  const localProjects = readJson<StoredProject[]>(PROJECTS_KEY, []);
  const localLogos = readJson<Record<string, string>>(LOGOS_KEY, {});
  const localOnly: ProjectReconciliationAudit["localOnly"] = [];

  for (const project of localProjects) {
    if (!project || typeof project.id !== "string") continue;
    if (activeIds.has(project.id)) continue;
    if (deletedIds.has(project.id)) {
      localOnly.push({
        id: project.id,
        name: pickName(typeof project.name === "string" ? project.name : ""),
        recovered: false,
        error: "this project was deleted on the server",
      });
      continue;
    }
    localOnly.push({
      id: project.id,
      name: pickName(typeof project.name === "string" ? project.name : ""),
      recovered: false,
      error: "browser-only project cannot be safely assigned to the current account",
    });
  }

  // Hydrate the browser cache from the authoritative server snapshot before the
  // review UI is enabled. Projects created on another device appear, while
  // unmatched browser records are discarded rather than assigned implicitly.
  const serverById = new Map(server.projects.map((project) => [project.id, project]));
  const merged: StoredProject[] = [];
  const mergedLogos: Record<string, string> = {};
  const seen = new Set<string>();
  for (const localProject of localProjects) {
    if (!localProject || typeof localProject.id !== "string" || deletedIds.has(localProject.id)) continue;
    const serverProject = serverById.get(localProject.id);
    if (serverProject) {
      seen.add(localProject.id);
      merged.push({
        ...localProject,
        ...hydrateServerProject(
          serverProject,
          typeof localProject.name === "string" ? localProject.name : "",
        ),
      });
      const logo = serverProject.logo ?? localLogos[localProject.id];
      if (logo) mergedLogos[localProject.id] = logo;
    }
  }
  for (const serverProject of server.projects) {
    if (seen.has(serverProject.id) || deletedIds.has(serverProject.id)) continue;
    merged.push(hydrateServerProject(serverProject));
    if (serverProject.logo) mergedLogos[serverProject.id] = serverProject.logo;
  }
  for (const id of invalidatedIds) {
    delete mergedLogos[id];
    activeIds.delete(id);
  }
  writeJson(PROJECTS_KEY, merged.filter((p) => !invalidatedIds.has(p.id)));
  writeJson(LOGOS_KEY, mergedLogos);

  return { serverProjectIds: [...activeIds], localOnly };
}

export type DeleteProjectResult = { ok: true } | { ok: false; error: string };

// Invalidate only reads already in flight when deletion is confirmed. A later
// authoritative fetch may legitimately contain a restored project.
const pendingProjectReads = new Set<Set<string>>();

export async function deleteRemoteProject(id: string): Promise<DeleteProjectResult> {
  try {
    const response = await fetch(`${apiBase()}/api/store/projects/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok !== true) {
      return {
        ok: false,
        error: typeof body?.error === "string" ? body.error : "Could not confirm project deletion. Please try again.",
      };
    }
    for (const invalidated of pendingProjectReads) invalidated.add(id);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}

// True when an intake blob carries a confirmed company identity (the choice made
// for an ambiguous brand name). This lives inside the intake blob but is not a
// "real Set-Up answer", so intakeIsEmpty ignores it.
function intakeHasConfirmedEntity(intake: unknown): boolean {
  if (intake == null || typeof intake !== "object") return false;
  const ce = (intake as Record<string, unknown>).confirmedEntity;
  return ce != null && typeof ce === "object";
}

async function pushIntake(id: string, intake: unknown, name?: string): Promise<boolean> {
  // Never push a blank Set-Up up: it must not be able to overwrite a populated
  // copy held on the server (the server guards this too, but we avoid even
  // sending it). A new project with no answers yet simply has nothing to save.
  // Exception: a confirmed company identity must still be sent even when the rest
  // of the Set-Up is sparse, so the choice persists cross-device. The server
  // merges just that key onto the existing intake, so this can never wipe
  // populated answers.
  if (intakeIsEmpty(intake) && !intakeHasConfirmedEntity(intake)) return true;
  try {
    const response = await fetch(`${apiBase()}/api/store/projects/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, intake, name: name ?? "" }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchRemoteIntake(id: string): Promise<{ intake: unknown; updatedAt: string | null } | null> {
  try {
    const resp = await fetch(`${apiBase()}/api/store/projects/${encodeURIComponent(id)}/intake`, {
      credentials: "include",
    });
    if (!resp.ok) return null;
    return (await resp.json()) as { intake: unknown; updatedAt: string | null };
  } catch {
    return null;
  }
}

// --- High-level sync used by the app ---------------------------------------

// Pull the shared project list, merge it with whatever is in localStorage, push
// up any project that only exists locally (so nothing is ever lost), drop any
// project that was deleted elsewhere, and return the merged result so the hub
// can re-render. localStorage is updated as the local cache.
export async function syncProjectsOnLoad(options: {
  signal?: AbortSignal;
  activeProjectId?: string;
} = {}): Promise<
  { projects: StoredProject[]; logos: Record<string, string> } | null | "unauthorized"
> {
  let server = await pullProjects(options.signal);
  if (server === "unauthorized") return "unauthorized"; // session expired
  if (!server) return null; // offline or API unavailable - keep local only
  // A session/workspace switch superseded this pull. It must not merge the
  // previous identity's response into browser caches.
  if (options.signal?.aborted) return null;

  // A transiently incomplete list must not revoke the project that is currently
  // open in the hub. Confirm an omission with one fresh authoritative read
  // before changing the local cache. A server tombstone is already explicit
  // removal evidence and remains authoritative without a second request.
  if (
    options.activeProjectId &&
    !server.projects.some((project) => project.id === options.activeProjectId) &&
    !server.deletedIds.includes(options.activeProjectId)
  ) {
    server = await pullProjects(options.signal);
    if (server === "unauthorized") return "unauthorized";
    if (!server) return null;
    if (options.signal?.aborted) return null;
  }

  const localProjects = readJson<StoredProject[]>(PROJECTS_KEY, []);
  const localLogos = readJson<Record<string, string>>(LOGOS_KEY, {});

  const deleted = new Set(server.deletedIds);
  const serverById = new Map<string, ServerProject>();
  for (const sp of server.projects) serverById.set(sp.id, sp);

  const merged: StoredProject[] = [];
  const mergedLogos: Record<string, string> = {};
  const seen = new Set<string>();

  // Local order first, so the hub keeps the order the user is used to.
  for (const lp of localProjects) {
    if (!lp || typeof lp.id !== "string") continue;
    if (deleted.has(lp.id)) continue; // removed on another device
    seen.add(lp.id);
    const sp = serverById.get(lp.id);
    if (sp) {
      // Exists in both: server record wins for real content, but never let an
      // empty/nameless server row wipe a good local entry. Passing the local
      // name as the fallback stops a blank server name overwriting it with the
      // generic "New Project".
      const localName = typeof lp.name === "string" ? lp.name : "";
      const hydrated = { ...lp, ...hydrateServerProject(sp, localName) };
      merged.push(hydrated);
      const logo = sp.logo ?? localLogos[lp.id];
      if (logo) mergedLogos[lp.id] = logo;
      // Self-heal the shared record: if the server row's stored data blob is
      // empty or only carries a placeholder name (e.g. an intake-only row) but
      // we now have a real name, push the hydrated record up so every device
      // gets the proper record instead of a blank "New Project". Also pushes a
      // local-only logo up. Once the row carries the real name + data this stops
      // triggering, so there is no repeated-push loop.
      const serverData =
        sp.data && typeof sp.data === "object" ? (sp.data as Record<string, unknown>) : {};
      const serverDataName = typeof serverData.name === "string" ? serverData.name.trim() : "";
      const serverRecordHealthy =
        Object.keys(serverData).length > 0 &&
        !!serverDataName &&
        serverDataName !== GENERIC_PROJECT_NAME;
      const hydratedName = typeof hydrated.name === "string" ? hydrated.name.trim() : "";
      const nameWorthSaving = !!hydratedName && hydratedName !== GENERIC_PROJECT_NAME;
      const repairRecord = !serverRecordHealthy && nameWorthSaving;
      if (repairRecord || (!sp.logo && localLogos[lp.id])) {
        void pushProjectMeta(hydrated, sp.logo ?? localLogos[lp.id] ?? null, { signal: options.signal });
      }
    }
  }

  // Then any project that exists only on the server (created elsewhere).
  // A local-only project is deliberately discarded. There is no trustworthy
  // account identity attached to the legacy browser cache, so uploading it here
  // could recreate another account's project after logout/login or switching.
  for (const sp of server.projects) {
    if (seen.has(sp.id) || deleted.has(sp.id)) continue;
    merged.push(hydrateServerProject(sp));
    if (sp.logo) mergedLogos[sp.id] = sp.logo;
  }

  if (options.signal?.aborted) return null;
  writeJson(PROJECTS_KEY, merged);
  writeJson(LOGOS_KEY, mergedLogos);
  return { projects: merged, logos: mergedLogos };
}

// Make sure the local intake cache for a project is the latest before the
// Set-Up form / dashboard reads it. Pulls a newer server copy down, or pushes a
// newer local copy up. Returns true if the local copy was replaced.
export async function syncIntakeForProject(id: string): Promise<boolean> {
  if (!id) return false;
  // Make sure the legacy "default" project is on its own namespaced key before
  // we read it, so we never miss its answers or compare the wrong copy.
  ensureDefaultIntakeMigrated();
  const remote = await fetchRemoteIntake(id);
  const key = intakeKey(id);
  let localRaw: string | null = null;
  try {
    localRaw = localStorage.getItem(key);
  } catch {
    /* noop */
  }
  let localParsed: unknown = null;
  try {
    localParsed = localRaw ? JSON.parse(localRaw) : null;
  } catch {
    localParsed = null;
  }
  const localEmpty = intakeIsEmpty(localParsed);

  const times = getIntakeTimes();
  const hasLocalTime = Object.prototype.hasOwnProperty.call(times, id);
  const localTime = times[id] ?? 0;

  if (remote && remote.intake != null) {
    const remoteEmpty = intakeIsEmpty(remote.intake);
    const remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;

    // A blank shared copy must NEVER overwrite populated local answers. Instead
    // push the populated local copy up so the shared copy is healed. This is
    // what restores a project whose server copy was wiped: the device that still
    // holds the real answers pushes them back up.
    if (remoteEmpty && !localEmpty) {
      void pushIntake(id, localParsed);
      setIntakeTime(id, Date.now());
      return false;
    }

    // A blank local copy must NEVER be pushed up over populated shared answers.
    // Adopt the shared copy instead.
    if (localEmpty && !remoteEmpty) {
      writeJson(key, remote.intake);
      setIntakeTime(id, remoteTime || Date.now());
      return true;
    }

    // Both populated (or both blank): resolve by timestamp as before.
    if (!localRaw) {
      // Nothing local to lose: adopt the shared copy.
      writeJson(key, remote.intake);
      setIntakeTime(id, remoteTime || Date.now());
      return true;
    }

    if (!hasLocalTime) {
      // Local answers exist but pre-date sync tracking (e.g. created before
      // this feature, or never confirmed-synced). We cannot know their age, so
      // we must NEVER silently overwrite them with the server copy. Keep local,
      // push it up so it becomes the shared copy, then start tracking its time.
      void pushIntake(id, localParsed);
      setIntakeTime(id, Date.now());
      return false;
    }

    if (remoteTime > localTime) {
      writeJson(key, remote.intake);
      setIntakeTime(id, remoteTime || Date.now());
      return true;
    }
    if (localTime > remoteTime) {
      void pushIntake(id, localParsed);
    }
    return false;
  }

  // Server has no intake yet but we do: push our copy up so it is shared and
  // start tracking its time so future syncs can compare properly. (pushIntake
  // ignores a blank copy, so an empty Draft is never sent.)
  if (localRaw && !localEmpty) {
    void pushIntake(id, localParsed);
    setIntakeTime(id, Date.now());
  }
  return false;
}

// Record a local intake save and mirror it to the server. Call this right after
// writing the intake blob to localStorage.
export function markIntakeSaved(id: string, intake: unknown, name?: string): void {
  if (!id) return;
  setIntakeTime(id, Date.now());
  void pushIntake(id, intake, name);
}
