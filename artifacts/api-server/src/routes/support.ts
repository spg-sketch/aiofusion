import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  supportFaqTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  platformMetaTable,
} from "@workspace/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { sendSupportTicketAlert, sendSupportTicketAck } from "../lib/notify-email";

const PROFILE_PREFIX = "account:profile:";

async function getDisplayName(username: string): Promise<string | undefined> {
  const key = `${PROFILE_PREFIX}${username.trim().toLowerCase()}`;
  const [row] = await db
    .select({ value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, key))
    .limit(1);
  if (!row?.value) return undefined;
  try {
    const obj = JSON.parse(row.value) as { displayName?: unknown };
    const dn = typeof obj?.displayName === "string" ? obj.displayName.trim() : "";
    return dn || undefined;
  } catch {
    return undefined;
  }
}

const router: IRouter = Router();

// Helper: is this request an admin?
function isAdmin(req: Request): boolean {
  return req.account?.role === "admin";
}

// ── GET /api/support/faq ───────────────────────────────────────────────────
// Returns FAQ entries. Optional query params:
//   q          — full-text search across question, answer, and keywords
//   category   — filter by category name
//   admin=1    — (admin only) return all entries including inactive ones
router.get("/support/faq", async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const adminMode = req.query.admin === "1" && req.account?.role === "admin";

    let rows = await db
      .select()
      .from(supportFaqTable)
      .where(adminMode ? undefined : eq(supportFaqTable.isActive, true))
      .orderBy(asc(supportFaqTable.category), asc(supportFaqTable.displayOrder));

    if (category) {
      rows = rows.filter((r) => r.category.toLowerCase() === category.toLowerCase());
    }

    if (q) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      // Score each row by how many terms it matches, then return top results
      const scored = rows
        .map((r) => {
          const haystack =
            `${r.question} ${r.answer} ${r.keywords}`.toLowerCase();
          const score = terms.reduce(
            (acc, t) => acc + (haystack.includes(t) ? 1 : 0),
            0,
          );
          return { row: r, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((s) => s.row);
      return res.json({ faq: scored });
    }

    return res.json({ faq: rows });
  } catch (err) {
    console.error("[support] GET /faq", err);
    return res.status(500).json({ error: "Failed to load FAQ" });
  }
});

// ── POST /api/support/faq ──────────────────────────────────────────────────
// Admin-only: create a new FAQ entry
router.post(
  "/support/faq",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    try {
      const { category, question, answer, keywords, displayOrder, isActive } =
        req.body ?? {};
      if (!category || !question || !answer) {
        res.status(400).json({ error: "category, question, and answer are required." });
        return;
      }
      const [row] = await db
        .insert(supportFaqTable)
        .values({
          category: String(category).trim(),
          question: String(question).trim(),
          answer: String(answer).trim(),
          keywords: typeof keywords === "string" ? keywords.trim() : "",
          displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
          isActive: isActive !== false,
        })
        .returning();
      res.status(201).json({ faq: row });
    } catch (err) {
      console.error("[support] POST /faq", err);
      res.status(500).json({ error: "Failed to create FAQ entry" });
    }
  },
);

// ── PATCH /api/support/faq/:id ─────────────────────────────────────────────
// Admin-only: update an existing FAQ entry
router.patch(
  "/support/faq/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid FAQ id." });
      return;
    }
    try {
      const { category, question, answer, keywords, displayOrder, isActive } =
        req.body ?? {};
      const set: Record<string, unknown> = {};
      if (category !== undefined) set.category = String(category).trim();
      if (question !== undefined) set.question = String(question).trim();
      if (answer !== undefined) set.answer = String(answer).trim();
      if (keywords !== undefined) set.keywords = String(keywords).trim();
      if (displayOrder !== undefined) set.displayOrder = Number(displayOrder);
      if (isActive !== undefined) set.isActive = Boolean(isActive);
      const [row] = await db
        .update(supportFaqTable)
        .set(set)
        .where(eq(supportFaqTable.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "FAQ entry not found." });
        return;
      }
      res.json({ faq: row });
    } catch (err) {
      console.error("[support] PATCH /faq/:id", err);
      res.status(500).json({ error: "Failed to update FAQ entry" });
    }
  },
);

// ── POST /api/support/faq/reorder ─────────────────────────────────────────
// Admin-only: bulk update display_order values for drag-reorder
router.post(
  "/support/faq/reorder",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    try {
      const { items } = req.body ?? {};
      if (!Array.isArray(items)) {
        res.status(400).json({ error: "items must be an array." });
        return;
      }
      await Promise.all(
        (items as { id: number; displayOrder: number }[]).map(({ id, displayOrder }) =>
          db
            .update(supportFaqTable)
            .set({ displayOrder })
            .where(eq(supportFaqTable.id, id)),
        ),
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("[support] POST /faq/reorder", err);
      res.status(500).json({ error: "Failed to reorder FAQ entries" });
    }
  },
);

// ── POST /api/support/tickets ──────────────────────────────────────────────
// Auth required: create a support ticket. Account/role/project auto-attached.
router.post(
  "/support/tickets",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { category, subject, description, attachmentUrl } =
        req.body ?? {};
      if (!subject || !description) {
        res.status(400).json({ error: "subject and description are required." });
        return;
      }
      const account = req.account!;
      // Validate optional base64 attachment — reject anything over 512 KB
      let resolvedAttachmentUrl: string | null = null;
      if (typeof attachmentUrl === "string" && attachmentUrl.startsWith("data:")) {
        const bytes = Math.ceil((attachmentUrl.length * 3) / 4);
        if (bytes > 512 * 1024) {
          res.status(400).json({ error: "Attachment must be under 512 KB." });
          return;
        }
        resolvedAttachmentUrl = attachmentUrl;
      }
      const [ticket] = await db
        .insert(supportTicketsTable)
        .values({
          accountUsername: account.username,
          userRole: account.role ?? "user",
          // projectId is NOT accepted from the client — it would allow spoofing.
          // If needed it can be derived from server-side session in the future.
          projectId: null,
          category:
            typeof category === "string" && category.trim()
              ? category.trim()
              : "General",
          subject: String(subject).trim().slice(0, 255),
          description: String(description).trim(),
          attachmentUrl: resolvedAttachmentUrl,
          status: "open",
        })
        .returning();
      res.status(201).json({ ticket });

      // Fire-and-forget email notifications (non-fatal if they fail)
      const displayName = await getDisplayName(account.username).catch(() => undefined);
      void sendSupportTicketAlert({
        ticketId: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        description: ticket.description,
        accountUsername: ticket.accountUsername,
        displayName,
      });
      if (account.email) {
        void sendSupportTicketAck({
          toEmail: account.email,
          toName: account.username,
          displayName,
          ticketId: ticket.id,
          subject: ticket.subject,
        });
      }
    } catch (err) {
      console.error("[support] POST /tickets", err);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  },
);

// ── GET /api/support/tickets ───────────────────────────────────────────────
// Admin: list all tickets with optional filters.
// User (mine=true): list the caller's own tickets.
router.get(
  "/support/tickets",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const account = req.account!;
      const mine = req.query.mine === "true";
      const hasUpdate = req.query.hasUpdate === "true";

      if (!isAdmin(req) && !mine) {
        res.status(403).json({ error: "Admin access required." });
        return;
      }

      const statusFilter =
        typeof req.query.status === "string" ? req.query.status.trim() : "";
      const categoryFilter =
        typeof req.query.category === "string"
          ? req.query.category.trim()
          : "";
      const fromFilter =
        typeof req.query.from === "string" ? req.query.from.trim() : "";
      const toFilter =
        typeof req.query.to === "string" ? req.query.to.trim() : "";

      const conditions = [];
      if (mine) {
        conditions.push(eq(supportTicketsTable.accountUsername, account.username));
      }
      if (hasUpdate) {
        conditions.push(
          and(
            eq(supportTicketsTable.hasAdminReply, true),
            eq(supportTicketsTable.userSeenReply, false),
          )!,
        );
      }
      if (statusFilter) {
        conditions.push(eq(supportTicketsTable.status, statusFilter));
      }
      if (categoryFilter) {
        conditions.push(eq(supportTicketsTable.category, categoryFilter));
      }
      if (fromFilter) {
        conditions.push(gte(supportTicketsTable.createdAt, new Date(fromFilter)));
      }
      if (toFilter) {
        conditions.push(lte(supportTicketsTable.createdAt, new Date(toFilter)));
      }

      const tickets = await db
        .select()
        .from(supportTicketsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(supportTicketsTable.createdAt));

      res.json({ tickets });
    } catch (err) {
      console.error("[support] GET /tickets", err);
      res.status(500).json({ error: "Failed to load tickets" });
    }
  },
);

// ── PATCH /api/support/tickets/:id ────────────────────────────────────────
// Admin-only: update status, admin notes, or mark user seen.
router.patch(
  "/support/tickets/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid ticket id." });
      return;
    }
    try {
      const { status, adminNotes, hasAdminReply, userSeenReply } = req.body ?? {};
      const set: Record<string, unknown> = {};
      if (status !== undefined) set.status = String(status);
      if (adminNotes !== undefined) set.adminNotes = String(adminNotes);
      if (hasAdminReply !== undefined) set.hasAdminReply = Boolean(hasAdminReply);
      if (userSeenReply !== undefined) set.userSeenReply = Boolean(userSeenReply);

      const [ticket] = await db
        .update(supportTicketsTable)
        .set(set)
        .where(eq(supportTicketsTable.id, id))
        .returning();
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found." });
        return;
      }
      res.json({ ticket });
    } catch (err) {
      console.error("[support] PATCH /tickets/:id", err);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  },
);

// ── GET /api/support/tickets/:id/messages ─────────────────────────────────
// Get message thread for a ticket. Admins see all; users see only their own.
router.get(
  "/support/tickets/:id/messages",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid ticket id." });
      return;
    }
    try {
      const [ticket] = await db
        .select({ accountUsername: supportTicketsTable.accountUsername })
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.id, id))
        .limit(1);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found." });
        return;
      }
      if (!isAdmin(req) && ticket.accountUsername !== req.account!.username) {
        res.status(403).json({ error: "Access denied." });
        return;
      }
      const messages = await db
        .select()
        .from(supportTicketMessagesTable)
        .where(eq(supportTicketMessagesTable.ticketId, id))
        .orderBy(asc(supportTicketMessagesTable.createdAt));
      res.json({ messages });
    } catch (err) {
      console.error("[support] GET /tickets/:id/messages", err);
      res.status(500).json({ error: "Failed to load messages" });
    }
  },
);

// ── POST /api/support/tickets/:id/messages ────────────────────────────────
// Add a reply to a ticket thread.
router.post(
  "/support/tickets/:id/messages",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid ticket id." });
      return;
    }
    try {
      const { body } = req.body ?? {};
      if (!body || typeof body !== "string" || !body.trim()) {
        res.status(400).json({ error: "message body is required." });
        return;
      }
      const account = req.account!;
      const [ticket] = await db
        .select({ accountUsername: supportTicketsTable.accountUsername })
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.id, id))
        .limit(1);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found." });
        return;
      }
      const isAdminUser = isAdmin(req);
      if (!isAdminUser && ticket.accountUsername !== account.username) {
        res.status(403).json({ error: "Access denied." });
        return;
      }
      const [message] = await db
        .insert(supportTicketMessagesTable)
        .values({
          ticketId: id,
          authorType: isAdminUser ? "admin" : "user",
          authorUsername: account.username,
          body: body.trim(),
        })
        .returning();
      // Mark the ticket as having an admin reply when admin posts
      if (isAdminUser) {
        await db
          .update(supportTicketsTable)
          .set({ hasAdminReply: true, userSeenReply: false, status: "in_progress" })
          .where(eq(supportTicketsTable.id, id));
      }
      res.status(201).json({ message });
    } catch (err) {
      console.error("[support] POST /tickets/:id/messages", err);
      res.status(500).json({ error: "Failed to add message" });
    }
  },
);

export default router;
