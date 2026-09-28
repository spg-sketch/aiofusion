// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { aiRunKey, clearAiRuns, findLatestAiRun, getAiRun, setAiRunIdentity, startAiRun, useAiRun } from "./aiRunLifecycle";

describe("AI run lifecycle", () => {
  beforeEach(() => {
    clearAiRuns();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
  });

  afterEach(() => {
    cleanup();
    clearAiRuns();
    vi.useRealTimers();
  });

  it("deduplicates a running request and retains its absolute start time and result", async () => {
    const scope = { sessionId: "person", workspaceId: "workspace", projectId: "project" };
    setAiRunIdentity(scope.sessionId, scope.workspaceId);
    const key = aiRunKey(scope, "content-optimise", "editor");
    let resolve!: (value: { text: string }) => void;
    const execute = vi.fn(() => new Promise<{ text: string }>((done) => { resolve = done; }));

    const first = startAiRun({ key, scope, operation: "content-optimise", input: { text: "original" }, estimateSeconds: 40, execute });
    vi.setSystemTime(new Date("2026-09-18T12:01:10Z"));
    const duplicate = startAiRun({ key, scope, operation: "content-optimise", input: { text: "changed" }, estimateSeconds: 40, execute });
    expect(duplicate.startedAt).toBe(first.startedAt);
    expect(execute).toHaveBeenCalledTimes(1);

    resolve({ text: "optimised" });
    await vi.runAllTimersAsync();
    expect(getAiRun(key)).toMatchObject({
      status: "succeeded",
      startedAt: first.startedAt,
      input: { text: "original" },
      result: { text: "optimised" },
    });
  });

  it("drops late results after an identity change and permits an explicit retry after failure", async () => {
    const scope = { sessionId: "person", workspaceId: "one", projectId: "project" };
    setAiRunIdentity(scope.sessionId, scope.workspaceId);
    const key = aiRunKey(scope, "website", "audit");
    let reject!: (reason: Error) => void;
    startAiRun({
      key, scope, operation: "website", input: {},
      estimateSeconds: 120,
      execute: () => new Promise((_, fail) => { reject = fail; }),
    });
    reject(new Error("failed"));
    await vi.runAllTimersAsync();
    expect(getAiRun(key)?.status).toBe("failed");

    const retry = startAiRun({
      key, scope, operation: "website", input: { retry: true },
      estimateSeconds: 120,
      execute: async () => ({ ok: true }),
    });
    expect(retry.status).toBe("running");
    setAiRunIdentity("person", "two");
    await vi.runAllTimersAsync();
    expect(getAiRun(key)).toBeNull();
  });

  it("rediscovers a field run after unmount and shows its result after completion", async () => {
    const scope = { sessionId: "person", workspaceId: "workspace", projectId: "project" };
    setAiRunIdentity(scope.sessionId, scope.workspaceId);
    const key = aiRunKey(scope, "content-optimise", "headline");
    let resolve!: (value: { next: string }) => void;
    startAiRun({
      key,
      scope,
      operation: "content-optimise",
      subjectId: "article:headline",
      input: { fieldKey: "headline", value: "Original" },
      estimateSeconds: 40,
      execute: () => new Promise((done) => { resolve = done; }),
    });

    function RecoveredFieldRun() {
      const found = findLatestAiRun<{ fieldKey: string }, { next: string }>(scope, "content-optimise");
      const run = useAiRun<{ fieldKey: string }, { next: string }>(found?.key ?? null);
      return createElement("div", null, run?.status === "running" ? `Running ${run.input.fieldKey}` : run?.result?.next || "Idle");
    }

    const first = render(createElement(RecoveredFieldRun));
    expect(screen.getByText("Running headline")).toBeInTheDocument();
    first.unmount();
    resolve({ next: "Improved" });
    await vi.runAllTimersAsync();

    render(createElement(RecoveredFieldRun));
    expect(screen.getByText("Improved")).toBeInTheDocument();
  });

  it("keeps a completed article A result out of article B's run key", async () => {
    const scope = { sessionId: "person", workspaceId: "workspace", projectId: "project" };
    setAiRunIdentity(scope.sessionId, scope.workspaceId);
    const articleAKey = aiRunKey(scope, "content-optimise", "article-a");
    const articleBKey = aiRunKey(scope, "content-optimise", "article-b");
    startAiRun({
      key: articleAKey,
      scope,
      operation: "content-optimise",
      subjectId: "article-a",
      input: { editorSubject: "article-a", bodyCopy: "Article A" },
      estimateSeconds: 40,
      execute: async () => ({ bodyCopy: "Improved article A" }),
    });
    await vi.runAllTimersAsync();

    expect(getAiRun(articleAKey)).toMatchObject({ status: "succeeded", result: { bodyCopy: "Improved article A" } });
    expect(getAiRun(articleBKey)).toBeNull();
  });

  it("does not apply a late completion from a failed attempt after a same-tick retry", async () => {
    const scope = { sessionId: "person", workspaceId: "workspace", projectId: "project" };
    setAiRunIdentity(scope.sessionId, scope.workspaceId);
    const key = aiRunKey(scope, "content-draft", "article");
    let resolveLate!: (value: { bodyCopy: string }) => void;
    const first = startAiRun({
      key, scope, operation: "content-draft", input: {}, estimateSeconds: 30,
      execute: () => new Promise((resolve) => { resolveLate = resolve; }),
    });
    // Simulate the transport's terminal failure while its old callback is still pending.
    // A retry must get a distinct identity even when Date.now() has not advanced.
    clearAiRuns();
    setAiRunIdentity(scope.sessionId, scope.workspaceId);
    const retry = startAiRun({
      key, scope, operation: "content-draft", input: {}, estimateSeconds: 30,
      execute: async () => ({ bodyCopy: "New draft" }),
    });
    resolveLate({ bodyCopy: "Stale draft" });
    await vi.runAllTimersAsync();
    expect(first.startedAt).toBe(retry.startedAt);
    expect(first.id).not.toBe(retry.id);
    expect(getAiRun(key)?.result).toEqual({ bodyCopy: "New draft" });
  });
});