import { useState, useEffect } from "react";
import { getActiveProjectId } from "../IntakeForm";
import type { ArchiveItem, PlannerProject, ScoringConfig } from "../types";
import { apiBase } from "./apiHelpers";

export const CONTENT_STORE_MIGRATED_KEY = "aio.store.migrated.v1";
export const ARCHIVE_KEY  = "aio.archive.v1";
export const PROJECTS_KEY = "aio.planner.projects.v1";

let _archiveCache:  (ArchiveItem & { projectId: string })[] | null = null;
let _plannerCache:  (PlannerProject & { projectId: string })[] | null = null;
let _scoringCache:  ScoringConfig | null = null;
let _contentStoreReady = false;

export function effectiveProjectId(clientId?: string): string {
  const id = clientId ?? getActiveProjectId();
  return id && id !== "default" ? id : "default";
}

export function useContentStore(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener("aio:content-store-changed", handler);
    return () => window.removeEventListener("aio:content-store-changed", handler);
  }, []);
  return version;
}

export async function initContentStore(): Promise<void> {
  try {
    const [archRes, planRes, cfgRes] = await Promise.all([
      fetch(`${apiBase()}/api/store/archive`,       { credentials: "include" }),
      fetch(`${apiBase()}/api/store/planner`,        { credentials: "include" }),
      fetch(`${apiBase()}/api/store/scoring-config`, { credentials: "include" }),
    ]);
    if (archRes.ok)  _archiveCache  = (await archRes.json()).items  ?? [];
    else             _archiveCache  = _archiveCache  ?? [];
    if (planRes.ok)  _plannerCache  = (await planRes.json()).items  ?? [];
    else             _plannerCache  = _plannerCache  ?? [];
    if (cfgRes.ok) {
      const raw = (await cfgRes.json()).config as Partial<ScoringConfig> | null;
      _scoringCache = raw
        ? { ...DEFAULT_SCORING, ...raw,
            statusMultipliers: { ...DEFAULT_SCORING.statusMultipliers, ...(raw.statusMultipliers ?? {}) },
            typeWeights: raw.typeWeights ?? DEFAULT_SCORING.typeWeights,
            channels:    raw.channels    ?? DEFAULT_SCORING.channels }
        : DEFAULT_SCORING;
    } else {
      _scoringCache = _scoringCache ?? DEFAULT_SCORING;
    }
  } catch {
    _archiveCache  = _archiveCache  ?? [];
    _plannerCache  = _plannerCache  ?? [];
    _scoringCache  = _scoringCache  ?? DEFAULT_SCORING;
  }
  _contentStoreReady = true;
  window.dispatchEvent(new Event("aio:content-store-changed"));
}

export async function migrateLocalStorageContentToServer(): Promise<void> {
  try { if (localStorage.getItem(CONTENT_STORE_MIGRATED_KEY)) return; } catch { return; }
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
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
    localStorage.setItem(CONTENT_STORE_MIGRATED_KEY, "1");
  } catch {
    // Will retry on next load if the guard key was not set.
  }
}

function stripProjectId(item: ArchiveItem | PlannerProject): ArchiveItem | PlannerProject {
  const { projectId: _p, ...rest } = item as typeof item & { projectId?: string };
  return rest as ArchiveItem | PlannerProject;
}

export function loadArchive(clientId?: string): ArchiveItem[] {
  if (_archiveCache === null) return [];
  const pid = effectiveProjectId(clientId);
  return _archiveCache.filter((a) => a.projectId === pid);
}

export function saveArchive(newItems: ArchiveItem[], clientId?: string) {
  const pid = effectiveProjectId(clientId);
  const oldItems = _archiveCache === null
    ? []
    : _archiveCache.filter((a) => a.projectId === pid);

  const oldMap = new Map(oldItems.map((a) => [a.id, a]));
  const newMap = new Map(newItems.map((a) => [a.id, a]));

  for (const old of oldItems) {
    if (!newMap.has(old.id)) {
      fetch(`${apiBase()}/api/store/archive/${old.id}`,
        { method: "DELETE", credentials: "include" }).catch(console.error);
    }
  }
  for (const item of newItems) {
    const withPid = { ...item, projectId: pid };
    if (!oldMap.has(item.id)) {
      fetch(`${apiBase()}/api/store/archive`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withPid),
      }).catch(console.error);
    } else if (JSON.stringify(stripProjectId(oldMap.get(item.id)!)) !== JSON.stringify(stripProjectId(item))) {
      fetch(`${apiBase()}/api/store/archive/${item.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withPid),
      }).catch(console.error);
    }
  }

  const withPid = newItems.map((a) => ({ ...a, projectId: pid }));
  _archiveCache = [
    ...(_archiveCache ?? []).filter((a) => a.projectId !== pid),
    ...withPid,
  ];
  window.dispatchEvent(new Event("aio:content-store-changed"));
}

export function loadPlannerProjects(clientId?: string): PlannerProject[] {
  if (_plannerCache === null) return [];
  const pid = effectiveProjectId(clientId);
  return _plannerCache.filter((p) => p.projectId === pid);
}

export function savePlannerProjects(newItems: PlannerProject[], clientId?: string) {
  const pid = effectiveProjectId(clientId);
  const oldItems = _plannerCache === null
    ? []
    : _plannerCache.filter((p) => p.projectId === pid);

  const oldMap = new Map(oldItems.map((p) => [p.id, p]));
  const newMap = new Map(newItems.map((p) => [p.id, p]));

  for (const old of oldItems) {
    if (!newMap.has(old.id)) {
      fetch(`${apiBase()}/api/store/planner/${old.id}`,
        { method: "DELETE", credentials: "include" }).catch(console.error);
    }
  }
  for (const item of newItems) {
    const withPid = { ...item, projectId: pid };
    if (!oldMap.has(item.id)) {
      fetch(`${apiBase()}/api/store/planner`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withPid),
      }).catch(console.error);
    } else if (JSON.stringify(stripProjectId(oldMap.get(item.id)!)) !== JSON.stringify(stripProjectId(item))) {
      fetch(`${apiBase()}/api/store/planner/${item.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withPid),
      }).catch(console.error);
    }
  }

  const withPid = newItems.map((p) => ({ ...p, projectId: pid }));
  _plannerCache = [
    ...(_plannerCache ?? []).filter((p) => p.projectId !== pid),
    ...withPid,
  ];
  window.dispatchEvent(new Event("aio:content-store-changed"));
}

export const SEED_PURGED_KEY = "aio.seed.demo.purged.v1";

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

export function saveScoringConfig(cfg: ScoringConfig) {
  _scoringCache = cfg;
  fetch(`${apiBase()}/api/store/scoring-config`, {
    method: "PUT", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: cfg }),
  }).catch(console.error);
  window.dispatchEvent(new Event("aio:content-store-changed"));
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

export const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  Planned:  { bg: "rgba(156,163,175,0.18)", fg: "#6B7280" },
  Drafting: { bg: "rgba(212,146,42,0.18)",  fg: "#D4922A" },
  Review:   { bg: "rgba(99,102,241,0.18)",  fg: "#6366F1" },
  Approved: { bg: "rgba(61,155,107,0.18)",  fg: "#3D9B6B" },
};

export { _contentStoreReady };
