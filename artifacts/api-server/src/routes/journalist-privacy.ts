import { Router, type Request, type Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, journalistPrivacyRequestsTable, journalistPrivacyRequestEventsTable, journalistPrivacyLegalHoldsTable, journalistPrivacyCompletionLedgerTable, mediaContactsTable, mediaOutletsTable, mediaSuppressionsTable } from "@workspace/db";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { DEFAULT_ADMIN_USERNAME, isRestrictedMaster, normUsername } from "../lib/platform-auth";
import { acquirePrivacyIdentityLock, addCalendarMonth, createSuppression, legalHoldCoversStore, privacyHash } from "../lib/journalist-privacy";
import { sendJournalistPrivacyCaseAlert, sendJournalistPrivacyOutcome } from "../lib/notify-email";

const router = Router();
const neutral = "Your request has been received. We will review it and contact you using the details provided.";
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip ? ipKeyGenerator(req.ip) : "unknown";
  },
});
const validTypes = new Set(["access", "correction", "objection", "removal"]);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function masterOwner(req: Request, res: Response): boolean {
  if (req.account?.role !== "admin" || normUsername(req.account.username) !== DEFAULT_ADMIN_USERNAME || isRestrictedMaster(req.account)) {
    res.status(403).json({ error: "Privacy case access requires the Master owner." });
    return false;
  }
  return true;
}

function requester(req: Request) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    requestType: typeof body.requestType === "string" ? body.requestType.trim().toLowerCase() : "",
    name: typeof body.name === "string" ? body.name.trim().slice(0, 160) : "",
    email: typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 320) : "",
    outlet: typeof body.outlet === "string" ? body.outlet.trim().slice(0, 200) : "",
    details: typeof body.details === "string" ? body.details.trim().slice(0, 5000) : "",
  };
}

function caseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function meaningfulNote(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

/**
 * Builds an access disclosure from every store that can hold this person's
 * personal data, not just the canonical contact row. Workspace-approved
 * cases only surface that workspace's derived/processing copies; a
 * shared-scope approval surfaces canonical fields only, since per-workspace
 * processing records belong to workspaces that were never part of this
 * case. Each store's coverage (or absence) is recorded in the append-only
 * completion ledger so a disclosure cannot silently omit a store.
 */
async function buildAccessDisclosure(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  requestId: number,
  matchedIds: number[],
  matchedIdSql: ReturnType<typeof sql.raw>,
  row: Record<string, unknown>,
): Promise<{ approved: boolean; matchedContactIds: number[]; generatedAt: string; records: Record<string, unknown[]> }> {
  const workspaceScope = row.approved_scope === "workspace";
  const approvedAccountId = typeof row.approved_account_id === "string" ? row.approved_account_id : "";
  const accountFilter = workspaceScope ? sql`AND account_id = ${approvedAccountId}` : sql`AND false`;
  const ledgerEntry = async (store: string, rows: unknown[]) => {
    await tx.insert(journalistPrivacyCompletionLedgerTable).values({
      requestId, store, storeKey: matchedIds.join(","),
      result: rows.length ? "disclosed" : "no_records_in_scope",
      note: `${store} access disclosure`,
    }).onConflictDoNothing();
  };

  const contacts = (await tx.execute(sql`
    SELECT c.id, c.first_name, c.last_name, c.role, c.email, c.phone, c.mobile, c.linkedin_url, c.twitter_handle,
      c.account_id, c.beats, c.sectors, c.notes, c.geography, c.confidence, c.publication_authority, c.journalist_authority,
      c.review_notes, c.source_ref, c.source_url, o.name AS outlet_name
    FROM media_contacts c LEFT JOIN media_outlets o ON o.id = c.outlet_id
    WHERE c.id IN (${matchedIdSql})
  `)).rows;
  await ledgerEntry("contacts", contacts);

  const fieldOverrides = (await tx.execute(sql`SELECT contact_id, field_name, value FROM media_contact_field_overrides WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("field_overrides", fieldOverrides);

  const sourceChecks = (await tx.execute(sql`SELECT contact_id, source_url, outcome, checked_at, observed_evidence, differences FROM media_contact_source_checks WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("source_checks", sourceChecks);

  const discoveries = (await tx.execute(sql`SELECT id, account_id, status, candidate, created_at FROM media_discoveries WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("discoveries", discoveries);

  const recommendations = (await tx.execute(sql`
    SELECT i.contact_id, s.account_id, s.story_key, i.score, i.rank
    FROM media_recommendation_items i JOIN media_recommendation_sets s ON s.id = i.recommendation_set_id
    WHERE i.contact_id IN (${matchedIdSql}) ${workspaceScope ? sql`AND s.account_id = ${approvedAccountId}` : sql`AND false`}
  `)).rows;
  await ledgerEntry("recommendations", recommendations);

  const decisions = (await tx.execute(sql`SELECT contact_id, account_id, story_key, decision, note, created_at FROM media_recommendation_decisions WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("decisions", decisions);

  const feedback = (await tx.execute(sql`SELECT contact_id, account_id, story_key, signal, created_at FROM media_recommendation_feedback WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("feedback", feedback);

  const outreach = (await tx.execute(sql`SELECT contact_id, account_id, story_key, status, contact_snapshot, pitch_date, response_date, notes FROM media_outreach WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("outreach_snapshots", outreach);

  const correctionReports = (await tx.execute(sql`SELECT contact_id, account_id, fields, status, details, created_at FROM media_contact_correction_reports WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("correction_reports", correctionReports);

  const statusEvents = (await tx.execute(sql`SELECT contact_id, account_id, status, note, created_at FROM media_contact_status_events WHERE contact_id IN (${matchedIdSql}) ${accountFilter}`)).rows;
  await ledgerEntry("status_events", statusEvents);

  return {
    approved: true,
    matchedContactIds: matchedIds,
    generatedAt: new Date().toISOString(),
    records: {
      contacts, fieldOverrides, sourceChecks, discoveries, recommendations, decisions, feedback, outreach, correctionReports, statusEvents,
    },
  };
}

router.post("/journalist-privacy/requests", limiter, async (req: Request, res: Response) => {
  const input = requester(req);
  if (!validTypes.has(input.requestType) || !input.name || !emailRe.test(input.email) || !input.details) {
    res.status(400).json({ error: "Request type, name, valid email and details are required." });
    return;
  }
  const received = new Date();
  const dueAt = addCalendarMonth(received);
  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.insert(journalistPrivacyRequestsTable).values({
        requestType: input.requestType, name: input.name, email: input.email, outlet: input.outlet,
        details: input.details, scope: "pending", assignedTo: process.env.PRIVACY_OWNER_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME, dueAt,
      }).returning({ id: journalistPrivacyRequestsTable.id, dueAt: journalistPrivacyRequestsTable.dueAt });
      await tx.insert(journalistPrivacyRequestEventsTable).values({
        requestId: row.id, eventType: "received", actor: "public", note: "Request received", metadata: {},
      });
      return row;
    });
    try {
      await sendJournalistPrivacyCaseAlert({ requestId: result.id, requestType: input.requestType, dueAt });
      await db.update(journalistPrivacyRequestsTable).set({ notificationStatus: "sent" }).where(eq(journalistPrivacyRequestsTable.id, result.id));
    } catch (error) {
      await db.update(journalistPrivacyRequestsTable).set({
        notificationStatus: "failed", notificationAttempts: sql`${journalistPrivacyRequestsTable.notificationAttempts} + 1`,
        lastNotificationError: error instanceof Error ? error.message.slice(0, 500) : "notification failed",
      }).where(eq(journalistPrivacyRequestsTable.id, result.id));
    }
    res.status(202).json({ ok: true, message: neutral });
  } catch {
    res.status(500).json({ error: "Unable to receive the request. Please try again." });
  }
});

router.get("/admin/journalist-privacy/requests", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const assignedTo = typeof req.query.assignedTo === "string" ? req.query.assignedTo.trim() : "";
  const overdue = req.query.overdue === "true";
  const filters = [];
  if (status && status !== "all") {
    if (status === "open") filters.push(sql`${journalistPrivacyRequestsTable.status} NOT IN ('resolved','rejected')`);
    else if (status === "overdue") filters.push(sql`${journalistPrivacyRequestsTable.dueAt} < now() AND ${journalistPrivacyRequestsTable.status} NOT IN ('resolved','rejected')`);
    else filters.push(eq(journalistPrivacyRequestsTable.status, status));
  }
  if (assignedTo) filters.push(eq(journalistPrivacyRequestsTable.assignedTo, assignedTo));
  if (overdue || status === "overdue") filters.push(sql`${journalistPrivacyRequestsTable.dueAt} < now() AND ${journalistPrivacyRequestsTable.status} NOT IN ('resolved','rejected')`);
  const rows = await db.select({
    id: journalistPrivacyRequestsTable.id, requestType: journalistPrivacyRequestsTable.requestType,
    outlet: journalistPrivacyRequestsTable.outlet, status: journalistPrivacyRequestsTable.status,
    dueAt: journalistPrivacyRequestsTable.dueAt, assignedTo: journalistPrivacyRequestsTable.assignedTo,
    verificationStatus: journalistPrivacyRequestsTable.verificationStatus,
    notificationStatus: journalistPrivacyRequestsTable.notificationStatus, createdAt: journalistPrivacyRequestsTable.createdAt,
  }).from(journalistPrivacyRequestsTable).where(filters.length ? and(...filters) : undefined).orderBy(desc(journalistPrivacyRequestsTable.createdAt));
  res.json({ requests: rows.map((row) => ({ ...row, overdue: row.dueAt.getTime() < Date.now() && !["resolved", "rejected"].includes(row.status) })) });
});

router.get("/admin/journalist-privacy/requests/:id", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = caseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid privacy case id" }); return; }
  const [request] = await db.select().from(journalistPrivacyRequestsTable).where(eq(journalistPrivacyRequestsTable.id, id)).limit(1);
  if (!request) { res.status(404).json({ error: "Privacy case not found" }); return; }
  const events = await db.select().from(journalistPrivacyRequestEventsTable).where(eq(journalistPrivacyRequestEventsTable.requestId, id)).orderBy(journalistPrivacyRequestEventsTable.createdAt);
  res.json({ request, events });
});

router.post("/admin/journalist-privacy/requests/:id/verify", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = caseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid privacy case id" }); return; }
  const status = req.body?.status === "verified" ? "verified" : req.body?.status === "uncertain" ? "uncertain" : "failed";
  const note = meaningfulNote(req.body?.note);
  if (!note) { res.status(400).json({ error: "A meaningful verification note is required." }); return; }
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.update(journalistPrivacyRequestsTable).set({ verificationStatus: status, verificationNote: note, status: "under_review" }).where(and(eq(journalistPrivacyRequestsTable.id, id), sql`${journalistPrivacyRequestsTable.status} NOT IN ('resolved','rejected')`)).returning();
    if (!row) return null;
    await tx.insert(journalistPrivacyRequestEventsTable).values({ requestId: id, eventType: "verification", actor: req.account!.username, note, metadata: { status } });
    return row;
  });
  if (!result) { res.status(404).json({ error: "Privacy case not found or already closed" }); return; }
  const row = result;
  res.json({ ok: true, request: row });
});

router.post("/admin/journalist-privacy/requests/:id/approve", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = caseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid privacy case id" }); return; }
  const noMatch = req.body?.noMatch === true;
  const scope = req.body?.scope === "shared" || req.body?.scope === "workspace" ? req.body.scope : "";
  const approvedAccountId = typeof req.body?.accountId === "string" ? req.body.accountId.trim().slice(0, 120) : "";
  const matchedContactIds: number[] = Array.isArray(req.body?.matchedContactIds)
    ? Array.from(new Set<number>(
      req.body.matchedContactIds
        .map((value: unknown) => Number(value))
        .filter((value: number): value is number => Number.isInteger(value) && value > 0),
    ))
    : [];
  const note = meaningfulNote(req.body?.note);
  if (!note || (!noMatch && (!scope || !matchedContactIds.length || (scope === "workspace" && !approvedAccountId))) || (noMatch && matchedContactIds.length)) {
    res.status(400).json({ error: "Record either an explicit no-match decision or an approved scope with selected contacts and a meaningful note." }); return;
  }
  const candidates = noMatch ? [] : await db.select({ id: mediaContactsTable.id, accountId: mediaContactsTable.accountId }).from(mediaContactsTable).where(and(inArray(mediaContactsTable.id, matchedContactIds), isNull(mediaContactsTable.deletedAt)));
  if (!noMatch && (candidates.length !== matchedContactIds.length
    || (scope === "workspace" && candidates.some((c) => c.accountId !== null && c.accountId !== approvedAccountId))
    || (scope === "shared" && candidates.some((c) => c.accountId !== null)))) {
    res.status(409).json({ error: "Every selected contact must exist within the approved scope." }); return;
  }
  const row = await db.transaction(async (tx) => {
    const [approved] = await tx.update(journalistPrivacyRequestsTable).set({ approvedScope: noMatch ? null : scope, approvedAccountId: noMatch ? null : approvedAccountId || null, matchedContactIds, reviewerApprovalAt: new Date(), reviewerApprovalBy: req.account!.username, scope: noMatch ? "no_match" : scope }).where(and(eq(journalistPrivacyRequestsTable.id, id), eq(journalistPrivacyRequestsTable.verificationStatus, "verified"), sql`${journalistPrivacyRequestsTable.status} NOT IN ('resolved','rejected')`)).returning();
    if (approved) await tx.insert(journalistPrivacyRequestEventsTable).values({ requestId: id, eventType: "approved", actor: req.account!.username, note, metadata: { scope: noMatch ? "no_match" : scope, matchedContactIds, noMatch } });
    return approved;
  });
  if (!row) { res.status(409).json({ error: "Verified identity is required before approval." }); return; }
  res.json({ ok: true, request: row });
});

router.get("/admin/journalist-privacy/requests/:id/candidates", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = caseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid privacy case id" }); return; }
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  if (query.length < 2) { res.status(400).json({ error: "Search must contain at least two characters." }); return; }
  const tokens = query.split(/\s+/).map((token) => token.trim()).filter((token) => token.length >= 2).slice(0, 6);
  const tokenFilters = tokens.map((token) => {
    const term = `%${token}%`;
    return sql`(${mediaContactsTable.firstName} ILIKE ${term} OR ${mediaContactsTable.lastName} ILIKE ${term} OR ${mediaContactsTable.role} ILIKE ${term} OR concat_ws(' ', ${mediaContactsTable.firstName}, ${mediaContactsTable.lastName}) ILIKE ${term})`;
  });
  const rows = await db.select({ id: mediaContactsTable.id, firstName: mediaContactsTable.firstName, lastName: mediaContactsTable.lastName, role: mediaContactsTable.role, outletId: mediaContactsTable.outletId, accountId: mediaContactsTable.accountId }).from(mediaContactsTable).where(and(sql`${mediaContactsTable.deletedAt} IS NULL`, ...tokenFilters)).limit(25);
  res.json({ candidates: rows });
});

router.post("/admin/journalist-privacy/requests/:id/assign", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = caseId(req.params.id);
  const assignedTo = typeof req.body?.assignedTo === "string" ? req.body.assignedTo.trim().slice(0, 160) : "";
  if (!id || !assignedTo) { res.status(400).json({ error: "Case id and accountable privacy owner are required." }); return; }
  const note = meaningfulNote(req.body?.note) || "Assigned accountable privacy owner";
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.update(journalistPrivacyRequestsTable).set({ assignedTo }).where(and(eq(journalistPrivacyRequestsTable.id, id), sql`${journalistPrivacyRequestsTable.status} NOT IN ('resolved','rejected')`)).returning();
    if (!row) return null;
    await tx.insert(journalistPrivacyRequestEventsTable).values({ requestId: id, eventType: "assigned", actor: req.account!.username, note, metadata: { assignedTo } });
    return row;
  });
  if (!result) { res.status(404).json({ error: "Privacy case not found" }); return; }
  res.json({ ok: true, request: result });
});

router.post("/admin/journalist-privacy/requests/:id/resolve", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = caseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid privacy case id" }); return; }
  const resolution = req.body?.resolution;
  if (!["upheld", "rejected", "partially_upheld"].includes(resolution)) { res.status(400).json({ error: "Choose a valid resolution." }); return; }
  const note = meaningfulNote(req.body?.note);
  if (!note) { res.status(400).json({ error: "A meaningful resolution note is required." }); return; }
  const correctionPayload = req.body?.correction && typeof req.body.correction === "object" ? req.body.correction : {};
  const supportedCorrectionFields = new Set(["firstName", "lastName", "role", "email", "phone", "mobile", "linkedinUrl", "twitterHandle", "outletId"]);
  const correctionFields: string[] = Array.isArray(correctionPayload.fields)
    ? Array.from(new Set(correctionPayload.fields.filter((field: unknown): field is string => typeof field === "string" && supportedCorrectionFields.has(field))))
    : [];
  const correctionValues: Record<string, unknown> = correctionPayload.values && typeof correctionPayload.values === "object" ? correctionPayload.values as Record<string, unknown> : {};
  const correctionEvidence = typeof correctionPayload.evidence === "string" ? correctionPayload.evidence.trim().slice(0, 2000) : "";
  const result = await db.transaction(async (tx) => {
    await acquirePrivacyIdentityLock(tx, id.toString());
    const locked = await tx.execute(sql`SELECT * FROM journalist_privacy_requests WHERE id = ${id} FOR UPDATE`);
    const row = locked.rows[0] as any;
    if (!row) return { status: 404, body: { error: "Privacy case not found" } };
    if (row.request_type === "correction" && resolution !== "rejected" && (!correctionFields.length || !correctionEvidence || correctionFields.some((field) => typeof correctionValues[field] !== "string" || !correctionValues[field].trim()))) {
      return { status: 400, body: { error: "Actionable correction fields, proposed values, and evidence are required." } };
    }
    const priorEvents = await tx.select().from(journalistPrivacyRequestEventsTable).where(eq(journalistPrivacyRequestEventsTable.requestId, id));
    const queuedCorrectionIds = priorEvents
      .filter((event) => event.eventType === "correction_queued")
      .flatMap((event) => {
        const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
        return Array.isArray(metadata.reportIds) ? metadata.reportIds.filter((value): value is number => Number.isInteger(value)) : [];
      });
    if (row.verification_status !== "verified" || !row.reviewer_approval_at) return { status: 409, body: { error: "Verified identity and reviewer approval are required." } };
    if (row.status === "resolved") return { status: 200, body: { ok: true, replayed: true } };
    const held = await tx.execute(sql`SELECT id, scope FROM journalist_privacy_legal_holds WHERE request_id = ${id} AND (expires_at IS NULL OR expires_at > now())`);
    const matchedIds = Array.isArray(row.matched_contact_ids) ? row.matched_contact_ids.filter((v: unknown) => Number.isInteger(v) && Number(v) > 0) : [];
    const matchedIdSql = sql.raw(matchedIds.length ? matchedIds.join(",") : "NULL");
    if (resolution !== "rejected" && ["removal", "objection"].includes(row.request_type) && !matchedIds.length) {
      return { status: 409, body: { error: "A confirmed matched contact and approved scope are required." } };
    }
    if (resolution !== "rejected") {
      let canonicalRows: Array<Record<string, unknown>> = [];
      if (["removal", "objection"].includes(row.request_type)) {
        const canonical = await tx.execute(sql`SELECT c.id, c.email, c.first_name, c.last_name, c.linkedin_url, o.name AS outlet_name FROM media_contacts c LEFT JOIN media_outlets o ON o.id = c.outlet_id WHERE c.id IN (${matchedIdSql})`);
        canonicalRows = canonical.rows as Array<Record<string, unknown>>;
        for (const contact of canonicalRows) {
          const outlet = String(contact.outlet_name ?? "");
          await tx.insert(mediaSuppressionsTable).values({
            requestId: id, scope: row.approved_scope ?? row.scope, accountId: row.approved_account_id ?? null,
            emailHash: privacyHash(contact.email), nameHash: privacyHash(`${contact.first_name ?? ""} ${contact.last_name ?? ""}`),
            linkedinHash: privacyHash(contact.linkedin_url), outletHash: privacyHash(outlet), reason: row.request_type, active: 1,
          }).onConflictDoNothing();
          await tx.insert(journalistPrivacyCompletionLedgerTable).values({ requestId: id, store: "suppression", storeKey: String(contact.id), result: "redacted", note: "Canonical identity suppression created" }).onConflictDoNothing();
        }
      }
      if (row.request_type === "removal") {
        const holds = held.rows as Array<{ scope?: string }>;
        const workspaceRemoval = row.approved_scope === "workspace";
        const approvedAccountId = row.approved_account_id ?? "";
        const storeHeld = (store: string) => holds.some((hold) => legalHoldCoversStore(hold.scope, store));
        const ledger = async (store: string, affected: Set<number>) => {
          for (const contactId of matchedIds) {
            const result = affected.has(contactId)
              ? storeHeld(store) ? "retained_under_legal_hold" : "redacted"
              : "already_absent";
            await tx.insert(journalistPrivacyCompletionLedgerTable).values({ requestId: id, store, storeKey: String(contactId), result, note: `${store} completion` }).onConflictDoNothing();
          }
        };
        const contactRows = storeHeld("contacts")
          ? (await tx.execute(sql`SELECT id FROM media_contacts WHERE id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ id: number }>
          : (await tx.execute(sql`UPDATE media_contacts SET first_name = '[redacted]', last_name = '[redacted]', email = '', phone = '', mobile = '', linkedin_url = '', twitter_handle = '', source_ref = '', source_url = '', provenance = '{}'::jsonb, deleted_at = now() WHERE id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING id`)).rows as Array<{ id: number }>;
        await ledger("contacts", new Set(contactRows.map((r) => r.id)));
        const overrideRows = storeHeld("field_overrides")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_contact_field_overrides WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`DELETE FROM media_contact_field_overrides WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("field_overrides", new Set(overrideRows.map((r) => r.contact_id)));
        const sourceRows = storeHeld("source_checks")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_contact_source_checks WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`UPDATE media_contact_source_checks SET observed_evidence = '{}'::jsonb, differences = '[]'::jsonb, error_message = 'Redacted following privacy outcome' WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("source_checks", new Set(sourceRows.map((r) => r.contact_id)));
        const unlinkedDiscoveryContactIds = new Set<number>();
        const discoveryScope = row.approved_scope === "workspace"
          ? sql`AND account_id = ${row.approved_account_id}`
          : sql``;
        const unlinkedDiscoveries = (await tx.execute(sql`SELECT id, candidate FROM media_discoveries WHERE contact_id IS NULL ${discoveryScope}`)).rows as Array<{ id: number; candidate: Record<string, unknown> }>;
        for (const discovery of unlinkedDiscoveries) {
          const candidate = discovery.candidate && typeof discovery.candidate === "object" ? discovery.candidate : {};
          const candidateName = String(candidate.name ?? `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`).trim();
          const candidateEmail = privacyHash(candidate.email);
          const candidateLinkedIn = privacyHash(candidate.linkedinUrl);
          const candidateNameHash = privacyHash(candidateName);
          const candidateOutletHash = privacyHash(candidate.outlet ?? candidate.outletName);
          for (const contact of canonicalRows) {
            const strongMatch = (!!candidateEmail && candidateEmail === privacyHash(contact.email))
              || (!!candidateLinkedIn && candidateLinkedIn === privacyHash(contact.linkedin_url))
              || (!!candidateNameHash && !!candidateOutletHash
                && candidateNameHash === privacyHash(`${contact.first_name ?? ""} ${contact.last_name ?? ""}`)
                && candidateOutletHash === privacyHash(contact.outlet_name));
            if (!strongMatch) continue;
            unlinkedDiscoveryContactIds.add(Number(contact.id));
            if (!storeHeld("discoveries")) {
              await tx.execute(sql`UPDATE media_discoveries SET candidate = jsonb_build_object('redacted', true) WHERE id = ${discovery.id}`);
            }
            break;
          }
        }
        const discoveryRows = storeHeld("discoveries")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_discoveries WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`WITH affected AS (SELECT id, contact_id FROM media_discoveries WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}), updated AS (UPDATE media_discoveries d SET candidate = jsonb_build_object('redacted', true), contact_id = NULL FROM affected a WHERE d.id = a.id RETURNING a.contact_id) SELECT contact_id FROM updated`)).rows as Array<{ contact_id: number }>;
        await ledger("discoveries", new Set([...discoveryRows.map((r) => r.contact_id), ...unlinkedDiscoveryContactIds]));
        const recommendationRows = storeHeld("recommendations")
          ? (await tx.execute(sql`SELECT DISTINCT i.contact_id FROM media_recommendation_items i JOIN media_recommendation_sets s ON s.id = i.recommendation_set_id WHERE i.contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND s.account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`DELETE FROM media_recommendation_items i USING media_recommendation_sets s WHERE i.recommendation_set_id = s.id AND i.contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND s.account_id = ${approvedAccountId}` : sql``} RETURNING i.contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("recommendations", new Set(recommendationRows.map((r) => r.contact_id)));
        const decisionRows = storeHeld("decisions")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_recommendation_decisions WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`DELETE FROM media_recommendation_decisions WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("decisions", new Set(decisionRows.map((r) => r.contact_id)));
        const feedbackRows = storeHeld("feedback")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_recommendation_feedback WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`DELETE FROM media_recommendation_feedback WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("feedback", new Set(feedbackRows.map((r) => r.contact_id)));
        const outreachRows = storeHeld("outreach_snapshots")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_outreach WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`UPDATE media_outreach SET contact_snapshot = jsonb_build_object('name','[redacted]','role','','email','') WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("outreach_snapshots", new Set(outreachRows.map((r) => r.contact_id)));
        const correctionRows = storeHeld("correction_reports")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_contact_correction_reports WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`UPDATE media_contact_correction_reports SET details = 'Redacted following privacy outcome' WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("correction_reports", new Set(correctionRows.map((r) => r.contact_id)));
        const statusRows = storeHeld("status_events")
          ? (await tx.execute(sql`SELECT DISTINCT contact_id FROM media_contact_status_events WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``}`)).rows as Array<{ contact_id: number }>
          : (await tx.execute(sql`UPDATE media_contact_status_events SET note = 'Redacted following privacy outcome' WHERE contact_id IN (${matchedIdSql}) ${workspaceRemoval ? sql`AND account_id = ${approvedAccountId}` : sql``} RETURNING contact_id`)).rows as Array<{ contact_id: number }>;
        await ledger("status_events", new Set(statusRows.map((r) => r.contact_id)));
      } else if (row.request_type === "correction") {
        const details = JSON.stringify({ privacyRequestId: id, note, evidence: correctionEvidence, proposedValues: correctionValues });
        const linkedIds = [...new Set(queuedCorrectionIds)];
        if (!linkedIds.length) {
          for (const contactId of matchedIds) {
            const created = (await tx.execute(sql`INSERT INTO media_contact_correction_reports (contact_id, account_id, fields, details, status, reported_by, resolution_note)
              VALUES (${contactId}, ${row.approved_account_id ?? "master"}, ARRAY[${sql.join(correctionFields.map((field) => sql`${field}`), sql`, `)}]::text[], ${details}, 'pending', ${req.account!.username}, '')
              RETURNING id`)).rows[0] as { id: number };
            linkedIds.push(created.id);
          }
          await tx.insert(journalistPrivacyRequestEventsTable).values({
            requestId: id, eventType: "correction_queued", actor: req.account!.username,
            note: "Actionable correction report queued for steward acceptance.",
            metadata: { reportIds: linkedIds, fields: correctionFields, evidence: correctionEvidence },
          });
          return { status: 409, body: { error: "Correction report queued; steward acceptance is required before closure." } };
        }
        const reports = (await tx.execute(sql`SELECT id, status FROM media_contact_correction_reports WHERE id IN (${sql.join(linkedIds.map((reportId) => sql`${reportId}`), sql`, `)})`)).rows as Array<{ id: number; status: string }>;
        if (reports.length !== linkedIds.length || reports.some((report) => report.status !== "accepted")) {
          return { status: 409, body: { error: "Every linked correction report must be accepted before closure." } };
        }
      }
    }
    const disclosureResult = row.request_type === "access"
      ? resolution === "rejected"
        ? { approved: false }
        : await buildAccessDisclosure(tx, id, matchedIds, matchedIdSql, row)
      : {};
    await tx.update(journalistPrivacyRequestsTable).set({ status: "resolved", resolution, resolutionNote: note, disclosureResult, resolvedAt: new Date() }).where(eq(journalistPrivacyRequestsTable.id, id));
    await tx.insert(journalistPrivacyRequestEventsTable).values({ requestId: id, eventType: "resolved", actor: req.account!.username, note, metadata: { resolution, legalHold: held.rows.length > 0, completion: held.rows.length ? "partial" : "complete" } });
    return { status: 200, body: { ok: true, resolution } };
  });
  res.status(result.status).json(result.body);
});

router.post("/admin/journalist-privacy/requests/:id/retry-notification", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = Number(req.params.id);
  const [row] = await db.select().from(journalistPrivacyRequestsTable).where(eq(journalistPrivacyRequestsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Privacy case not found" }); return; }
  try {
    await sendJournalistPrivacyCaseAlert({ requestId: id, requestType: row.requestType, dueAt: row.dueAt });
    await db.update(journalistPrivacyRequestsTable).set({ notificationStatus: "sent", notificationAttempts: sql`${journalistPrivacyRequestsTable.notificationAttempts} + 1`, lastNotificationError: "" }).where(eq(journalistPrivacyRequestsTable.id, id));
    res.json({ ok: true });
  } catch (error) {
    await db.update(journalistPrivacyRequestsTable).set({ notificationStatus: "failed", notificationAttempts: sql`${journalistPrivacyRequestsTable.notificationAttempts} + 1`, lastNotificationError: error instanceof Error ? error.message.slice(0, 500) : "notification failed" }).where(eq(journalistPrivacyRequestsTable.id, id));
    res.status(502).json({ error: "Notification delivery failed; the case remains stored for retry." });
  }
});

router.post("/admin/journalist-privacy/requests/:id/deliver-outcome", requirePlatformAuth, async (req, res) => {
  if (!masterOwner(req, res)) return;
  const id = caseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid privacy case id" }); return; }
  const [row] = await db.select().from(journalistPrivacyRequestsTable).where(eq(journalistPrivacyRequestsTable.id, id)).limit(1);
  if (!row || row.status !== "resolved") { res.status(409).json({ error: "Only resolved cases can deliver an outcome." }); return; }
  const disclosure = row.disclosureResult && typeof row.disclosureResult === "object"
    ? row.disclosureResult as { approved?: boolean; records?: Record<string, unknown[]> }
    : {};
  const body = row.requestType === "access" && disclosure.approved
    ? `Your access request has been upheld. The verified and approved records for case ${id}, covering every store that held your data, are included below.\n\n${JSON.stringify(disclosure.records ?? {}, null, 2)}`
    : `Your ${row.requestType} request has been reviewed. Outcome: ${row.resolution}. Case ${id}.`;
  const [claimed] = await db.update(journalistPrivacyRequestsTable).set({ outcomeDeliveryAttempts: sql`${journalistPrivacyRequestsTable.outcomeDeliveryAttempts} + 1`, outcomeDeliveryStatus: "sending", outcomeDeliveryClaimedAt: new Date() }).where(and(eq(journalistPrivacyRequestsTable.id, id), sql`${journalistPrivacyRequestsTable.outcomeDeliveryStatus} IN ('pending','failed') OR (${journalistPrivacyRequestsTable.outcomeDeliveryStatus} = 'sending' AND ${journalistPrivacyRequestsTable.outcomeDeliveryClaimedAt} < now() - interval '15 minutes')`)).returning({ id: journalistPrivacyRequestsTable.id });
  if (!claimed) {
    const [current] = await db.select({ status: journalistPrivacyRequestsTable.outcomeDeliveryStatus }).from(journalistPrivacyRequestsTable).where(eq(journalistPrivacyRequestsTable.id, id)).limit(1);
    if (current?.status === "sent") { res.json({ ok: true, replayed: true }); return; }
    res.status(409).json({ error: "Outcome delivery is already in progress or failed; retry after review." }); return;
  }
  try {
    await sendJournalistPrivacyOutcome({ toEmail: row.email, requestId: id, requestType: row.requestType, body });
    await db.update(journalistPrivacyRequestsTable).set({ outcomeDeliveryStatus: "sent", outcomeDeliveryError: "" }).where(eq(journalistPrivacyRequestsTable.id, id));
    await db.insert(journalistPrivacyRequestEventsTable).values({ requestId: id, eventType: "outcome_delivered", actor: req.account!.username, note: "Outcome delivered", metadata: { status: "sent" } });
    res.json({ ok: true });
  } catch (error) {
    await db.update(journalistPrivacyRequestsTable).set({ outcomeDeliveryStatus: "failed", outcomeDeliveryError: error instanceof Error ? error.message.slice(0, 500) : "delivery failed" }).where(eq(journalistPrivacyRequestsTable.id, id));
    res.status(502).json({ error: "Outcome delivery failed; retry is available." });
  }
});

export default router;