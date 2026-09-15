import { Router, type IRouter, type Request, type Response } from "express";
import { db, mediaCategoriesTable, mediaOutletsTable, mediaContactsTable, mediaContactFieldOverridesTable, mediaContactSourceChecksTable, mediaContactStatusEventsTable, mediaContactCorrectionReportsTable, mediaImportBatchesTable, mediaRecommendationSetsTable, mediaRecommendationItemsTable, mediaRecommendationDecisionsTable, mediaRecommendationFeedbackTable, mediaOutreachTable, mediaOutreachActivitiesTable, mediaPlacementsTable, projectsTable, type MediaOutreachStatus } from "@workspace/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { inAssignedScope, memberProjectGate } from "../lib/member-guards";
import { getVisibleUsernames, normUsername } from "../lib/platform-auth";
import { TRADE_MEDIA_CATEGORIES } from "../lib/trade-media-categories";
import {
  buildMediaContactNotes,
  canonicalMediaEmail,
  classifyMediaReconciliation,
  filterVisibleRecommendationItems,
  mediaOutletKey,
  mediaOverrideOwner,
  parseMediaImportCsv,
  parseMediaImportXlsx,
  planMediaImport,
} from "../lib/media-csv-import";
import type { MediaImportRow } from "../lib/media-csv-import";
import { mediaDiscoveryNotes, verifyMediaDiscoveries } from "../lib/media-discovery-token";
import { approvedSourceUpdates, mediaSourceNextDueAt } from "../lib/media-source-health";
import { claimMediaContactForManualReverification, reverifyClaimedMediaContact } from "../lib/media-source-reverification";
import { fetchPlacementPageEvidence } from "../lib/safe-fetch";
import {
  normaliseExactPhraseText,
  normaliseSubmittedExactTargetPhrases,
  stableExactTargetPhraseId,
  type ExactTargetPhrase,
} from "../lib/exact-target-phrases";
import { MEDIA_RECOMMENDATION_STOP_WORDS, scoreMediaRecommendation } from "../lib/media-recommendation-ranking";

const router: IRouter = Router();

const OUTREACH_TRANSITIONS: Record<MediaOutreachStatus, MediaOutreachStatus[]> = {
  planned: ["pitched", "declined"],
  pitched: ["responded", "accepted", "declined"],
  responded: ["accepted", "declined"],
  accepted: ["declined"],
  declined: ["planned"],
  placed: [],
};

function parseDate(value: unknown): Date | null | undefined {
  if (value === null || value === "") return null;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value);
}

export function canonicalPlacementUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Placement URL must use HTTP or HTTPS.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

// Membership role gate for the media database: billing members are blocked
// entirely, viewers may only issue reads.
router.use(["/store/media-categories", "/store/media-db"], memberProjectGate);

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

async function editableContact(req: Request, id: number) {
  const rows = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.deletedAt) return { ok: false as const, status: 404, error: "Contact not found" };
  if (row.accountId === null && !isAdmin(req)) {
    return { ok: false as const, status: 403, error: "Only admins may check global contacts" };
  }
  if (row.accountId !== null && !isAdmin(req) && row.accountId !== normUsername(req.account!.username)) {
    return { ok: false as const, status: 403, error: "You can only check your own contacts" };
  }
  return { ok: true as const, row, owner: mediaOverrideOwner(row.accountId) };
}

async function visibleContact(req: Request, id: number) {
  const rows = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.deletedAt) return { ok: false as const, status: 404, error: "Contact not found" };
  const visible = await visibleAccounts(req);
  if (row.accountId !== null && visible !== null && !visible.includes(row.accountId)) {
    return { ok: false as const, status: 404, error: "Contact not found" };
  }
  return { ok: true as const, row };
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
  "/store/media-db/import",
  requirePlatformAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { csv, xlsxBase64, rows, category, commit, filename, idempotencyKey } = req.body ?? {};
    if (typeof csv !== "string" && typeof xlsxBase64 !== "string" && !Array.isArray(rows)) {
      res.status(400).json({ error: "Choose a CSV or XLSX file to import." });
      return;
    }
    if (category !== undefined && typeof category !== "string") {
      res.status(400).json({ error: "Category must be text." });
      return;
    }

    try {
      const parsed = typeof csv === "string"
        ? parseMediaImportCsv(csv)
        : typeof xlsxBase64 === "string"
          ? await parseMediaImportXlsx(xlsxBase64)
          : {
            rows: rows.filter((row: unknown) => row && typeof row === "object").slice(0, 5_000).map((raw: Record<string, unknown>, index: number): MediaImportRow => ({
              sourceRow: Number(raw.sourceRow) || index + 1,
              sheetName: typeof raw.sheetName === "string" ? raw.sheetName.slice(0, 200) : undefined,
              sector: typeof raw.sector === "string" ? raw.sector.slice(0, 200) : undefined,
              firstName: typeof raw.firstName === "string" ? raw.firstName.trim() : "", lastName: typeof raw.lastName === "string" ? raw.lastName.trim() : "",
              role: typeof raw.role === "string" ? raw.role.trim() : "", outletName: typeof raw.outletName === "string" ? raw.outletName.trim() : "",
              email: typeof raw.email === "string" ? canonicalMediaEmail(raw.email) : "", website: typeof raw.website === "string" ? raw.website.trim() : "",
              description: typeof raw.description === "string" ? raw.description.trim() : "", beat: typeof raw.beat === "string" ? raw.beat.trim() : "",
              country: typeof raw.country === "string" ? raw.country.trim() : "", reachBand: typeof raw.reachBand === "string" ? raw.reachBand.trim() : "",
              confidence: typeof raw.confidence === "string" ? raw.confidence.trim() : "", notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
              linkedinUrl: typeof raw.linkedinUrl === "string" ? raw.linkedinUrl.trim() : "", sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl.trim() : "",
              verifiedDate: typeof raw.verifiedDate === "string" ? raw.verifiedDate.trim() : "", publicationAuthority: typeof raw.publicationAuthority === "string" ? raw.publicationAuthority.trim() : "",
              journalistAuthority: typeof raw.journalistAuthority === "string" ? raw.journalistAuthority.trim() : "", reviewNotes: typeof raw.reviewNotes === "string" ? raw.reviewNotes.trim() : "",
            })).filter((row: MediaImportRow) => row.outletName && (row.firstName || row.lastName || row.email)),
            errors: [], headers: [],
          };
      const accountId = normUsername(req.account!.username);
      const loadExisting = async () => {
        const [existingOutlets, existingContacts] = await Promise.all([
          db
            .select({
              id: mediaOutletsTable.id,
              name: mediaOutletsTable.name,
              website: mediaOutletsTable.website,
            })
            .from(mediaOutletsTable)
            .where(and(
              isNull(mediaOutletsTable.deletedAt),
              or(eq(mediaOutletsTable.accountId, accountId), isNull(mediaOutletsTable.accountId)),
            )),
          db
            .select({
              id: mediaContactsTable.id,
              outletId: mediaContactsTable.outletId,
              firstName: mediaContactsTable.firstName,
              lastName: mediaContactsTable.lastName,
              email: mediaContactsTable.email,
              sectors: mediaContactsTable.sectors,
              role: mediaContactsTable.role,
              publicationReach: mediaContactsTable.publicationReach,
              confidence: mediaContactsTable.confidence,
            })
            .from(mediaContactsTable)
            // Imports only reconcile this workspace's private contacts. A
            // globally-curated canonical email is reference data, not an
            // import target; importing it creates a private workspace copy.
            .where(and(isNull(mediaContactsTable.deletedAt), eq(mediaContactsTable.accountId, accountId))),
        ]);
        return { existingOutlets, existingContacts };
      };
      const existing = await loadExisting();
      const initialPlan = planMediaImport(parsed.rows, existing.existingOutlets, existing.existingContacts);
      const previewOverrides = await db.select({ contactId: mediaContactFieldOverridesTable.contactId, fieldName: mediaContactFieldOverridesTable.fieldName })
        .from(mediaContactFieldOverridesTable).where(eq(mediaContactFieldOverridesTable.accountId, accountId));
      const reconciliation = classifyMediaReconciliation(parsed.rows, existing.existingContacts, new Set(previewOverrides.map((item) => `${item.contactId}:${item.fieldName}`)));
      const preview = {
        validRows: parsed.rows.length,
        importableRows: initialPlan.importRows.length,
        duplicateRows: initialPlan.duplicatesSkipped,
        ...reconciliation,
        invalid: reconciliation.invalid + parsed.errors.length,
        invalidRows: parsed.errors.length,
        outletCount: initialPlan.outletCount,
        newOutletCount: initialPlan.newOutletCount,
        headers: parsed.headers,
        errors: parsed.errors.slice(0, 50),
        sample: initialPlan.importRows.slice(0, 8).map(({ row }) => row),
      };
      if (commit !== true) {
        res.json({ ok: true, preview });
        return;
      }
      if (initialPlan.importRows.length === 0 && initialPlan.matchedExisting === 0) {
        res.status(400).json({ error: "The import does not contain any valid contacts to reconcile.", preview });
        return;
      }

      // Imports are always private to the active account, including admin imports.
      // This avoids accidentally publishing a customer's uploaded list globally.
      const selectedCategory = typeof category === "string" ? category.trim() : "";
      const result = await db.transaction(async (tx) => {
        // Serialize import commits for this account. The schema intentionally
        // allows manual duplicates, so a transaction-scoped advisory lock is
        // safer than adding broad uniqueness constraints.
        if (process.env.NODE_ENV !== "test") {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-import:${accountId}`}))`);
        }
        const safeKey = typeof idempotencyKey === "string" ? idempotencyKey.trim().slice(0, 160) : "";
        if (safeKey) {
          const prior = await tx.select({ summary: mediaImportBatchesTable.summary })
            .from(mediaImportBatchesTable)
            .where(and(eq(mediaImportBatchesTable.accountId, accountId), eq(mediaImportBatchesTable.idempotencyKey, safeKey)))
            .limit(1);
          if (prior[0]) return { ...(prior[0].summary as Record<string, number>), replayed: true };
        }
        const existingOutlets = await tx
          .select({
            id: mediaOutletsTable.id,
            name: mediaOutletsTable.name,
            website: mediaOutletsTable.website,
          })
          .from(mediaOutletsTable)
          .where(and(
            isNull(mediaOutletsTable.deletedAt),
            or(eq(mediaOutletsTable.accountId, accountId), isNull(mediaOutletsTable.accountId)),
          ));
        const existingContacts = await tx
          .select({
            id: mediaContactsTable.id,
            outletId: mediaContactsTable.outletId,
            firstName: mediaContactsTable.firstName,
            lastName: mediaContactsTable.lastName,
            email: mediaContactsTable.email,
            sectors: mediaContactsTable.sectors,
          })
          .from(mediaContactsTable)
          .where(and(isNull(mediaContactsTable.deletedAt), eq(mediaContactsTable.accountId, accountId)));

        const commitPlan = planMediaImport(parsed.rows, existingOutlets, existingContacts);
        const outletIdByRef = new Map(existingOutlets.map((outlet) => [`existing:${outlet.id}`, outlet.id]));
        let outletsCreated = 0;
        let contactsCreated = 0;

        for (const { row, outletRef } of commitPlan.importRows) {
          let outletId = outletIdByRef.get(outletRef);
          if (!outletId) {
            const [created] = await tx.insert(mediaOutletsTable).values({
              name: row.outletName,
              category: selectedCategory || row.sector || "",
              website: row.website,
              description: row.description,
              country: row.country,
              reachBand: row.reachBand,
              accountId,
            }).returning({ id: mediaOutletsTable.id });
            outletId = created.id;
            outletIdByRef.set(outletRef, outletId);
            outletsCreated += 1;
          }

          await tx.insert(mediaContactsTable).values({
            outletId,
            firstName: row.firstName,
            lastName: row.lastName,
            role: row.role,
            email: row.email,
            phone: "",
            notes: buildMediaContactNotes(row),
            beats: row.beat ? row.beat.split(/[;,|]/).map((value) => value.trim()).filter(Boolean) : [],
            sectors: Array.from(new Set(parsed.rows
              .filter((candidate: MediaImportRow) => row.email && candidate.email === row.email)
              .flatMap((candidate: MediaImportRow) => [candidate.sector, selectedCategory])
              .filter((value: string | undefined): value is string => !!value))),
            sourceRef: `${row.sheetName ?? "CSV"}:${row.sourceRow}`,
            linkedinUrl: row.linkedinUrl ?? "",
            sourceUrl: row.sourceUrl ?? "",
            publicationReach: row.reachBand,
            publicationAuthority: row.publicationAuthority ?? "",
            journalistAuthority: row.journalistAuthority ?? "",
            confidence: row.confidence,
            reviewNotes: row.reviewNotes ?? "",
            lastVerifiedAt: row.verifiedDate && !Number.isNaN(Date.parse(row.verifiedDate)) ? new Date(row.verifiedDate) : null,
            provenance: { importFilename: typeof filename === "string" ? filename.slice(0, 500) : "", sheet: row.sheetName ?? "", sourceRow: row.sourceRow },
            accountId,
          });
          contactsCreated += 1;
        }
        // Reconciliation updates workbook/source-owned metadata for canonical
        // email matches, but never overwrites an explicitly user-owned field.
        const matched = existingContacts.filter((contact) => contact.email);
        const overrides = matched.length ? await tx.select({ contactId: mediaContactFieldOverridesTable.contactId, fieldName: mediaContactFieldOverridesTable.fieldName })
          .from(mediaContactFieldOverridesTable).where(eq(mediaContactFieldOverridesTable.accountId, accountId)) : [];
        const overridden = new Set(overrides.map((entry) => `${entry.contactId}:${entry.fieldName}`));
        for (const row of parsed.rows) {
          if (!row.email) continue;
          const contact = matched.find((candidate) => candidate.email.trim().toLowerCase() === row.email);
          if (!contact) continue;
          const next: Record<string, unknown> = {
            role: row.role, linkedinUrl: row.linkedinUrl ?? "", sourceUrl: row.sourceUrl ?? "", sourceRef: `${row.sheetName ?? "CSV"}:${row.sourceRow}`,
            publicationReach: row.reachBand, publicationAuthority: row.publicationAuthority ?? "", journalistAuthority: row.journalistAuthority ?? "",
            confidence: row.confidence, reviewNotes: row.reviewNotes ?? "", beats: row.beat ? row.beat.split(/[;,|]/).map((value: string) => value.trim()).filter(Boolean) : [],
            sectors: Array.from(new Set([...(contact.sectors ?? []), ...(row.sector ? [row.sector] : []), ...(selectedCategory ? [selectedCategory] : [])])),
          };
          for (const key of Object.keys(next)) if (overridden.has(`${contact.id}:${key}`)) delete next[key];
          if (Object.keys(next).length) await tx.update(mediaContactsTable).set(next).where(eq(mediaContactsTable.id, contact.id));
        }
        const summary = {
          outletsCreated,
          contactsCreated,
          duplicatesSkipped: commitPlan.duplicatesSkipped,
        };
        await tx.insert(mediaImportBatchesTable).values({
          accountId,
          idempotencyKey: safeKey || null,
          sourceFilename: typeof filename === "string" ? filename.slice(0, 500) : "",
          sourceType: typeof xlsxBase64 === "string" ? "xlsx" : Array.isArray(rows) ? "parsed" : "csv",
          summary,
          committedAt: new Date(),
        });
        return summary;
      });

      req.log.info({
        accountId,
        validRows: parsed.rows.length,
        invalidRows: parsed.errors.length,
        ...result,
      }, "Media database CSV import completed");
      res.json({ ok: true, preview, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import CSV.";
      req.log.warn({ err: error }, "Media database CSV import rejected");
      res.status(400).json({ error: message });
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
      // Custom categories are always scoped to the creating account - 
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
      const requestingAccount = normUsername(req.account!.username);
      if (!isAdmin(req) && row.accountId !== requestingAccount) {
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

const RICH_CONTACT_STRING_FIELDS = [
  "firstName", "lastName", "role", "email", "phone", "notes", "mobile",
  "linkedinUrl", "twitterHandle", "geography", "language", "seniority",
  "editorialStatus", "sourceUrl", "sourceRef", "publicationReach",
  "publicationAuthority", "journalistAuthority", "confidence", "reviewNotes",
] as const;

function cleanContactStrings(body: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of RICH_CONTACT_STRING_FIELDS) {
    if (typeof body[field] === "string") values[field] = body[field].trim().slice(0, field === "notes" || field === "reviewNotes" ? 8000 : 2000);
  }
  return values;
}

function cleanContactArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))).slice(0, 30);
}

function cleanVerifiedDate(value: unknown): Date | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  const parsed = new Date(value);
  return parsed.getTime() > Date.now() + 60_000 ? undefined : parsed;
}

const SEARCH_STOP_WORDS = MEDIA_RECOMMENDATION_STOP_WORDS;
const SEARCH_EXPANSIONS: Record<string, string[]> = {
  ai: ["ai", "artificial intelligence"],
  fintech: ["fintech", "financial technology"],
  tech: ["tech", "technology"],
  uk: ["uk", "united kingdom", "britain", "british"],
  us: ["us", "usa", "united states", "american"],
};

function searchTokens(query: string): string[][] {
  const tokens: string[] = query.match(/[a-z0-9-]+/g) ?? [];
  return tokens
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
    .map((token) => SEARCH_EXPANSIONS[token] ?? [token]);
}

function countryMatchesFilter(filter: string, country: string, geography: string): boolean {
  if (!filter) return true;
  const haystack = `${country} ${geography}`.toLowerCase();
  if (filter === "uk") return /\b(uk|united kingdom|britain|british|england|scotland|wales|london)\b/.test(haystack);
  if (filter === "us") return /\b(us|usa|united states|american|new york|washington|california)\b/.test(haystack);
  return haystack.includes(filter);
}

function normalisedOutletDomain(value: string): string {
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function inferredOutletCountry(geography: string): string {
  const value = geography.toLowerCase();
  if (/\b(us|usa|united states|american|new york|washington|california|chicago|boston|texas)\b/.test(value)) return "United States";
  if (/\b(uk|united kingdom|britain|british|england|scotland|wales|london)\b/.test(value)) return "United Kingdom";
  return geography.trim();
}

const SEARCH_FIELDS = ["phrase", "topic", "location", "category"] as const;

function cleanSearchValue(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function authorityNumber(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchedTextFields(fields: Record<string, unknown>, terms: string[]): string[] {
  if (!terms.length) return [];
  return Object.entries(fields)
    .filter(([, value]) => terms.some((term) => String(value ?? "").toLowerCase().includes(term)))
    .map(([field]) => field);
}

router.get(
  "/store/media-db/search",
  requirePlatformAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const visible = await visibleAccounts(req);
      const workspaceId = normUsername(req.account!.username);
      const interpretation = Object.fromEntries(SEARCH_FIELDS.map((field) => [field, cleanSearchValue(req.query[field])])) as Record<typeof SEARCH_FIELDS[number], string>;
      const minimumAuthority = Math.max(0, Math.min(100, Number(req.query.authority) || 0));
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 25));
      const phraseGroups = searchTokens(interpretation.phrase.toLowerCase());
      const topicGroups = searchTokens(interpretation.topic.toLowerCase());
      const queryTerms = [...phraseGroups, ...topicGroups].flat();
      const phraseTerms = interpretation.phrase ? [interpretation.phrase.toLowerCase()] : [];

      const [contacts, outlets, statusEvents, correctionReports] = await Promise.all([
        db.select({
          contact: mediaContactsTable,
          outletName: mediaOutletsTable.name,
          outletCategory: mediaOutletsTable.category,
          outletWebsite: mediaOutletsTable.website,
          outletCountry: mediaOutletsTable.country,
          outletReachBand: mediaOutletsTable.reachBand,
          outletAccountId: mediaOutletsTable.accountId,
        }).from(mediaContactsTable).leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
          .where(isNull(mediaContactsTable.deletedAt)),
        db.select().from(mediaOutletsTable).where(isNull(mediaOutletsTable.deletedAt)),
        db.select().from(mediaContactStatusEventsTable).where(eq(mediaContactStatusEventsTable.accountId, workspaceId)).orderBy(desc(mediaContactStatusEventsTable.createdAt), desc(mediaContactStatusEventsTable.id)),
        db.select().from(mediaContactCorrectionReportsTable).where(and(eq(mediaContactCorrectionReportsTable.accountId, workspaceId), eq(mediaContactCorrectionReportsTable.status, "pending"))),
      ]);

      const latestStatus = new Map<number, typeof statusEvents[number]>();
      for (const event of statusEvents) if (!latestStatus.has(event.contactId)) latestStatus.set(event.contactId, event);
      const pendingCorrections = new Set(correctionReports.map((report) => report.contactId));
      const location = interpretation.location.toLowerCase();
      const category = interpretation.category.toLowerCase();

      const contactResults = contacts.flatMap(({ contact, outletName, outletCategory, outletWebsite, outletCountry, outletReachBand, outletAccountId }) => {
        if (contact.accountId !== null && visible !== null && !visible.includes(contact.accountId)) return [];
        const outletAllowed = outletVisible(outletAccountId ?? null, visible);
        const safeOutlet = outletAllowed ? { outletName, outletCategory, outletWebsite, outletCountry, outletReachBand } : { outletName: null, outletCategory: null, outletWebsite: null, outletCountry: null, outletReachBand: null };
        const searchable = {
          name: `${contact.firstName} ${contact.lastName}`.trim(), role: contact.role, email: contact.email,
          publication: safeOutlet.outletName, topic: [...contact.beats, ...contact.sectors].join(" "),
          location: `${contact.geography} ${safeOutlet.outletCountry ?? ""}`, category: safeOutlet.outletCategory, notes: contact.notes,
        };
        const topicCorpus = searchable.topic.toLowerCase();
        const matchedFields = matchedTextFields(searchable, queryTerms);
        if (phraseGroups.some((alternatives) => !alternatives.some((term) => Object.values(searchable).some((value) => String(value ?? "").toLowerCase().includes(term))))) return [];
        if (topicGroups.some((alternatives) => !alternatives.some((term) => topicCorpus.includes(term)))) return [];
        if (location && !countryMatchesFilter(location, safeOutlet.outletCountry ?? "", contact.geography)) return [];
        if (category && !String(safeOutlet.outletCategory ?? "").toLowerCase().includes(category) && !contact.sectors.some((sector) => sector.toLowerCase().includes(category))) return [];
        const authority = Math.max(authorityNumber(contact.journalistAuthority), authorityNumber(contact.publicationAuthority));
        if (authority < minimumAuthority) return [];
        const phraseMatches = phraseTerms.filter((phrase) => Object.values(searchable).some((value) => String(value ?? "").toLowerCase().includes(phrase)));
        const status = latestStatus.get(contact.id)?.status ?? "active";
        const reasons = [
          matchedFields.length ? `Matched ${matchedFields.slice(0, 3).join(", ")}.` : "Matches the selected filters.",
          phraseMatches.length ? `Contains the exact phrase "${interpretation.phrase}".` : interpretation.phrase ? "Related topic terms match, but the full phrase was not found." : "",
          authority ? `Authority ${authority}.` : "",
        ].filter(Boolean);
        return [{ type: "contact" as const, id: contact.id, contact: { ...contact, ...safeOutlet, lifecycleStatus: status, hasPendingCorrection: pendingCorrections.has(contact.id) }, matchedFields, matchedPhrases: phraseMatches, reasons, authority }];
      });

      const outletResults = outlets.flatMap((outlet) => {
        if (!outletVisible(outlet.accountId, visible)) return [];
        // Outlets do not currently store a standalone authority score. When an
        // authority threshold is active, return only contacts with measured
        // journalist/publication authority instead of implying an outlet score.
        if (minimumAuthority > 0) return [];
        const searchable = { publication: outlet.name, topic: outlet.description, location: outlet.country, category: outlet.category, website: outlet.website };
        const topicCorpus = `${outlet.description} ${outlet.category}`.toLowerCase();
        const matchedFields = matchedTextFields(searchable, queryTerms);
        if (phraseGroups.some((alternatives) => !alternatives.some((term) => Object.values(searchable).some((value) => String(value).toLowerCase().includes(term))))) return [];
        if (topicGroups.some((alternatives) => !alternatives.some((term) => topicCorpus.includes(term)))) return [];
        if (location && !countryMatchesFilter(location, outlet.country, "")) return [];
        if (category && !outlet.category.toLowerCase().includes(category)) return [];
        const phraseMatches = phraseTerms.filter((phrase) => Object.values(searchable).some((value) => String(value).toLowerCase().includes(phrase)));
        return [{ type: "outlet" as const, id: outlet.id, outlet, matchedFields, matchedPhrases: phraseMatches, reasons: [matchedFields.length ? `Matched ${matchedFields.slice(0, 3).join(", ")}.` : "Matches the selected filters.", phraseMatches.length ? `Contains the exact phrase "${interpretation.phrase}".` : ""].filter(Boolean), authority: 0 }];
      });

      const results = [...contactResults, ...outletResults].sort((a, b) =>
        Number(b.matchedPhrases.length > 0) - Number(a.matchedPhrases.length > 0)
        || b.matchedFields.length - a.matchedFields.length
        || b.authority - a.authority
        || a.type.localeCompare(b.type)
        || a.id - b.id);
      res.json({
        interpretation: { ...interpretation, authority: minimumAuthority },
        results: results.slice((page - 1) * pageSize, page * pageSize),
        total: results.length, page, pageSize,
        counts: { contacts: contactResults.length, outlets: outletResults.length },
      });
    } catch (error) {
      req.log.warn({ err: error }, "Media database unified search failed");
      res.status(500).json({ error: "Failed to search the media database" });
    }
  },
);

router.post("/store/media-db/contacts/:id/status", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!id || (status !== "active" && status !== "departed")) { res.status(400).json({ error: "Choose a valid contact status." }); return; }
  const access = await visibleContact(req, id);
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return; }
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
  const workspaceId = normUsername(req.account!.username);
  const actorId = req.account!.userId ?? req.platformUser?.id ?? workspaceId;
  const [event] = await db.insert(mediaContactStatusEventsTable).values({
    contactId: id, accountId: workspaceId, status, note, createdBy: actorId,
  }).returning();
  res.json({ ok: true, statusEvent: event });
});

router.post("/store/media-db/contacts/:id/corrections", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid contact id." }); return; }
  const access = await visibleContact(req, id);
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return; }
  const details = typeof req.body?.details === "string" ? req.body.details.trim().slice(0, 4000) : "";
  const reportableFields = new Set(["firstName", "lastName", "role", "email", "phone", "mobile", "outletId", "linkedinUrl", "twitterHandle", "sourceUrl"]);
  const fields = cleanContactArray(req.body?.fields)?.filter((field) => reportableFields.has(field)) ?? [];
  if (!details || fields.length === 0) { res.status(400).json({ error: "Select at least one field and explain what needs review." }); return; }
  const workspaceId = normUsername(req.account!.username);
  const actorId = req.account!.userId ?? req.platformUser?.id ?? workspaceId;
  const [report] = await db.insert(mediaContactCorrectionReportsTable).values({
    contactId: id, accountId: workspaceId, fields, details, reportedBy: actorId,
  }).returning();
  res.json({ ok: true, correction: report });
});

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
          mobile: mediaContactsTable.mobile,
          linkedinUrl: mediaContactsTable.linkedinUrl,
          twitterHandle: mediaContactsTable.twitterHandle,
          beats: mediaContactsTable.beats,
          sectors: mediaContactsTable.sectors,
          geography: mediaContactsTable.geography,
          language: mediaContactsTable.language,
          seniority: mediaContactsTable.seniority,
          editorialStatus: mediaContactsTable.editorialStatus,
          sourceUrl: mediaContactsTable.sourceUrl,
          sourceRef: mediaContactsTable.sourceRef,
          publicationReach: mediaContactsTable.publicationReach,
          publicationAuthority: mediaContactsTable.publicationAuthority,
          journalistAuthority: mediaContactsTable.journalistAuthority,
          confidence: mediaContactsTable.confidence,
          reviewNotes: mediaContactsTable.reviewNotes,
          provenance: mediaContactsTable.provenance,
          lastVerifiedAt: mediaContactsTable.lastVerifiedAt,
          sourceCheckClaimedAt: mediaContactsTable.sourceCheckClaimedAt,
          sourceCheckFailureCount: mediaContactsTable.sourceCheckFailureCount,
          accountId: mediaContactsTable.accountId,
          createdAt: mediaContactsTable.createdAt,
          outletName: mediaOutletsTable.name,
          outletCategory: mediaOutletsTable.category,
          outletWebsite: mediaOutletsTable.website,
          outletCountry: mediaOutletsTable.country,
          outletReachBand: mediaOutletsTable.reachBand,
        })
        .from(mediaContactsTable)
        .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
        .where(isNull(mediaContactsTable.deletedAt))
        .orderBy(mediaContactsTable.lastName, mediaContactsTable.firstName);

      // Global contacts (accountId null) are visible to all; otherwise filter by hierarchy.
      // Mask outlet metadata when the joined outlet belongs to a non-visible account - 
      // prevents leaking private outlet names through the contacts join.
      const results = rows
        .filter((r) => {
          if (r.accountId === null) return true;
          if (visible === null) return true;
          return visible.includes(r.accountId);
        })
        .map((r) => {
          const outletAccountId = r.outletName != null
            ? (rows.find((x) => x.id === r.id) as { outletAccountId?: string | null } | undefined)?.outletAccountId ?? null
            : null;
          return r;
        });
      // Second-pass: strip outlet info if we can't verify outlet visibility.
      // Since the join only returns a name (not the outlet's accountId), we do a
      // conservative allow-list: expose outlet fields only for outlets we can
      // confirm are visible (globally or via the caller's hierarchy).
      // We need the outlet accountId - re-fetch outlet IDs visible to this caller.
      const visibleOutletIds = new Set<number>();
      if (results.some((r) => r.outletId)) {
        const outletRows = await db
          .select({ id: mediaOutletsTable.id, accountId: mediaOutletsTable.accountId })
          .from(mediaOutletsTable)
          .where(isNull(mediaOutletsTable.deletedAt));
        for (const o of outletRows) {
          if (outletVisible(o.accountId, visible)) visibleOutletIds.add(o.id);
        }
      }
      const safeResults = results.map((r) => {
        if (r.outletId && !visibleOutletIds.has(r.outletId)) {
          return { ...r, outletName: null, outletCategory: null, outletWebsite: null, outletCountry: null, outletReachBand: null };
        }
        return r;
      });
      const contactIds = safeResults.map((contact) => contact.id);
      const checks = contactIds.length
        ? await db.select().from(mediaContactSourceChecksTable)
          .where(inArray(mediaContactSourceChecksTable.contactId, contactIds))
          .orderBy(desc(mediaContactSourceChecksTable.checkedAt), desc(mediaContactSourceChecksTable.id))
        : [];
      const latestCheckByContact = new Map<string, typeof checks[number]>();
      for (const check of checks) {
        const key = `${check.contactId}\0${check.sourceUrl}`;
        if (!latestCheckByContact.has(key)) latestCheckByContact.set(key, check);
      }
      const now = Date.now();
      const contactsWithSourceHealth = safeResults.map((contact) => {
        const sourceCheck = latestCheckByContact.get(`${contact.id}\0${contact.sourceUrl}`) ?? null;
        const sourceReviewDueAt = mediaSourceNextDueAt(sourceCheck, contact.sourceCheckFailureCount);
        const sourceStatus = !contact.sourceUrl ? "unverified"
          : !sourceCheck || (sourceReviewDueAt && sourceReviewDueAt.getTime() <= now) ? "due"
            : sourceCheck.outcome;
        return {
          ...contact,
          sourceCheck,
          sourceStatus,
          sourceReviewDueAt,
          sourceCheckQueued: Boolean(contact.sourceCheckClaimedAt),
        };
      });
      // Server-side pagination/filtering keeps large imported lists usable while
      // preserving the legacy `contacts` envelope for existing callers.
      const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
      const country = typeof req.query.country === "string" ? req.query.country.trim().toLowerCase() : "";
      const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
      const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize) || 50));
      const sort = ["firstName", "lastName", "role", "email", "outletName", "createdAt"].includes(String(req.query.sort))
        ? String(req.query.sort) : "lastName";
      const direction = req.query.direction === "desc" ? -1 : 1;
      const filtered = contactsWithSourceHealth.filter((contact) => {
        const haystack = [contact.firstName, contact.lastName, contact.role, contact.email, contact.outletName, contact.outletCategory, contact.outletCountry, contact.notes, contact.reviewNotes, contact.geography, contact.beats.join(" "), contact.sectors.join(" ")]
          .filter(Boolean).join(" ").toLowerCase();
        const queryGroups = searchTokens(query);
        return (!query || queryGroups.every((alternatives) => alternatives.some((token) => haystack.includes(token))))
          && (!category || (contact.outletCategory ?? "").toLowerCase().includes(category))
          && countryMatchesFilter(country, contact.outletCountry ?? "", contact.geography);
      }).sort((a, b) => {
        const av = String(a[sort as keyof typeof a] ?? "").toLowerCase();
        const bv = String(b[sort as keyof typeof b] ?? "").toLowerCase();
        return av.localeCompare(bv) * direction || a.id - b.id;
      });
      res.json({ contacts: filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: filtered.length });
    } catch {
      res.status(500).json({ error: "Failed to load contacts" });
    }
  },
);

router.post("/store/media-db/contacts/:id/source-check", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid contact id" }); return; }
  const access = await editableContact(req, id);
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return; }
  if (!access.row.sourceUrl) { res.status(400).json({ error: "This contact has no public source to check." }); return; }
  const checkedAt = new Date();
  const claimed = await claimMediaContactForManualReverification(access.row, checkedAt);
  if (!claimed) { res.status(409).json({ error: "This source is already being checked. Try again shortly." }); return; }
  const outcome = await reverifyClaimedMediaContact(claimed, { now: checkedAt });
  if (outcome === "lost-claim") { res.status(409).json({ error: "The source changed while it was being checked. Run the check again." }); return; }
  const [sourceCheck] = await db.select().from(mediaContactSourceChecksTable)
    .where(and(
      eq(mediaContactSourceChecksTable.contactId, id),
      eq(mediaContactSourceChecksTable.sourceUrl, claimed.sourceUrl),
      eq(mediaContactSourceChecksTable.checkedAt, checkedAt),
    ))
    .orderBy(desc(mediaContactSourceChecksTable.id))
    .limit(1);
  if (!sourceCheck) { res.status(500).json({ error: "The source check could not be saved." }); return; }
  const failureCount = outcome === "unavailable" ? claimed.sourceCheckFailureCount + 1 : 0;
  res.json({ ok: true, sourceCheck, sourceReviewDueAt: mediaSourceNextDueAt(sourceCheck, failureCount) });
});

router.post("/store/media-db/contacts/:id/source-checks/:checkId/approve", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const checkId = Number(req.params.checkId);
  if (!id || !checkId) { res.status(400).json({ error: "Invalid source check" }); return; }
  const access = await editableContact(req, id);
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return; }
  const [check] = await db.select().from(mediaContactSourceChecksTable)
    .where(and(eq(mediaContactSourceChecksTable.id, checkId), eq(mediaContactSourceChecksTable.contactId, id), eq(mediaContactSourceChecksTable.accountId, access.owner)))
    .limit(1);
  if (!check) { res.status(404).json({ error: "Source check not found" }); return; }
  const overrides = await db.select({ fieldName: mediaContactFieldOverridesTable.fieldName })
    .from(mediaContactFieldOverridesTable)
    .where(and(eq(mediaContactFieldOverridesTable.contactId, id), eq(mediaContactFieldOverridesTable.accountId, access.owner)));
  const { updates, applied, skipped } = approvedSourceUpdates(check.differences, req.body?.fields, overrides.map((item) => item.fieldName));
  if (applied.length) await db.update(mediaContactsTable).set({ ...updates, updatedAt: new Date() }).where(eq(mediaContactsTable.id, id));
  await db.update(mediaContactSourceChecksTable).set({ reviewedAt: new Date() }).where(eq(mediaContactSourceChecksTable.id, checkId));
  res.json({ ok: true, applied, skipped });
});

router.post(
  "/store/media-db/contacts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { outletId, firstName, lastName } = body;
      if (!firstName && !lastName) {
        res.status(400).json({ error: "Contact must have at least a first or last name" });
        return;
      }
      // Validate outletId: caller must have visibility over the chosen outlet.
      let resolvedOutletId: number | null = null;
      if (outletId) {
        const numOutletId = Number(outletId);
        if (numOutletId) {
          const visible = await visibleAccounts(req);
          const outletRow = await db.select({ id: mediaOutletsTable.id, accountId: mediaOutletsTable.accountId, deletedAt: mediaOutletsTable.deletedAt }).from(mediaOutletsTable).where(eq(mediaOutletsTable.id, numOutletId)).limit(1);
          if (!outletRow[0] || outletRow[0].deletedAt) {
            res.status(400).json({ error: "Outlet not found" });
            return;
          }
          if (!outletVisible(outletRow[0].accountId, visible)) {
            res.status(403).json({ error: "You cannot link to this outlet" });
            return;
          }
          resolvedOutletId = numOutletId;
        }
      }
      // Admins can create global contacts (accountId = null)
      const accountId = isAdmin(req) ? null : normUsername(req.account!.username);
      const stringValues = cleanContactStrings(body);
      const beats = cleanContactArray(body.beats);
      const sectors = cleanContactArray(body.sectors);
      const lastVerifiedAt = cleanVerifiedDate(body.lastVerifiedAt);
      const [created] = await db
        .insert(mediaContactsTable)
        .values({
          outletId: resolvedOutletId,
          firstName: typeof firstName === "string" ? firstName.trim() : "",
          lastName: typeof lastName === "string" ? lastName.trim() : "",
          ...stringValues,
          ...(beats ? { beats } : {}),
          ...(sectors ? { sectors } : {}),
          ...(lastVerifiedAt !== undefined ? { lastVerifiedAt } : {}),
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
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { outletId } = body;
      // Validate outletId if supplied - caller must be able to see that outlet.
      let resolvedOutletId = row.outletId;
      if (outletId !== undefined) {
        if (!outletId) {
          resolvedOutletId = null;
        } else {
          const numOid = Number(outletId);
          if (numOid) {
            const visible = await visibleAccounts(req);
            const outletRow = await db.select({ id: mediaOutletsTable.id, accountId: mediaOutletsTable.accountId, deletedAt: mediaOutletsTable.deletedAt }).from(mediaOutletsTable).where(eq(mediaOutletsTable.id, numOid)).limit(1);
            if (!outletRow[0] || outletRow[0].deletedAt) {
              res.status(400).json({ error: "Outlet not found" });
              return;
            }
            if (!outletVisible(outletRow[0].accountId, visible)) {
              res.status(403).json({ error: "You cannot link to this outlet" });
              return;
            }
            resolvedOutletId = numOid;
          }
        }
      }
      const stringValues = cleanContactStrings(body);
      const sourceUrlChanged = typeof stringValues.sourceUrl === "string"
        && stringValues.sourceUrl !== row.sourceUrl;
      const beats = cleanContactArray(body.beats);
      const sectors = cleanContactArray(body.sectors);
      const lastVerifiedAt = cleanVerifiedDate(body.lastVerifiedAt);
      const [updated] = await db
        .update(mediaContactsTable)
        .set({
          outletId: resolvedOutletId,
          ...stringValues,
          ...(beats ? { beats } : {}),
          ...(sectors ? { sectors } : {}),
          ...(lastVerifiedAt !== undefined ? { lastVerifiedAt } : {}),
          ...(sourceUrlChanged ? {
            sourceCheckClaimedAt: null,
            sourceCheckClaimToken: null,
            sourceCheckFailureCount: 0,
          } : {}),
          updatedAt: new Date(),
        })
        .where(eq(mediaContactsTable.id, numId))
        .returning();
      // Only values that actually changed become user-owned. The edit form
      // submits the whole record, so treating every supplied value as an
      // override would block later workbook refreshes for untouched fields.
      const owner = mediaOverrideOwner(row.accountId);
      for (const fieldName of RICH_CONTACT_STRING_FIELDS) {
        const value = body[fieldName];
        if (typeof value !== "string" || value.trim() === row[fieldName]) continue;
        await db.delete(mediaContactFieldOverridesTable).where(and(eq(mediaContactFieldOverridesTable.contactId, numId), eq(mediaContactFieldOverridesTable.accountId, owner), eq(mediaContactFieldOverridesTable.fieldName, fieldName)));
        await db.insert(mediaContactFieldOverridesTable).values({ contactId: numId, accountId: owner, fieldName, value: value.trim() });
      }
      for (const fieldName of ["beats", "sectors"] as const) {
        const value = cleanContactArray(body[fieldName]);
        if (!value || JSON.stringify(value) === JSON.stringify(row[fieldName])) continue;
        await db.delete(mediaContactFieldOverridesTable).where(and(eq(mediaContactFieldOverridesTable.contactId, numId), eq(mediaContactFieldOverridesTable.accountId, owner), eq(mediaContactFieldOverridesTable.fieldName, fieldName)));
        await db.insert(mediaContactFieldOverridesTable).values({ contactId: numId, accountId: owner, fieldName, value: JSON.stringify(value) });
      }
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

async function assertProjectVisible(req: Request, projectId: string): Promise<boolean> {
  if (!inAssignedScope(req, projectId)) return false;
  const visible = await visibleAccounts(req);
  const project = await db.select({ owner: projectsTable.owner, deletedAt: projectsTable.deletedAt })
    .from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  return !!project[0] && !project[0].deletedAt
    && (visible === null || (!!project[0].owner && visible.includes(project[0].owner)));
}

async function visibleProjectOwner(req: Request, projectId: string): Promise<string | null> {
  if (!inAssignedScope(req, projectId)) return null;
  const visible = await visibleAccounts(req);
  const [project] = await db.select({ owner: projectsTable.owner, deletedAt: projectsTable.deletedAt }).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  if (!project || project.deletedAt || !project.owner || (visible !== null && !visible.includes(project.owner))) return null;
  return project.owner;
}

type RefinementContact = {
  id: number;
  beats: string[];
  sectors: string[];
  geography: string;
  role: string;
  outletCategory?: string | null;
};

type PhraseAttribution = {
  phraseId: string;
  phraseText: string;
  matchKind: "exact" | "topic";
  exactPhraseMatch: string;
  articleFit: string;
  publicationAuthorityContext: string;
  suggestedPlacementAngle: string;
};

const normaliseSubmittedPhrases = normaliseSubmittedExactTargetPhrases;

function hasForgedPhraseId(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((raw) => {
    if (!raw || typeof raw !== "object") return true;
    const item = raw as Record<string, unknown>;
    const group = item.intentGroup;
    const text = typeof item.text === "string" ? item.text.trim().replace(/\s+/g, " ").slice(0, 500) : "";
    return (group !== "discovery" && group !== "shortlist" && group !== "comparison")
      || !text
      || typeof item.id !== "string"
      || item.id !== stableExactTargetPhraseId(group as ExactTargetPhrase["intentGroup"], text);
  });
}

function normalizedContactCorpus(contact: {
  role?: string | null;
  beats?: string[] | null;
  sectors?: string[] | null;
  notes?: string | null;
}): string {
  return [contact.role, ...(contact.beats ?? []), ...(contact.sectors ?? []), contact.notes]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function phraseMatchSignals(
  contact: { role?: string | null; beats?: string[] | null; sectors?: string[] | null; notes?: string | null },
  phrases: ExactTargetPhrase[],
): { exact: ExactTargetPhrase[]; topic: ExactTargetPhrase[] } {
  const corpus = normalizedContactCorpus(contact);
  const exact: ExactTargetPhrase[] = [];
  const topic: ExactTargetPhrase[] = [];
  for (const phrase of phrases) {
    if (corpus.includes(normaliseExactPhraseText(phrase.text))) {
      exact.push(phrase);
    } else if (phrase.text.split(/\s+/).some((word) => word.length > 3 && corpus.includes(normaliseExactPhraseText(word)))) {
      topic.push(phrase);
    }
  }
  return { exact, topic };
}

function buildPhraseAttributions(contact: {
  role?: string | null;
  beats?: string[] | null;
  sectors?: string[] | null;
  publicationAuthority?: string | null;
  publicationReach?: string | null;
  outletCategory?: string | null;
}, phrases: ExactTargetPhrase[]): PhraseAttribution[] {
  const matches = phraseMatchSignals(contact, phrases);
  const beat = [...(contact.beats ?? []), ...(contact.sectors ?? [])].find(Boolean) || contact.outletCategory || "this subject";
  return [...matches.exact, ...matches.topic].map((phrase) => {
    const isExactPhraseMatch = matches.exact.includes(phrase);
    return {
    phraseId: phrase.id,
    phraseText: phrase.text,
    matchKind: isExactPhraseMatch ? "exact" : "topic",
    exactPhraseMatch: isExactPhraseMatch
      ? "The full normalized exact phrase appears in the contact's recorded coverage profile."
      : "No full exact phrase match. Recorded topic/keyword overlap supports this as a related subject.",
    articleFit: `The contact's recorded coverage includes ${beat}.`,
    publicationAuthorityContext: [contact.publicationAuthority ? `Stored publication authority: ${contact.publicationAuthority}` : "", contact.publicationReach ? `Stored publication reach: ${contact.publicationReach}` : ""].filter(Boolean).join("; ") || "No publication authority or reach label is stored.",
    suggestedPlacementAngle: `Frame the article around ${phrase.text} for the contact's ${beat} coverage.`,
    };
  });
}

const normaliseSignals = (values: string[]) => new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));

export function refinementAdjustment(candidate: RefinementContact, example: RefinementContact): { points: number; signals: string[] } {
  const signals: string[] = [];
  const overlap = (left: string[], right: string[]) => {
    const other = normaliseSignals(right);
    return Array.from(normaliseSignals(left)).some((value) => other.has(value));
  };
  if (overlap(candidate.beats, example.beats)) signals.push("similar beats");
  if (overlap(candidate.sectors, example.sectors)) signals.push("similar sectors");
  if (candidate.geography.trim() && candidate.geography.trim().toLowerCase() === example.geography.trim().toLowerCase()) signals.push("similar geography");
  if (candidate.outletCategory?.trim() && candidate.outletCategory.trim().toLowerCase() === example.outletCategory?.trim().toLowerCase()) signals.push("similar outlet category");
  const candidateRoles = normaliseSignals(candidate.role.split(/\W+/).filter((value) => value.length > 3));
  const exampleRoles = normaliseSignals(example.role.split(/\W+/).filter((value) => value.length > 3));
  if (Array.from(candidateRoles).some((value) => exampleRoles.has(value))) signals.push("similar role");
  return { points: signals.length * 8, signals };
}

async function rerankRecommendationSet(accountId: string, projectId: string, storyKey: string) {
  const [set] = await db.select().from(mediaRecommendationSetsTable)
    .where(and(eq(mediaRecommendationSetsTable.accountId, accountId), eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey)))
    .orderBy(desc(mediaRecommendationSetsTable.id)).limit(1);
  if (!set) return [];
  const baseScores = (set.criteria && typeof set.criteria === "object" && !Array.isArray(set.criteria)
    ? (set.criteria as { baseScores?: Record<string, number> }).baseScores
    : undefined) ?? {};
  const [storedItems, feedback] = await Promise.all([
    db.select({ item: mediaRecommendationItemsTable, contact: mediaContactsTable, outletCategory: mediaOutletsTable.category })
      .from(mediaRecommendationItemsTable)
      .innerJoin(mediaContactsTable, eq(mediaRecommendationItemsTable.contactId, mediaContactsTable.id))
      .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
      .where(eq(mediaRecommendationItemsTable.recommendationSetId, set.id)),
    db.select().from(mediaRecommendationFeedbackTable).where(and(
      eq(mediaRecommendationFeedbackTable.accountId, accountId),
      eq(mediaRecommendationFeedbackTable.projectId, projectId),
      eq(mediaRecommendationFeedbackTable.storyKey, storyKey),
    )),
  ]);
  const contacts = new Map(storedItems.map(({ contact, outletCategory }) => [contact.id, { ...contact, outletCategory }]));
  const ranked = storedItems.map(({ item, contact, outletCategory }) => {
    let adjustment = 0;
    const refinementReasons: string[] = [];
    for (const entry of feedback) {
      const example = contacts.get(entry.contactId);
      if (!example) continue;
      if (entry.contactId === contact.id) {
        adjustment += entry.signal === "more" ? 18 : -18;
        refinementReasons.push(entry.signal === "more" ? "Marked More like this" : "Marked Less like this");
        continue;
      }
      const similarity = refinementAdjustment({ ...contact, outletCategory }, example);
      if (!similarity.points) continue;
      adjustment += entry.signal === "more" ? similarity.points : -similarity.points;
      refinementReasons.push(`${entry.signal === "more" ? "Favoured" : "Reduced"} by feedback: ${similarity.signals.join(", ")}`);
    }
    const baseScore = Number(baseScores[String(contact.id)]) || item.score;
    return { item, score: Math.max(0, Math.min(100, baseScore + adjustment)), reasons: [...item.reasons.filter((reason) => !reason.includes(" by feedback") && !reason.startsWith("Marked ")), ...refinementReasons] };
  }).sort((a, b) => b.score - a.score || a.item.contactId - b.item.contactId);
  await Promise.all(ranked.map((entry, index) => db.update(mediaRecommendationItemsTable)
    .set({ score: entry.score, reasons: entry.reasons, rank: index + 1 })
    .where(eq(mediaRecommendationItemsTable.id, entry.item.id))));
  return ranked;
}

// Deterministic, database-only recommendations. No LLM or external lookup is
// involved, making a story's shortlist repeatable and auditable.
router.post("/store/media-db/recommendations", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim().slice(0, 200) : "";
    const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
    const terms = Array.isArray(req.body?.terms) ? req.body.terms.filter((v: unknown) => typeof v === "string").map((v: string) => v.toLowerCase().trim()).filter(Boolean).slice(0, 30) : [];
    if (hasForgedPhraseId(req.body?.targetPhrases)) {
      res.status(400).json({ error: "Target phrase IDs do not match their exact text and intent group." });
      return;
    }
    const targetPhrases = normaliseSubmittedPhrases(req.body?.targetPhrases);
    if (!projectId || !storyKey || !(await assertProjectVisible(req, projectId))) { res.status(404).json({ error: "Project not found" }); return; }
    const accountId = normUsername(req.account!.username);
    const visible = await visibleAccounts(req);
    const contacts = (await db.select().from(mediaContactsTable).where(isNull(mediaContactsTable.deletedAt)))
      .filter((contact) => contact.accountId === null || visible === null || visible.includes(contact.accountId));
    const outlets = await db.select().from(mediaOutletsTable).where(isNull(mediaOutletsTable.deletedAt));
    const outletById = new Map(outlets.filter((outlet) => outletVisible(outlet.accountId, visible)).map((outlet) => [outlet.id, outlet]));
    const ranked = contacts.map((contact) => {
      const baseRecommendation = scoreMediaRecommendation(contact, terms);
      const phraseMatches = phraseMatchSignals(contact, targetPhrases);
      const reasons = [
        ...phraseMatches.exact.map((phrase) => `Exact target phrase appears in coverage profile: “${phrase.text}”`),
        ...phraseMatches.topic.map((phrase) => `Recorded topic/keyword overlap for target phrase: “${phrase.text}”`),
        ...baseRecommendation.reasons,
      ];
      const outlet = contact.outletId ? outletById.get(contact.outletId) : undefined;
      return {
        contact: {
          ...contact,
          outletName: outlet?.name ?? null,
          outletCategory: outlet?.category ?? null,
          outletWebsite: outlet?.website ?? null,
          outletCountry: outlet?.country ?? null,
          outletReachBand: outlet?.reachBand ?? null,
        },
        score: Math.min(100, phraseMatches.exact.length * 45 + phraseMatches.topic.length * 15 + baseRecommendation.score),
        reasons,
        phraseAttributions: buildPhraseAttributions({
          role: contact.role,
          beats: contact.beats,
          sectors: contact.sectors,
          publicationAuthority: outlet?.category ? contact.publicationAuthority : contact.publicationAuthority,
          publicationReach: outlet?.reachBand || contact.publicationReach,
          outletCategory: outlet?.category,
        }, targetPhrases),
      };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.contact.id - b.contact.id).slice(0, 100);
    const [set] = await db.insert(mediaRecommendationSetsTable).values({
      accountId,
      projectId,
      storyKey,
      criteria: { terms, targetPhrases, baseScores: Object.fromEntries(ranked.map((item) => [String(item.contact.id), item.score])) },
    }).returning();
    if (ranked.length) await db.insert(mediaRecommendationItemsTable).values(ranked.map((item, index) => ({ recommendationSetId: set.id, contactId: item.contact.id, score: item.score, reasons: item.reasons, phraseAttributions: item.phraseAttributions, rank: index + 1 })));
    const refined = await rerankRecommendationSet(accountId, projectId, storyKey);
    const contactById = new Map(ranked.map((item) => [item.contact.id, item.contact]));
    res.json({
      ok: true,
      recommendationSet: set,
      items: refined.map((entry, index) => ({
        rank: index + 1,
        contact: contactById.get(entry.item.contactId),
        score: entry.score,
        reasons: entry.reasons,
        phraseAttributions: entry.item.phraseAttributions,
      })),
    });
  } catch (error) { req.log.error({ err: error }, "media recommendations failed"); res.status(500).json({ error: "Failed to create recommendations" }); }
});

router.post("/store/media-db/discoveries", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const token = typeof req.body?.discoveryToken === "string" ? req.body.discoveryToken : "";
    const candidateKey = typeof req.body?.candidateKey === "string" ? req.body.candidateKey : "";
    const trusted = verifyMediaDiscoveries(token);
    const accountId = normUsername(req.account!.username);
    if (!trusted || trusted.accountId !== accountId) {
      res.status(400).json({ error: "This discovery has expired or is not valid for this account. Run the search again." });
      return;
    }
    const candidate = trusted.items.find((item) => item.candidateKey === candidateKey);
    if (!candidate) {
      res.status(400).json({ error: "This discovery is not present in the verified search results." });
      return;
    }
    const visible = await visibleAccounts(req);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`media-discovery:${accountId}`}))`);
      const visibleOutlets = (await tx.select().from(mediaOutletsTable).where(isNull(mediaOutletsTable.deletedAt)))
        .filter((row) => outletVisible(row.accountId, visible));
      const candidateDomain = normalisedOutletDomain(candidate.outletWebsite);
      let outlet = visibleOutlets.find((row) =>
        row.name.trim().toLowerCase() === candidate.outletName.toLowerCase()
        || (!!candidateDomain && normalisedOutletDomain(row.website) === candidateDomain),
      );
      if (!outlet) {
        [outlet] = await tx.insert(mediaOutletsTable).values({
          name: candidate.outletName,
          website: candidate.outletWebsite,
          category: candidate.sectors?.[0] ?? "",
          description: "",
          country: inferredOutletCountry(candidate.geography ?? ""),
          accountId,
        }).returning();
      }
      const ownContacts = await tx.select().from(mediaContactsTable).where(and(eq(mediaContactsTable.accountId, accountId), isNull(mediaContactsTable.deletedAt)));
      const verifiedEmail = candidate.email.trim().toLowerCase();
      const existing = ownContacts.find((row) =>
        row.outletId === outlet.id
        && row.firstName.trim().toLowerCase() === candidate.firstName.toLowerCase()
        && row.lastName.trim().toLowerCase() === candidate.lastName.toLowerCase()
        && (!verifiedEmail || !row.email || row.email.trim().toLowerCase() === verifiedEmail),
      );
      const discoveryNotes = mediaDiscoveryNotes(candidate);
      if (existing) {
        const mergedBeats = Array.from(new Set([...existing.beats, ...candidate.beats]));
        const mergedSectors = Array.from(new Set([...existing.sectors, ...(candidate.sectors ?? [])]));
        const mergedNotes = discoveryNotes && !existing.notes.includes(discoveryNotes)
          ? [existing.notes, discoveryNotes].filter(Boolean).join("\n\n")
          : existing.notes;
        const [contact] = await tx.update(mediaContactsTable).set({
          email: existing.email || verifiedEmail,
          role: existing.role || candidate.role,
          beats: mergedBeats,
          sectors: mergedSectors,
          geography: existing.geography || candidate.geography || "",
          sourceUrl: existing.sourceUrl || candidate.sourceUrl,
          sourceRef: existing.sourceRef || "Live public web research",
          confidence: existing.confidence || candidate.confidence,
          reviewNotes: existing.reviewNotes || candidate.evidence,
          notes: mergedNotes,
          provenance: {
            ...existing.provenance,
            latestPublicDiscovery: {
              provider: "OpenAI web search",
              sourceUrl: candidate.sourceUrl,
              evidence: candidate.evidence,
              discoveredAt: candidate.verifiedAt,
               recentBylines: candidate.recentBylines ?? [],
               journalistInterests: candidate.journalistInterests ?? [],
               mediaOpportunities: candidate.mediaOpportunities ?? [],
               mediaOpportunity: candidate.mediaOpportunity ?? "",
               modelDerivedFields: ["role", "beats", "sectors", "geography", "recentBylines", "journalistInterests", "mediaOpportunities", "mediaOpportunity"],
            },
          },
          updatedAt: new Date(),
        }).where(eq(mediaContactsTable.id, existing.id)).returning();
        return { contact, outlet, existing: true };
      }
      const verifiedAt = new Date(candidate.verifiedAt);
      const [contact] = await tx.insert(mediaContactsTable).values({
        outletId: outlet.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        role: candidate.role,
        email: verifiedEmail,
        beats: candidate.beats,
        sectors: candidate.sectors ?? [],
        geography: candidate.geography ?? "",
        sourceUrl: candidate.sourceUrl,
        sourceRef: "Live public web research",
        confidence: candidate.confidence,
        reviewNotes: candidate.evidence,
        notes: discoveryNotes,
        provenance: {
          provider: "OpenAI web search",
          sourceUrl: candidate.sourceUrl,
          evidence: candidate.evidence,
          discoveredAt: candidate.verifiedAt,
          recentBylines: candidate.recentBylines ?? [],
          journalistInterests: candidate.journalistInterests ?? [],
          mediaOpportunities: candidate.mediaOpportunities ?? [],
          mediaOpportunity: candidate.mediaOpportunity ?? "",
          modelDerivedFields: ["role", "beats", "sectors", "geography", "recentBylines", "journalistInterests", "mediaOpportunities", "mediaOpportunity"],
        },
        lastVerifiedAt: verifiedAt,
        accountId,
      }).returning();
      return { contact, outlet, existing: false };
    });
    res.status(result.existing ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    req.log.error({ err: error }, "saving live media discovery failed");
    res.status(500).json({ error: "Failed to save this discovery to the Media Database." });
  }
});

router.put("/store/media-db/recommendations/decisions", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, storyKey, contactId, decision, note } = req.body ?? {};
    if (typeof projectId !== "string" || typeof storyKey !== "string" || !Number(contactId) || !["shortlisted", "rejected", "contacted"].includes(decision) || !(await assertProjectVisible(req, projectId))) { res.status(400).json({ error: "Invalid recommendation decision or project" }); return; }
    const accountId = normUsername(req.account!.username);
    const visible = await visibleAccounts(req);
    const contact = await db.select({ accountId: mediaContactsTable.accountId }).from(mediaContactsTable).where(and(eq(mediaContactsTable.id, Number(contactId)), isNull(mediaContactsTable.deletedAt))).limit(1);
    if (!contact[0] || (contact[0].accountId !== null && visible !== null && !visible.includes(contact[0].accountId))) { res.status(403).json({ error: "Contact is not available to this account" }); return; }
    const existing = await db.select({ id: mediaRecommendationDecisionsTable.id }).from(mediaRecommendationDecisionsTable).where(and(eq(mediaRecommendationDecisionsTable.accountId, accountId), eq(mediaRecommendationDecisionsTable.projectId, projectId), eq(mediaRecommendationDecisionsTable.storyKey, storyKey), eq(mediaRecommendationDecisionsTable.contactId, Number(contactId)))).limit(1);
    const values = { decision, note: typeof note === "string" ? note.slice(0, 4000) : "" };
    const [row] = existing[0] ? await db.update(mediaRecommendationDecisionsTable).set(values).where(eq(mediaRecommendationDecisionsTable.id, existing[0].id)).returning() : await db.insert(mediaRecommendationDecisionsTable).values({ accountId, projectId, storyKey, contactId: Number(contactId), ...values }).returning();
    res.json({ ok: true, decision: row });
  } catch (error) { req.log.error({ err: error }, "media decision failed"); res.status(500).json({ error: "Failed to save recommendation decision" }); }
});

router.put("/store/media-db/recommendations/feedback", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
    const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
    const contactId = Number(req.body?.contactId);
    const signal = req.body?.signal;
    if (!projectId || !storyKey || !contactId || !["more", "less", null].includes(signal) || !(await assertProjectVisible(req, projectId))) {
      res.status(400).json({ error: "Invalid recommendation feedback or project" }); return;
    }
    const accountId = normUsername(req.account!.username);
    const [latestSet] = await db.select({ id: mediaRecommendationSetsTable.id }).from(mediaRecommendationSetsTable)
      .where(and(eq(mediaRecommendationSetsTable.accountId, accountId), eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey)))
      .orderBy(desc(mediaRecommendationSetsTable.id)).limit(1);
    const recommended = latestSet ? await db.select({ id: mediaRecommendationItemsTable.id }).from(mediaRecommendationItemsTable)
      .where(and(eq(mediaRecommendationItemsTable.recommendationSetId, latestSet.id), eq(mediaRecommendationItemsTable.contactId, contactId))).limit(1) : [];
    if (!recommended[0]) { res.status(404).json({ error: "Recommendation not found for this article" }); return; }
    const scope = and(eq(mediaRecommendationFeedbackTable.accountId, accountId), eq(mediaRecommendationFeedbackTable.projectId, projectId), eq(mediaRecommendationFeedbackTable.storyKey, storyKey), eq(mediaRecommendationFeedbackTable.contactId, contactId));
    if (signal === null) {
      await db.delete(mediaRecommendationFeedbackTable).where(scope);
    } else {
      const existing = await db.select({ id: mediaRecommendationFeedbackTable.id }).from(mediaRecommendationFeedbackTable).where(scope).limit(1);
      if (existing[0]) await db.update(mediaRecommendationFeedbackTable).set({ signal }).where(eq(mediaRecommendationFeedbackTable.id, existing[0].id));
      else await db.insert(mediaRecommendationFeedbackTable).values({ accountId, projectId, storyKey, contactId, signal });
    }
    await rerankRecommendationSet(accountId, projectId, storyKey);
    res.json({ ok: true });
  } catch (error) { req.log.error({ err: error }, "media refinement failed"); res.status(500).json({ error: "Failed to refine recommendations" }); }
});

router.delete("/store/media-db/recommendations/feedback", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
    const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
    if (!projectId || !storyKey || !(await assertProjectVisible(req, projectId))) { res.status(400).json({ error: "Invalid project or article" }); return; }
    const accountId = normUsername(req.account!.username);
    await db.delete(mediaRecommendationFeedbackTable).where(and(eq(mediaRecommendationFeedbackTable.accountId, accountId), eq(mediaRecommendationFeedbackTable.projectId, projectId), eq(mediaRecommendationFeedbackTable.storyKey, storyKey)));
    await rerankRecommendationSet(accountId, projectId, storyKey);
    res.json({ ok: true });
  } catch (error) { req.log.error({ err: error }, "media refinement reset failed"); res.status(500).json({ error: "Failed to reset recommendation refinement" }); }
});

router.get("/store/media-db/recommendations/decisions", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const storyKey = typeof req.query.storyKey === "string" ? req.query.storyKey : "";
  if (!projectId || !storyKey || !(await assertProjectVisible(req, projectId))) { res.status(404).json({ error: "Project not found" }); return; }
  const accountId = normUsername(req.account!.username);
  const decisions = await db.select().from(mediaRecommendationDecisionsTable).where(and(eq(mediaRecommendationDecisionsTable.accountId, accountId), eq(mediaRecommendationDecisionsTable.projectId, projectId), eq(mediaRecommendationDecisionsTable.storyKey, storyKey)));
  const visible = await visibleAccounts(req);
  // Re-running an automatic recommendation intentionally leaves the prior set
  // auditable. Only the newest scoped set is applicable to this view; loading
  // every historical set would render the same contact repeatedly.
  const sets = await db.select({ id: mediaRecommendationSetsTable.id })
    .from(mediaRecommendationSetsTable)
    .where(and(eq(mediaRecommendationSetsTable.accountId, accountId), eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey)))
    .orderBy(desc(mediaRecommendationSetsTable.createdAt), desc(mediaRecommendationSetsTable.id))
    .limit(1);
  const feedback = await db.select().from(mediaRecommendationFeedbackTable).where(and(eq(mediaRecommendationFeedbackTable.accountId, accountId), eq(mediaRecommendationFeedbackTable.projectId, projectId), eq(mediaRecommendationFeedbackTable.storyKey, storyKey)));
  const candidateItems = sets.length ? await db.select({ id: mediaRecommendationItemsTable.id, recommendationSetId: mediaRecommendationItemsTable.recommendationSetId, score: mediaRecommendationItemsTable.score, rank: mediaRecommendationItemsTable.rank, reasons: mediaRecommendationItemsTable.reasons, phraseAttributions: mediaRecommendationItemsTable.phraseAttributions, contact: mediaContactsTable, outletName: mediaOutletsTable.name, outletCategory: mediaOutletsTable.category, outletWebsite: mediaOutletsTable.website, outletCountry: mediaOutletsTable.country, outletReachBand: mediaOutletsTable.reachBand, outletAccountId: mediaOutletsTable.accountId, outletDeletedAt: mediaOutletsTable.deletedAt })
    .from(mediaRecommendationItemsTable)
    .innerJoin(mediaContactsTable, eq(mediaRecommendationItemsTable.contactId, mediaContactsTable.id))
    .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
    .where(and(eq(mediaRecommendationItemsTable.recommendationSetId, sets[0].id), isNull(mediaContactsTable.deletedAt))) : [];
  const seenContacts = new Set<number>();
  const items = filterVisibleRecommendationItems(candidateItems, visible).filter((item) => {
    if (seenContacts.has(item.contact.id)) return false;
    seenContacts.add(item.contact.id);
    return true;
  }).map((item) => {
    const canSeeOutlet = !item.outletDeletedAt && outletVisible(item.outletAccountId, visible);
    const outletFields = canSeeOutlet ? {
      outletName: item.outletName,
      outletCategory: item.outletCategory,
      outletWebsite: item.outletWebsite,
      outletCountry: item.outletCountry,
      outletReachBand: item.outletReachBand,
    } : {
      outletName: null,
      outletCategory: null,
      outletWebsite: null,
      outletCountry: null,
      outletReachBand: null,
    };
    return {
      ...item,
      ...outletFields,
      outletAccountId: undefined,
      outletDeletedAt: undefined,
      contact: { ...item.contact, ...outletFields },
    };
  });
  // A shortlisted decision is durable user state, not a claim that the
  // contact must remain in every newly generated recommendation set. Return
  // its currently visible contact details separately so the UI can preserve
  // the Accepted shortlist without reintroducing stale cards to `items`.
  const shortlistedIds = decisions.filter((decision) => decision.decision === "shortlisted").map((decision) => decision.contactId);
  const decisionContactRows = shortlistedIds.length ? await db.select({
    contact: mediaContactsTable,
    outletName: mediaOutletsTable.name,
    outletCategory: mediaOutletsTable.category,
    outletWebsite: mediaOutletsTable.website,
    outletCountry: mediaOutletsTable.country,
    outletReachBand: mediaOutletsTable.reachBand,
    outletAccountId: mediaOutletsTable.accountId,
    outletDeletedAt: mediaOutletsTable.deletedAt,
  }).from(mediaContactsTable)
    .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
    .where(and(inArray(mediaContactsTable.id, shortlistedIds), isNull(mediaContactsTable.deletedAt))) : [];
  const decisionContacts = decisionContactRows.flatMap((row) => {
    if (row.contact.accountId !== null && visible !== null && !visible.includes(row.contact.accountId)) return [];
    const canSeeOutlet = !row.outletDeletedAt && outletVisible(row.outletAccountId, visible);
    const outletFields = canSeeOutlet ? {
      outletName: row.outletName,
      outletCategory: row.outletCategory,
      outletWebsite: row.outletWebsite,
      outletCountry: row.outletCountry,
      outletReachBand: row.outletReachBand,
    } : {
      outletName: null,
      outletCategory: null,
      outletWebsite: null,
      outletCountry: null,
      outletReachBand: null,
    };
    return [{ contactId: row.contact.id, contact: { ...row.contact, ...outletFields } }];
  });
  res.json({ decisions, items, decisionContacts, feedback });
});

router.get("/store/media-db/outreach", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const storyKey = typeof req.query.storyKey === "string" ? req.query.storyKey : "";
  const accountId = projectId ? await visibleProjectOwner(req, projectId) : null;
  if (!accountId || !storyKey) { res.status(404).json({ error: "Project not found" }); return; }
  const outreach = await db.select().from(mediaOutreachTable).where(and(eq(mediaOutreachTable.accountId, accountId), eq(mediaOutreachTable.projectId, projectId), eq(mediaOutreachTable.storyKey, storyKey))).orderBy(desc(mediaOutreachTable.updatedAt));
  const ids = outreach.map((row) => row.id);
  let activities: Array<typeof mediaOutreachActivitiesTable.$inferSelect> = [];
  let placements: Array<typeof mediaPlacementsTable.$inferSelect> = [];
  if (ids.length) {
    [activities, placements] = await Promise.all([
      db.select().from(mediaOutreachActivitiesTable).where(inArray(mediaOutreachActivitiesTable.outreachId, ids)).orderBy(desc(mediaOutreachActivitiesTable.occurredAt)),
      db.select().from(mediaPlacementsTable).where(inArray(mediaPlacementsTable.outreachId, ids)).orderBy(desc(mediaPlacementsTable.publicationDate)),
    ]);
  }
  res.json({ outreach: outreach.map((row) => ({ ...row, activities: activities.filter((item) => item.outreachId === row.id), placements: placements.filter((item) => item.outreachId === row.id) })) });
});

router.post("/store/media-db/outreach", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
    const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
    const contactId = Number(req.body?.contactId);
    const accountId = projectId ? await visibleProjectOwner(req, projectId) : null;
    if (!accountId || !storyKey || !contactId || hasForgedPhraseId(req.body?.targetPhrases)) { res.status(400).json({ error: "Invalid outreach record or project" }); return; }
    const actorAccountId = normUsername(req.account!.username);
    const [contact] = await db.select({ contact: mediaContactsTable, outlet: mediaOutletsTable }).from(mediaContactsTable).leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id)).where(eq(mediaContactsTable.id, contactId)).limit(1);
    if (!contact || (contact.contact.accountId !== null && contact.contact.accountId !== accountId && contact.contact.accountId !== actorAccountId)) { res.status(403).json({ error: "Contact is not available to this project's workspace" }); return; }
    const existing = await db.select().from(mediaOutreachTable).where(and(eq(mediaOutreachTable.accountId, accountId), eq(mediaOutreachTable.projectId, projectId), eq(mediaOutreachTable.storyKey, storyKey), eq(mediaOutreachTable.contactId, contactId))).limit(1);
    if (existing[0]) { res.status(200).json({ ok: true, outreach: existing[0], existing: true }); return; }
    const status: MediaOutreachStatus = "planned";
    const actor = req.account!.username;
    const [row] = await db.transaction(async (tx) => {
      const created = await tx.insert(mediaOutreachTable).values({
        accountId, projectId, storyKey, contactId, outletId: contact.contact.outletId, status,
        articleSnapshot: { title: typeof req.body?.articleTitle === "string" ? req.body.articleTitle.slice(0, 500) : "" },
        contactSnapshot: { name: `${contact.contact.firstName} ${contact.contact.lastName}`.trim(), role: contact.contact.role, email: contact.contact.email },
        outletSnapshot: { name: contact.outlet?.name ?? "", website: contact.outlet?.website ?? "" },
        targetPhrases: normaliseSubmittedPhrases(req.body?.targetPhrases), responsibleTeamMember: typeof req.body?.responsibleTeamMember === "string" ? req.body.responsibleTeamMember.slice(0, 200) : "",
        notes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 10000) : "", createdBy: actor,
      }).returning();
      await tx.insert(mediaOutreachActivitiesTable).values({ outreachId: created[0].id, accountId, projectId, toStatus: status, note: "Outreach planned", actor });
      return created;
    });
    res.status(201).json({ ok: true, outreach: row });
  } catch (error) { req.log.error({ err: error }, "media outreach create failed"); res.status(500).json({ error: "Failed to create outreach record" }); }
});

router.put("/store/media-db/outreach/:id", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [candidate] = await db.select().from(mediaOutreachTable).where(eq(mediaOutreachTable.id, id)).limit(1);
    const accountId = candidate ? await visibleProjectOwner(req, candidate.projectId) : null;
    const current = candidate && accountId === candidate.accountId ? candidate : undefined;
    if (!current || !accountId) { res.status(404).json({ error: "Outreach record not found" }); return; }
    const nextStatus = req.body?.status as MediaOutreachStatus | undefined;
    if (nextStatus === "placed") { res.status(409).json({ error: "A placement can only be recorded with placement evidence." }); return; }
    if (nextStatus && nextStatus !== current.status && !OUTREACH_TRANSITIONS[current.status].includes(nextStatus)) { res.status(409).json({ error: `Cannot move outreach from ${current.status} to ${nextStatus}.` }); return; }
    if (nextStatus === "pitched" && !parseDate(req.body?.pitchDate) && !current.pitchDate) { res.status(400).json({ error: "A pitch date is required when marking outreach as pitched." }); return; }
    if (nextStatus === "responded" && !parseDate(req.body?.responseDate) && !current.responseDate) { res.status(400).json({ error: "A response date is required when recording a response." }); return; }
    const updates = {
      status: nextStatus ?? current.status,
      pitchDate: parseDate(req.body?.pitchDate) ?? current.pitchDate,
      responseDate: parseDate(req.body?.responseDate) ?? current.responseDate,
      notes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 10000) : current.notes,
      responsibleTeamMember: typeof req.body?.responsibleTeamMember === "string" ? req.body.responsibleTeamMember.slice(0, 200) : current.responsibleTeamMember,
    };
    const [row] = await db.transaction(async (tx) => {
      if (process.env.NODE_ENV !== "test") await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-outreach:${id}`}))`);
      const changed = await tx.update(mediaOutreachTable).set(updates).where(and(eq(mediaOutreachTable.id, id), eq(mediaOutreachTable.status, current.status))).returning();
      if (!changed[0]) return [];
      if (nextStatus && nextStatus !== current.status) await tx.insert(mediaOutreachActivitiesTable).values({ outreachId: id, accountId, projectId: current.projectId, fromStatus: current.status, toStatus: nextStatus, note: typeof req.body?.activityNote === "string" ? req.body.activityNote.slice(0, 4000) : "", actor: req.account!.username });
      return changed;
    });
    if (!row) { res.status(409).json({ error: "Outreach changed in another session. Reload and try again." }); return; }
    res.json({ ok: true, outreach: row });
  } catch (error) { req.log.error({ err: error }, "media outreach update failed"); res.status(500).json({ error: "Failed to update outreach record" }); }
});

router.post("/store/media-db/outreach/:id/placements", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [candidate] = await db.select().from(mediaOutreachTable).where(eq(mediaOutreachTable.id, id)).limit(1);
    const accountId = candidate ? await visibleProjectOwner(req, candidate.projectId) : null;
    const outreach = candidate && accountId === candidate.accountId ? candidate : undefined;
    if (!outreach || !accountId) { res.status(404).json({ error: "Outreach record not found" }); return; }
    if (outreach.status !== "accepted" && outreach.status !== "placed") { res.status(409).json({ error: "Accept the outreach before recording a placement." }); return; }
    const canonicalUrl = canonicalPlacementUrl(typeof req.body?.canonicalUrl === "string" ? req.body.canonicalUrl : "");
    const publicationDate = parseDate(req.body?.publicationDate);
    const headline = typeof req.body?.headline === "string" ? req.body.headline.trim().slice(0, 1000) : "";
    const supportingEvidence = typeof req.body?.supportingEvidence === "string" ? req.body.supportingEvidence.trim().slice(0, 10000) : "";
    if (!(publicationDate instanceof Date) || !headline || !supportingEvidence) { res.status(400).json({ error: "URL, publication date, headline and supporting evidence are required." }); return; }
    const values = { canonicalUrl, canonicalUrlKey: canonicalUrl, publicationDate, headline, supportingEvidence, legacySourceRef: typeof req.body?.legacySourceRef === "string" ? req.body.legacySourceRef.slice(0, 500) : null };
    const actor = req.account!.username;
    const result = await db.transaction(async (tx) => {
      if (process.env.NODE_ENV !== "test") await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-outreach:${id}`}))`);
      if (process.env.NODE_ENV !== "test") await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-placement:${accountId}:${outreach.projectId}:${canonicalUrl}`}))`);
      const [lockedOutreach] = await tx.select().from(mediaOutreachTable).where(eq(mediaOutreachTable.id, id)).limit(1);
      if (!lockedOutreach || (lockedOutreach.status !== "accepted" && lockedOutreach.status !== "placed")) return { invalidStatus: true as const };
      let [existing] = await tx.select().from(mediaPlacementsTable).where(and(eq(mediaPlacementsTable.accountId, accountId), eq(mediaPlacementsTable.projectId, outreach.projectId), eq(mediaPlacementsTable.canonicalUrlKey, canonicalUrl))).limit(1);
      if (existing && existing.outreachId !== id) return { conflict: existing };
      if (existing && process.env.NODE_ENV !== "test") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-placement-id:${existing.id}`}))`);
        [existing] = await tx.select().from(mediaPlacementsTable).where(eq(mediaPlacementsTable.id, existing.id)).limit(1);
      }
      const verificationHistory = existing ? [...existing.verificationHistory, {
        kind: "claim_revised", recordedAt: new Date().toISOString(), actor,
        priorClaim: { canonicalUrl: existing.canonicalUrl, publicationDate: existing.publicationDate.toISOString(), headline: existing.headline, supportingEvidence: existing.supportingEvidence },
        priorVerification: existing.verification, priorVerifiedFacts: existing.verifiedFacts,
      }] : [];
      const [row] = existing
        ? await tx.update(mediaPlacementsTable).set({ ...values, verification: "user_claimed", verifiedFacts: {}, verificationHistory }).where(eq(mediaPlacementsTable.id, existing.id)).returning()
        : await tx.insert(mediaPlacementsTable).values({ ...values, outreachId: id, accountId, projectId: outreach.projectId, verification: "user_claimed", createdBy: actor }).returning();
      if (lockedOutreach.status !== "placed") {
        await tx.update(mediaOutreachTable).set({ status: "placed" }).where(and(eq(mediaOutreachTable.id, id), eq(mediaOutreachTable.status, "accepted")));
        await tx.insert(mediaOutreachActivitiesTable).values({ outreachId: id, accountId, projectId: outreach.projectId, fromStatus: lockedOutreach.status, toStatus: "placed", note: existing ? "Placement evidence updated" : "Placement recorded", actor });
      }
      return { placement: row, updated: !!existing };
    });
    if ("invalidStatus" in result) { res.status(409).json({ error: "Accept the outreach before recording a placement." }); return; }
    if ("conflict" in result) { res.status(409).json({ error: "This placement URL is already linked to another outreach record.", duplicate: result.conflict }); return; }
    res.status(result.updated ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save placement";
    if (/Placement URL/.test(message) || /Invalid URL/.test(message)) { res.status(400).json({ error: message }); return; }
    req.log.error({ err: error }, "media placement failed"); res.status(500).json({ error: "Failed to save placement" });
  }
});

router.put("/store/media-db/placements/:id/verification", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [candidate] = await db.select().from(mediaPlacementsTable).where(eq(mediaPlacementsTable.id, id)).limit(1);
    const accountId = candidate ? await visibleProjectOwner(req, candidate.projectId) : null;
    const placement = candidate && accountId === candidate.accountId ? candidate : undefined;
    if (!placement || !accountId) { res.status(404).json({ error: "Placement not found" }); return; }
    const [updated] = await db.transaction(async (tx) => {
      if (process.env.NODE_ENV !== "test") await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-placement-id:${id}`}))`);
      const [current] = await tx.select().from(mediaPlacementsTable).where(eq(mediaPlacementsTable.id, id)).limit(1);
      if (!current || current.accountId !== accountId) return [];
      const evidence = await fetchPlacementPageEvidence(current.canonicalUrl);
      const verifiedFacts = { ...evidence, canonicalUrl: canonicalPlacementUrl(evidence.canonicalUrl), checkedAt: new Date().toISOString() };
      const verificationHistory = [...current.verificationHistory, { kind: "page_verified", ...verifiedFacts, actor: req.account!.username }];
      return tx.update(mediaPlacementsTable).set({ verification: "page_verified", verifiedFacts, verificationHistory }).where(eq(mediaPlacementsTable.id, id)).returning();
    });
    if (!updated) { res.status(409).json({ error: "The placement changed before verification completed." }); return; }
    res.json({ ok: true, placement: updated });
  } catch (error) {
    req.log.warn({ err: error }, "media placement page verification failed");
    res.status(422).json({ error: "The placement page could not be verified." });
  }
});

export default router;
