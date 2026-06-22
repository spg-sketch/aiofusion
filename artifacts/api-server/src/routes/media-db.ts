import { Router, type IRouter, type Request, type Response } from "express";
import { db, mediaCategoriesTable, mediaOutletsTable, mediaContactsTable } from "@workspace/db";
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { getVisibleUsernames, normUsername } from "../lib/platform-auth";
import { TRADE_MEDIA_CATEGORIES } from "../lib/trade-media-categories";

const router: IRouter = Router();

// Returns the set of account_ids the request may see for shared/global rows.
// null = admin (sees all). Otherwise returns own username + descendants.
async function visibleAccounts(req: Request): Promise<string[] | null> {
  return getVisibleUsernames(req.account!);
}

function isAdmin(req: Request): boolean {
  return req.account?.role === "admin";
}

// ---------------------------------------------------------------------------
// Custom categories
// ---------------------------------------------------------------------------

// GET /store/media-categories
// Returns the standard 110 categories merged with any custom rows visible to
// this account. Each entry is either a plain string (standard) or
// { id, name, custom: true } (custom).
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

      // Filter to rows visible to this account (global = no account_id, or own hierarchy)
      const custom = rows.filter((r) => {
        if (!r.accountId) return true; // global
        if (visible === null) return true; // admin sees all
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

// POST /store/media-categories
// Create a custom category scoped to the session account.
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
      const accountId = isAdmin(req) ? null : normUsername(req.account!.username);
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

// DELETE /store/media-categories/:id
// Remove a custom category the account owns.
router.post(
  "/store/media-categories/delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.body?.id);
      if (!id) {
        res.status(400).json({ error: "Missing category id" });
        return;
      }
      const visible = await visibleAccounts(req);
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
      // Admins can delete any; others can only delete rows they own
      if (!isAdmin(req)) {
        if (!row.accountId || (visible !== null && !visible.includes(row.accountId))) {
          res.status(403).json({ error: "You cannot delete this category" });
          return;
        }
      }
      await db.delete(mediaCategoriesTable).where(eq(mediaCategoriesTable.id, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete category" });
    }
  },
);

// ---------------------------------------------------------------------------
// Media outlets
// ---------------------------------------------------------------------------

function outletVisible(accountId: string | null, visible: string[] | null): boolean {
  if (accountId === null) return true; // global
  if (visible === null) return true; // admin
  return visible.includes(accountId);
}

// GET /store/media-outlets
router.get(
  "/store/media-outlets",
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

// POST /store/media-outlets
router.post(
  "/store/media-outlets",
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

// POST /store/media-outlets/update
router.post(
  "/store/media-outlets/update",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { id, name, category, website, description, country, reachBand } = req.body ?? {};
      const numId = Number(id);
      if (!numId) {
        res.status(400).json({ error: "Missing outlet id" });
        return;
      }
      const visible = await visibleAccounts(req);
      const existing = await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, numId)).limit(1);
      const row = existing[0];
      if (!row || row.deletedAt) {
        res.status(404).json({ error: "Outlet not found" });
        return;
      }
      if (!isAdmin(req) && !outletVisible(row.accountId, visible)) {
        res.status(403).json({ error: "You cannot edit this outlet" });
        return;
      }
      // Non-admins cannot edit global rows
      if (!isAdmin(req) && row.accountId === null) {
        res.status(403).json({ error: "Only admins may edit global outlets" });
        return;
      }
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

// POST /store/media-outlets/delete
router.post(
  "/store/media-outlets/delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.body?.id);
      if (!id) {
        res.status(400).json({ error: "Missing outlet id" });
        return;
      }
      const visible = await visibleAccounts(req);
      const existing = await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, id)).limit(1);
      const row = existing[0];
      if (!row) {
        res.json({ ok: true });
        return;
      }
      if (!isAdmin(req) && !outletVisible(row.accountId, visible)) {
        res.status(403).json({ error: "You cannot delete this outlet" });
        return;
      }
      if (!isAdmin(req) && row.accountId === null) {
        res.status(403).json({ error: "Only admins may delete global outlets" });
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
// Media contacts
// ---------------------------------------------------------------------------

// GET /store/media-contacts
router.get(
  "/store/media-contacts",
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

      const results = rows.filter((r) => {
        if (visible === null) return true;
        return visible.includes(r.accountId);
      });
      res.json({ contacts: results });
    } catch {
      res.status(500).json({ error: "Failed to load contacts" });
    }
  },
);

// POST /store/media-contacts
router.post(
  "/store/media-contacts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { outletId, firstName, lastName, role, email, phone, notes } = req.body ?? {};
      if (!firstName && !lastName) {
        res.status(400).json({ error: "Contact must have at least a first or last name" });
        return;
      }
      const accountId = normUsername(req.account!.username);
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

// POST /store/media-contacts/update
router.post(
  "/store/media-contacts/update",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { id, outletId, firstName, lastName, role, email, phone, notes } = req.body ?? {};
      const numId = Number(id);
      if (!numId) {
        res.status(400).json({ error: "Missing contact id" });
        return;
      }
      const visible = await visibleAccounts(req);
      const existing = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, numId)).limit(1);
      const row = existing[0];
      if (!row || row.deletedAt) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }
      if (visible !== null && !visible.includes(row.accountId)) {
        res.status(403).json({ error: "You cannot edit this contact" });
        return;
      }
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

// POST /store/media-contacts/delete
router.post(
  "/store/media-contacts/delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.body?.id);
      if (!id) {
        res.status(400).json({ error: "Missing contact id" });
        return;
      }
      const visible = await visibleAccounts(req);
      const existing = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, id)).limit(1);
      const row = existing[0];
      if (!row) {
        res.json({ ok: true });
        return;
      }
      if (visible !== null && !visible.includes(row.accountId)) {
        res.status(403).json({ error: "You cannot delete this contact" });
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
