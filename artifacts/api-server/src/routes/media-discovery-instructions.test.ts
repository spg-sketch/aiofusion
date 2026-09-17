import { beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec("CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL);");
  return { db, ...schema };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: any, res: any, next: () => void) => {
    if (!req.account) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  },
}));

vi.mock("../lib/platform-auth", () => ({
  masterSubrole: (account: { role: string; membershipRole?: string }) =>
    account.role === "admin" && (!account.membershipRole || account.membershipRole === "owner")
      ? "owner"
      : account.role === "admin" && account.membershipRole === "admin"
        ? "technical"
        : account.role === "admin" ? "support" : null,
}));

import {
  DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS,
  MEDIA_DISCOVERY_INSTRUCTIONS_KEY,
} from "../lib/media-discovery-instructions";
import { db, platformMetaTable } from "@workspace/db";
import router from "./media-discovery-instructions";

function startFor(account: { username: string; role: string; membershipRole?: string }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).account = account;
    next();
  });
  app.use("/api", router);
  return app.listen(0);
}

async function request(
  method: "GET" | "PUT",
  account: { username: string; role: string; membershipRole?: string },
  body?: unknown,
) {
  const local = startFor(account);
  await new Promise<void>((resolve) => local.once("listening", resolve));
  const port = (local.address() as AddressInfo).port;
  try {
    return await fetch(`http://127.0.0.1:${port}/api/store/media-db/discovery-instructions`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } finally {
    await new Promise<void>((resolve) => local.close(() => resolve()));
  }
}

beforeAll(async () => {
  await db.delete(platformMetaTable).where(
    // This intentionally avoids a broad delete if another focused suite
    // shares the in-memory database.
    eq(platformMetaTable.key, MEDIA_DISCOVERY_INSTRUCTIONS_KEY),
  );
});

const owner = { username: "not-admin", role: "admin", membershipRole: "owner" };
const viewer = { username: "admin", role: "admin", membershipRole: "viewer" };
const agency = { username: "admin", role: "agency", membershipRole: "owner" };
const custom = "Use current outlet team pages and recent bylines. Never infer email addresses; cite every candidate source URL.";

describe("Master Owner media discovery instructions", () => {
  it("returns the safe version-zero default without writing it", async () => {
    const response = await request("GET", owner);
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.instructions).toBe(DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS);
    expect(body.defaultInstructions).toBe(DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS);
    expect(body.version).toBe(0);
    expect(body.updatedAt).toBeNull();
    expect(body.canEdit).toBe(true);
    expect(await db.select().from(platformMetaTable)).toHaveLength(0);
  });

  it("uses role and membership subrole, not a trusted-looking username", async () => {
    expect((await request("GET", owner)).status).toBe(200);
    expect((await request("GET", viewer)).status).toBe(403);
    expect((await request("GET", agency)).status).toBe(403);
  });

  it("rejects bad lengths and applies transactional version CAS", async () => {
    expect((await request("PUT", owner, { instructions: "too short", version: 0 })).status).toBe(400);
    expect((await request("PUT", owner, { instructions: "x".repeat(12001), version: 0 })).status).toBe(400);

    const saved = await request("PUT", owner, { instructions: custom, version: 0 });
    expect(saved.status).toBe(200);
    expect((await saved.json() as { version: number }).version).toBe(1);

    const conflict = await request("PUT", owner, { instructions: `${custom} changed`, version: 0 });
    expect(conflict.status).toBe(409);
    expect((await conflict.json() as { version: number }).version).toBe(1);
  });

  it("restores the immutable default through a normal versioned PUT", async () => {
    const restored = await request("PUT", owner, {
      instructions: DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS,
      version: 1,
    });
    const body = await restored.json() as { instructions: string; version: number; updatedAt: string };
    expect(restored.status).toBe(200);
    expect(body.instructions).toBe(DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS);
    expect(body.version).toBe(2);
    expect(body.updatedAt).toEqual(expect.any(String));
  });
});