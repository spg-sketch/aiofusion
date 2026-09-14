import { useState, useEffect } from "react";
import { getActiveProjectId } from "../IntakeForm";
import { apiBase } from "./contentAi";
import { stripEmDashes, normaliseAddedData } from "./utils";
export type ArchiveItem = {
  id: string;
  title: string;
  contentType: string;
  spokesperson?: string;
  status: "Draft" | "Final";
  tags: string[];
  body: string;
  headline?: string;
  standfirst?: string;
  bodyCopy?: string;
  actionNotes?: string;
  selectedMessages?: string[];
  mediaCats?: string[];
  pubDate?: string;
  createdAt: string;
  releasedAt?: string;
  releaseChannel?: string;
  source?: "optimiser" | "creator";
  projectId?: string;
};

export function splitArchiveBody(arc: { body?: string; headline?: string; standfirst?: string; bodyCopy?: string }): { headline: string; standfirst: string; bodyCopy: string } {
  // Strip any em dashes left in previously saved drafts so retrieved content is clean.
  if (arc.headline !== undefined || arc.standfirst !== undefined || arc.bodyCopy !== undefined) {
    return {
      headline: stripEmDashes(arc.headline || ""),
      standfirst: stripEmDashes(arc.standfirst || ""),
      // Use arc.bodyCopy when it is explicitly set (even if empty ""), only fall back to
      // arc.body for legacy items that pre-date the explicit bodyCopy field.
      bodyCopy: normaliseAddedData(stripEmDashes(arc.bodyCopy !== undefined ? arc.bodyCopy : (arc.body || ""))),
    };
  }
  const parts = (arc.body || "").split(/\n\n+/);
  if (parts.length >= 3) return { headline: stripEmDashes(parts[0]), standfirst: stripEmDashes(parts[1]), bodyCopy: normaliseAddedData(stripEmDashes(parts.slice(2).join("\n\n"))) };
  if (parts.length === 2) return { headline: stripEmDashes(parts[0]), standfirst: "", bodyCopy: normaliseAddedData(stripEmDashes(parts[1])) };
  return { headline: "", standfirst: "", bodyCopy: normaliseAddedData(stripEmDashes(arc.body || "")) };
}

// ---------------------------------------------------------------------------
// Content store - archive, planner and scoring config
// ---------------------------------------------------------------------------
// Items live in a module-level in-memory cache populated from the server on
// login. All reads return synchronously from the cache so existing call sites
// (useMemo, useState initialisers, etc.) keep working without change.
// Mutations update the cache only after the server confirms them.
// ---------------------------------------------------------------------------

const CONTENT_STORE_MIGRATED_KEY = "aio.store.migrated.v1";
// Legacy localStorage keys - kept so the one-time migration can find them.
const ARCHIVE_KEY  = "aio.archive.v1";
const PROJECTS_KEY = "aio.planner.projects.v1";

let _archiveCache:  (ArchiveItem & { projectId: string })[] | null = null;
let _plannerCache:  (PlannerProject & { projectId: string })[] | null = null;
let _scoringCache:  ScoringConfig | null = null;
export type ContentStoreStatus = "loading" | "ready" | "authentication-error" | "network-error";
export type ContentStoreState = {
  status: ContentStoreStatus;
  mutationPending: boolean;
  mutationError: "authentication" | "network" | null;
};
let _contentStoreState: ContentStoreState = {
  status: "loading",
  mutationPending: false,
  mutationError: null,
};
let _archiveMutation = Promise.resolve();
let _plannerMutation = Promise.resolve();
let _scoringMutation = Promise.resolve();

function notifyContentStore() {
  window.dispatchEvent(new Event("aio:content-store-changed"));
}

export function getContentStoreState(): ContentStoreState {
  return { ..._contentStoreState };
}

// True if the last initContentStore call received a 401 - i.e. the session
// has expired or is missing. Use this to show a "please log in" message
// rather than a misleading "Library is empty" state.
export function isContentStoreAuthError(): boolean {
  return _contentStoreState.status === "authentication-error";
}

// Resolve the effective project id for a given clientId argument (mirrors the
// old scopedStoreKey logic so call sites that pass client.id still work).
export function effectiveProjectId(clientId?: string): string {
  const id = clientId ?? getActiveProjectId();
  return id && id !== "default" ? id : "default";
}

// True once the initial server fetch (see initContentStore) has completed at
// least once, regardless of whether any component is listening yet.
export function isContentStoreReady(): boolean {
  return _contentStoreState.status === "ready";
}

// Subscribe to content-store changes and force a re-render. Returns a version
// counter that increments on every change so components can use it as a
// useEffect dependency. Initialises from the current ready flag (not always
// 0) so a component that mounts *after* initContentStore() has already
// resolved and fired its event doesn't get stuck showing a "loading" state
// forever - it starts already "loaded".
export function useContentStore(): number {
  const [version, setVersion] = useState(() => (_contentStoreState.status === "loading" ? 0 : 1));
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener("aio:content-store-changed", handler);
    // Close the narrow window between this component's initial render and
    // this effect running: if the store became ready in between, sync now
    // instead of waiting for a future change event that may never come.
    if (_contentStoreState.status !== "loading") setVersion((v) => (v > 0 ? v : 1));
    return () => window.removeEventListener("aio:content-store-changed", handler);
  }, []);
  return version;
}

// Load all content for this session from the server. Fires
// `aio:content-store-changed` when done so all subscribed components refresh.
export async function initContentStore(): Promise<void> {
  // Always reset caches before fetching so that switching accounts on the
  // same browser never leaks one account's data into another's view.
  _archiveCache = null;
  _plannerCache = null;
  _scoringCache = null;
  _contentStoreState = { ..._contentStoreState, status: "loading", mutationError: null };
  notifyContentStore();
  try {
    const [archRes, planRes, cfgRes] = await Promise.all([
      fetch(`${apiBase()}/api/store/archive`,       { credentials: "include" }),
      fetch(`${apiBase()}/api/store/planner`,        { credentials: "include" }),
      fetch(`${apiBase()}/api/store/scoring-config`, { credentials: "include" }),
    ]);
    if (archRes.status === 401 || planRes.status === 401 || cfgRes.status === 401) {
      _contentStoreState = { ..._contentStoreState, status: "authentication-error" };
      return;
    }
    if (!archRes.ok || !planRes.ok || !cfgRes.ok) {
      _contentStoreState = { ..._contentStoreState, status: "network-error" };
      return;
    }
    _archiveCache = (await archRes.json()).items ?? [];
    _plannerCache = (await planRes.json()).items ?? [];
    if (cfgRes.ok) {
      const raw = (await cfgRes.json()).config as Partial<ScoringConfig> | null;
      _scoringCache = raw
        ? { ...DEFAULT_SCORING, ...raw,
            statusMultipliers: { ...DEFAULT_SCORING.statusMultipliers, ...(raw.statusMultipliers ?? {}) },
            typeWeights: raw.typeWeights ?? DEFAULT_SCORING.typeWeights,
            channels:    raw.channels    ?? DEFAULT_SCORING.channels }
        : DEFAULT_SCORING;
    }
    _contentStoreState = { ..._contentStoreState, status: "ready" };
  } catch {
    _contentStoreState = { ..._contentStoreState, status: "network-error" };
  } finally {
    notifyContentStore();
  }
}

async function checkedFetch(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("network");
  }
  if (response.status === 401) throw new Error("authentication");
  if (!response.ok) throw new Error("network");
  return response;
}

function runMutation<T>(queue: Promise<void>, setQueue: (next: Promise<void>) => void, work: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => undefined).then(async () => {
    _contentStoreState = { ..._contentStoreState, mutationPending: true, mutationError: null };
    notifyContentStore();
    try {
      return await work();
    } catch (error) {
      const kind = error instanceof Error && error.message === "authentication" ? "authentication" : "network";
      _contentStoreState = { ..._contentStoreState, mutationError: kind };
      throw error;
    } finally {
      _contentStoreState = { ..._contentStoreState, mutationPending: false };
      notifyContentStore();
    }
  });
  setQueue(run.then(() => undefined, () => undefined));
  return run;
}

// One-time migration: upload any data still only in this browser's localStorage
// to the server, then purge the localStorage keys so they cannot be uploaded
// again under a different account's session.
export async function migrateLocalStorageContentToServer(): Promise<void> {
  try { if (localStorage.getItem(CONTENT_STORE_MIGRATED_KEY)) return; } catch { return; }
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }

    // Only migrate if the server currently has no archive items for this
    // account - if items already exist, the localStorage data almost certainly
    // belongs to a different account and must not be uploaded here.
    const serverIsEmpty = (_archiveCache ?? []).length === 0 && (_plannerCache ?? []).length === 0;

    if (serverIsEmpty) {
      for (const key of keys.filter((k) => k === ARCHIVE_KEY || k.startsWith(ARCHIVE_KEY + "::"))) {
        const projectId = key.includes("::") ? key.split("::").pop()! : "default";
        const items: ArchiveItem[] = JSON.parse(localStorage.getItem(key) || "[]");
        for (const item of items) {
          if (item.id.startsWith("seed-")) continue;
          await fetch(`${apiBase()}/api/store/archive`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...item, projectId }),
          });
        }
      }
      for (const key of keys.filter((k) => k === PROJECTS_KEY || k.startsWith(PROJECTS_KEY + "::"))) {
        const projectId = key.includes("::") ? key.split("::").pop()! : "default";
        const items: PlannerProject[] = JSON.parse(localStorage.getItem(key) || "[]");
        for (const item of items) {
          await fetch(`${apiBase()}/api/store/planner`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...item, projectId }),
          });
        }
      }
      const rawCfg = localStorage.getItem("aio.scoring.v1");
      if (rawCfg) {
        await fetch(`${apiBase()}/api/store/scoring-config`, {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: JSON.parse(rawCfg) }),
        });
      }
    }

    // Always purge legacy localStorage keys after this check, whether or not
    // we migrated - keeping them risks a future account picking them up.
    for (const key of keys.filter((k) =>
      k === ARCHIVE_KEY || k.startsWith(ARCHIVE_KEY + "::") ||
      k === PROJECTS_KEY || k.startsWith(PROJECTS_KEY + "::") ||
      k === "aio.scoring.v1"
    )) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }

    localStorage.setItem(CONTENT_STORE_MIGRATED_KEY, "1");
  } catch {
    // Will retry on next load if the guard key was not set.
  }
}

// Strip projectId for comparison so items fetched from the cache (which have
// projectId) compare equal to the same item without the server-added field.
export function stripProjectId(item: ArchiveItem | PlannerProject): ArchiveItem | PlannerProject {
  const { projectId: _p, ...rest } = item as typeof item & { projectId?: string };
  return rest as ArchiveItem | PlannerProject;
}

export function loadArchive(clientId?: string): ArchiveItem[] {
  if (_archiveCache === null) return [];
  const pid = effectiveProjectId(clientId);
  return _archiveCache.filter((a) => a.projectId === pid);
}

export function saveArchive(newItems: ArchiveItem[], clientId?: string): Promise<void> {
  const pid = effectiveProjectId(clientId);
  const baseline = (_archiveCache ?? []).filter((a) => a.projectId === pid);
  return runMutation(_archiveMutation, (p) => { _archiveMutation = p; }, async () => {
    const latestRes = await checkedFetch(`${apiBase()}/api/store/archive`, { credentials: "include" });
    const latestAll = ((await latestRes.json()).items ?? []) as (ArchiveItem & { projectId: string })[];
    const latest = latestAll.filter((a) => a.projectId === pid);
    const baselineMap = new Map(baseline.map((a) => [a.id, a]));
    const latestMap = new Map(latest.map((a) => [a.id, a]));
    const desiredMap = new Map(newItems.map((a) => [a.id, a]));
    for (const old of baseline) {
      if (!desiredMap.has(old.id) && latestMap.has(old.id)) {
        if (JSON.stringify(stripProjectId(latestMap.get(old.id)!)) !== JSON.stringify(stripProjectId(old))) {
          _archiveCache = latestAll;
          notifyContentStore();
          throw new Error("conflict");
        }
        await checkedFetch(`${apiBase()}/api/store/archive/${old.id}`, { method: "DELETE", credentials: "include" });
      }
    }
    for (const item of newItems) {
      const changed = !baselineMap.has(item.id) || JSON.stringify(stripProjectId(baselineMap.get(item.id)!)) !== JSON.stringify(stripProjectId(item));
      if (!changed) continue;
      const exists = latestMap.has(item.id);
      if (exists) {
        const latestValue = JSON.stringify(stripProjectId(latestMap.get(item.id)!));
        const desiredValue = JSON.stringify(stripProjectId(item));
        if (latestValue === desiredValue) continue;
        if (!baselineMap.has(item.id) || latestValue !== JSON.stringify(stripProjectId(baselineMap.get(item.id)!))) {
          _archiveCache = latestAll;
          notifyContentStore();
          throw new Error("conflict");
        }
      }
      await checkedFetch(`${apiBase()}/api/store/archive${exists ? `/${item.id}` : ""}`, {
        method: exists ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, projectId: pid }),
      });
    }
    const confirmed = await checkedFetch(`${apiBase()}/api/store/archive`, { credentials: "include" });
    _archiveCache = (await confirmed.json()).items ?? [];
    notifyContentStore();
  });
}

export type PlannerStatus = "Planned" | "Drafting" | "Review" | "Approved";

export type PlannerProject = {
  id: string;
  title: string;
  contentType: string;
  spokesperson: string;
  keyMessage: string;
  audience: string;
  channels: string[];
  week: number;
  status: PlannerStatus;
  releaseDate: string;
  notes: string;
  headline?: string;
  standfirst?: string;
  bodyCopy?: string;
  actionNotes?: string;
};

export function loadPlannerProjects(clientId?: string): PlannerProject[] {
  if (_plannerCache === null) return [];
  const pid = effectiveProjectId(clientId);
  return _plannerCache.filter((p) => p.projectId === pid);
}

export function savePlannerProjects(newItems: PlannerProject[], clientId?: string): Promise<void> {
  const pid = effectiveProjectId(clientId);
  const baseline = (_plannerCache ?? []).filter((p) => p.projectId === pid);
  return runMutation(_plannerMutation, (p) => { _plannerMutation = p; }, async () => {
    const latestRes = await checkedFetch(`${apiBase()}/api/store/planner`, { credentials: "include" });
    const latestAll = ((await latestRes.json()).items ?? []) as (PlannerProject & { projectId: string })[];
    const latest = latestAll.filter((p) => p.projectId === pid);
    const baselineMap = new Map(baseline.map((p) => [p.id, p]));
    const latestMap = new Map(latest.map((p) => [p.id, p]));
    const desiredMap = new Map(newItems.map((p) => [p.id, p]));
    for (const old of baseline) {
      if (!desiredMap.has(old.id) && latestMap.has(old.id)) {
        if (JSON.stringify(stripProjectId(latestMap.get(old.id)!)) !== JSON.stringify(stripProjectId(old))) {
          _plannerCache = latestAll;
          notifyContentStore();
          throw new Error("conflict");
        }
        await checkedFetch(`${apiBase()}/api/store/planner/${old.id}`, { method: "DELETE", credentials: "include" });
      }
    }
    for (const item of newItems) {
      const changed = !baselineMap.has(item.id) || JSON.stringify(stripProjectId(baselineMap.get(item.id)!)) !== JSON.stringify(stripProjectId(item));
      if (!changed) continue;
      const exists = latestMap.has(item.id);
      if (exists) {
        const latestValue = JSON.stringify(stripProjectId(latestMap.get(item.id)!));
        const desiredValue = JSON.stringify(stripProjectId(item));
        if (latestValue === desiredValue) continue;
        if (!baselineMap.has(item.id) || latestValue !== JSON.stringify(stripProjectId(baselineMap.get(item.id)!))) {
          _plannerCache = latestAll;
          notifyContentStore();
          throw new Error("conflict");
        }
      }
      await checkedFetch(`${apiBase()}/api/store/planner${exists ? `/${item.id}` : ""}`, {
        method: exists ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, projectId: pid }),
      });
    }
    const confirmed = await checkedFetch(`${apiBase()}/api/store/planner`, { credentials: "include" });
    _plannerCache = (await confirmed.json()).items ?? [];
    notifyContentStore();
  });
}

const SEED_PURGED_KEY = "aio.seed.demo.purged.v1";

// Remove legacy demo/seed content. Earlier builds seeded example archive and
// planner items (ids prefixed "seed-") into the default project store. The app
// no longer seeds demo data; this one-time cleanup strips any such items from
// every project archive and planner so each project only ever shows the
// content actually created in it.
export function removeDemoSeedData() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(SEED_PURGED_KEY)) return;
    const isStoreKey = (k: string) =>
      k === ARCHIVE_KEY ||
      k.startsWith(`${ARCHIVE_KEY}::`) ||
      k === PROJECTS_KEY ||
      k.startsWith(`${PROJECTS_KEY}::`);
    const keys: string[] = [];
    for (let n = 0; n < localStorage.length; n++) {
      const k = localStorage.key(n);
      if (k && isStoreKey(k)) keys.push(k);
    }
    for (const k of keys) {
      try {
        const arr = JSON.parse(localStorage.getItem(k) || "[]");
        if (!Array.isArray(arr)) continue;
        const cleaned = arr.filter(
          (it: unknown) =>
            !(
              it &&
              typeof it === "object" &&
              typeof (it as { id?: unknown }).id === "string" &&
              (it as { id: string }).id.startsWith("seed-")
            ),
        );
        if (cleaned.length !== arr.length) {
          localStorage.setItem(k, JSON.stringify(cleaned));
        }
      } catch {
        /* skip a malformed store entry */
      }
    }
    localStorage.setItem(SEED_PURGED_KEY, "v1");
  } catch {
    /* noop - never block app boot */
  }
}

export function getISOWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
}

export function weekDateLabel(weekNumber: number, year: number = new Date().getFullYear()): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${target.getUTCDate()}-${months[target.getUTCMonth()]}`;
}

export type ScoringConfig = {
  typeWeights: Record<string, { vis: number; auth: number }>;
  channels: string[];
  channelBase: number;
  channelStep: number;
  channelCap: number;
  statusMultipliers: Record<PlannerStatus, number>;
};

// Default scoring table per Patrick's d2 brief - Authority and Visibility scored
// independently, with Combined as the shown average. Article (Trade Publication)
// is the gold standard at 9/9 → 9.0 combined.
export const DEFAULT_SCORING: ScoringConfig = {
  typeWeights: {
    "Press release":      { vis: 8, auth: 6 },
    "Article":            { vis: 9, auth: 9 },
    "Case study":         { vis: 6, auth: 7 },
    "Whitepaper":         { vis: 5, auth: 8 },
    "Blog post":          { vis: 7, auth: 5 },
    "Social post":        { vis: 8, auth: 2 },
    "Event copy":         { vis: 4, auth: 3 },
    "Speaker submission": { vis: 3, auth: 6 },
    "Award submission":   { vis: 2, auth: 8 },
    "Directory entry":    { vis: 6, auth: 5 },
  },
  channels: ["Priority", "National", "Specialist A", "Specialist B", "Specialist C", "Specialist D", "Owned", "LinkedIn"],
  channelBase: 0.5,
  channelStep: 0.25,
  channelCap: 1.5,
  statusMultipliers: { Approved: 1, Review: 0.85, Drafting: 0.7, Planned: 0.5 },
};

export function loadScoringConfig(): ScoringConfig {
  return _scoringCache ?? DEFAULT_SCORING;
}
export function saveScoringConfig(cfg: ScoringConfig): Promise<void> {
  return runMutation(_scoringMutation, (p) => { _scoringMutation = p; }, async () => {
    await checkedFetch(`${apiBase()}/api/store/scoring-config`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: cfg }),
    });
    const confirmed = await checkedFetch(`${apiBase()}/api/store/scoring-config`, { credentials: "include" });
    const raw = (await confirmed.json()).config as Partial<ScoringConfig> | null;
    _scoringCache = raw ? {
      ...DEFAULT_SCORING, ...raw,
      statusMultipliers: { ...DEFAULT_SCORING.statusMultipliers, ...(raw.statusMultipliers ?? {}) },
      typeWeights: raw.typeWeights ?? DEFAULT_SCORING.typeWeights,
      channels: raw.channels ?? DEFAULT_SCORING.channels,
    } : DEFAULT_SCORING;
    notifyContentStore();
  });
}

export function scoreProject(p: PlannerProject, cfg: ScoringConfig = loadScoringConfig()) {
  const weights = cfg.typeWeights[p.contentType] || { vis: 5, auth: 5 };
  const activeChannelCount = p.channels.filter((c) => cfg.channels.includes(c)).length;
  const channelMultiplier = Math.min(cfg.channelCap, cfg.channelBase + activeChannelCount * cfg.channelStep);
  const statusMultiplier = cfg.statusMultipliers[p.status] ?? 0.5;
  const visibility = Math.round(weights.vis * 5 * channelMultiplier * statusMultiplier * 0.125 * 10) / 10;
  const authority  = Math.round(weights.auth * 5 * statusMultiplier * 0.1 * 10) / 10;
  return { visibility: Math.min(50, visibility * 5), authority: Math.min(50, authority * 5) };
}

export function aggregatePlanScore(
  projects: PlannerProject[],
  cfg: ScoringConfig = loadScoringConfig(),
): { visibility: number; authority: number; total: number } {
  const MAX = 50;
  const rawVis = projects.reduce((sum, p) => sum + scoreProject(p, cfg).visibility, 0);
  const rawAuth = projects.reduce((sum, p) => sum + scoreProject(p, cfg).authority, 0);
  const visibility = Math.round(MAX * (1 - Math.exp(-rawVis / MAX)) * 10) / 10;
  const authority  = Math.round(MAX * (1 - Math.exp(-rawAuth / MAX)) * 10) / 10;
  return { visibility, authority, total: Math.round(visibility + authority) };
}

export const STATUS_COLOURS: Record<PlannerStatus, { bg: string; fg: string }> = {
  Planned:  { bg: "rgba(156,163,175,0.18)", fg: "#6B7280" },
  Drafting: { bg: "rgba(212,146,42,0.18)",  fg: "#D4922A" },
  Review:   { bg: "rgba(99,102,241,0.18)",  fg: "#6366F1" },
  Approved: { bg: "rgba(61,155,107,0.18)",  fg: "#3D9B6B" },
};
