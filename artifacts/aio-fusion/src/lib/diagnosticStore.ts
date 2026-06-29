import type { SavedDiagnostic, SavedScored } from "../types";

const savedDiagnosticsKey = (clientId: string) => `aio.savedDiagnostics.${clientId}`;
export const contentGeoKey = (clientId: string) => `aio.savedContentGeo.${clientId}`;
export const techGeoKey = (clientId: string) => `aio.savedTechGeo.${clientId}`;

export function loadSavedDiagnostics(clientId: string): SavedDiagnostic[] {
  try {
    const raw = localStorage.getItem(savedDiagnosticsKey(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedDiagnostics(clientId: string, list: SavedDiagnostic[]): boolean {
  try {
    localStorage.setItem(savedDiagnosticsKey(clientId), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedScored(storageKey: string): SavedScored[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedScored(storageKey: string, list: SavedScored[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
