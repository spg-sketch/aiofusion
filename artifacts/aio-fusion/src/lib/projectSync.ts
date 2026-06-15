// ---------------------------------------------------------------------------
// Shared project sync.
//
// Projects, their Set-Up (intake) answers and logos used to live only in the
// browser's localStorage, so the same login on a different device (or a
// colleague on the same login) never saw the same projects. This module mirrors
// that data to the shared server store so one login sees everything everywhere,
// while keeping localStorage as a fast local cache and never losing projects
// that only exist locally yet (they get pushed up on the next sync).
//
// The UI still reads localStorage synchronously. This module's job is to keep
// localStorage and the server in step: pull on load, push on change.
// ---------------------------------------------------------------------------

const PROJECTS_KEY = "aio.projects.v1";
const LOGOS_KEY = "aio.clientLogos.v1";
// Per-project timestamp of the last intake save/pull on THIS device, used to
// decide whether the server copy or the local copy is newer.
const INTAKE_TIMES_KEY = "aio.intake.updatedAt.v1";

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
  };
}

async function pullProjects(): Promise<{ projects: ServerProject[]; deletedIds: string[] } | null> {
  try {
    const resp = await fetch(`${apiBase()}/api/store/projects`, { credentials: "include" });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { projects?: ServerProject[]; deletedIds?: string[] };
    return { projects: json.projects ?? [], deletedIds: json.deletedIds ?? [] };
  } catch {
    return null;
  }
}

export async function pushProjectMeta(project: StoredProject, logo?: string | null): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/store/projects/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: project.id,
        name: typeof project.name === "string" ? project.name : "",
        data: project,
        logo: logo ?? null,
      }),
    });
    return res.ok;
  } catch {
    return false; // will retry on next change/sync
  }
}

export async function deleteRemoteProject(id: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/store/projects/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
  } catch {
    /* noop */
  }
}

async function pushIntake(id: string, intake: unknown, name?: string): Promise<void> {
  // Never push a blank Set-Up up: it must not be able to overwrite a populated
  // copy held on the server (the server guards this too, but we avoid even
  // sending it). A new project with no answers yet simply has nothing to save.
  if (intakeIsEmpty(intake)) return;
  try {
    await fetch(`${apiBase()}/api/store/projects/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, intake, name: name ?? "" }),
    });
  } catch {
    /* noop */
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
export async function syncProjectsOnLoad(): Promise<
  { projects: StoredProject[]; logos: Record<string, string> } | null
> {
  const server = await pullProjects();
  if (!server) return null; // offline or API unavailable - keep local only

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
        void pushProjectMeta(hydrated, sp.logo ?? localLogos[lp.id] ?? null);
      }
    } else {
      // Local only: keep it and push it up so other devices get it.
      merged.push(lp);
      if (localLogos[lp.id]) mergedLogos[lp.id] = localLogos[lp.id];
      void pushProjectMeta(lp, localLogos[lp.id]);
    }
  }

  // Then any project that exists only on the server (created elsewhere).
  for (const sp of server.projects) {
    if (seen.has(sp.id) || deleted.has(sp.id)) continue;
    merged.push(hydrateServerProject(sp));
    if (sp.logo) mergedLogos[sp.id] = sp.logo;
  }

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
