// ---------------------------------------------------------------------------
// Audit / Diagnostic server sync.
//
// All four score/audit types used to live only in the browser's localStorage,
// so two logins on the same project saw completely different history. This
// module mirrors them to the server so every authorised login on the same
// project reads the same shared audit history.
//
// Design:
//   • localStorage stays as a fast synchronous read-cache.
//   • On page load: pull server list, merge, update localStorage.
//   • On save: push the new entry to the server immediately.
//   • On delete: await server DELETE confirmation before updating localStorage.
//
// Delete-resurrection prevention (syncEpoch):
//   A per-project-per-kind "syncEpoch" ISO timestamp is written to
//   localStorage only AFTER all pending migration uploads succeed.
//
//   • First sync (no epoch): push ALL local-only items as one-time migration.
//     Epoch is NOT advanced until every upload returns 2xx. Items that fail
//     to upload remain "pending" and are retried on the next sync.
//   • Subsequent syncs (epoch exists): only push/keep local-only items with
//     savedAt > epoch (pending writes). Items with savedAt <= epoch that are
//     absent from server were deleted on another login → dropped from result.
//   • Server fetch failure (network error): epoch NOT advanced; local list
//     returned unchanged (fail-soft - never silently lose items).
// ---------------------------------------------------------------------------

import { type SavedAudit, loadSavedAudits, savedAuditsKey } from "../LlmCheckPage";
import {
  type SavedDiagnostic,
  type SavedScored,
  loadSavedDiagnostics,
  savedDiagnosticsKey,
  contentGeoKey,
  techGeoKey,
  loadSavedScored,
} from "./diagnosticStore";

const apiBase = () => (import.meta.env.DEV ? `https://${window.location.host}` : "");

function writeLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* noop */ }
}

function readSyncEpoch(epochKey: string): string | null {
  try {
    return localStorage.getItem(epochKey);
  } catch { return null; }
}

function writeSyncEpoch(epochKey: string): void {
  try {
    localStorage.setItem(epochKey, new Date().toISOString());
  } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Generic merge helper - no side-effects, no network calls
// ---------------------------------------------------------------------------

type HasIdAndSavedAt = { id: string; savedAt: string };

type MergeResult<T> = {
  merged: T[];
  toUpload: T[];
};

/**
 * Produces a merged server+local list and the set of local-only items that
 * need to be pushed (migration candidates), without making any network calls.
 *
 * Rules:
 *  - Server items always included (server is authoritative).
 *  - Local-only items with savedAt > epoch (or no epoch): included + queued
 *    for upload (pending writes or initial migration).
 *  - Local-only items with savedAt <= epoch: DROPPED. They were present at
 *    last sync but are now absent on server → deleted on another login.
 */
function mergeWithEpoch<T extends HasIdAndSavedAt>(
  serverList: T[],
  localList: T[],
  epoch: string | null,
): MergeResult<T> {
  const serverById = new Map<string, T>(serverList.map((a) => [a.id, a]));
  const merged = new Map<string, T>();
  const toUpload: T[] = [];

  for (const a of serverList) merged.set(a.id, a);

  for (const a of localList) {
    if (merged.has(a.id)) continue; // server copy wins
    const isPending = epoch === null || a.savedAt > epoch;
    if (isPending) {
      merged.set(a.id, a);
      toUpload.push(a);
    }
    // else: pre-epoch, absent from server → deleted elsewhere → drop it.
  }

  return {
    merged: [...merged.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    toUpload,
  };
}

// ---------------------------------------------------------------------------
// Earned Media Audit helpers
// ---------------------------------------------------------------------------

const auditEpochKey = (projectId: string) => `aio.syncEpoch.audits.${projectId}`;

type ServerFetchResult<T> =
  | { ok: true; items: T[] }
  | { ok: false };

async function fetchServerAudits(projectId: string): Promise<ServerFetchResult<SavedAudit>> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/audits`,
      { credentials: "include" },
    );
    if (!resp.ok) return { ok: false };
    const data = (await resp.json()) as { audits?: unknown[] };
    const items = data.audits;
    if (!Array.isArray(items)) return { ok: true, items: [] };
    return {
      ok: true,
      items: items.filter(
        (a): a is SavedAudit =>
          !!a &&
          typeof a === "object" &&
          typeof (a as SavedAudit).id === "string" &&
          typeof (a as SavedAudit).savedAt === "string" &&
          !!(a as SavedAudit).result,
      ),
    };
  } catch { return { ok: false }; }
}

export async function pushServerAudit(projectId: string, audit: SavedAudit): Promise<boolean> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/audits`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ audit }),
      },
    );
    return resp.ok;
  } catch { return false; }
}

export async function deleteServerAudit(projectId: string, auditId: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/audits/${encodeURIComponent(auditId)}`,
      { method: "DELETE", credentials: "include" },
    );
    return resp.ok;
  } catch { return false; }
}

export async function syncAuditsForProject(projectId: string): Promise<SavedAudit[]> {
  const epoch = readSyncEpoch(auditEpochKey(projectId));
  const localList = loadSavedAudits(projectId);
  const fetched = await fetchServerAudits(projectId);

  // Network failure: don't change epoch, return local list unchanged.
  if (!fetched.ok) return localList;

  const { merged, toUpload } = mergeWithEpoch(fetched.items, localList, epoch);

  // Await all migration uploads. Only advance epoch when every upload
  // succeeds - if any fail, keep epoch as-is so those items are retried
  // next sync instead of being silently dropped.
  let allUploaded = true;
  if (toUpload.length > 0) {
    const results = await Promise.all(
      toUpload.map((a) => pushServerAudit(projectId, a)),
    );
    allUploaded = results.every(Boolean);
  }

  writeLocalStorage(savedAuditsKey(projectId), merged);
  if (allUploaded) writeSyncEpoch(auditEpochKey(projectId));
  return merged;
}

// ---------------------------------------------------------------------------
// Website/GEO Diagnostic helpers
// ---------------------------------------------------------------------------

const diagEpochKey = (projectId: string) => `aio.syncEpoch.diagnostics.${projectId}`;

async function fetchServerDiagnostics(
  projectId: string,
): Promise<ServerFetchResult<SavedDiagnostic>> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/diagnostics`,
      { credentials: "include" },
    );
    if (!resp.ok) return { ok: false };
    const data = (await resp.json()) as { diagnostics?: unknown[] };
    const items = data.diagnostics;
    if (!Array.isArray(items)) return { ok: true, items: [] };
    return {
      ok: true,
      items: items.filter(
        (d): d is SavedDiagnostic =>
          !!d &&
          typeof d === "object" &&
          typeof (d as SavedDiagnostic).id === "string" &&
          typeof (d as SavedDiagnostic).savedAt === "string" &&
          !!(d as SavedDiagnostic).result,
      ),
    };
  } catch { return { ok: false }; }
}

export async function pushServerDiagnostic(
  projectId: string,
  diagnostic: SavedDiagnostic,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/diagnostics`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ diagnostic }),
      },
    );
    return resp.ok;
  } catch { return false; }
}

export async function deleteServerDiagnostic(
  projectId: string,
  diagId: string,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/diagnostics/${encodeURIComponent(diagId)}`,
      { method: "DELETE", credentials: "include" },
    );
    return resp.ok;
  } catch { return false; }
}

export async function syncDiagnosticsForProject(
  projectId: string,
): Promise<SavedDiagnostic[]> {
  const epoch = readSyncEpoch(diagEpochKey(projectId));
  const localList = loadSavedDiagnostics(projectId);
  const fetched = await fetchServerDiagnostics(projectId);

  if (!fetched.ok) return localList;

  const { merged, toUpload } = mergeWithEpoch(fetched.items, localList, epoch);

  let allUploaded = true;
  if (toUpload.length > 0) {
    const results = await Promise.all(
      toUpload.map((d) => pushServerDiagnostic(projectId, d)),
    );
    allUploaded = results.every(Boolean);
  }

  writeLocalStorage(savedDiagnosticsKey(projectId), merged);
  if (allUploaded) writeSyncEpoch(diagEpochKey(projectId));
  return merged;
}

// ---------------------------------------------------------------------------
// Content GEO + Technical GEO saved score helpers
// ---------------------------------------------------------------------------

type AnyScored = SavedScored & Record<string, unknown>;

const geoEpochKey = (kind: string, projectId: string) =>
  `aio.syncEpoch.${kind}.${projectId}`;

async function fetchServerGeoScores(
  projectId: string,
  kind: "content-geo" | "tech-geo",
): Promise<ServerFetchResult<AnyScored>> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/${kind}`,
      { credentials: "include" },
    );
    if (!resp.ok) return { ok: false };
    const data = (await resp.json()) as { "content-geo"?: unknown[]; "tech-geo"?: unknown[] };
    const items = data[kind];
    if (!Array.isArray(items)) return { ok: true, items: [] };
    return {
      ok: true,
      items: items.filter(
        (e): e is AnyScored =>
          !!e &&
          typeof e === "object" &&
          typeof (e as AnyScored).id === "string" &&
          typeof (e as AnyScored).savedAt === "string",
      ),
    };
  } catch { return { ok: false }; }
}

async function pushServerGeoScore(
  projectId: string,
  kind: "content-geo" | "tech-geo",
  entry: AnyScored,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/${kind}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entry }),
      },
    );
    return resp.ok;
  } catch { return false; }
}

async function deleteServerGeoScore(
  projectId: string,
  kind: "content-geo" | "tech-geo",
  geoId: string,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${apiBase()}/api/store/projects/${encodeURIComponent(projectId)}/${kind}/${encodeURIComponent(geoId)}`,
      { method: "DELETE", credentials: "include" },
    );
    return resp.ok;
  } catch { return false; }
}

async function syncGeoScores(
  projectId: string,
  kind: "content-geo" | "tech-geo",
  storageKey: string,
): Promise<AnyScored[]> {
  const epoch = readSyncEpoch(geoEpochKey(kind, projectId));
  const localList = loadSavedScored(storageKey) as AnyScored[];
  const fetched = await fetchServerGeoScores(projectId, kind);

  if (!fetched.ok) return localList;

  const { merged, toUpload } = mergeWithEpoch(fetched.items, localList, epoch);

  let allUploaded = true;
  if (toUpload.length > 0) {
    const results = await Promise.all(
      toUpload.map((e) => pushServerGeoScore(projectId, kind, e)),
    );
    allUploaded = results.every(Boolean);
  }

  writeLocalStorage(storageKey, merged);
  if (allUploaded) writeSyncEpoch(geoEpochKey(kind, projectId));
  return merged;
}

export async function syncContentGeoForProject(projectId: string): Promise<SavedScored[]> {
  return syncGeoScores(projectId, "content-geo", contentGeoKey(projectId));
}

export async function pushServerContentGeo(projectId: string, entry: SavedScored): Promise<boolean> {
  return pushServerGeoScore(projectId, "content-geo", entry as AnyScored);
}

export async function deleteServerContentGeo(projectId: string, geoId: string): Promise<boolean> {
  return deleteServerGeoScore(projectId, "content-geo", geoId);
}

export async function syncTechGeoForProject(projectId: string): Promise<AnyScored[]> {
  return syncGeoScores(projectId, "tech-geo", techGeoKey(projectId));
}

export async function pushServerTechGeo(projectId: string, entry: AnyScored): Promise<boolean> {
  return pushServerGeoScore(projectId, "tech-geo", entry);
}

export async function deleteServerTechGeo(projectId: string, geoId: string): Promise<boolean> {
  return deleteServerGeoScore(projectId, "tech-geo", geoId);
}
