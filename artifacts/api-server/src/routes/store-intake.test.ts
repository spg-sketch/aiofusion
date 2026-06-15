import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

// A real (in-memory) Postgres so the route's actual SQL conflict guard runs.
//
// The other store route tests use a hand-rolled JS mock of @workspace/db, which
// is fine for authorization branching but cannot exercise the one thing that
// matters most here: the SQL `coalesce(${projectsTable.intake}, ${incoming})`
// in POST /api/store/projects/intake. That `coalesce` is the single most
// important data-loss preventer - it stops a blank Draft from a stale device
// wiping a completed Set-Up. To prove it we run the real route against a real
// Postgres engine (pglite, in-memory), so any change to that SQL fails here.
//
// We mock @workspace/db so it hands back a pglite-backed drizzle instance plus
// the *real* schema tables (imported unmocked from @workspace/db/schema). The
// route, its helpers and drizzle-orm are all unmocked, so the SQL executed is
// exactly what production runs.
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Mirror lib/db/src/schema/projects.ts (only the projects table is touched by
  // an admin-actor intake save; auth helpers short-circuit for an admin).
  await client.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id varchar PRIMARY KEY,
      name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      intake jsonb,
      logo text,
      owner varchar,
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
  `);

  return { db, ...schema };
});

// These resolve to the mocked module above: the same pglite-backed db and the
// real projectsTable, so the test seeds and asserts through the very engine the
// route writes to.
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import storeRouter from "./store";

const POPULATED_INTAKE = {
  formData: {
    "1.1": "Acme Corp",
    "4.1": "Acme Corp",
    "2.3": "We sell rockets",
  },
  businessCategories: ["aerospace"],
  duals: { foo: { a: "1", b: "2" } },
};

const BLANK_INTAKE = {
  formData: { "1.1": "", "4.1": "", notes: "   " },
  businessCategories: [],
  mediaCategories: [],
  audienceCategories: [],
  duals: {},
};

const SECOND_POPULATED_INTAKE = {
  formData: { "1.1": "Globex", "4.1": "Globex" },
  businessCategories: ["finance"],
};

describe("POST /api/store/projects/intake (blank never overwrites populated, DB-backed)", () => {
  let server: Server;
  let baseUrl: string;

  async function postIntake(body: unknown) {
    const res = await fetch(`${baseUrl}/api/store/projects/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, json };
  }

  async function storedIntake(id: string) {
    const [row] = await db
      .select({ intake: projectsTable.intake })
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);
    return row?.intake ?? null;
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    // Stand in for requirePlatformAuth: act as the master so visibility checks
    // pass without needing seeded accounts/sessions.
    app.use((req, _res, next) => {
      req.account = { username: "admin", role: "admin" } as any;
      next();
    });
    app.use("/api", storeRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await db.delete(projectsTable);
  });

  async function seedPopulated(id: string) {
    await db.insert(projectsTable).values({
      id,
      name: "Acme Corp",
      data: { name: "Acme Corp" },
      intake: POPULATED_INTAKE,
      owner: "admin",
      updatedAt: new Date(),
      deletedAt: null,
    });
  }

  it("keeps a populated stored Set-Up when a blank Draft is posted", async () => {
    const id = "p-blank-overwrite";
    await seedPopulated(id);

    const { status, json } = await postIntake({ id, intake: BLANK_INTAKE });

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    // The coalesce guard must have preserved the original populated intake.
    expect(await storedIntake(id)).toEqual(POPULATED_INTAKE);
  });

  it("replaces the stored Set-Up when a genuinely populated update is posted", async () => {
    const id = "p-real-update";
    await seedPopulated(id);

    const { status, json } = await postIntake({ id, intake: SECOND_POPULATED_INTAKE });

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    // A real (non-empty) intake must overwrite the previous one.
    expect(await storedIntake(id)).toEqual(SECOND_POPULATED_INTAKE);
  });

  it("adopts an incoming intake when the project had none yet", async () => {
    // A brand-new project (no row) created via a populated intake save: the
    // insert branch should store the incoming intake verbatim.
    const id = "p-fresh";
    const { status } = await postIntake({ id, intake: POPULATED_INTAKE, name: "Acme Corp" });

    expect(status).toBe(200);
    expect(await storedIntake(id)).toEqual(POPULATED_INTAKE);
  });

  it("does not resurrect a populated intake with a blank one across repeated saves", async () => {
    // Regression for the stale-device scenario: several blank Drafts in a row
    // must never erode the saved Set-Up.
    const id = "p-repeat";
    await seedPopulated(id);

    for (let i = 0; i < 3; i++) {
      const { status } = await postIntake({ id, intake: BLANK_INTAKE });
      expect(status).toBe(200);
    }

    expect(await storedIntake(id)).toEqual(POPULATED_INTAKE);
  });

  it("merges a confirmed identity onto a populated Set-Up without wiping it", async () => {
    // Confirming which company an ambiguous brand name refers to produces an
    // otherwise-sparse payload (confirmedEntity but no real Set-Up answers).
    // It must save the choice while leaving every populated answer intact.
    const id = "p-confirm-merge";
    await seedPopulated(id);

    const confirmedEntity = { name: "Acme Aerospace Ltd", description: "The UK rocket maker" };
    const { status, json } = await postIntake({
      id,
      intake: { ...BLANK_INTAKE, confirmedEntity },
    });

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(await storedIntake(id)).toEqual({ ...POPULATED_INTAKE, confirmedEntity });
  });

  it("persists a confirmed identity for a project that has no Set-Up yet", async () => {
    // The genuinely-empty case: an audit run from project name/sector fallback.
    // The confirmation is the only content, and it must still be saved so it
    // loads back on another device / for a teammate. For a brand-new project the
    // insert branch stores the incoming blob verbatim, so the confirmation is
    // preserved (alongside the empty Set-Up scaffolding).
    const id = "p-confirm-only";
    const confirmedEntity = { name: "Globex Industries", description: "" };
    const incoming = { ...BLANK_INTAKE, confirmedEntity };
    const { status } = await postIntake({ id, intake: incoming });

    expect(status).toBe(200);
    const stored = (await storedIntake(id)) as Record<string, unknown>;
    expect(stored.confirmedEntity).toEqual(confirmedEntity);
  });

  it("updates a previously confirmed identity without touching other answers", async () => {
    // Changing the confirmed company ("no, it's actually X") must overwrite only
    // that key on the stored intake.
    const id = "p-confirm-change";
    const first = { name: "Acme Aerospace Ltd", description: "" };
    await db.insert(projectsTable).values({
      id,
      name: "Acme Corp",
      data: { name: "Acme Corp" },
      intake: { ...POPULATED_INTAKE, confirmedEntity: first },
      owner: "admin",
      updatedAt: new Date(),
      deletedAt: null,
    });

    const second = { name: "Acme Robotics Inc", description: "Different namesake" };
    const { status } = await postIntake({
      id,
      intake: { ...BLANK_INTAKE, confirmedEntity: second },
    });

    expect(status).toBe(200);
    expect(await storedIntake(id)).toEqual({ ...POPULATED_INTAKE, confirmedEntity: second });
  });
});
