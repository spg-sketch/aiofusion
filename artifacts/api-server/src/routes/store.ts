import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

// Shared project store. These routes back the cross-device "one login sees
// everything" behaviour. They are intentionally not gated behind an individual
// user - every signed-in user of this demo shares the same set of projects.

// List all live projects (lightweight: no intake blob) plus the ids of any
// projects that have been deleted, so other devices can drop their local copy.
router.get("/store/projects", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: projectsTable.id,
        // Recover a display name even when the name column was saved empty: fall
        // back to the company-name answer (field 4.1) inside the intake blob.
        // This is what an intake-only row has before the hub record is pushed
        // up, and without this such a project shows up blank / "New Project".
        name: sql<string>`coalesce(nullif(${projectsTable.name}, ''), ${projectsTable.intake}->'formData'->>'4.1', '')`,
        data: projectsTable.data,
        logo: projectsTable.logo,
        updatedAt: projectsTable.updatedAt,
        deletedAt: projectsTable.deletedAt,
      })
      .from(projectsTable);

    const projects = rows
      .filter((r) => !r.deletedAt)
      // name is returned alongside data so the client can recover a project's
      // name even if its data blob was saved empty (e.g. an intake-only row).
      .map((r) => ({ id: r.id, name: r.name, data: r.data, logo: r.logo, updatedAt: r.updatedAt }));
    const deletedIds = rows.filter((r) => r.deletedAt).map((r) => r.id);

    res.json({ projects, deletedIds });
  } catch {
    res.status(500).json({ error: "Failed to load projects" });
  }
});

// Fetch the full Set-Up / intake blob for a single project.
router.get("/store/projects/:id/intake", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "Missing project id" });
      return;
    }
    const rows = await db
      .select({ intake: projectsTable.intake, updatedAt: projectsTable.updatedAt })
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);
    const row = rows[0];
    res.json({ intake: row?.intake ?? null, updatedAt: row?.updatedAt ?? null });
  } catch {
    res.status(500).json({ error: "Failed to load intake" });
  }
});

// Upsert a project's hub record (name, data, logo). Leaves the intake blob
// untouched so saving the hub record never clobbers Set-Up answers.
router.post("/store/projects/upsert", async (req, res) => {
  try {
    const { id, name, data, logo } = req.body ?? {};
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Missing project id" });
      return;
    }
    const now = new Date();
    await db
      .insert(projectsTable)
      .values({
        id,
        name: typeof name === "string" ? name : "",
        data: data ?? {},
        logo: typeof logo === "string" ? logo : null,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: projectsTable.id,
        // Note: deletedAt is intentionally NOT touched here. A stale write from
        // another tab/device must never revive a project that was deleted
        // elsewhere - deletion only happens via the delete route.
        set: {
          name: typeof name === "string" ? name : "",
          data: data ?? {},
          logo: typeof logo === "string" ? logo : null,
          updatedAt: now,
        },
      });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save project" });
  }
});

// Upsert a project's intake blob only. Creates a minimal row if the project
// does not exist yet so intake is never lost.
router.post("/store/projects/intake", async (req, res) => {
  try {
    const { id, intake, name, data } = req.body ?? {};
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Missing project id" });
      return;
    }
    const now = new Date();
    await db
      .insert(projectsTable)
      .values({
        id,
        name: typeof name === "string" ? name : "",
        data: data ?? {},
        intake: intake ?? null,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: projectsTable.id,
        // deletedAt left untouched on purpose so a late intake save cannot
        // resurrect a project deleted on another device.
        set: { intake: intake ?? null, updatedAt: now },
      });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save intake" });
  }
});

// Soft-delete a project so the removal propagates to other devices.
router.post("/store/projects/delete", async (req, res) => {
  try {
    const { id } = req.body ?? {};
    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "Missing project id" });
      return;
    }
    await db
      .update(projectsTable)
      .set({ deletedAt: new Date() })
      .where(eq(projectsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
