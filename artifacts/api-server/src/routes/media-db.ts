import { Router, type IRouter, type Request, type Response } from "express";
import { db, mediaCategoriesTable, mediaOutletsTable, mediaContactsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { getVisibleUsernames, normUsername } from "../lib/platform-auth";
import { TRADE_MEDIA_CATEGORIES } from "../lib/trade-media-categories";

const router: IRouter = Router();

async function visibleAccounts(req: Request): Promise<string[] | null> {
  return getVisibleUsernames(req.account!);
}

function isAdmin(req: Request): boolean {
  return req.account?.role === "admin";
}

function outletVisible(accountId: string | null, visible: string[] | null): boolean {
  if (accountId === null) return true;
  if (visible === null) return true;
  return visible.includes(accountId);
}

// ---------------------------------------------------------------------------
// Custom categories  GET /api/store/media-categories
//                    POST /api/store/media-categories
//                    DELETE /api/store/media-categories/:id
// ---------------------------------------------------------------------------

router.get(
  "/store/media-categories",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleAccounts(req);
      const rows = await db
        .select()
        .from(mediaCategoriesTable)
        .orderBy(mediaCategoriesTable.name);

      const custom = rows.filter((r) => {
        if (!r.accountId) return true;
        if (visible === null) return true;
        return visible.includes(r.accountId);
      });

      res.json({
        standard: TRADE_MEDIA_CATEGORIES,
        custom: custom.map((r) => ({ id: r.id, name: r.name, accountId: r.accountId })),
      });
    } catch {
      res.status(500).json({ error: "Failed to load categories" });
    }
  },
);

router.post(
  "/store/media-categories",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { name } = req.body ?? {};
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "Missing category name" });
        return;
      }
      // Custom categories are always scoped to the creating account —
      // there is no global category concept.
      const accountId = normUsername(req.account!.username);
      const [created] = await db
        .insert(mediaCategoriesTable)
        .values({ name: name.trim(), accountId })
        .returning();
      res.json({ ok: true, category: created });
    } catch {
      res.status(500).json({ error: "Failed to create category" });
    }
  },
);

router.delete(
  "/store/media-categories/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Invalid category id" });
        return;
      }
      const existing = await db
        .select()
        .from(mediaCategoriesTable)
        .where(eq(mediaCategoriesTable.id, id))
        .limit(1);
      if (!existing[0]) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      const row = existing[0];
      // Only the account that created the category (or admin) may delete it.
      const owner = normUsername(req.account!.username);
      if (!isAdmin(req) && row.accountId !== owner) {
        res.status(403).json({ error: "You cannot delete this category" });
        return;
      }
      await db.delete(mediaCategoriesTable).where(eq(mediaCategoriesTable.id, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete category" });
    }
  },
);

// ---------------------------------------------------------------------------
// Outlets  GET    /api/store/media-db/outlets
//          POST   /api/store/media-db/outlets
//          PUT    /api/store/media-db/outlets/:id
//          DELETE /api/store/media-db/outlets/:id
// ---------------------------------------------------------------------------

router.get(
  "/store/media-db/outlets",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleAccounts(req);
      const rows = await db
        .select()
        .from(mediaOutletsTable)
        .orderBy(mediaOutletsTable.name);

      const results = rows.filter(
        (r) => !r.deletedAt && outletVisible(r.accountId, visible),
      );
      res.json({ outlets: results });
    } catch {
      res.status(500).json({ error: "Failed to load outlets" });
    }
  },
);

router.post(
  "/store/media-db/outlets",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { name, category, website, description, country, reachBand } = req.body ?? {};
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "Missing outlet name" });
        return;
      }
      const accountId = isAdmin(req) ? null : normUsername(req.account!.username);
      const [created] = await db
        .insert(mediaOutletsTable)
        .values({
          name: name.trim(),
          category: typeof category === "string" ? category.trim() : "",
          website: typeof website === "string" ? website.trim() : "",
          description: typeof description === "string" ? description.trim() : "",
          country: typeof country === "string" ? country.trim() : "",
          reachBand: typeof reachBand === "string" ? reachBand.trim() : "",
          accountId,
        })
        .returning();
      res.json({ ok: true, outlet: created });
    } catch {
      res.status(500).json({ error: "Failed to create outlet" });
    }
  },
);

router.put(
  "/store/media-db/outlets/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const numId = Number(req.params.id);
      if (!numId) {
        res.status(400).json({ error: "Invalid outlet id" });
        return;
      }
      const existing = await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, numId)).limit(1);
      const row = existing[0];
      if (!row || row.deletedAt) {
        res.status(404).json({ error: "Outlet not found" });
        return;
      }
      // Global rows (accountId null) require admin; account-scoped rows require ownership.
      if (row.accountId === null && !isAdmin(req)) {
        res.status(403).json({ error: "Only admins may edit global outlets" });
        return;
      }
      if (row.accountId !== null && !isAdmin(req) && row.accountId !== normUsername(req.account!.username)) {
        res.status(403).json({ error: "You can only edit your own outlets" });
        return;
      }
      const { name, category, website, description, country, reachBand } = req.body ?? {};
      const [updated] = await db
        .update(mediaOutletsTable)
        .set({
          name: typeof name === "string" && name.trim() ? name.trim() : row.name,
          category: typeof category === "string" ? category.trim() : row.category,
          website: typeof website === "string" ? website.trim() : row.website,
          description: typeof description === "string" ? description.trim() : row.description,
          country: typeof country === "string" ? country.trim() : row.country,
          reachBand: typeof reachBand === "string" ? reachBand.trim() : row.reachBand,
        })
        .where(eq(mediaOutletsTable.id, numId))
        .returning();
      res.json({ ok: true, outlet: updated });
    } catch {
      res.status(500).json({ error: "Failed to update outlet" });
    }
  },
);

router.delete(
  "/store/media-db/outlets/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Invalid outlet id" });
        return;
      }
      const existing = await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, id)).limit(1);
      const row = existing[0];
      if (!row) {
        res.json({ ok: true });
        return;
      }
      if (row.accountId === null && !isAdmin(req)) {
        res.status(403).json({ error: "Only admins may delete global outlets" });
        return;
      }
      if (row.accountId !== null && !isAdmin(req) && row.accountId !== normUsername(req.account!.username)) {
        res.status(403).json({ error: "You can only delete your own outlets" });
        return;
      }
      await db.update(mediaOutletsTable).set({ deletedAt: new Date() }).where(eq(mediaOutletsTable.id, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete outlet" });
    }
  },
);

// ---------------------------------------------------------------------------
// Contacts  GET    /api/store/media-db/contacts
//           POST   /api/store/media-db/contacts
//           PUT    /api/store/media-db/contacts/:id
//           DELETE /api/store/media-db/contacts/:id
// ---------------------------------------------------------------------------

router.get(
  "/store/media-db/contacts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleAccounts(req);
      const rows = await db
        .select({
          id: mediaContactsTable.id,
          outletId: mediaContactsTable.outletId,
          firstName: mediaContactsTable.firstName,
          lastName: mediaContactsTable.lastName,
          role: mediaContactsTable.role,
          email: mediaContactsTable.email,
          phone: mediaContactsTable.phone,
          notes: mediaContactsTable.notes,
          accountId: mediaContactsTable.accountId,
          createdAt: mediaContactsTable.createdAt,
          outletName: mediaOutletsTable.name,
          outletCategory: mediaOutletsTable.category,
        })
        .from(mediaContactsTable)
        .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
        .where(isNull(mediaContactsTable.deletedAt))
        .orderBy(mediaContactsTable.lastName, mediaContactsTable.firstName);

      // Global contacts (accountId null) are visible to all; otherwise filter by hierarchy
      const results = rows.filter((r) => {
        if (r.accountId === null) return true;
        if (visible === null) return true;
        return visible.includes(r.accountId);
      });
      res.json({ contacts: results });
    } catch {
      res.status(500).json({ error: "Failed to load contacts" });
    }
  },
);

router.post(
  "/store/media-db/contacts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { outletId, firstName, lastName, role, email, phone, notes } = req.body ?? {};
      if (!firstName && !lastName) {
        res.status(400).json({ error: "Contact must have at least a first or last name" });
        return;
      }
      // Admins can create global contacts (accountId = null)
      const accountId = isAdmin(req) ? null : normUsername(req.account!.username);
      const [created] = await db
        .insert(mediaContactsTable)
        .values({
          outletId: outletId ? Number(outletId) : null,
          firstName: typeof firstName === "string" ? firstName.trim() : "",
          lastName: typeof lastName === "string" ? lastName.trim() : "",
          role: typeof role === "string" ? role.trim() : "",
          email: typeof email === "string" ? email.trim() : "",
          phone: typeof phone === "string" ? phone.trim() : "",
          notes: typeof notes === "string" ? notes.trim() : "",
          accountId,
        })
        .returning();
      res.json({ ok: true, contact: created });
    } catch {
      res.status(500).json({ error: "Failed to create contact" });
    }
  },
);

router.put(
  "/store/media-db/contacts/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const numId = Number(req.params.id);
      if (!numId) {
        res.status(400).json({ error: "Invalid contact id" });
        return;
      }
      const existing = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, numId)).limit(1);
      const row = existing[0];
      if (!row || row.deletedAt) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }
      // Global contacts (accountId null) require admin; account-scoped require ownership.
      if (row.accountId === null && !isAdmin(req)) {
        res.status(403).json({ error: "Only admins may edit global contacts" });
        return;
      }
      if (row.accountId !== null && !isAdmin(req) && row.accountId !== normUsername(req.account!.username)) {
        res.status(403).json({ error: "You can only edit your own contacts" });
        return;
      }
      const { outletId, firstName, lastName, role, email, phone, notes } = req.body ?? {};
      const [updated] = await db
        .update(mediaContactsTable)
        .set({
          outletId: outletId !== undefined ? (outletId ? Number(outletId) : null) : row.outletId,
          firstName: typeof firstName === "string" ? firstName.trim() : row.firstName,
          lastName: typeof lastName === "string" ? lastName.trim() : row.lastName,
          role: typeof role === "string" ? role.trim() : row.role,
          email: typeof email === "string" ? email.trim() : row.email,
          phone: typeof phone === "string" ? phone.trim() : row.phone,
          notes: typeof notes === "string" ? notes.trim() : row.notes,
        })
        .where(eq(mediaContactsTable.id, numId))
        .returning();
      res.json({ ok: true, contact: updated });
    } catch {
      res.status(500).json({ error: "Failed to update contact" });
    }
  },
);

router.delete(
  "/store/media-db/contacts/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Invalid contact id" });
        return;
      }
      const existing = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, id)).limit(1);
      const row = existing[0];
      if (!row) {
        res.json({ ok: true });
        return;
      }
      if (row.accountId === null && !isAdmin(req)) {
        res.status(403).json({ error: "Only admins may delete global contacts" });
        return;
      }
      if (row.accountId !== null && !isAdmin(req) && row.accountId !== normUsername(req.account!.username)) {
        res.status(403).json({ error: "You can only delete your own contacts" });
        return;
      }
      await db.update(mediaContactsTable).set({ deletedAt: new Date() }).where(eq(mediaContactsTable.id, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete contact" });
    }
  },
);

export default router;
