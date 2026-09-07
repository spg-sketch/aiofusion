import { describe, expect, it } from "vitest";
import { pool } from "@workspace/db";

describe("PostgreSQL pool resilience", () => {
  it("handles idle-client errors instead of letting Node terminate the API", () => {
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
  });
});