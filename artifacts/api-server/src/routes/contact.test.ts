import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

// ── Hoisted state + table stubs ──────────────────────────────────────────────

const h = vi.hoisted(() => {
  type SubmissionRow = {
    id: number;
    type: string;
    name: string;
    email: string;
    company: string;
    subject: string;
    message: string;
    emailFailed: string;
    createdAt: Date;
  };

  let seq = 1;

  const state = {
    rows: [] as SubmissionRow[],
    insertShouldFail: false,
    updateShouldFail: false,
    reset() {
      seq = 1;
      state.rows = [];
      state.insertShouldFail = false;
      state.updateShouldFail = false;
    },
    nextId() {
      return seq++;
    },
  };

  const contactSubmissionsTable = {
    __table: "contact_submissions",
    id: { __col: "id" },
    type: { __col: "type" },
    name: { __col: "name" },
    email: { __col: "email" },
    company: { __col: "company" },
    subject: { __col: "subject" },
    message: { __col: "message" },
    emailFailed: { __col: "emailFailed" },
    createdAt: { __col: "createdAt" },
  };

  return { state, contactSubmissionsTable };
});

// ── Mock @workspace/db ────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const { state, contactSubmissionsTable } = h;

  const makeChain = (table: unknown, values?: Record<string, unknown>) => {
    return {
      values(v: Record<string, unknown>) {
        return {
          returning(fields: Record<string, unknown>) {
            return {
              then(resolve: (rows: unknown[]) => void, reject: (err: Error) => void) {
                if (state.insertShouldFail) {
                  reject(new Error("DB insert failed"));
                } else {
                  const id = state.nextId();
                  state.rows.push({
                    id,
                    type: String(v.type ?? ""),
                    name: String(v.name ?? ""),
                    email: String(v.email ?? ""),
                    company: String(v.company ?? ""),
                    subject: String(v.subject ?? ""),
                    message: String(v.message ?? ""),
                    emailFailed: String(v.emailFailed ?? "false"),
                    createdAt: new Date(),
                  });
                  resolve([{ id }]);
                }
              },
            };
          },
        };
      },
    };
    void table; void values;
  };

  const db = {
    insert(table: unknown) {
      return makeChain(table);
    },
    update(table: unknown) {
      return {
        set(fields: Record<string, unknown>) {
          return {
            where(pred: unknown) {
              return {
                catch(fn: (err: Error) => void) {
                  if (state.updateShouldFail) {
                    fn(new Error("DB update failed"));
                  } else {
                    const predTyped = pred as { kind: string; col: string; val: unknown } | undefined;
                    if (predTyped?.kind === "eq" && predTyped.col === "id") {
                      const row = state.rows.find((r) => r.id === predTyped.val);
                      if (row) {
                        Object.assign(row, fields);
                      }
                    }
                  }
                  return this;
                },
              };
            },
          };
        },
      };
      void table;
    },
  };

  return { db, contactSubmissionsTable };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (col: { __col: string }, val: unknown) => ({ kind: "eq", col: col.__col, val }),
}));

// ── Mock notify-email ─────────────────────────────────────────────────────────

const emailMocks = vi.hoisted(() => ({
  sendBookDemoInternalAlert: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  sendBookDemoConfirmation: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  sendEnquiryInternalAlert: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  sendEnquiryConfirmation: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("../lib/notify-email", () => emailMocks);

// ── Mock rate-limit ───────────────────────────────────────────────────────────

vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Test helper ───────────────────────────────────────────────────────────────

async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { default: contactRouter } = await import("./contact");
  const app = express();
  app.use(express.json());
  app.use("/api", contactRouter);
  return new Promise((resolve) => {
    const srv: Server = app.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/api`,
        close: () => new Promise((res) => srv.close(() => res())),
      });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /contact/book-demo", () => {
  const validBody = {
    name: "Alice Smith",
    email: "alice@example.com",
    company: "Acme Ltd",
    goal: "Improve our AI visibility.",
  };

  let url: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    h.state.reset();
    vi.clearAllMocks();
    ({ url, close } = await startServer());
  });

  it("persists submission and dispatches emails on success — returns 200", async () => {
    const r = await fetch(`${url}/contact/book-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(h.state.rows).toHaveLength(1);
    expect(h.state.rows[0].type).toBe("book-demo");
    expect(h.state.rows[0].email).toBe("alice@example.com");
    expect(h.state.rows[0].emailFailed).toBe("false");

    expect(emailMocks.sendBookDemoInternalAlert).toHaveBeenCalledOnce();
    expect(emailMocks.sendBookDemoConfirmation).toHaveBeenCalledOnce();
    await close();
  });

  it("returns 500 and does NOT call email when DB insert fails", async () => {
    h.state.insertShouldFail = true;

    const r = await fetch(`${url}/contact/book-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(r.status).toBe(500);

    expect(h.state.rows).toHaveLength(0);
    expect(emailMocks.sendBookDemoInternalAlert).not.toHaveBeenCalled();
    expect(emailMocks.sendBookDemoConfirmation).not.toHaveBeenCalled();
    await close();
  });

  it("returns 200 and marks email_failed=true when email delivery fails after successful DB insert", async () => {
    emailMocks.sendBookDemoInternalAlert.mockRejectedValueOnce(new Error("Resend timeout"));

    const r = await fetch(`${url}/contact/book-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(r.status).toBe(200);

    expect(h.state.rows).toHaveLength(1);
    // Give the async update a tick to settle
    await new Promise((res) => setTimeout(res, 10));
    expect(h.state.rows[0].emailFailed).toBe("true");
    await close();
  });

  it("returns 400 for missing required fields", async () => {
    const r = await fetch(`${url}/contact/book-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
    });
    expect(r.status).toBe(400);
    expect(h.state.rows).toHaveLength(0);
    await close();
  });
});

describe("POST /contact/enquiry", () => {
  const validBody = {
    name: "Bob Jones",
    email: "bob@example.com",
    company: "Beta Corp",
    subject: "Partnership question",
    message: "We would like to explore a partnership.",
  };

  let url: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    h.state.reset();
    vi.clearAllMocks();
    ({ url, close } = await startServer());
  });

  it("persists submission and dispatches emails on success — returns 200", async () => {
    const r = await fetch(`${url}/contact/enquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(h.state.rows).toHaveLength(1);
    expect(h.state.rows[0].type).toBe("enquiry");
    expect(h.state.rows[0].subject).toBe("Partnership question");
    expect(h.state.rows[0].emailFailed).toBe("false");

    expect(emailMocks.sendEnquiryInternalAlert).toHaveBeenCalledOnce();
    expect(emailMocks.sendEnquiryConfirmation).toHaveBeenCalledOnce();
    await close();
  });

  it("returns 500 and does NOT call email when DB insert fails", async () => {
    h.state.insertShouldFail = true;

    const r = await fetch(`${url}/contact/enquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(r.status).toBe(500);

    expect(h.state.rows).toHaveLength(0);
    expect(emailMocks.sendEnquiryInternalAlert).not.toHaveBeenCalled();
    expect(emailMocks.sendEnquiryConfirmation).not.toHaveBeenCalled();
    await close();
  });

  it("returns 200 and marks email_failed=true when email delivery fails after successful DB insert", async () => {
    emailMocks.sendEnquiryInternalAlert.mockRejectedValueOnce(new Error("Resend timeout"));

    const r = await fetch(`${url}/contact/enquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(r.status).toBe(200);

    expect(h.state.rows).toHaveLength(1);
    await new Promise((res) => setTimeout(res, 10));
    expect(h.state.rows[0].emailFailed).toBe("true");
    await close();
  });

  it("returns 400 for missing message", async () => {
    const r = await fetch(`${url}/contact/enquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bob", email: "bob@example.com", subject: "Hi" }),
    });
    expect(r.status).toBe(400);
    expect(h.state.rows).toHaveLength(0);
    await close();
  });
});
