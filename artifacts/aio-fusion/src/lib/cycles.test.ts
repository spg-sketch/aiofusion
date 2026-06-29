import { describe, it, expect, beforeEach } from "vitest";
import { loadCycle, recordCycle } from "./cycles";

beforeEach(() => {
  localStorage.clear();
});

describe("loadCycle", () => {
  it("returns a zero cycle with empty history when nothing is stored", () => {
    expect(loadCycle("client-1")).toEqual({ cycle: 0, history: [] });
  });

  it("returns a zero cycle for an unknown client id", () => {
    recordCycle("other-client", 80);
    expect(loadCycle("client-1")).toEqual({ cycle: 0, history: [] });
  });

  it("returns the stored cycle after a record", () => {
    recordCycle("client-1", 75);
    const data = loadCycle("client-1");
    expect(data.cycle).toBe(1);
    expect(data.history).toHaveLength(1);
    expect(data.history[0].score).toBe(75);
  });
});

describe("recordCycle", () => {
  it("increments the cycle counter on each call", () => {
    recordCycle("c1", 60);
    recordCycle("c1", 70);
    expect(loadCycle("c1").cycle).toBe(2);
  });

  it("appends an entry with an ISO date and the given score", () => {
    const before = Date.now();
    const result = recordCycle("c1", 88);
    const after = Date.now();

    expect(result.history).toHaveLength(1);
    const entry = result.history[0];
    expect(entry.score).toBe(88);
    const ts = new Date(entry.date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("accumulates history across multiple calls", () => {
    [50, 60, 70].forEach((score) => recordCycle("c1", score));
    const { history } = loadCycle("c1");
    expect(history.map((e) => e.score)).toEqual([50, 60, 70]);
  });

  it("caps history at 12 entries, dropping the oldest", () => {
    for (let i = 1; i <= 14; i++) recordCycle("c1", i);
    const { history } = loadCycle("c1");
    expect(history).toHaveLength(12);
    expect(history[0].score).toBe(3);
    expect(history[11].score).toBe(14);
  });

  it("keeps history for different client ids independent", () => {
    recordCycle("c1", 55);
    recordCycle("c2", 99);
    expect(loadCycle("c1").history[0].score).toBe(55);
    expect(loadCycle("c2").history[0].score).toBe(99);
  });

  it("persists the result to localStorage", () => {
    recordCycle("c1", 72);
    expect(localStorage.getItem("aio.cycle.c1")).not.toBeNull();
  });
});
