import type { Client } from "./projectTypes";

export const CREATED_PROJECTS_KEY = "aio.projects.v1";

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
