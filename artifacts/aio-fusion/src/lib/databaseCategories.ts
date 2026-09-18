import { useCallback, useEffect, useState } from "react";
import { apiBase } from "./apiHelpers";
import { getActiveProjectId, loadIntakeData } from "../IntakeForm";
import { getSession } from "./auth";

export type DatabaseCategoryState = {
  categories: string[];
  status: "loading" | "ready" | "empty" | "error";
  error: string;
  retry: () => void;
};

/** Comparison is deliberately forgiving, while saved values always use the
 * server's display label. */
export function normaliseCategory(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function validDatabaseCategories(values: unknown, allowlist: string[]): string[] {
  const labels = new Map(allowlist.map((label) => [normaliseCategory(label), label]));
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .filter((value): value is string => typeof value === "string")
    .map(normaliseCategory)
    .map((key) => labels.get(key))
    .filter((value): value is string => Boolean(value))));
}

/** Read only section 1.9. Older records may have the old business category
 * array, but audience categories (1.10) are never a fallback. */
export function getFreshCategoryDefaults(): string[] {
  const intake = loadIntakeData() as {
    formData?: Record<string, unknown>;
    businessCategories?: unknown;
  } | null;
  if (intake?.formData && Object.prototype.hasOwnProperty.call(intake.formData, "1.9")) {
    const raw = intake.formData["1.9"];
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : typeof raw === "string" ? raw.split(/[\n,]+/) : [];
  }
  return Array.isArray(intake?.businessCategories)
    ? intake.businessCategories.filter((v): v is string => typeof v === "string")
    : [];
}

export function useDatabaseCategories(): DatabaseCategoryState {
  const projectId = getActiveProjectId();
  const workspaceId = getSession()?.username ?? "";
  const [state, setState] = useState<Omit<DatabaseCategoryState, "retry">>({
    categories: [], status: "loading", error: "",
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ categories: [], status: "loading", error: "" });
    fetch(`${apiBase()}/api/store/media-db/categories`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load media categories.");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        const categories = Array.isArray(data?.categories)
          ? data.categories.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim()))
          : [];
        setState({ categories: Array.from(new Set(categories)), status: categories.length ? "ready" : "empty", error: "" });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setState({ categories: [], status: "error", error: error instanceof Error ? error.message : "Could not load media categories." });
      });
    return () => { active = false; controller.abort(); };
  }, [attempt, projectId, workspaceId]);

  return { ...state, retry };
}