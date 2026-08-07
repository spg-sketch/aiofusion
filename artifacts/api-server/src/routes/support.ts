import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  supportFaqTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  platformMetaTable,
  platformAccountsTable,
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
import { sendSupportTicketAlert, sendSupportTicketAck, sendSupportTicketReplyNotification } from "../lib/notify-email";

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
//   q - full-text search across question, answer, and keywords
//   category - filter by category name
//   admin=1 - (admin only) return all entries including inactive ones
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
      // Strip common stop-words so "what does this do" doesn't match everything equally
      const STOP = new Set([
        "a","an","and","are","as","at","be","been","but","by","can","did","do",
        "does","for","from","get","got","had","has","have","he","her","him","his",
        "how","i","if","in","is","it","its","just","me","my","no","not","of","on",
        "or","our","out","so","some","that","the","their","them","then","there",
        "they","this","to","up","us","was","we","were","what","when","where",
        "which","who","why","will","with","you","your",
      ]);
      const rawTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const terms = rawTerms.filter((t) => t.length > 1 && !STOP.has(t));
      // Fall back to all raw terms if stop-word filtering removed everything
      const effectiveTerms = terms.length > 0 ? terms : rawTerms.filter((t) => t.length > 1);

      const phraseQ = q.toLowerCase();

      const scored = rows
        .map((r) => {
          const qLower  = r.question.toLowerCase();
          const kLower  = r.keywords.toLowerCase();
          const aLower  = r.answer.toLowerCase();

          // Exact phrase appearing in the question title = large bonus
          let score = qLower.includes(phraseQ) ? 30 : 0;

          // Per-term scoring with field weights:
          //   question field: 4 × term-length weight  (most specific)
          //   keywords field: 2 × term-length weight  (curated synonyms)
          //   answer field:   1 × term-length weight  (broad context)
          // Longer terms earn proportionally more - "methodology" beats "me"
          score += effectiveTerms.reduce((acc, t) => {
            const w = Math.min(t.length, 6); // cap weight at length 6
            let ts = 0;
            if (qLower.includes(t)) ts += 4 * w;
            if (kLower.includes(t)) ts += 2 * w;
            if (aLower.includes(t)) ts += 1 * w;
            return acc + ts;
          }, 0);

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

// ── POST /api/support/tickets/anon ─────────────────────────────────────────
// No auth required: create a support ticket as an anonymous (pre-login) user.
// Accepts an optional email address so the admin can follow up.
router.post("/support/tickets/anon", async (req: Request, res: Response) => {
  try {
    const { email, category, subject, description, attachmentUrl } = req.body ?? {};
    if (!subject || !description) {
      res.status(400).json({ error: "subject and description are required." });
      return;
    }
    const rawEmail = typeof email === "string" ? email.trim() : "";
    const accountUsername = rawEmail ? `anon:${rawEmail.slice(0, 50)}` : "anonymous";

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
        accountUsername,
        userRole: "user",
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

    // Alert admin; no ack to the user (no guaranteed email).
    await sendSupportTicketAlert({
      ticketId: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      description: ticket.description,
      accountUsername: ticket.accountUsername,
      displayName: rawEmail || undefined,
    }).catch((err) => {
      console.error("[support] anon ticket alert email failed", err);
    });
  } catch (err) {
    console.error("[support] POST /tickets/anon", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

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
      // Validate optional base64 attachment - reject anything over 512 KB
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
          // projectId is NOT accepted from the client - it would allow spoofing.
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

      // Send email notifications; track failures and persist them to the ticket row.
      const displayName = await getDisplayName(account.username).catch(() => undefined);
      const [alertOk, ackOk] = await Promise.all([
        sendSupportTicketAlert({
          ticketId: ticket.id,
          subject: ticket.subject,
          category: ticket.category,
          description: ticket.description,
          accountUsername: ticket.accountUsername,
          displayName,
        }),
        account.email
          ? sendSupportTicketAck({
              toEmail: account.email,
              toName: account.username,
              displayName,
              ticketId: ticket.id,
              subject: ticket.subject,
            })
          : Promise.resolve(true),
      ]);
      if (!alertOk || !ackOk) {
        await db
          .update(supportTicketsTable)
          .set({ emailFailed: true })
          .where(eq(supportTicketsTable.id, ticket.id))
          .catch((err) => {
            console.error("[support] Failed to set emailFailed flag on ticket", ticket.id, err);
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

      const uniqueUsernames = [...new Set(tickets.map((t) => t.accountUsername))];
      const displayNameMap: Record<string, string | undefined> = {};
      await Promise.all(
        uniqueUsernames.map(async (username) => {
          displayNameMap[username] = await getDisplayName(username).catch(() => undefined);
        }),
      );

      const annotated = tickets.map((t) => ({
        ...t,
        displayName: displayNameMap[t.accountUsername] ?? undefined,
      }));

      res.json({ tickets: annotated });
    } catch (err) {
      console.error("[support] GET /tickets", err);
      res.status(500).json({ error: "Failed to load tickets" });
    }
  },
);

// ── PATCH /api/support/tickets/:id ────────────────────────────────────────
// Admin-only: update status, admin notes, or mark user seen.
// Guard: closing a ticket whose last message was sent by the user returns 409
// unless the request includes { force: true } to override.
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
      const { status, adminNotes, hasAdminReply, userSeenReply, emailFailed, force } = req.body ?? {};

      // Guard: if closing, check whether the last message was from the user
      if (status === "closed" && force !== true) {
        const lastMessages = await db
          .select({ authorType: supportTicketMessagesTable.authorType })
          .from(supportTicketMessagesTable)
          .where(eq(supportTicketMessagesTable.ticketId, id))
          .orderBy(desc(supportTicketMessagesTable.createdAt));
        const lastMessage = lastMessages[0];
        if (lastMessage?.authorType === "user") {
          res.status(409).json({
            error: "unanswered_user_message",
            message:
              "The user's last message has not been answered. Close the ticket anyway?",
          });
          return;
        }
      }

      const set: Record<string, unknown> = {};
      if (status !== undefined) set.status = String(status);
      if (adminNotes !== undefined) set.adminNotes = String(adminNotes);
      if (hasAdminReply !== undefined) set.hasAdminReply = Boolean(hasAdminReply);
      if (userSeenReply !== undefined) set.userSeenReply = Boolean(userSeenReply);
      if (emailFailed !== undefined) set.emailFailed = Boolean(emailFailed);

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

// ── POST /api/support/tickets/:id/seen ───────────────────────────────────
// User-accessible: mark the ticket's admin reply as seen (clears badge).
router.post(
  "/support/tickets/:id/seen",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid ticket id." });
      return;
    }
    try {
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
      if (!isAdmin(req) && ticket.accountUsername !== account.username) {
        res.status(403).json({ error: "Access denied." });
        return;
      }
      await db
        .update(supportTicketsTable)
        .set({ userSeenReply: true })
        .where(eq(supportTicketsTable.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[support] POST /tickets/:id/seen", err);
      res.status(500).json({ error: "Failed to mark ticket as seen" });
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
        .select({
          accountUsername: supportTicketsTable.accountUsername,
          subject: supportTicketsTable.subject,
        })
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

      // Send reply notification email to the ticket owner when an admin replies.
      if (isAdminUser) {
        try {
          const [ownerAccount] = await db
            .select({ email: platformAccountsTable.email, username: platformAccountsTable.username })
            .from(platformAccountsTable)
            .where(eq(platformAccountsTable.username, ticket.accountUsername))
            .limit(1);
          if (ownerAccount?.email) {
            const displayName = await getDisplayName(ticket.accountUsername).catch(() => undefined);
            const notifyOk = await sendSupportTicketReplyNotification({
              toEmail: ownerAccount.email,
              toName: ownerAccount.username,
              displayName,
              ticketId: id,
              subject: ticket.subject,
              replyBody: body.trim(),
            });
            if (!notifyOk) {
              await db
                .update(supportTicketsTable)
                .set({ emailFailed: true })
                .where(eq(supportTicketsTable.id, id))
                .catch((err) => {
                  console.error("[support] Failed to set emailFailed flag on ticket after reply notification failure", id, err);
                });
            }
          }
        } catch (err) {
          console.error("[support] POST /tickets/:id/messages - reply notification error (non-fatal)", err);
        }
      }
    } catch (err) {
      console.error("[support] POST /tickets/:id/messages", err);
      res.status(500).json({ error: "Failed to add message" });
    }
  },
);

export default router;
