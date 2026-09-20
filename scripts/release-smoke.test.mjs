import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { runCommand, stopChild, waitForHealth } from "./release-lib.mjs";

test("health polling accepts only an ok response", async () => {
  let calls = 0;
  await waitForHealth("http://fixture/health", {
    timeoutMs: 100,
    intervalMs: 1,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ status: "ok" }) };
    },
  });
  assert.equal(calls, 2);
});

test("health polling rejects a timeout", async () => {
  await assert.rejects(
    waitForHealth("http://fixture/health", {
      timeoutMs: 5,
      intervalMs: 1,
      fetchImpl: async () => { throw new Error("offline"); },
    }),
    /timed out.*offline/,
  );
});

test("smoke cleanup terminates a running child", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    child.exitCode = 0;
    queueMicrotask(() => child.emit("exit", 0));
    return true;
  };
  await stopChild(child, { timeoutMs: 10 });
  assert.deepEqual(child.signals, ["SIGTERM"]);
});

test("smoke cleanup force-kills a child that will not drain", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    if (signal === "SIGKILL") child.exitCode = 137;
    return true;
  };
  await stopChild(child, { timeoutMs: 1 });
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
});

test("release commands reject and clean up when they hang", async () => {
  await assert.rejects(
    runCommand("node -e \"setTimeout(() => {}, 10000)\"", { timeoutMs: 20 }),
    /timed out after 20ms/,
  );
});