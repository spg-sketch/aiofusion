import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SQL_DATA_PROBES } from "../lib/security-audit-probes";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`CREATE TABLE contact_submissions (
    id serial PRIMARY KEY, type varchar(32) NOT NULL, name varchar(128) NOT NULL,
    email varchar(256) NOT NULL, company varchar(128) NOT NULL DEFAULT '',
    goal text NOT NULL DEFAULT '', subject varchar(256) NOT NULL DEFAULT '',
    message text NOT NULL DEFAULT '', status varchar(32) NOT NULL DEFAULT 'new',
    email_failed boolean NOT NULL DEFAULT false,
    internal_email_accepted boolean, customer_email_accepted boolean,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  return { ...schema, db: drizzle(client, { schema }), pool: { end: () => client.close() } };
});
vi.mock("./contact-delivery", () => ({ deliverContactEmails: vi.fn(async () => []) }));
vi.mock("../lib/notify-email", () => ({ sendContactFormFailedAlert: vi.fn(async () => {}) }));
import { db, pool } from "@workspace/db";
import contactRouter from "./contact";
import { deliverContactEmails } from "./contact-delivery";

describe("contact SQL and proxy boundary audit with executed PostgreSQL", () => {
  let server: Server, base: string;
  beforeAll(async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api", contactRouter);
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/contact`;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  });
  const submit = (path: string, value: string, forwarded: string) => fetch(`${base}/${path}`, {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": forwarded },
    body: JSON.stringify({ name: value, company: value, goal: value, subject: value,
      message: value, email: "o'brien@example.invalid" }),
  });
  it("both public forms bind text, including legitimate apostrophes, without executing it", async () => {
    for (const [index, value] of SQL_DATA_PROBES.entries()) {
      for (const type of ["book-demo", "enquiry"]) {
        expect((await submit(type, value, `198.51.100.${index + 1}, 192.0.2.1`)).status).toBe(200);
      }
      const result = await db.execute(sql`SELECT name, email FROM contact_submissions WHERE name = ${value}`);
      expect(result.rows).toEqual([
        { name: value, email: "o'brien@example.invalid" },
        { name: value, email: "o'brien@example.invalid" },
      ]);
    }
    expect((await db.execute(sql`SELECT count(*)::int AS count FROM contact_submissions`)).rows).toEqual([{ count: 10 }]);
    expect(deliverContactEmails).toHaveBeenCalledTimes(10);
  });
  it("characterises spoofable first X-Forwarded-For key despite the same trusted client hop", async () => {
    for (let i = 0; i < 5; i++) expect((await submit("enquiry", "fixture", "203.0.113.100, 192.0.2.2")).status).toBe(200);
    expect((await submit("enquiry", "fixture", "203.0.113.100, 192.0.2.2")).status).toBe(429);
    // The req.ip chosen under trust proxy=1 is unchanged; the custom key is not.
    expect((await submit("enquiry", "fixture", "203.0.113.101, 192.0.2.2")).status).toBe(200);
  });
});