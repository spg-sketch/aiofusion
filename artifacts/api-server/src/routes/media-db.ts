import { Router, type IRouter, type Request, type Response } from "express";
import { db, mediaCategoriesTable, mediaOutletsTable, mediaContactsTable, mediaContactFieldOverridesTable, mediaImportBatchesTable, mediaRecommendationSetsTable, mediaRecommendationItemsTable, mediaRecommendationDecisionsTable, projectsTable } from "@workspace/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
import { verifyMediaDiscoveries } from "../lib/media-discovery-token";

const router: IRouter = Router();

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

const SEARCH_STOP_WORDS = new Set(["a", "an", "and", "at", "cover", "covering", "for", "in", "of", "on", "or", "the", "who", "with", "journalist", "journalists", "reporter", "reporters", "editor", "editors", "writing", "writes"]);
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
      const filtered = safeResults.filter((contact) => {
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

// Deterministic, database-only recommendations. No LLM or external lookup is
// involved, making a story's shortlist repeatable and auditable.
router.post("/store/media-db/recommendations", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim().slice(0, 200) : "";
    const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
    const terms = Array.isArray(req.body?.terms) ? req.body.terms.filter((v: unknown) => typeof v === "string").map((v: string) => v.toLowerCase().trim()).filter(Boolean).slice(0, 30) : [];
    if (!projectId || !storyKey || !(await assertProjectVisible(req, projectId))) { res.status(404).json({ error: "Project not found" }); return; }
    const accountId = normUsername(req.account!.username);
    const visible = await visibleAccounts(req);
    const contacts = (await db.select().from(mediaContactsTable).where(isNull(mediaContactsTable.deletedAt)))
      .filter((contact) => contact.accountId === null || visible === null || visible.includes(contact.accountId));
    const outlets = await db.select().from(mediaOutletsTable).where(isNull(mediaOutletsTable.deletedAt));
    const outletById = new Map(outlets.filter((outlet) => outletVisible(outlet.accountId, visible)).map((outlet) => [outlet.id, outlet]));
    const ranked = contacts.map((contact) => {
      const corpus = [contact.role, contact.beats.join(" "), contact.sectors.join(" "), contact.notes].join(" ").toLowerCase();
      const matches = terms.filter((term: string) => !SEARCH_STOP_WORDS.has(term) && term.length > 3 && corpus.includes(term));
      const reasons = matches.map((term: string) => `Coverage profile matches “${term}”`);
      if (contact.email) reasons.push("Public contact email is available");
      if (contact.lastVerifiedAt) reasons.push("Contact record has a verification date");
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
        score: Math.min(100, matches.length * 20 + (contact.email ? 10 : 0) + (contact.lastVerifiedAt ? 5 : 0)),
        reasons,
      };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.contact.id - b.contact.id).slice(0, 100);
    const [set] = await db.insert(mediaRecommendationSetsTable).values({ accountId, projectId, storyKey, criteria: { terms } }).returning();
    if (ranked.length) await db.insert(mediaRecommendationItemsTable).values(ranked.map((item, index) => ({ recommendationSetId: set.id, contactId: item.contact.id, score: item.score, reasons: item.reasons, rank: index + 1 })));
    res.json({ ok: true, recommendationSet: set, items: ranked.map((item, index) => ({ rank: index + 1, contact: item.contact, score: item.score, reasons: item.reasons })) });
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
      const discoveryNotes = [
        candidate.mediaOpportunity ? `AI-suggested media opportunity: ${candidate.mediaOpportunity}` : "",
        candidate.evidence ? `Cited source evidence: ${candidate.evidence}` : "",
      ].filter(Boolean).join("\n\n");
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
              modelDerivedFields: ["role", "beats", "sectors", "geography", "mediaOpportunity"],
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
          mediaOpportunity: candidate.mediaOpportunity ?? "",
          modelDerivedFields: ["role", "beats", "sectors", "geography", "mediaOpportunity"],
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

router.get("/store/media-db/recommendations/decisions", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const storyKey = typeof req.query.storyKey === "string" ? req.query.storyKey : "";
  if (!projectId || !storyKey || !(await assertProjectVisible(req, projectId))) { res.status(404).json({ error: "Project not found" }); return; }
  const accountId = normUsername(req.account!.username);
  const decisions = await db.select().from(mediaRecommendationDecisionsTable).where(and(eq(mediaRecommendationDecisionsTable.accountId, accountId), eq(mediaRecommendationDecisionsTable.projectId, projectId), eq(mediaRecommendationDecisionsTable.storyKey, storyKey)));
  const sets = await db.select({ id: mediaRecommendationSetsTable.id }).from(mediaRecommendationSetsTable).where(and(eq(mediaRecommendationSetsTable.accountId, accountId), eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey)));
  const candidateItems = sets.length ? await db.select({ id: mediaRecommendationItemsTable.id, recommendationSetId: mediaRecommendationItemsTable.recommendationSetId, score: mediaRecommendationItemsTable.score, rank: mediaRecommendationItemsTable.rank, reasons: mediaRecommendationItemsTable.reasons, contact: mediaContactsTable, outletName: mediaOutletsTable.name, outletCategory: mediaOutletsTable.category, outletWebsite: mediaOutletsTable.website, outletCountry: mediaOutletsTable.country, outletReachBand: mediaOutletsTable.reachBand, outletAccountId: mediaOutletsTable.accountId, outletDeletedAt: mediaOutletsTable.deletedAt })
    .from(mediaRecommendationItemsTable)
    .innerJoin(mediaContactsTable, eq(mediaRecommendationItemsTable.contactId, mediaContactsTable.id))
    .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
    .where(and(inArray(mediaRecommendationItemsTable.recommendationSetId, sets.map((set) => set.id)), isNull(mediaContactsTable.deletedAt))) : [];
  const visible = await visibleAccounts(req);
  const items = filterVisibleRecommendationItems(candidateItems, visible).map((item) => {
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
  res.json({ decisions, items });
});

export default router;
