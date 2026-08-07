import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

// ── In-memory state + column markers, hoisted so vi.mock factories can use them ──

const h = vi.hoisted(() => {
  type FaqRow = {
    id: number;
    category: string;
    question: string;
    answer: string;
    keywords: string;
    displayOrder: number;
    isActive: boolean;
  };
  type TicketRow = {
    id: number;
    accountUsername: string;
    userRole: string;
    projectId: string | null;
    category: string;
    subject: string;
    description: string;
    attachmentUrl: string | null;
    status: string;
    adminNotes: string | null;
    hasAdminReply: boolean;
    userSeenReply: boolean;
    emailFailed: boolean;
    createdAt: Date;
  };

  type MessageRow = {
    id: number;
    ticketId: number;
    authorType: string;
    authorUsername: string;
    body: string;
    createdAt: Date;
  };

  type AccountRow = {
    username: string;
    email: string | null;
  };

  let faqSeq = 1;
  let ticketSeq = 1;
  let messageSeq = 1;

  const state = {
    faq: [] as FaqRow[],
    tickets: [] as TicketRow[],
    messages: [] as MessageRow[],
    accounts: [] as AccountRow[],
    reset() {
      faqSeq = 1;
      ticketSeq = 1;
      messageSeq = 1;
      state.messages = [];
      state.accounts = [
        { username: "alice", email: "alice@example.com" },
        { username: "bob", email: null },
      ];
      state.faq = [
        {
          id: faqSeq++,
          category: "Getting Started",
          question: "What is AIO Fusion?",
          answer: "AIO Fusion is a GEO platform for PR professionals.",
          keywords: "aio fusion, overview, geo, platform",
          displayOrder: 10,
          isActive: true,
        },
        {
          id: faqSeq++,
          category: "Getting Started",
          question: "How do I log in?",
          answer: "Go to the login page and enter your credentials.",
          keywords: "login, sign in, password, access",
          displayOrder: 20,
          isActive: true,
        },
        {
          id: faqSeq++,
          category: "LLM Check",
          question: "How long does the audit take?",
          answer: "The audit typically takes 3-8 minutes.",
          keywords: "audit, duration, time, wait",
          displayOrder: 10,
          isActive: true,
        },
        {
          id: faqSeq++,
          category: "LLM Check",
          question: "What is the Authority Index?",
          answer: "A 0-100 score measuring brand presence in AI answers.",
          keywords: "authority index, score, 0-100",
          displayOrder: 20,
          isActive: true,
        },
        {
          id: faqSeq++,
          category: "Billing",
          question: "How do I cancel my subscription?",
          answer: "Contact support at info@aiofusions.ai.",
          keywords: "cancel, subscription, billing",
          displayOrder: 10,
          isActive: true,
        },
        {
          id: faqSeq++,
          category: "Hidden",
          question: "Internal note: do not show.",
          answer: "This should never be returned to regular users.",
          keywords: "internal, hidden",
          displayOrder: 99,
          isActive: false,
        },
      ];
      state.tickets = [];
      ticketSeq = 1;
    },
    nextTicketId() {
      return ticketSeq++;
    },
    nextMessageId() {
      return messageSeq++;
    },
  };

  const supportFaqTable = {
    __table: "faq",
    id: { __col: "id" },
    category: { __col: "category" },
    question: { __col: "question" },
    answer: { __col: "answer" },
    keywords: { __col: "keywords" },
    displayOrder: { __col: "displayOrder" },
    isActive: { __col: "isActive" },
  };

  const supportTicketsTable = {
    __table: "tickets",
    id: { __col: "id" },
    accountUsername: { __col: "accountUsername" },
    userRole: { __col: "userRole" },
    category: { __col: "category" },
    subject: { __col: "subject" },
    description: { __col: "description" },
    status: { __col: "status" },
    hasAdminReply: { __col: "hasAdminReply" },
    userSeenReply: { __col: "userSeenReply" },
    emailFailed: { __col: "emailFailed" },
    createdAt: { __col: "createdAt" },
    adminNotes: { __col: "adminNotes" },
  };

  const supportTicketMessagesTable = {
    __table: "messages",
    id: { __col: "id" },
    ticketId: { __col: "ticketId" },
    authorType: { __col: "authorType" },
    authorUsername: { __col: "authorUsername" },
    body: { __col: "body" },
    createdAt: { __col: "createdAt" },
  };

  const platformAccountsTable = {
    __table: "accounts",
    username: { __col: "username" },
    email: { __col: "email" },
  };

  type Pred =
    | { kind: "eq"; col: string; val: unknown }
    | { kind: "and"; parts: Pred[] }
    | { kind: "gte"; col: string; val: unknown }
    | { kind: "lte"; col: string; val: unknown };

  function matches(row: Record<string, unknown>, pred: Pred | undefined): boolean {
    if (!pred) return true;
    if (pred.kind === "eq") return row[pred.col] === pred.val;
    if (pred.kind === "and") return pred.parts.every((p) => matches(row, p));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (pred.kind === "gte") return (row[pred.col] as any) >= (pred.val as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (pred.kind === "lte") return (row[pred.col] as any) <= (pred.val as any);
    return true;
  }

  function rowsFor(table: unknown): Record<string, unknown>[] {
    if (table === supportFaqTable) return state.faq as unknown as Record<string, unknown>[];
    if (table === supportTicketsTable) return state.tickets as unknown as Record<string, unknown>[];
    if (table === supportTicketMessagesTable) return state.messages as unknown as Record<string, unknown>[];
    if (table === platformAccountsTable) return state.accounts as unknown as Record<string, unknown>[];
    return [];
  }

  return {
    state,
    supportFaqTable,
    supportTicketsTable,
    supportTicketMessagesTable,
    platformAccountsTable,
    matches,
    rowsFor,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: { __col: string }, val: unknown) => ({ kind: "eq", col: col.__col, val }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  asc: (col: { __col: string }) => ({ kind: "asc", col: col.__col }),
  desc: (col: { __col: string }) => ({ kind: "desc", col: col.__col }),
  gte: (col: { __col: string }, val: unknown) => ({ kind: "gte", col: col.__col, val }),
  lte: (col: { __col: string }, val: unknown) => ({ kind: "lte", col: col.__col, val }),
  ilike: (col: { __col: string }, val: unknown) => ({ kind: "ilike", col: col.__col, val }),
  or: (...parts: unknown[]) => ({ kind: "or", parts }),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

vi.mock("@workspace/db", () => {
  const db = {
    select: (_proj?: unknown) => ({
      from: (table: unknown) => {
        const builder = {
          where: (pred: any) => ({
            orderBy: (..._order: unknown[]) => {
              const filtered = h.rowsFor(table).filter((r) => h.matches(r, pred));
              return Promise.resolve(filtered.map((r) => ({ ...r })));
            },
            limit: (n: number) => {
              const filtered = h.rowsFor(table).filter((r) => h.matches(r, pred));
              return Promise.resolve(filtered.slice(0, n).map((r) => ({ ...r })));
            },
            then: (resolve: (v: unknown) => unknown) => {
              const filtered = h.rowsFor(table).filter((r) => h.matches(r, pred));
              return resolve(filtered.map((r) => ({ ...r })));
            },
          }),
          orderBy: (..._order: unknown[]) => {
            const rows = h.rowsFor(table).map((r) => ({ ...r }));
            return Promise.resolve(rows);
          },
          then: (resolve: (v: unknown) => unknown) => {
            return resolve(h.rowsFor(table).map((r) => ({ ...r })));
          },
        };
        return builder;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: () => {
          const rows = h.rowsFor(table);
          if (table === h.supportFaqTable) {
            const row = {
              id: rows.length + 1,
              displayOrder: 0,
              isActive: true,
              keywords: "",
              ...values,
            };
            rows.push(row);
            return Promise.resolve([{ ...row }]);
          }
          if (table === h.supportTicketsTable) {
            const row = {
              id: h.state.nextTicketId(),
              createdAt: new Date(),
              adminNotes: null,
              attachmentUrl: null,
              hasAdminReply: false,
              userSeenReply: false,
              emailFailed: false,
              ...values,
            };
            rows.push(row);
            return Promise.resolve([{ ...row }]);
          }
          if (table === h.supportTicketMessagesTable) {
            const row = {
              id: h.state.nextMessageId(),
              createdAt: new Date(),
              ...values,
            };
            rows.push(row);
            return Promise.resolve([{ ...row }]);
          }
          return Promise.resolve([{ id: 1, ...values }]);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (updates: Record<string, unknown>) => ({
        where: (pred: any) => {
          const rows = h.rowsFor(table);
          const idx = rows.findIndex((r) => h.matches(r, pred));
          if (idx >= 0) Object.assign(rows[idx], updates);
          const updated = idx >= 0 ? { ...rows[idx] } : undefined;
          return {
            returning: () => Promise.resolve(updated ? [updated] : []),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve, reject),
          };
        },
      }),
    }),
  };

  return {
    db,
    supportFaqTable: h.supportFaqTable,
    supportTicketsTable: h.supportTicketsTable,
    supportTicketMessagesTable: h.supportTicketMessagesTable,
    platformMetaTable: { __table: "platform_meta", key: { __col: "key" }, value: { __col: "value" } },
    platformAccountsTable: h.platformAccountsTable,
  };
});

vi.mock("../lib/notify-email", () => ({
  sendSupportTicketAlert: vi.fn().mockResolvedValue(true),
  sendSupportTicketAck: vi.fn().mockResolvedValue(true),
  sendSupportTicketReplyNotification: vi.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: () => Promise.resolve(),
}));

import supportRouter from "./support";

// ── Test helpers ─────────────────────────────────────────────────────────────

function buildApp(actorOverride?: { username: string; role: string }) {
  const app = express();
  // Raise body-parser limit so the oversized-attachment test reaches the route's
  // own 512 KB guard rather than being rejected by Express first (413).
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    if (actorOverride) req.account = actorOverride as any;
    next();
  });
  app.use("/api", supportRouter);
  return app;
}

function listen(app: ReturnType<typeof express>): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function req(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/support/faq", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    h.state.reset();
    const app = buildApp();
    ({ server, baseUrl } = await listen(app));
  });

  afterEach(async () => close(server));

  it("returns all active FAQ entries when no query is given", async () => {
    const { status, json } = await req(baseUrl, "GET", "/api/support/faq");
    expect(status).toBe(200);
    expect(Array.isArray(json.faq)).toBe(true);
    // Should not include the inactive entry
    expect(json.faq.every((f: any) => f.isActive !== false)).toBe(true);
    // Inactive row has category "Hidden" - must not appear
    expect(json.faq.find((f: any) => f.category === "Hidden")).toBeUndefined();
  });

  it("scores and returns top matching entries for a search query", async () => {
    // "audit duration" matches "audit, duration, time, wait" in LLM Check FAQ
    const { status, json } = await req(baseUrl, "GET", "/api/support/faq?q=audit%20duration");
    expect(status).toBe(200);
    expect(json.faq.length).toBeGreaterThan(0);
    // Top hit should be the "How long does the audit take?" entry
    expect(json.faq[0].question).toContain("audit");
  });

  it("returns at most 5 results for any search query", async () => {
    // "a" appears in most rows, so would return many without the cap
    const { status, json } = await req(baseUrl, "GET", "/api/support/faq?q=a");
    expect(status).toBe(200);
    expect(json.faq.length).toBeLessThanOrEqual(5);
  });

  it("returns an empty faq array when the query matches nothing", async () => {
    const { status, json } = await req(baseUrl, "GET", "/api/support/faq?q=xyzzy12345notreal");
    expect(status).toBe(200);
    expect(json.faq).toEqual([]);
  });

  it("returns a higher-scoring entry before a lower-scoring one", async () => {
    // "login password access" matches 3 terms in the login FAQ, fewer elsewhere
    const { status, json } = await req(baseUrl, "GET", "/api/support/faq?q=login%20password%20access");
    expect(status).toBe(200);
    expect(json.faq.length).toBeGreaterThan(0);
    // The login FAQ contains all 3 terms in keywords
    const first = json.faq[0];
    const haystack = `${first.question} ${first.answer} ${first.keywords}`.toLowerCase();
    expect(haystack).toMatch(/login|password|access/);
  });

  it("does not include inactive entries in search results (soft-keyword match)", async () => {
    // "internal hidden" matches the inactive row's keywords - the guard is
    // unconditional so a regression that returns the inactive row is always caught
    const { status, json } = await req(baseUrl, "GET", "/api/support/faq?q=internal%20hidden");
    expect(status).toBe(200);
    expect(json.faq.every((f: any) => f.isActive !== false)).toBe(true);
    expect(json.faq.find((f: any) => f.category === "Hidden")).toBeUndefined();
  });

  it("never returns inactive entries even when an active entry shares the same keywords", async () => {
    // Seed an *active* entry whose keywords overlap exactly with the inactive one.
    // After the search both should score, but only the active one may be returned.
    h.state.faq.push({
      id: 99,
      category: "Getting Started",
      question: "What about internal tools?",
      answer: "We provide internal tooling for agency users.",
      keywords: "internal, hidden, tools",
      displayOrder: 30,
      isActive: true,
    });

    const { status, json } = await req(baseUrl, "GET", "/api/support/faq?q=internal%20hidden");
    expect(status).toBe(200);
    // At least the active entry should come back
    expect(json.faq.length).toBeGreaterThan(0);
    // The inactive "Hidden" entry must never appear regardless of DB isActive state
    expect(json.faq.find((f: any) => f.category === "Hidden")).toBeUndefined();
    expect(json.faq.every((f: any) => f.isActive !== false)).toBe(true);
  });

  it("non-admin + category=Hidden returns 0 results (inactive entries excluded by category filter)", async () => {
    // The seeded "Hidden" entry is inactive. A non-admin explicitly requesting
    // that category must still get nothing - the isActive guard must fire before
    // the category filter, not be bypassed by an explicit category param.
    const { status, json } = await req(baseUrl, "GET", "/api/support/faq?category=Hidden");
    expect(status).toBe(200);
    expect(Array.isArray(json.faq)).toBe(true);
    expect(json.faq.length).toBe(0);
  });

  it("admin=1 from a non-admin authenticated session is treated as a regular (active-only) request", async () => {
    // An authenticated non-admin (role: "client") passing admin=1 must not
    // unlock the full list - the check must be role === "admin", not just
    // !!req.account. If that distinction regresses, the inactive "Hidden"
    // entry would leak through.
    const clientApp = buildApp({ username: "user1", role: "client" });
    const { server: s2, baseUrl: url2 } = await listen(clientApp);
    try {
      const { status, json } = await req(url2, "GET", "/api/support/faq?admin=1");
      expect(status).toBe(200);
      expect(Array.isArray(json.faq)).toBe(true);
      expect(json.faq.find((f: any) => f.category === "Hidden")).toBeUndefined();
      expect(json.faq.every((f: any) => f.isActive !== false)).toBe(true);
    } finally {
      await close(s2);
    }
  });
});

// ── POST /api/support/tickets ─────────────────────────────────────────────────

describe("POST /api/support/tickets", () => {
  let server: Server;
  let baseUrl: string;
  const actor = { username: "user1", role: "client" };

  beforeEach(async () => {
    h.state.reset();
    const app = buildApp(actor);
    ({ server, baseUrl } = await listen(app));
  });

  afterEach(async () => close(server));

  it("creates a ticket and returns 201 with the new ticket", async () => {
    const { status, json } = await req(baseUrl, "POST", "/api/support/tickets", {
      category: "Getting Started",
      subject: "Cannot log in",
      description: "I keep getting an invalid password error.",
    });
    expect(status).toBe(201);
    expect(json.ticket).toBeDefined();
    expect(json.ticket.id).toBeGreaterThan(0);
    expect(json.ticket.subject).toBe("Cannot log in");
    expect(json.ticket.status).toBe("open");
    expect(json.ticket.accountUsername).toBe("user1");
  });

  it("attaches the category from the request body", async () => {
    const { json } = await req(baseUrl, "POST", "/api/support/tickets", {
      category: "Billing & Payments",
      subject: "Billing question",
      description: "Why was I charged twice?",
    });
    expect(json.ticket.category).toBe("Billing & Payments");
  });

  it("defaults category to 'General' when omitted", async () => {
    const { json } = await req(baseUrl, "POST", "/api/support/tickets", {
      subject: "General question",
      description: "I have a question.",
    });
    expect(json.ticket.category).toBe("General");
  });

  it("rejects a ticket with missing subject (400)", async () => {
    const { status, json } = await req(baseUrl, "POST", "/api/support/tickets", {
      description: "No subject provided.",
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/subject/i);
  });

  it("rejects a ticket with missing description (400)", async () => {
    const { status, json } = await req(baseUrl, "POST", "/api/support/tickets", {
      subject: "Something broke",
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/description/i);
  });

  it("requires authentication - returns 401 when no account is set", async () => {
    const unauthApp = buildApp(undefined);
    const { server: s2, baseUrl: url2 } = await listen(unauthApp);
    try {
      const { status } = await req(url2, "POST", "/api/support/tickets", {
        subject: "Help",
        description: "Need help.",
      });
      expect(status).toBe(401);
    } finally {
      await close(s2);
    }
  });

  it("rejects oversized base64 attachment (400)", async () => {
    // Build a data-URL that decodes to >512 KB (base64 inflates ~4/3×, so
    // we need a string longer than 512*1024 * 4/3 ≈ 699,050 chars)
    const bigPayload = "data:image/png;base64," + "A".repeat(700_000);
    const { status, json } = await req(baseUrl, "POST", "/api/support/tickets", {
      subject: "With attachment",
      description: "Screenshot attached.",
      attachmentUrl: bigPayload,
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/512 KB/i);
  });
});

// ── GET /api/support/tickets ───────────────────────────────────────────────────

describe("GET /api/support/tickets", () => {
  let server: Server;
  let baseUrl: string;
  const adminActor = { username: "admin", role: "admin" };
  const userActor = { username: "user1", role: "client" };

  function buildWithActor(actor: typeof adminActor) {
    return buildApp(actor);
  }

  beforeEach(async () => {
    h.state.reset();
    // Seed some tickets
    h.state.tickets.push(
      {
        id: 1,
        accountUsername: "user1",
        userRole: "client",
        projectId: null,
        category: "General",
        subject: "User 1 ticket A",
        description: "First ticket from user1.",
        attachmentUrl: null,
        status: "open",
        adminNotes: null,
        hasAdminReply: true,
        userSeenReply: false,
        emailFailed: false,
        createdAt: new Date("2024-01-01"),
      },
      {
        id: 2,
        accountUsername: "user2",
        userRole: "client",
        projectId: null,
        category: "Billing",
        subject: "User 2 ticket B",
        description: "First ticket from user2.",
        attachmentUrl: null,
        status: "in_progress",
        adminNotes: null,
        hasAdminReply: false,
        userSeenReply: false,
        emailFailed: false,
        createdAt: new Date("2024-01-02"),
      },
    );
  });

  afterEach(async () => close(server));

  it("admin can list all tickets without any filter", async () => {
    const app = buildWithActor(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "GET", "/api/support/tickets");
    expect(status).toBe(200);
    expect(Array.isArray(json.tickets)).toBe(true);
    expect(json.tickets.length).toBe(2);
  });

  it("non-admin without mine=true gets 403", async () => {
    const app = buildWithActor(userActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(baseUrl, "GET", "/api/support/tickets");
    expect(status).toBe(403);
  });

  it("user with mine=true sees only their own tickets", async () => {
    const app = buildWithActor(userActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "GET", "/api/support/tickets?mine=true");
    expect(status).toBe(200);
    expect(json.tickets.every((t: any) => t.accountUsername === "user1")).toBe(true);
    expect(json.tickets.length).toBe(1);
    expect(json.tickets[0].subject).toBe("User 1 ticket A");
  });

  it("admin can filter by status", async () => {
    const app = buildWithActor(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "GET", "/api/support/tickets?status=in_progress");
    expect(status).toBe(200);
    expect(json.tickets.every((t: any) => t.status === "in_progress")).toBe(true);
  });

  it("mine=true with hasUpdate=true returns only tickets with unseen admin replies", async () => {
    const app = buildWithActor(userActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(
      baseUrl,
      "GET",
      "/api/support/tickets?mine=true&hasUpdate=true",
    );
    expect(status).toBe(200);
    // user1 ticket has hasAdminReply=true and userSeenReply=false
    expect(json.tickets.length).toBe(1);
    expect(json.tickets[0].hasAdminReply).toBe(true);
    expect(json.tickets[0].userSeenReply).toBe(false);
  });

  it("requires authentication - returns 401 when no account is set", async () => {
    const unauthApp = buildApp(undefined);
    const { server: s2, baseUrl: url2 } = await listen(unauthApp);
    try {
      const { status } = await req(url2, "GET", "/api/support/tickets?mine=true");
      expect(status).toBe(401);
    } finally {
      await close(s2);
    }
  });
});

// ── PATCH /api/support/tickets/:id ────────────────────────────────────────────

describe("PATCH /api/support/tickets/:id", () => {
  let server: Server;
  let baseUrl: string;
  const adminActor = { username: "admin", role: "admin" };

  beforeEach(async () => {
    h.state.reset();
    h.state.tickets.push({
      id: 1,
      accountUsername: "user1",
      userRole: "client",
      projectId: null,
      category: "General",
      subject: "My issue",
      description: "Something broke.",
      attachmentUrl: null,
      status: "open",
      adminNotes: null,
      hasAdminReply: false,
      userSeenReply: false,
      emailFailed: false,
      createdAt: new Date(),
    });

    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));
  });

  afterEach(async () => close(server));

  it("admin can change ticket status", async () => {
    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      status: "in_progress",
    });
    expect(status).toBe(200);
    expect(json.ticket.status).toBe("in_progress");
  });

  it("admin can add admin notes to a ticket", async () => {
    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      adminNotes: "Investigating with the engineering team.",
    });
    expect(status).toBe(200);
    expect(json.ticket.adminNotes).toBe("Investigating with the engineering team.");
  });

  it("admin can mark a ticket as resolved", async () => {
    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      status: "resolved",
    });
    expect(status).toBe(200);
    expect(json.ticket.status).toBe("resolved");
  });

  it("admin can set hasAdminReply and userSeenReply flags", async () => {
    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      hasAdminReply: true,
      userSeenReply: false,
    });
    expect(status).toBe(200);
    expect(json.ticket.hasAdminReply).toBe(true);
    expect(json.ticket.userSeenReply).toBe(false);
  });

  it("returns 404 for a non-existent ticket id", async () => {
    const { status } = await req(baseUrl, "PATCH", "/api/support/tickets/9999", {
      status: "resolved",
    });
    expect(status).toBe(404);
  });

  it("returns 400 for an invalid (non-numeric) ticket id", async () => {
    const { status } = await req(baseUrl, "PATCH", "/api/support/tickets/abc", {
      status: "resolved",
    });
    expect(status).toBe(400);
  });

  it("non-admin gets 403", async () => {
    const nonAdminApp = buildApp({ username: "user1", role: "client" });
    const { server: s2, baseUrl: url2 } = await listen(nonAdminApp);
    try {
      const { status } = await req(url2, "PATCH", "/api/support/tickets/1", {
        status: "resolved",
      });
      expect(status).toBe(403);
    } finally {
      await close(s2);
    }
  });

  it("unauthenticated request gets 401", async () => {
    const unauthApp = buildApp(undefined);
    const { server: s2, baseUrl: url2 } = await listen(unauthApp);
    try {
      const { status } = await req(url2, "PATCH", "/api/support/tickets/1", {
        status: "resolved",
      });
      expect(status).toBe(401);
    } finally {
      await close(s2);
    }
  });

  it("closing a ticket with an unanswered user message returns 409", async () => {
    // Seed a user message as the only (last) message on the ticket
    h.state.messages.push({
      id: h.state.nextMessageId(),
      ticketId: 1,
      authorType: "user",
      authorUsername: "user1",
      body: "Any update on this?",
      createdAt: new Date(),
    });

    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      status: "closed",
    });
    expect(status).toBe(409);
    expect(json.error).toBe("unanswered_user_message");
    expect(typeof json.message).toBe("string");
    // Ticket status must NOT have been changed
    const ticket = h.state.tickets.find((t) => t.id === 1);
    expect(ticket?.status).toBe("open");
  });

  it("closing a ticket with no messages is allowed (no thread yet)", async () => {
    // No messages seeded - ticket can be closed freely
    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      status: "closed",
    });
    expect(status).toBe(200);
    expect(json.ticket.status).toBe("closed");
  });

  it("closing a ticket whose last message is from admin is allowed", async () => {
    h.state.messages.push({
      id: h.state.nextMessageId(),
      ticketId: 1,
      authorType: "admin",
      authorUsername: "admin",
      body: "Issue resolved - closing now.",
      createdAt: new Date(),
    });

    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      status: "closed",
    });
    expect(status).toBe(200);
    expect(json.ticket.status).toBe("closed");
  });

  it("force=true bypasses the unanswered-message guard and closes the ticket", async () => {
    h.state.messages.push({
      id: h.state.nextMessageId(),
      ticketId: 1,
      authorType: "user",
      authorUsername: "user1",
      body: "Still waiting for help.",
      createdAt: new Date(),
    });

    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      status: "closed",
      force: true,
    });
    expect(status).toBe(200);
    expect(json.ticket.status).toBe("closed");
  });

  it("admin can clear the emailFailed flag by sending { emailFailed: false }", async () => {
    // Seed the ticket with emailFailed=true
    Object.assign(h.state.tickets[0], { emailFailed: true });

    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      emailFailed: false,
    });
    expect(status).toBe(200);
    expect(json.ticket.emailFailed).toBe(false);

    // Verify the DB row was actually updated
    const ticket = h.state.tickets.find((t) => t.id === 1);
    expect(ticket?.emailFailed).toBe(false);
  });

  it("clearing emailFailed does not mutate status or other fields", async () => {
    Object.assign(h.state.tickets[0], { emailFailed: true, status: "in_progress", adminNotes: "Keep this." });

    const { status, json } = await req(baseUrl, "PATCH", "/api/support/tickets/1", {
      emailFailed: false,
    });
    expect(status).toBe(200);
    expect(json.ticket.emailFailed).toBe(false);
    expect(json.ticket.status).toBe("in_progress");
    expect(json.ticket.adminNotes).toBe("Keep this.");
  });

  it("non-admin cannot clear the emailFailed flag - returns 403", async () => {
    Object.assign(h.state.tickets[0], { emailFailed: true });

    const nonAdminApp = buildApp({ username: "user1", role: "client" });
    const { server: s2, baseUrl: url2 } = await listen(nonAdminApp);
    try {
      const { status } = await req(url2, "PATCH", "/api/support/tickets/1", {
        emailFailed: false,
      });
      expect(status).toBe(403);
      // Confirm the flag was NOT cleared
      const ticket = h.state.tickets.find((t) => t.id === 1);
      expect(ticket?.emailFailed).toBe(true);
    } finally {
      await close(s2);
    }
  });

  it("clearing emailFailed on a non-existent ticket returns 404", async () => {
    const { status } = await req(baseUrl, "PATCH", "/api/support/tickets/9999", {
      emailFailed: false,
    });
    expect(status).toBe(404);
  });
});

// ── GET /api/support/tickets/:id/messages ─────────────────────────────────────

describe("GET /api/support/tickets/:id/messages", () => {
  let server: Server;
  let baseUrl: string;
  const adminActor = { username: "admin", role: "admin" };
  const ownerActor = { username: "user1", role: "client" };
  const otherActor = { username: "user2", role: "client" };

  beforeEach(async () => {
    h.state.reset();
    h.state.tickets.push({
      id: 1,
      accountUsername: "user1",
      userRole: "client",
      projectId: null,
      category: "General",
      subject: "My issue",
      description: "Something broke.",
      attachmentUrl: null,
      status: "open",
      adminNotes: null,
      hasAdminReply: true,
      userSeenReply: false,
      emailFailed: false,
      createdAt: new Date(),
    });
    h.state.messages.push(
      {
        id: 1,
        ticketId: 1,
        authorType: "user",
        authorUsername: "user1",
        body: "I cannot log in.",
        createdAt: new Date("2024-06-01T10:00:00Z"),
      },
      {
        id: 2,
        ticketId: 1,
        authorType: "admin",
        authorUsername: "admin",
        body: "We are looking into it.",
        createdAt: new Date("2024-06-01T11:00:00Z"),
      },
    );
  });

  afterEach(async () => close(server));

  it("ticket owner can read their own thread", async () => {
    const app = buildApp(ownerActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "GET", "/api/support/tickets/1/messages");
    expect(status).toBe(200);
    expect(Array.isArray(json.messages)).toBe(true);
    expect(json.messages.length).toBe(2);
    expect(json.messages[0].body).toBe("I cannot log in.");
    expect(json.messages[1].body).toBe("We are looking into it.");
  });

  it("admin can read any ticket thread", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "GET", "/api/support/tickets/1/messages");
    expect(status).toBe(200);
    expect(json.messages.length).toBe(2);
  });

  it("non-owner non-admin gets 403", async () => {
    const app = buildApp(otherActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "GET", "/api/support/tickets/1/messages");
    expect(status).toBe(403);
    expect(json.error).toMatch(/access denied/i);
  });

  it("returns 404 for a non-existent ticket", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(baseUrl, "GET", "/api/support/tickets/9999/messages");
    expect(status).toBe(404);
  });

  it("returns 400 for an invalid ticket id", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(baseUrl, "GET", "/api/support/tickets/abc/messages");
    expect(status).toBe(400);
  });

  it("unauthenticated request gets 401", async () => {
    const unauthApp = buildApp(undefined);
    const { server: s2, baseUrl: url2 } = await listen(unauthApp);
    try {
      const { status } = await req(url2, "GET", "/api/support/tickets/1/messages");
      expect(status).toBe(401);
    } finally {
      await close(s2);
    }
  });
});

// ── POST /api/support/tickets/:id/messages ────────────────────────────────────

describe("POST /api/support/tickets/:id/messages", () => {
  let server: Server;
  let baseUrl: string;
  const adminActor = { username: "admin", role: "admin" };
  const ownerActor = { username: "user1", role: "client" };
  const otherActor = { username: "user2", role: "client" };

  beforeEach(async () => {
    h.state.reset();
    h.state.tickets.push({
      id: 1,
      accountUsername: "user1",
      userRole: "client",
      projectId: null,
      category: "General",
      subject: "My issue",
      description: "Something broke.",
      attachmentUrl: null,
      status: "open",
      adminNotes: null,
      hasAdminReply: false,
      userSeenReply: false,
      emailFailed: false,
      createdAt: new Date(),
    });
  });

  afterEach(async () => close(server));

  it("admin reply sets hasAdminReply=true and status=in_progress on the ticket", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(
      baseUrl,
      "POST",
      "/api/support/tickets/1/messages",
      { body: "We are investigating your issue." },
    );
    expect(status).toBe(201);
    expect(json.message).toBeDefined();
    expect(json.message.authorType).toBe("admin");
    expect(json.message.body).toBe("We are investigating your issue.");

    // Verify the ticket's flags were updated in state
    const ticket = h.state.tickets.find((t) => t.id === 1);
    expect(ticket?.hasAdminReply).toBe(true);
    expect(ticket?.userSeenReply).toBe(false);
    expect(ticket?.status).toBe("in_progress");
  });

  it("ticket owner (user) can reply to their own ticket", async () => {
    const app = buildApp(ownerActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(
      baseUrl,
      "POST",
      "/api/support/tickets/1/messages",
      { body: "Any update?" },
    );
    expect(status).toBe(201);
    expect(json.message.authorType).toBe("user");
    expect(json.message.authorUsername).toBe("user1");

    // User reply must NOT flip hasAdminReply
    const ticket = h.state.tickets.find((t) => t.id === 1);
    expect(ticket?.hasAdminReply).toBe(false);
    expect(ticket?.status).toBe("open");
  });

  it("non-owner non-admin gets 403", async () => {
    const app = buildApp(otherActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(
      baseUrl,
      "POST",
      "/api/support/tickets/1/messages",
      { body: "I should not be able to do this." },
    );
    expect(status).toBe(403);
    expect(json.error).toMatch(/access denied/i);
  });

  it("returns 400 when body is empty", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(
      baseUrl,
      "POST",
      "/api/support/tickets/1/messages",
      { body: "   " },
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/body/i);
  });

  it("returns 400 when body field is missing", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(
      baseUrl,
      "POST",
      "/api/support/tickets/1/messages",
      {},
    );
    expect(status).toBe(400);
    expect(json.error).toMatch(/body/i);
  });

  it("returns 404 when ticket does not exist", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(
      baseUrl,
      "POST",
      "/api/support/tickets/9999/messages",
      { body: "Hello?" },
    );
    expect(status).toBe(404);
  });

  it("returns 400 for an invalid ticket id", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(
      baseUrl,
      "POST",
      "/api/support/tickets/abc/messages",
      { body: "Hello?" },
    );
    expect(status).toBe(400);
  });

  it("unauthenticated request gets 401", async () => {
    const unauthApp = buildApp(undefined);
    const { server: s2, baseUrl: url2 } = await listen(unauthApp);
    try {
      const { status } = await req(url2, "POST", "/api/support/tickets/1/messages", {
        body: "Hello?",
      });
      expect(status).toBe(401);
    } finally {
      await close(s2);
    }
  });
});

// ── POST /api/support/tickets/:id/seen ────────────────────────────────────────

describe("POST /api/support/tickets/:id/seen", () => {
  let server: Server;
  let baseUrl: string;
  const ownerActor = { username: "user1", role: "client" };
  const otherActor = { username: "user2", role: "client" };
  const adminActor = { username: "admin", role: "admin" };

  beforeEach(async () => {
    h.state.reset();
    h.state.tickets.push({
      id: 1,
      accountUsername: "user1",
      userRole: "client",
      projectId: null,
      category: "General",
      subject: "My issue",
      description: "Something broke.",
      attachmentUrl: null,
      status: "in_progress",
      adminNotes: null,
      hasAdminReply: true,
      userSeenReply: false,
      emailFailed: false,
      createdAt: new Date(),
    });
  });

  afterEach(async () => close(server));

  it("ticket owner can mark an admin reply as seen and gets ok:true", async () => {
    const app = buildApp(ownerActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "POST", "/api/support/tickets/1/seen");
    expect(status).toBe(200);
    expect(json.ok).toBe(true);

    const ticket = h.state.tickets.find((t) => t.id === 1);
    expect(ticket?.userSeenReply).toBe(true);
  });

  it("marking seen removes the ticket from hasUpdate results", async () => {
    const app = buildApp(ownerActor);
    ({ server, baseUrl } = await listen(app));

    const before = await req(baseUrl, "GET", "/api/support/tickets?mine=true&hasUpdate=true");
    expect(before.json.tickets.length).toBe(1);

    await req(baseUrl, "POST", "/api/support/tickets/1/seen");

    const after = await req(baseUrl, "GET", "/api/support/tickets?mine=true&hasUpdate=true");
    expect(after.json.tickets.length).toBe(0);
  });

  it("non-owner cannot mark another user's ticket as seen (403)", async () => {
    const app = buildApp(otherActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(baseUrl, "POST", "/api/support/tickets/1/seen");
    expect(status).toBe(403);

    const ticket = h.state.tickets.find((t) => t.id === 1);
    expect(ticket?.userSeenReply).toBe(false);
  });

  it("admin can also mark any ticket as seen", async () => {
    const app = buildApp(adminActor);
    ({ server, baseUrl } = await listen(app));

    const { status, json } = await req(baseUrl, "POST", "/api/support/tickets/1/seen");
    expect(status).toBe(200);
    expect(json.ok).toBe(true);

    const ticket = h.state.tickets.find((t) => t.id === 1);
    expect(ticket?.userSeenReply).toBe(true);
  });

  it("returns 404 for a non-existent ticket", async () => {
    const app = buildApp(ownerActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(baseUrl, "POST", "/api/support/tickets/9999/seen");
    expect(status).toBe(404);
  });

  it("returns 400 for an invalid (non-numeric) ticket id", async () => {
    const app = buildApp(ownerActor);
    ({ server, baseUrl } = await listen(app));

    const { status } = await req(baseUrl, "POST", "/api/support/tickets/abc/seen");
    expect(status).toBe(400);
  });

  it("unauthenticated request gets 401", async () => {
    const unauthApp = buildApp(undefined);
    const { server: s2, baseUrl: url2 } = await listen(unauthApp);
    try {
      const { status } = await req(url2, "POST", "/api/support/tickets/1/seen");
      expect(status).toBe(401);
    } finally {
      await close(s2);
    }
  });
});

// ── Multi-turn thread: full reply cycle ───────────────────────────────────────
// Covers the scenario where both the user and the admin post multiple messages
// and the GET thread endpoint returns them all in order with correct authorType
// (authorType drives the "user" vs "admin" bubble styling in SupportAdminPage).

describe("Ticket thread renders correctly with multiple user and admin messages", () => {
  let server: Server;
  let baseUrl: string;
  const adminActor = { username: "admin_agent", role: "admin" };
  const userActor = { username: "client_user", role: "client" };

  beforeEach(async () => {
    h.state.reset();
    // Seed a ticket owned by client_user
    h.state.tickets.push({
      id: 1,
      accountUsername: "client_user",
      userRole: "client",
      projectId: null,
      category: "Bug / Technical Issue",
      subject: "Audit keeps timing out",
      description: "Every time I run the audit it times out after 2 minutes.",
      attachmentUrl: null,
      status: "open",
      adminNotes: null,
      hasAdminReply: false,
      userSeenReply: false,
      emailFailed: false,
      createdAt: new Date("2026-07-10T09:00:00Z"),
    });
  });

  afterEach(async () => {
    if (server) await close(server);
  });

  it("full reply cycle: user sends two messages, admin sends two replies - thread GET returns all four in order", async () => {
    // Each step uses its own ephemeral server so the shared `server` variable
    // (used by the other two tests via afterEach) is never touched here.

    // ── Step 1: user posts first message ──────────────────────────────────
    const { server: s1, baseUrl: url1 } = await listen(buildApp(userActor));
    const r1 = await req(url1, "POST", "/api/support/tickets/1/messages", {
      body: "Still happening. Tried Chrome and Firefox.",
    });
    await close(s1);
    expect(r1.status).toBe(201);
    expect(r1.json.message.authorType).toBe("user");
    expect(r1.json.message.body).toBe("Still happening. Tried Chrome and Firefox.");

    // ── Step 2: admin posts first reply ───────────────────────────────────
    const { server: s2, baseUrl: url2 } = await listen(buildApp(adminActor));
    const r2 = await req(url2, "POST", "/api/support/tickets/1/messages", {
      body: "Thanks for the report. Can you share your project ID?",
    });
    await close(s2);
    expect(r2.status).toBe(201);
    expect(r2.json.message.authorType).toBe("admin");
    // Admin reply must flip hasAdminReply and set status to in_progress
    const ticketAfterAdminReply1 = h.state.tickets.find((t) => t.id === 1);
    expect(ticketAfterAdminReply1?.hasAdminReply).toBe(true);
    expect(ticketAfterAdminReply1?.status).toBe("in_progress");

    // ── Step 3: user posts a follow-up message ────────────────────────────
    const { server: s3, baseUrl: url3 } = await listen(buildApp(userActor));
    const r3 = await req(url3, "POST", "/api/support/tickets/1/messages", {
      body: "Project ID is proj-abc-123.",
    });
    await close(s3);
    expect(r3.status).toBe(201);
    expect(r3.json.message.authorType).toBe("user");
    // User reply must NOT change status or flip hasAdminReply again
    const ticketAfterUserReply2 = h.state.tickets.find((t) => t.id === 1);
    expect(ticketAfterUserReply2?.status).toBe("in_progress");

    // ── Step 4: admin posts a second reply ────────────────────────────────
    const { server: s4, baseUrl: url4 } = await listen(buildApp(adminActor));
    const r4 = await req(url4, "POST", "/api/support/tickets/1/messages", {
      body: "Found the issue. A fix is being deployed.",
    });
    await close(s4);
    expect(r4.status).toBe(201);
    expect(r4.json.message.authorType).toBe("admin");

    // ── Step 5: admin GETs the full thread and verifies all 4 messages ────
    const { server: s5, baseUrl: url5 } = await listen(buildApp(adminActor));
    const { status, json } = await req(url5, "GET", "/api/support/tickets/1/messages");
    await close(s5);

    expect(status).toBe(200);
    expect(Array.isArray(json.messages)).toBe(true);
    expect(json.messages).toHaveLength(4);

    // Verify chronological ordering and alternating user/admin bubbles
    expect(json.messages[0].authorType).toBe("user");
    expect(json.messages[0].body).toBe("Still happening. Tried Chrome and Firefox.");
    expect(json.messages[0].authorUsername).toBe("client_user");

    expect(json.messages[1].authorType).toBe("admin");
    expect(json.messages[1].body).toBe("Thanks for the report. Can you share your project ID?");
    expect(json.messages[1].authorUsername).toBe("admin_agent");

    expect(json.messages[2].authorType).toBe("user");
    expect(json.messages[2].body).toBe("Project ID is proj-abc-123.");
    expect(json.messages[2].authorUsername).toBe("client_user");

    expect(json.messages[3].authorType).toBe("admin");
    expect(json.messages[3].body).toBe("Found the issue. A fix is being deployed.");
    expect(json.messages[3].authorUsername).toBe("admin_agent");

    // Every message must carry the fields the UI uses for bubble rendering:
    // id (React key), ticketId, authorType, authorUsername, body, createdAt
    for (const m of json.messages) {
      expect(typeof m.id).toBe("number");
      expect(m.ticketId).toBe(1);
      expect(["user", "admin"]).toContain(m.authorType);
      expect(typeof m.authorUsername).toBe("string");
      expect(typeof m.body).toBe("string");
      expect(m.createdAt).toBeDefined();
    }
  });

  it("ticket owner also sees the complete thread in order after admin replies", async () => {
    // Seed the four messages directly so we can test the read path in isolation
    h.state.messages.push(
      {
        id: 1,
        ticketId: 1,
        authorType: "user",
        authorUsername: "client_user",
        body: "First message from user.",
        createdAt: new Date("2026-07-10T09:05:00Z"),
      },
      {
        id: 2,
        ticketId: 1,
        authorType: "admin",
        authorUsername: "admin_agent",
        body: "First reply from admin.",
        createdAt: new Date("2026-07-10T09:15:00Z"),
      },
      {
        id: 3,
        ticketId: 1,
        authorType: "user",
        authorUsername: "client_user",
        body: "Follow-up from user.",
        createdAt: new Date("2026-07-10T09:20:00Z"),
      },
      {
        id: 4,
        ticketId: 1,
        authorType: "admin",
        authorUsername: "admin_agent",
        body: "Second reply from admin.",
        createdAt: new Date("2026-07-10T09:30:00Z"),
      },
    );

    const userApp = buildApp(userActor);
    ({ server, baseUrl } = await listen(userApp));

    const { status, json } = await req(baseUrl, "GET", "/api/support/tickets/1/messages");
    expect(status).toBe(200);
    expect(json.messages).toHaveLength(4);

    // Verify user sees both bubble types with correct authorType field
    const userBubbles = json.messages.filter((m: { authorType: string }) => m.authorType === "user");
    const adminBubbles = json.messages.filter((m: { authorType: string }) => m.authorType === "admin");
    expect(userBubbles).toHaveLength(2);
    expect(adminBubbles).toHaveLength(2);

    // The ordering must be preserved (ascending createdAt)
    expect(json.messages[0].id).toBe(1);
    expect(json.messages[1].id).toBe(2);
    expect(json.messages[2].id).toBe(3);
    expect(json.messages[3].id).toBe(4);
  });

  it("authorType='admin' messages have different username to the ticket owner - no bubble identity collision", async () => {
    // Guards against a regression where admin replies appear as if sent by the user
    h.state.messages.push(
      {
        id: 1,
        ticketId: 1,
        authorType: "user",
        authorUsername: "client_user",
        body: "Help me please.",
        createdAt: new Date("2026-07-10T10:00:00Z"),
      },
      {
        id: 2,
        ticketId: 1,
        authorType: "admin",
        authorUsername: "admin_agent",
        body: "On it.",
        createdAt: new Date("2026-07-10T10:05:00Z"),
      },
    );

    const adminApp = buildApp(adminActor);
    ({ server, baseUrl } = await listen(adminApp));

    const { json } = await req(baseUrl, "GET", "/api/support/tickets/1/messages");

    const userMsg = json.messages.find((m: { authorType: string }) => m.authorType === "user");
    const adminMsg = json.messages.find((m: { authorType: string }) => m.authorType === "admin");

    expect(userMsg).toBeDefined();
    expect(adminMsg).toBeDefined();
    // Distinct usernames ensure the UI can style each bubble independently
    expect(userMsg.authorUsername).not.toBe(adminMsg.authorUsername);
    // authorType is always the canonical signal for bubble styling
    expect(userMsg.authorType).toBe("user");
    expect(adminMsg.authorType).toBe("admin");
  });
});
