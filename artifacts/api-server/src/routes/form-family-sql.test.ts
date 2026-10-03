import express from "express";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { SQL_DATA_PROBES } from "../lib/security-audit-probes";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { SQL } = await import("drizzle-orm");
  const { PgDialect, getTableConfig } = await import("drizzle-orm/pg-core");
  const schema = await vi.importActual<typeof import("@workspace/db/schema")>("@workspace/db/schema");
  const client = new PGlite();
  const tables = [schema.platformMetaTable, schema.platformAccountsTable,
    schema.supportFaqTable, schema.supportTicketsTable, schema.supportTicketMessagesTable];
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const literal = (value: unknown) => typeof value === "number" || typeof value === "boolean"
    ? String(value) : `'${(typeof value === "string" ? value : JSON.stringify(value)).replace(/'/g, "''")}'`;
  // Trusted schema-only fixture DDL, never request-derived identifiers/data.
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      const defaultSql = column.default === undefined ? "" : ` DEFAULT ${column.default instanceof SQL
        ? new PgDialect().sqlToQuery(column.default).sql : literal(column.default)}`;
      return `${quote(column.name)} ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.notNull ? " NOT NULL" : ""}${column.isUnique ? " UNIQUE" : ""}${defaultSql}`;
    });
    await client.exec(`CREATE TABLE ${quote(config.name)} (${columns.join(",")});`);
  }
  return { ...schema, db: drizzle(client, { schema }), pool: { end: () => client.close() } };
});
vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/notify-email", async original => {
  const actual = await original<Record<string, unknown>>();
  return Object.fromEntries(Object.entries(actual).map(([key, value]) =>
    [key, typeof value === "function" ? vi.fn(async () => undefined) : value]));
});

import { db, pool, supportTicketsTable } from "@workspace/db";
import supportRouter from "./support";
import instructionsRouter from "./media-discovery-instructions";
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = { username: "audit-workspace", role: req.headers["x-fixture-role"] === "admin" ? "admin" : "agency",
      membershipRole: "owner", email: "audit@example.invalid" } as typeof req.account;
    next();
  });
  app.use("/api", supportRouter, instructionsRouter);
  server = await new Promise<Server>(resolve => {
    const running = app.listen(0, "127.0.0.1", () => resolve(running));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
});
async function call(method: string, path: string, data?: unknown, admin = false) {
  const response = await fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(admin ? { "x-fixture-role": "admin" } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, data: await response.json() as Record<string, any> };
}
it("support subjects, messages, IDs and stored values remain scoped data", async () => {
  for (const value of SQL_DATA_PROBES) {
    const created = await call("POST", "/support/tickets", { category: "general", subject: value, description: value });
    expect(created.status).toBe(201);
    expect(created.data.ticket.subject).toBe(value);
    const message = await call("POST", `/support/tickets/${created.data.ticket.id}/messages`, { body: value });
    expect(message.status).toBe(201);
    expect(message.data.message.body).toBe(value);
    const read = await call("GET", `/support/tickets/${created.data.ticket.id}/messages`);
    expect(read.status).toBe(200);
    expect(JSON.stringify(read.data)).toContain(value);
    expect((await call("GET", `/support/tickets/${encodeURIComponent(value)}/messages`)).status).toBe(400);
  }
  expect((await db.select().from(supportTicketsTable)).length).toBe(SQL_DATA_PROBES.length);
});
it("Master discovery instructions use a fixed meta namespace and version CAS with stored quote probes", async () => {
  for (const value of SQL_DATA_PROBES) {
    const current = await call("GET", "/store/media-db/discovery-instructions", undefined, true);
    expect(current.status).toBe(200);
    const instructions = `Bounded synthetic media instructions for this isolated fixture: ${value}`;
    const saved = await call("PUT", "/store/media-db/discovery-instructions", { instructions, version: current.data.version }, true);
    expect(saved.status).toBe(200);
    expect(saved.data.instructions).toBe(instructions);
    const read = await call("GET", "/store/media-db/discovery-instructions", undefined, true);
    expect(read.data.instructions).toBe(instructions);
    expect((await call("PUT", "/store/media-db/discovery-instructions", { instructions, version: current.data.version }, true)).status).toBe(409);
    expect((await call("PUT", "/store/media-db/discovery-instructions", { instructions, version: value }, true)).status).toBe(400);
    expect((await call("GET", "/store/media-db/discovery-instructions")).status).toBe(403);
  }
});