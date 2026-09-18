import { useSyncExternalStore } from "react";

export type AiRunStatus = "running" | "succeeded" | "failed";

export type AiRunScope = {
  sessionId: string;
  workspaceId: string;
  projectId: string;
};

export type AiRun<TInput = unknown, TResult = unknown> = {
  key: string;
  scope: AiRunScope;
  operation: string;
  subjectId: string;
  input: TInput;
  startedAt: number;
  estimateSeconds: number;
  status: AiRunStatus;
  progress: number;
  result?: TResult;
  error?: string;
  completedAt?: number;
};

type StartOptions<TInput, TResult> = {
  key: string;
  scope: AiRunScope;
  operation: string;
  subjectId?: string;
  input: TInput;
  estimateSeconds: number;
  execute: (progress: (value: number) => void) => Promise<TResult>;
  onSuccess?: (result: TResult, run: AiRun<TInput, TResult>) => void | Promise<void>;
};

const runs = new Map<string, AiRun>();
const listeners = new Set<() => void>();
let activeIdentity = "";

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function identityFor(scope: AiRunScope): string {
  return `${scope.sessionId}\u0000${scope.workspaceId}`;
}

export function aiRunKey(
  scope: AiRunScope,
  operation: string,
  subjectId = "default",
): string {
  return [scope.sessionId, scope.workspaceId, scope.projectId, operation, subjectId]
    .map((part) => encodeURIComponent(part || "default"))
    .join(":");
}

export function setAiRunIdentity(sessionId: string, workspaceId: string): void {
  const next = `${sessionId}\u0000${workspaceId}`;
  if (next === activeIdentity) return;
  activeIdentity = next;
  runs.clear();
  emit();
}

export function clearAiRuns(): void {
  activeIdentity = "";
  runs.clear();
  emit();
}

export function getAiRun<TInput = unknown, TResult = unknown>(
  key: string,
): AiRun<TInput, TResult> | null {
  return (runs.get(key) as AiRun<TInput, TResult> | undefined) ?? null;
}

export function findLatestAiRun<TInput = unknown, TResult = unknown>(
  scope: AiRunScope,
  operation: string,
): AiRun<TInput, TResult> | null {
  return [...runs.values()]
    .filter((run) =>
      run.operation === operation &&
      run.scope.sessionId === scope.sessionId &&
      run.scope.workspaceId === scope.workspaceId &&
      run.scope.projectId === scope.projectId
    )
    .sort((a, b) => b.startedAt - a.startedAt)[0] as AiRun<TInput, TResult> | undefined ?? null;
}

export function discardAiRun(key: string): void {
  if (runs.delete(key)) emit();
}

export function startAiRun<TInput, TResult>(
  options: StartOptions<TInput, TResult>,
): AiRun<TInput, TResult> {
  // App normally establishes the authenticated identity. Standalone page
  // renders (including isolated tests) may start before that effect runs.
  if (!activeIdentity) activeIdentity = identityFor(options.scope);
  const existing = getAiRun<TInput, TResult>(options.key);
  if (existing?.status === "running") return existing;

  const run: AiRun<TInput, TResult> = {
    key: options.key,
    scope: { ...options.scope },
    operation: options.operation,
    subjectId: options.subjectId || "default",
    input: structuredClone(options.input),
    startedAt: Date.now(),
    estimateSeconds: Math.max(1, Math.round(options.estimateSeconds)),
    status: "running",
    progress: 0,
  };
  runs.set(options.key, run);
  emit();

  void options.execute((value) => {
    const current = runs.get(options.key);
    if (!current || current.startedAt !== run.startedAt || current.status !== "running") return;
    const updated = {
      ...current,
      progress: Number.isFinite(value) ? Math.max(0, value) : 0,
    };
    runs.set(options.key, updated);
    emit();
  }).then(async (result) => {
    const current = runs.get(options.key) as AiRun<TInput, TResult> | undefined;
    if (!current || current.startedAt !== run.startedAt || identityFor(current.scope) !== activeIdentity) return;
    await options.onSuccess?.(result, current);
    const latest = runs.get(options.key) as AiRun<TInput, TResult> | undefined;
    if (!latest || latest.startedAt !== run.startedAt || identityFor(latest.scope) !== activeIdentity) return;
    const completed: AiRun<TInput, TResult> = {
      ...latest,
      result,
      status: "succeeded",
      completedAt: Date.now(),
    };
    runs.set(options.key, completed);
    emit();
  }).catch((error: unknown) => {
    const current = runs.get(options.key) as AiRun<TInput, TResult> | undefined;
    if (!current || current.startedAt !== run.startedAt || identityFor(current.scope) !== activeIdentity) return;
    const failed: AiRun<TInput, TResult> = {
      ...current,
      status: "failed",
      completedAt: Date.now(),
      error: error instanceof Error ? error.message : "The operation could not be completed. Please try again.",
    };
    runs.set(options.key, failed);
    emit();
  });

  return run;
}

export function useAiRun<TInput = unknown, TResult = unknown>(
  key: string | null,
): AiRun<TInput, TResult> | null {
  return useSyncExternalStore(
    subscribe,
    () => key ? getAiRun<TInput, TResult>(key) : null,
    () => null,
  );
}