import { Router, type IRouter, type Request, type Response } from "express";
import { db, mediaCategoriesTable, mediaOutletsTable, mediaContactsTable, mediaContactFieldOverridesTable, mediaContactSourceChecksTable, mediaContactStatusEventsTable, mediaContactCorrectionReportsTable, mediaImportBatchesTable, mediaRecommendationSetsTable, mediaRecommendationItemsTable, mediaRecommendationDecisionsTable, mediaRecommendationFeedbackTable, mediaOutreachTable, mediaOutreachActivitiesTable, mediaPlacementsTable, projectsTable, archiveItemsTable, platformMetaTable, tokenUsageTable, type MediaOutreachStatus } from "@workspace/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { inAssignedScope, memberProjectGate } from "../lib/member-guards";
import {
  DEFAULT_ADMIN_USERNAME,
  getVisibleUsernames,
  normUsername,
  canWriteProjects,
} from "../lib/platform-auth";
import { TRADE_MEDIA_CATEGORIES } from "../lib/trade-media-categories";
import {
  canonicalMediaEmail,
  filterVisibleRecommendationItems,
  mediaOverrideOwner,
  parseMediaImportCsv,
  parseMediaImportXlsx,
} from "../lib/media-csv-import";
import type { MediaImportRow } from "../lib/media-csv-import";
import {
  buildImportedContactMetadata,
  importedOutletMetadata,
  importDimensionCounts,
  reconcileMediaImport,
  reconciliationFingerprint,
  sourceHashForImport,
  verifyMediaImportPreviewToken,
  issueMediaImportPreviewToken,
  mergeImportedProvenance,
} from "../lib/media-import-reconciliation";
import type { ImportReconciliation } from "../lib/media-import-reconciliation";
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
import { assessEditorialFit, type EditorialAssessment, type TargetingBrief } from "../lib/media-editorial-ranking";
import { checkFairUsage, checkMonthlySpendLimit } from "../lib/fair-usage";
import { collectJournalistCoverage } from "../lib/journalist-coverage-evidence";

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

const GLOBAL_MEDIA_OWNER = "__global_admin__";
type MediaCollectionScope = "shared" | "workspace";

async function visibleAccounts(req: Request): Promise<string[] | null> {
  // Authentication normalises non-Master rows with a legacy `admin` role to an
  // agency, but keep this boundary defensive for legacy sessions and tests:
  // only the canonical Master workspace gets the unrestricted visibility list.
  if (req.account?.role === "admin" && normUsername(req.account.username) !== DEFAULT_ADMIN_USERNAME) {
    return [normUsername(req.account.username)];
  }
  return getVisibleUsernames(req.account!);
}

function isMasterWorkspace(req: Request): boolean {
  return req.account?.role === "admin"
    && normUsername(req.account.username) === DEFAULT_ADMIN_USERNAME;
}

function isWritableMaster(req: Request): boolean {
  return isMasterWorkspace(req) && canWriteProjects(req.account!);
}

function parseCollectionScope(value: unknown): MediaCollectionScope | null {
  if (value === undefined || value === null || value === "") return "workspace";
  return value === "shared" || value === "workspace" ? value : null;
}

function collectionOwner(scope: MediaCollectionScope, workspaceId: string): string {
  return scope === "shared" ? GLOBAL_MEDIA_OWNER : workspaceId;
}

function collectionPreviewOwner(scope: MediaCollectionScope, workspaceId: string): string {
  // Keep the internal namespace out of the user-facing preview. The namespace
  // is still included separately so clients that need to reconcile ownership
  // can do so without displaying an implementation detail.
  return scope === "shared" ? "Master" : workspaceId;
}

function sharedMutationError(res: Response, action: string): boolean {
  res.status(403).json({ error: `Only a writable Master member may ${action} shared media records.` });
  return false;
}

function outletVisible(accountId: string | null, visible: string[] | null): boolean {
  if (accountId === null) return true;
  if (visible === null) return true;
  return visible.includes(accountId);
}

/**
 * The reconciliation helper intentionally has no authorization/database
 * concerns. Workspace imports include shared outlets so private contacts can
 * still link to them, but shared outlet metadata must remain read-only. Keep
 * this ownership normalization at the route boundary and repeat it for the
 * transaction plan rather than trusting a preview/plan to authorize an
 * update.
 */
function enforceImportOutletOwnership(
  reconciliation: ImportReconciliation,
  existingOutlets: Array<{ id: number; accountId: string | null }>,
  writableAccountId: string | null,
): ImportReconciliation {
  const outletById = new Map(existingOutlets.map((outlet) => [outlet.id, outlet]));
  const blockedPublicationRefs = new Set<string>();
  let blockedUpdates = 0;

  const publicationRows = reconciliation.publicationRows.map((publication) => {
    if (!publication.outletRef.startsWith("existing:") || !publication.changedFields.length) {
      return publication;
    }
    const outletId = Number(publication.outletRef.slice("existing:".length));
    const outlet = outletById.get(outletId);
    if (!outlet || outlet.accountId === writableAccountId) return publication;
    blockedPublicationRefs.add(publication.outletRef);
    blockedUpdates += 1;
    return {
      ...publication,
      changedFields: [],
      status: "unchanged" as const,
    };
  });

  if (!blockedUpdates) return reconciliation;

  const blockedPublicationRows = new Set(
    publicationRows
      .filter((publication) => blockedPublicationRefs.has(publication.outletRef))
      .map((publication) => `${publication.row.sheetName ?? ""}:${publication.row.sourceRow}`),
  );
  const outcomes = reconciliation.outcomes.map((outcome) => (
    blockedPublicationRows.has(`${outcome.sheetName ?? ""}:${outcome.sourceRow}`)
      ? { ...outcome, changedFields: [] }
      : outcome
  ));
  const counts = {
    ...reconciliation.counts,
    outletRefreshed: Math.max(0, reconciliation.counts.outletRefreshed - blockedUpdates),
    outletUnchanged: reconciliation.counts.outletUnchanged + blockedUpdates,
  };
  const expectedMutations = {
    ...reconciliation.expectedMutations,
    outletsUpdated: Math.max(0, reconciliation.expectedMutations.outletsUpdated - blockedUpdates),
    outletsUnchanged: reconciliation.expectedMutations.outletsUnchanged + blockedUpdates,
  };
  return { ...reconciliation, publicationRows, outcomes, counts, expectedMutations };
}

function importOutletOwnerCondition(accountId: string | null) {
  return accountId === null
    ? isNull(mediaOutletsTable.accountId)
    : eq(mediaOutletsTable.accountId, accountId);
}

async function editableContact(req: Request, id: number) {
  const rows = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.deletedAt) return { ok: false as const, status: 404, error: "Contact not found" };
  if (row.accountId === null && !isWritableMaster(req)) {
    return { ok: false as const, status: 403, error: "Only a writable Master member may change shared contacts" };
  }
  if (row.accountId !== null && row.accountId !== normUsername(req.account!.username)) {
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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { csv, xlsxBase64, rows, category, commit, filename, idempotencyKey, collectionScope: requestedScope } = body;
    const collectionScope = parseCollectionScope(requestedScope);
    if (!collectionScope) {
      res.status(400).json({ error: "collectionScope must be shared or workspace." });
      return;
    }
    if (collectionScope === "shared" && !isWritableMaster(req)) {
      sharedMutationError(res, "upload");
      return;
    }
    if (typeof csv !== "string" && typeof xlsxBase64 !== "string" && !Array.isArray(rows)) {
      res.status(400).json({ error: "Choose a CSV or XLSX file to import." });
      return;
    }
    if (category !== undefined && typeof category !== "string") {
      res.status(400).json({ error: "Category must be text." });
      return;
    }
    if (Array.isArray(rows) && rows.length > 50_000) {
      res.status(413).json({ error: "Parsed import rows must contain 50,000 rows or fewer." });
      return;
    }
    const selectedCategory = typeof category === "string" ? category.trim() : "";

    try {
      // Hash the bytes that were actually uploaded, before parsing.  This
      // prevents a retry from changing the workbook while retaining its name
      // or idempotency key, and lets the commit route reject a stale preview.
      const source = sourceHashForImport({ csv, xlsxBase64, rows });
      const maxBytes = source.sourceType === "csv" ? 2 * 1024 * 1024 : 12 * 1024 * 1024;
      if (source.byteLength < 1 || source.byteLength > maxBytes) {
        res.status(413).json({ error: `Import files must be between 1 byte and ${Math.round(maxBytes / (1024 * 1024))} MB.` });
        return;
      }

      const parsed = typeof csv === "string"
        ? parseMediaImportCsv(csv)
        : typeof xlsxBase64 === "string"
          ? await parseMediaImportXlsx(xlsxBase64)
          : {
             rows: (Array.isArray(rows) ? rows : []).filter((row: unknown) => row && typeof row === "object").map((raw: unknown, index: number): MediaImportRow => {
              const item = raw as Record<string, unknown>;
              return {
                sourceRow: Number(item.sourceRow) || index + 1,
                sheetName: typeof item.sheetName === "string" ? item.sheetName.slice(0, 200) : undefined,
                sector: typeof item.sector === "string" ? item.sector.slice(0, 200) : undefined,
                recordType: item.recordType === "publication" || item.recordType === "contact" ? item.recordType : undefined,
                firstName: typeof item.firstName === "string" ? item.firstName.trim() : "",
                lastName: typeof item.lastName === "string" ? item.lastName.trim() : "",
                role: typeof item.role === "string" ? item.role.trim() : "",
                outletName: typeof item.outletName === "string" ? item.outletName.trim() : "",
                email: typeof item.email === "string" ? canonicalMediaEmail(item.email) : "",
                website: typeof item.website === "string" ? item.website.trim() : "",
                description: typeof item.description === "string" ? item.description.trim() : "",
                beat: typeof item.beat === "string" ? item.beat.trim() : "",
                country: typeof item.country === "string" ? item.country.trim() : "",
                reachBand: typeof item.reachBand === "string" ? item.reachBand.trim() : "",
                confidence: typeof item.confidence === "string" ? item.confidence.trim() : "",
                notes: typeof item.notes === "string" ? item.notes.trim() : "",
                linkedinUrl: typeof item.linkedinUrl === "string" ? item.linkedinUrl.trim() : "",
                sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl.trim() : "",
                verifiedDate: typeof item.verifiedDate === "string" ? item.verifiedDate.trim() : "",
                publicationAuthority: typeof item.publicationAuthority === "string" ? item.publicationAuthority.trim() : "",
                journalistAuthority: typeof item.journalistAuthority === "string" ? item.journalistAuthority.trim() : "",
                reviewNotes: typeof item.reviewNotes === "string" ? item.reviewNotes.trim() : "",
                // The parser's canonical email is intentionally retained while
                // preserving the source assertion in provenance.
                ...(typeof item.rawEmail === "string" ? { rawEmail: item.rawEmail.trim() } : {}),
                ...(item.rawMetadata && typeof item.rawMetadata === "object" && !Array.isArray(item.rawMetadata)
                  ? { rawMetadata: Object.fromEntries(Object.entries(item.rawMetadata as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string> }
                  : {}),
              } as MediaImportRow;
            }),
            errors: [],
            headers: [],
          };
      const workspaceId = normUsername(req.account!.username);
      const accountId = collectionScope === "shared" ? null : workspaceId;
      const owner = collectionOwner(collectionScope, workspaceId);
      const previewOwner = collectionPreviewOwner(collectionScope, workspaceId);

      const loadExisting = async () => {
        const [existingOutlets, existingContacts] = await Promise.all([
          db.select({
            id: mediaOutletsTable.id,
            name: mediaOutletsTable.name,
            website: mediaOutletsTable.website,
            accountId: mediaOutletsTable.accountId,
              category: mediaOutletsTable.category,
              description: mediaOutletsTable.description,
              country: mediaOutletsTable.country,
              reachBand: mediaOutletsTable.reachBand,
          }).from(mediaOutletsTable).where(and(
            isNull(mediaOutletsTable.deletedAt),
            collectionScope === "shared"
              ? isNull(mediaOutletsTable.accountId)
              : or(eq(mediaOutletsTable.accountId, workspaceId), isNull(mediaOutletsTable.accountId)),
          )),
          db.select({
            id: mediaContactsTable.id,
            outletId: mediaContactsTable.outletId,
            firstName: mediaContactsTable.firstName,
            lastName: mediaContactsTable.lastName,
            role: mediaContactsTable.role,
            email: mediaContactsTable.email,
            linkedinUrl: mediaContactsTable.linkedinUrl,
            sourceUrl: mediaContactsTable.sourceUrl,
            publicationReach: mediaContactsTable.publicationReach,
            publicationAuthority: mediaContactsTable.publicationAuthority,
            journalistAuthority: mediaContactsTable.journalistAuthority,
            confidence: mediaContactsTable.confidence,
            reviewNotes: mediaContactsTable.reviewNotes,
            notes: mediaContactsTable.notes,
            beats: mediaContactsTable.beats,
            sectors: mediaContactsTable.sectors,
            provenance: mediaContactsTable.provenance,
            geography: mediaContactsTable.geography,
            sourceRef: mediaContactsTable.sourceRef,
          }).from(mediaContactsTable).where(and(
            isNull(mediaContactsTable.deletedAt),
            collectionScope === "shared"
              ? isNull(mediaContactsTable.accountId)
              : eq(mediaContactsTable.accountId, workspaceId),
          )),
        ]);
        return { existingOutlets, existingContacts };
      };

      const existing = await loadExisting();
      const previewOverrides = await db.select({
        contactId: mediaContactFieldOverridesTable.contactId,
        fieldName: mediaContactFieldOverridesTable.fieldName,
        value: mediaContactFieldOverridesTable.value,
      }).from(mediaContactFieldOverridesTable).where(eq(mediaContactFieldOverridesTable.accountId, owner));
      const overrideSet = new Set(previewOverrides.map((item) => `${item.contactId}:${item.fieldName}`));
      const overrideFingerprint = previewOverrides.map((item) => `${item.contactId}:${item.fieldName}:${item.value}`);
      const reconciliation = reconcileMediaImport(
        parsed.rows,
        existing.existingOutlets,
        existing.existingContacts,
        overrideSet,
        { selectedCategory },
      );
      const authorizedReconciliation = enforceImportOutletOwnership(
        reconciliation,
        existing.existingOutlets,
        accountId,
      );
      const dimensionCounts = importDimensionCounts(parsed.rows);
      const fingerprint = reconciliationFingerprint(
        owner,
        collectionScope,
        source.sourceHash,
        existing.existingOutlets,
        existing.existingContacts,
        overrideFingerprint,
        authorizedReconciliation,
      );
      const previewToken = issueMediaImportPreviewToken({
        owner,
        scope: collectionScope,
        category: selectedCategory,
        sourceHash: source.sourceHash,
        fingerprint,
      });
      const preview = {
        collectionScope,
        owner: previewOwner,
        ownerNamespace: owner,
        sourceHash: source.sourceHash,
        sourceByteLength: source.byteLength,
        metadata: parsed.metadata,
        sheetInventory: parsed.sheetInventory,
        reviewedToken: previewToken,
        previewToken,
        // reviewToken is the v33 UI name; the explicit aliases above preserve
        // the API name used by non-browser clients.
        reviewToken: previewToken,
        recordTypeCounts: dimensionCounts.byRecordType,
        sectorCounts: dimensionCounts.bySector,
        sectorCountsByRecordType: dimensionCounts.byRecordTypeAndSector,
        scopeInventory: {
          collectionScope,
          owner: previewOwner,
          sourceType: source.sourceType,
          sourceByteLength: source.byteLength,
          acceptedRows: parsed.rows.length,
          rejectedRows: parsed.errors.length,
          contactRows: dimensionCounts.byRecordType.contact ?? 0,
          publicationRows: dimensionCounts.byRecordType.publication ?? 0,
          sectorCounts: dimensionCounts.bySector,
          sectorCountsByRecordType: dimensionCounts.byRecordTypeAndSector,
        },
        validRows: parsed.rows.length,
        importableRows: authorizedReconciliation.importRows.length,
        publicationRows: authorizedReconciliation.publicationRows.length,
        matchedExisting: authorizedReconciliation.matchedExisting,
        duplicateRows: authorizedReconciliation.duplicatesSkipped,
        ...authorizedReconciliation.counts,
        invalid: authorizedReconciliation.counts.invalid + parsed.errors.length,
        invalidRows: authorizedReconciliation.counts.invalid + parsed.errors.length,
        outletCount: authorizedReconciliation.outletCount,
        newOutletCount: authorizedReconciliation.newOutletCount,
        expectedMutations: authorizedReconciliation.expectedMutations,
        headers: parsed.headers,
        warnings: parsed.warnings ?? [],
        errors: [
          ...parsed.errors,
          ...authorizedReconciliation.outcomes.flatMap((outcome) => outcome.conflicts.map((conflict) => ({
            row: conflict.sourceRow,
            ...(outcome.sheetName ? { sheetName: outcome.sheetName } : {}),
            ...(conflict.conflictingSheetName ? { conflictingSheetName: conflict.conflictingSheetName } : {}),
            ...(conflict.conflictingSourceRow !== undefined ? { conflictingSourceRow: conflict.conflictingSourceRow } : {}),
            ...(conflict.existingContactId !== undefined ? { existingContactId: conflict.existingContactId } : {}),
            message: conflict.message,
          }))),
        ],
        rowOutcomes: authorizedReconciliation.outcomes.map((outcome) => ({
          ...outcome,
          outcome: outcome.status,
          reason: outcome.conflicts.map((conflict) => conflict.message).join(" "),
          fields: outcome.changedFields?.length
            ? outcome.changedFields
            : outcome.conflicts.flatMap((conflict) => conflict.field ? [conflict.field] : []),
        })),
        sample: authorizedReconciliation.importRows.slice(0, 8).map(({ row }) => row),
      };
      if (commit !== true) {
        res.json({ ok: true, preview });
        return;
      }

      const safeKey = typeof idempotencyKey === "string" ? idempotencyKey.trim().slice(0, 160) : "";
      // A successful commit may have changed the reconciliation fingerprint.
      // Resolve an exact idempotent retry before validating the old preview
      // token so network retries remain safe after that state change.
      if (safeKey) {
        const prior = await db.select({
          summary: mediaImportBatchesTable.summary,
          sourceHash: mediaImportBatchesTable.sourceHash,
        }).from(mediaImportBatchesTable).where(and(
          eq(mediaImportBatchesTable.accountId, owner),
          eq(mediaImportBatchesTable.idempotencyKey, safeKey),
        )).limit(1);
        if (prior[0]) {
          if (prior[0].sourceHash !== source.sourceHash) {
            res.status(409).json({ error: "This idempotency key was already used for a different source file." });
            return;
          }
          const priorSummary = prior[0].summary as Record<string, unknown>;
          if (String(priorSummary.category ?? "") !== selectedCategory) {
            res.status(409).json({ error: "This idempotency key was already used for a different import category." });
            return;
          }
          res.json({
            ok: true,
            preview,
            result: { ...priorSummary, replayed: true },
          });
          return;
        }
      }
      const reviewedToken = typeof body.reviewedToken === "string"
        ? body.reviewedToken
        : typeof body.previewToken === "string"
          ? body.previewToken
          : typeof body.reviewToken === "string" ? body.reviewToken : "";
      const requestedHash = typeof body.sourceHash === "string" ? body.sourceHash : "";
      if (!requestedHash || requestedHash !== source.sourceHash || !reviewedToken
        || !verifyMediaImportPreviewToken(reviewedToken, {
          owner,
          scope: collectionScope,
          category: selectedCategory,
          sourceHash: source.sourceHash,
          fingerprint,
        })) {
        res.status(409).json({
          error: "This import preview is stale or has not been reviewed. Preview the exact file again before committing.",
          sourceHash: source.sourceHash,
          previewRequired: true,
        });
        return;
      }
      if (body.acknowledgeTarget !== true || (authorizedReconciliation.counts.conflicted > 0 && body.acknowledgeConflicts !== true)) {
        res.status(409).json({
          error: "Acknowledge the import target and review all conflicts before committing.",
          previewRequired: true,
          acknowledgementRequired: true,
        });
        return;
      }
      if (authorizedReconciliation.importRows.length === 0 && authorizedReconciliation.matches.length === 0
        && authorizedReconciliation.publicationRows.length === 0 && authorizedReconciliation.counts.conflicted === 0) {
        res.status(400).json({ error: "The import does not contain any valid contacts to reconcile.", preview });
        return;
      }

      const result = await db.transaction(async (tx) => {
        if (process.env.NODE_ENV !== "test") {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-import:${owner}`}))`);
        }
        if (safeKey) {
          const prior = await tx.select({ summary: mediaImportBatchesTable.summary, sourceHash: mediaImportBatchesTable.sourceHash })
            .from(mediaImportBatchesTable)
            .where(and(eq(mediaImportBatchesTable.accountId, owner), eq(mediaImportBatchesTable.idempotencyKey, safeKey)))
            .limit(1);
          if (prior[0]) {
            if (prior[0].sourceHash !== source.sourceHash) {
              throw new Error("This idempotency key was already used for a different source file.");
            }
            const priorSummary = prior[0].summary as Record<string, unknown>;
            if (String(priorSummary.category ?? "") !== selectedCategory) {
              throw new Error("This idempotency key was already used for a different import category.");
            }
            return { ...priorSummary, replayed: true };
          }
        }

        // The transaction repeats the read and the shared pure plan.  The
        // preview token above was based on the same snapshot; if another
        // commit changed an identity, this second plan remains deterministic
        // and no source-owned field can be applied to the wrong contact.
        const [existingOutlets, existingContacts] = await Promise.all([
          tx.select({
            id: mediaOutletsTable.id,
            name: mediaOutletsTable.name,
            website: mediaOutletsTable.website,
            accountId: mediaOutletsTable.accountId,
            category: mediaOutletsTable.category,
            description: mediaOutletsTable.description,
            country: mediaOutletsTable.country,
            reachBand: mediaOutletsTable.reachBand,
          }).from(mediaOutletsTable).where(and(
            isNull(mediaOutletsTable.deletedAt),
            collectionScope === "shared"
              ? isNull(mediaOutletsTable.accountId)
              : or(eq(mediaOutletsTable.accountId, workspaceId), isNull(mediaOutletsTable.accountId)),
          )),
          tx.select({
            id: mediaContactsTable.id,
            outletId: mediaContactsTable.outletId,
            firstName: mediaContactsTable.firstName,
            lastName: mediaContactsTable.lastName,
            role: mediaContactsTable.role,
            email: mediaContactsTable.email,
            linkedinUrl: mediaContactsTable.linkedinUrl,
            sourceUrl: mediaContactsTable.sourceUrl,
            publicationReach: mediaContactsTable.publicationReach,
            publicationAuthority: mediaContactsTable.publicationAuthority,
            journalistAuthority: mediaContactsTable.journalistAuthority,
            confidence: mediaContactsTable.confidence,
            reviewNotes: mediaContactsTable.reviewNotes,
            notes: mediaContactsTable.notes,
            beats: mediaContactsTable.beats,
            sectors: mediaContactsTable.sectors,
            provenance: mediaContactsTable.provenance,
            geography: mediaContactsTable.geography,
            sourceRef: mediaContactsTable.sourceRef,
          }).from(mediaContactsTable).where(and(
            isNull(mediaContactsTable.deletedAt),
            collectionScope === "shared" ? isNull(mediaContactsTable.accountId) : eq(mediaContactsTable.accountId, workspaceId),
          )),
        ]);
        const commitOverrides = await tx.select({
          contactId: mediaContactFieldOverridesTable.contactId,
          fieldName: mediaContactFieldOverridesTable.fieldName,
          value: mediaContactFieldOverridesTable.value,
        }).from(mediaContactFieldOverridesTable).where(eq(mediaContactFieldOverridesTable.accountId, owner));
        const currentOverrideSet = new Set(commitOverrides.map((entry) => `${entry.contactId}:${entry.fieldName}`));
        const currentOverrideFingerprint = commitOverrides.map((entry) => `${entry.contactId}:${entry.fieldName}:${entry.value}`);
        const rawCommitPlan = reconcileMediaImport(
          parsed.rows,
          existingOutlets,
          existingContacts,
          currentOverrideSet,
          { selectedCategory },
        );
        const commitPlan = enforceImportOutletOwnership(rawCommitPlan, existingOutlets, accountId);
        const currentFingerprint = reconciliationFingerprint(
          owner,
          collectionScope,
          source.sourceHash,
          existingOutlets,
          existingContacts,
          currentOverrideFingerprint,
          commitPlan,
        );
        if (currentFingerprint !== fingerprint) {
          throw new Error("This import preview is stale because the collection or manual overrides changed. Preview the file again.");
        }
        const outletIdByRef = new Map(existingOutlets.map((outlet) => [`existing:${outlet.id}`, outlet.id]));
        let outletsCreated = 0;
        let outletsUpdated = 0;
        let contactsCreated = 0;
        for (const { row, outletRef, changedFields } of commitPlan.publicationRows) {
          const existingOutletId = outletIdByRef.get(outletRef);
          if (existingOutletId) {
            if (changedFields.length) {
              const metadata = importedOutletMetadata(row, selectedCategory);
              const updated = await tx.update(mediaOutletsTable)
                .set(Object.fromEntries(changedFields.map((field) => [field, metadata[field as keyof typeof metadata]])))
                .where(and(
                  eq(mediaOutletsTable.id, existingOutletId),
                  importOutletOwnerCondition(accountId),
                ))
                .returning({ id: mediaOutletsTable.id });
              if (updated.length) outletsUpdated += 1;
            }
            continue;
          }
          const metadata = importedOutletMetadata(row, selectedCategory);
          const [created] = await tx.insert(mediaOutletsTable).values({
            name: row.outletName,
            ...metadata,
            website: row.website.trim(),
            accountId,
          }).returning({ id: mediaOutletsTable.id });
          outletIdByRef.set(outletRef, created.id);
          outletsCreated += 1;
        }
        for (const { row, outletRef, aggregate } of commitPlan.importRows) {
          let outletId = outletIdByRef.get(outletRef);
          if (!outletId) {
            const metadata = importedOutletMetadata(row, selectedCategory);
            const [created] = await tx.insert(mediaOutletsTable).values({
              name: row.outletName,
              ...metadata,
              website: row.website.trim(),
              accountId,
            }).returning({ id: mediaOutletsTable.id });
            outletId = created.id;
            outletIdByRef.set(outletRef, outletId);
            outletsCreated += 1;
          }
          const imported = buildImportedContactMetadata(row, aggregate, {
            filename: typeof filename === "string" ? filename.slice(0, 500) : "",
            sourceHash: source.sourceHash,
            sourceType: source.sourceType,
            selectedCategory,
          });
          await tx.insert(mediaContactsTable).values({
            outletId,
            firstName: row.firstName,
            lastName: row.lastName,
            role: row.role,
            email: row.email,
            phone: "",
            notes: imported.notes,
            beats: imported.beats,
            sectors: imported.sectors,
            geography: imported.geography,
            sourceRef: imported.sourceRef,
            linkedinUrl: row.linkedinUrl ?? "",
            sourceUrl: row.sourceUrl ?? "",
            publicationReach: row.reachBand,
            publicationAuthority: row.publicationAuthority ?? "",
            journalistAuthority: row.journalistAuthority ?? "",
            confidence: row.confidence,
            reviewNotes: row.reviewNotes ?? "",
            // Workbook dates are source assertions, not page verification.
            provenance: imported.provenance,
            accountId,
          });
          contactsCreated += 1;
        }

        for (const match of commitPlan.matches) {
          const aggregate = match.aggregate;
          const { row } = aggregate;
          const contact = match.contact;
          const imported = buildImportedContactMetadata(row, aggregate, {
            filename: typeof filename === "string" ? filename.slice(0, 500) : "",
            sourceHash: source.sourceHash,
            sourceType: source.sourceType,
            selectedCategory,
          });
          const next: Record<string, unknown> = {
            sourceRef: imported.sourceRef,
            // Sectors are additive, including rows with no email.
            sectors: Array.from(new Set([...(contact.sectors ?? []), ...imported.sectors])),
            provenance: mergeImportedProvenance(contact.provenance, imported.provenance),
          };
          if (row.role) next.role = row.role;
          if (row.linkedinUrl) next.linkedinUrl = row.linkedinUrl;
          if (row.sourceUrl) next.sourceUrl = row.sourceUrl;
          if (imported.geography) next.geography = imported.geography;
          if (row.reachBand) next.publicationReach = row.reachBand;
          if (row.publicationAuthority) next.publicationAuthority = row.publicationAuthority;
          if (row.journalistAuthority) next.journalistAuthority = row.journalistAuthority;
          if (row.confidence) next.confidence = row.confidence;
          if (row.reviewNotes) next.reviewNotes = row.reviewNotes;
          if (imported.beats.length) {
            // Workbook refreshes add beat evidence; they do not erase a
            // previously curated or source-derived beat.
            next.beats = Array.from(new Set([...(contact.beats ?? []), ...imported.beats]));
          }
          if (!contact.email && row.email) next.email = row.email;
          for (const key of Object.keys(next)) {
            if (overrideSet.has(`${contact.id}:${key}`) || match.overriddenFields.includes(key)) delete next[key];
          }
          if (Object.keys(next).length) {
            await tx.update(mediaContactsTable).set({ ...next, updatedAt: new Date() }).where(eq(mediaContactsTable.id, contact.id!));
          }
        }
        const summary = {
          outletsCreated,
          outletsUpdated,
          outletsUnchanged: commitPlan.counts.outletUnchanged,
          contactsCreated,
          contactsMatched: commitPlan.matches.length,
          duplicatesSkipped: commitPlan.duplicatesSkipped,
          publicationsProcessed: commitPlan.publicationRows.length,
          expectedMutations: commitPlan.expectedMutations,
          category: selectedCategory,
          new: commitPlan.counts.new,
          refreshed: commitPlan.counts.refreshed,
          unchanged: commitPlan.counts.unchanged,
          conflicted: commitPlan.counts.conflicted,
          invalid: commitPlan.counts.invalid + parsed.errors.length,
          sourceHash: source.sourceHash,
        };
        await tx.insert(mediaImportBatchesTable).values({
          accountId: owner,
          idempotencyKey: safeKey || null,
          sourceFilename: typeof filename === "string" ? filename.slice(0, 500) : "",
          sourceHash: source.sourceHash,
          sourceType: source.sourceType,
          summary,
          committedAt: new Date(),
        });
        return summary;
      });

      const aggregateResult = result as Record<string, unknown>;
      req.log.info({
        accountId: owner,
        validRows: parsed.rows.length,
        invalidRows: parsed.errors.length,
        outletsCreated: aggregateResult.outletsCreated,
        contactsCreated: aggregateResult.contactsCreated,
        duplicatesSkipped: aggregateResult.duplicatesSkipped,
        publicationsProcessed: aggregateResult.publicationsProcessed,
        new: aggregateResult.new,
        refreshed: aggregateResult.refreshed,
        unchanged: aggregateResult.unchanged,
        conflicted: aggregateResult.conflicted,
        invalid: aggregateResult.invalid,
        sourceHash: aggregateResult.sourceHash,
      }, "Media database import completed");
      res.json({ ok: true, preview, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import the media file.";
      req.log.warn({ err: error }, "Media database import rejected");
      res.status(/idempotency key|preview is stale|collection changed|manual overrides changed/i.test(message) ? 409 : 400).json({ error: message });
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
      // Shared categories follow the same Master-only mutation rule as shared
      // media records. Private categories remain owned by their workspace,
      // including when the caller is the Master account.
      const requestingAccount = normUsername(req.account!.username);
      if (row.accountId === null && !isWritableMaster(req)) {
        sharedMutationError(res, "delete");
        return;
      }
      if (row.accountId !== null && row.accountId !== requestingAccount) {
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
      if (isMasterWorkspace(req) && !isWritableMaster(req)) {
        sharedMutationError(res, "create");
        return;
      }
      // Preserve the established Master manual-entry behaviour (global rows),
      // while all non-Master manual entries stay private to their workspace.
      const accountId = isMasterWorkspace(req) ? null : normUsername(req.account!.username);
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
      // Shared rows are controlled by a writable Master member. A Master
      // session must not gain access to another workspace's private rows.
      if (row.accountId === null && !isWritableMaster(req)) {
        sharedMutationError(res, "edit");
        return;
      }
      if (row.accountId !== null && row.accountId !== normUsername(req.account!.username)) {
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
      if (row.accountId === null && !isWritableMaster(req)) {
        sharedMutationError(res, "delete");
        return;
      }
      if (row.accountId !== null && row.accountId !== normUsername(req.account!.username)) {
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
      const outletId = typeof req.query.outletId === "string" && /^\d+$/.test(req.query.outletId)
        ? Number(req.query.outletId)
        : null;
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
          && (!category || (contact.outletCategory ?? "").toLowerCase().includes(category)
            || contact.sectors.some((sector) => sector.toLowerCase().includes(category)))
          && countryMatchesFilter(country, contact.outletCountry ?? "", contact.geography)
          && (outletId === null || contact.outletId === outletId);
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
    .where(and(
      eq(mediaContactSourceChecksTable.id, checkId),
      eq(mediaContactSourceChecksTable.contactId, id),
      access.row.accountId === null
        ? or(
          eq(mediaContactSourceChecksTable.accountId, access.owner),
          // Older manual source checks used the legacy global namespace.
          // Accept those observations for review, but all new overrides and
          // imports use the canonical __global_admin__ owner namespace.
          eq(mediaContactSourceChecksTable.accountId, "__global__"),
        )
        : eq(mediaContactSourceChecksTable.accountId, access.owner),
    ))
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
          if (isMasterWorkspace(req) && outletRow[0].accountId !== null) {
            res.status(403).json({ error: "Shared contacts can only link to shared outlets" });
            return;
          }
          resolvedOutletId = numOutletId;
        }
      }
      if (isMasterWorkspace(req) && !isWritableMaster(req)) {
        sharedMutationError(res, "create");
        return;
      }
      // Preserve the established Master manual-entry behaviour (global rows),
      // while all non-Master manual entries stay private to their workspace.
      const accountId = isMasterWorkspace(req) ? null : normUsername(req.account!.username);
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
      // Shared rows are controlled by a writable Master member. A Master
      // session must not gain access to another workspace's private rows.
      if (row.accountId === null && !isWritableMaster(req)) {
        sharedMutationError(res, "edit");
        return;
      }
      if (row.accountId !== null && row.accountId !== normUsername(req.account!.username)) {
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
            if (row.accountId === null && outletRow[0].accountId !== null) {
              res.status(403).json({ error: "Shared contacts can only link to shared outlets" });
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
      if (row.accountId === null && !isWritableMaster(req)) {
        sharedMutationError(res, "delete");
        return;
      }
      if (row.accountId !== null && row.accountId !== normUsername(req.account!.username)) {
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

async function assertCanonicalStoryVisible(req: Request, projectId: string, storyKey: string): Promise<boolean> {
  if (!(await assertProjectVisible(req, projectId))) return false;
  const [story] = await db.select({ id: archiveItemsTable.id }).from(archiveItemsTable).where(and(
    eq(archiveItemsTable.id, storyKey),
    eq(archiveItemsTable.projectId, projectId),
    isNull(archiveItemsTable.deletedAt),
  )).limit(1);
  return !!story;
}

type RecommendationCriteria = {
  terms?: string[];
  targetPhrases?: ExactTargetPhrase[];
  baseScores?: Record<string, number>;
  brief?: TargetingBrief;
  assessments?: Record<string, EditorialAssessment>;
  evidence?: Record<string, unknown[]>;
  warnings?: Record<string, string[]>;
  rankingVersion?: string;
};

const emptyTargetingBrief = (terms: string[], phrases: ExactTargetPhrase[]): TargetingBrief => ({
  topic: terms.join(", "),
  angle: phrases.map((phrase) => phrase.text).join(", "),
  audience: "",
  regions: [],
  publicationTypes: [],
  whyNow: "",
});

function normaliseBrief(value: unknown, fallback: TargetingBrief): TargetingBrief {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const strings = (input: unknown) => Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    topic: typeof raw.topic === "string" ? raw.topic.trim().slice(0, 1000) : fallback.topic,
    angle: typeof raw.angle === "string" ? raw.angle.trim().slice(0, 1000) : fallback.angle,
    audience: typeof raw.audience === "string" ? raw.audience.trim().slice(0, 1000) : fallback.audience,
    regions: strings(raw.regions),
    publicationTypes: strings(raw.publicationTypes),
    whyNow: typeof raw.whyNow === "string" ? raw.whyNow.trim().slice(0, 1000) : fallback.whyNow,
  };
}

function briefsEqual(left: TargetingBrief, right: TargetingBrief): boolean {
  return left.topic === right.topic && left.angle === right.angle && left.audience === right.audience
    && left.whyNow === right.whyNow
    && JSON.stringify(left.regions) === JSON.stringify(right.regions)
    && JSON.stringify(left.publicationTypes) === JSON.stringify(right.publicationTypes);
}

function normalisedEvidenceUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}

function mergeCoverageEvidence(previous: unknown[], next: unknown[]): unknown[] {
  const merged = new Map<string, unknown>();
  for (const item of previous) {
    const key = normalisedEvidenceUrl(item && typeof item === "object" ? (item as Record<string, unknown>).url : "");
    if (key) merged.set(key, item);
  }
  for (const item of next) {
    const key = normalisedEvidenceUrl(item && typeof item === "object" ? (item as Record<string, unknown>).url : "");
    if (!key) continue;
    const prior = merged.get(key);
    const priorChecked = prior && typeof prior === "object" && (prior as Record<string, unknown>).attribution === "page_checked";
    const freshSuggested = item && typeof item === "object" && (item as Record<string, unknown>).attribution !== "page_checked";
    // A failed check must never downgrade a prior page verification.
    if (!priorChecked || !freshSuggested) merged.set(key, item);
  }
  return [...merged.values()];
}

function recommendationMetaKey(kind: "brief" | "restriction", owner: string, projectId: string, storyKey: string, contactId?: number): string {
  return `mediaRecommendation:${kind}:${owner}:${projectId}:${storyKey}${contactId === undefined ? "" : `:${contactId}`}`;
}

async function savedRecommendationBrief(owner: string, projectId: string, storyKey: string): Promise<TargetingBrief | null> {
  const [row] = await db.select({ value: platformMetaTable.value }).from(platformMetaTable)
    .where(eq(platformMetaTable.key, recommendationMetaKey("brief", owner, projectId, storyKey))).limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    return normaliseBrief(parsed, emptyTargetingBrief([], []));
  } catch {
    return null;
  }
}

async function restrictedContactIds(owner: string, projectId: string, storyKey: string): Promise<Set<number>> {
  const rows = await db.select({ key: platformMetaTable.key, value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(sql`${platformMetaTable.key} LIKE ${`mediaRecommendation:restriction:${owner}:${projectId}:${storyKey}:%`}`);
  return new Set(rows.filter((row) => row.value === "true").map((row) => Number(row.key.split(":").pop())).filter(Number.isFinite));
}

async function saveRecommendationMeta(key: string, value: string): Promise<void> {
  await db.insert(platformMetaTable).values({ key, value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

async function deleteRecommendationMeta(key: string): Promise<void> {
  await db.delete(platformMetaTable).where(eq(platformMetaTable.key, key));
}

async function departedContactIds(contactIds: number[], accountId?: string): Promise<Set<number>> {
  if (!contactIds.length) return new Set();
  const rows = await db.select().from(mediaContactStatusEventsTable)
    .where(and(inArray(mediaContactStatusEventsTable.contactId, contactIds), ...(accountId ? [eq(mediaContactStatusEventsTable.accountId, accountId)] : [])))
    .orderBy(desc(mediaContactStatusEventsTable.id));
  const latest = new Map<number, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.contactId)) latest.set(row.contactId, row);
  return new Set([...latest].filter(([, row]) => row.status === "departed").map(([id]) => id));
}

async function evaluationSummary(accountId: string, projectId: string, storyKey: string, evaluated: number, shortlisted: number) {
  const [outreach, decisions] = await Promise.all([
    db.select({ status: mediaOutreachTable.status, contactId: mediaOutreachTable.contactId }).from(mediaOutreachTable).where(and(
      eq(mediaOutreachTable.accountId, accountId), eq(mediaOutreachTable.projectId, projectId), eq(mediaOutreachTable.storyKey, storyKey),
    )),
    db.select({ decision: mediaRecommendationDecisionsTable.decision, contactId: mediaRecommendationDecisionsTable.contactId }).from(mediaRecommendationDecisionsTable).where(and(
      eq(mediaRecommendationDecisionsTable.accountId, accountId), eq(mediaRecommendationDecisionsTable.projectId, projectId), eq(mediaRecommendationDecisionsTable.storyKey, storyKey),
    )),
  ]);
  return {
    evaluated,
    shortlisted: decisions.filter((row) => row.decision === "shortlisted").length,
    contacted: new Set([
      ...outreach.filter((row) => row.status !== "planned" && row.contactId !== null).map((row) => row.contactId as number),
      ...decisions.filter((row) => row.decision === "contacted" && row.contactId !== null).map((row) => row.contactId),
    ]).size,
    responded: outreach.filter((row) => ["responded", "accepted", "declined", "placed"].includes(row.status)).length,
    placed: outreach.filter((row) => row.status === "placed").length,
  };
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

router.get("/store/media-db/recommendations/brief", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
  const storyKey = typeof req.query.storyKey === "string" ? req.query.storyKey.trim().slice(0, 200) : "";
  const owner = projectId ? await visibleProjectOwner(req, projectId) : null;
  if (!owner || !storyKey || !(await assertCanonicalStoryVisible(req, projectId, storyKey))) { res.status(404).json({ error: "Project or article not found" }); return; }
  res.json({ brief: await savedRecommendationBrief(owner, projectId, storyKey) });
});

router.put("/store/media-db/recommendations/brief", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
  const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
  const owner = projectId ? await visibleProjectOwner(req, projectId) : null;
  if (!owner || !storyKey || !(await assertCanonicalStoryVisible(req, projectId, storyKey)) || !req.body?.brief || typeof req.body.brief !== "object") { res.status(400).json({ error: "A valid project, article and targeting brief are required." }); return; }
  const brief = normaliseBrief(req.body.brief, emptyTargetingBrief([], []));
  await saveRecommendationMeta(recommendationMetaKey("brief", owner, projectId, storyKey), JSON.stringify(brief));
  res.json({ brief });
});

router.post("/store/media-db/recommendations/contact-restriction", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
  const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
  const contactId = Number(req.body?.contactId);
  const owner = projectId ? await visibleProjectOwner(req, projectId) : null;
  if (!owner || !storyKey || !(await assertCanonicalStoryVisible(req, projectId, storyKey)) || !Number.isInteger(contactId) || contactId < 1 || typeof req.body?.doNotContact !== "boolean") {
    res.status(400).json({ error: "Invalid contact restriction or project" }); return;
  }
  const visible = await visibleAccounts(req);
  const [contact] = await db.select({ accountId: mediaContactsTable.accountId, deletedAt: mediaContactsTable.deletedAt })
    .from(mediaContactsTable).where(eq(mediaContactsTable.id, contactId)).limit(1);
  if (!contact || contact.deletedAt || (contact.accountId !== null && visible !== null && !visible.includes(contact.accountId))) {
    res.status(403).json({ error: "Contact is not available to this account" }); return;
  }
  const key = recommendationMetaKey("restriction", owner, projectId, storyKey, contactId);
  if (req.body.doNotContact) await saveRecommendationMeta(key, "true");
  else await deleteRecommendationMeta(key);
  res.json({ doNotContact: req.body.doNotContact });
});

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
    if (!projectId || !storyKey || !(await assertCanonicalStoryVisible(req, projectId, storyKey))) { res.status(404).json({ error: "Project or article not found" }); return; }
    const owner = await visibleProjectOwner(req, projectId);
    if (!owner) { res.status(404).json({ error: "Project not found" }); return; }
    // Recommendation archives belong to the project owner's workspace, not to
    // the particular human member who happened to generate them.
    const accountId = owner;
    const derivedBrief = emptyTargetingBrief(terms, targetPhrases);
    const brief = normaliseBrief(req.body?.brief ?? await savedRecommendationBrief(owner, projectId, storyKey), derivedBrief);
    await saveRecommendationMeta(recommendationMetaKey("brief", owner, projectId, storyKey), JSON.stringify(brief));
    const [previousSet] = await db.select({ criteria: mediaRecommendationSetsTable.criteria })
      .from(mediaRecommendationSetsTable).where(and(
        eq(mediaRecommendationSetsTable.accountId, accountId), eq(mediaRecommendationSetsTable.projectId, projectId),
        eq(mediaRecommendationSetsTable.storyKey, storyKey),
      )).orderBy(desc(mediaRecommendationSetsTable.id)).limit(1);
    const previousCriteria = (previousSet?.criteria ?? {}) as RecommendationCriteria;
    const priorEvidence = previousCriteria.evidence ?? {};
    const priorWarnings = previousCriteria.warnings ?? {};
    const visible = await visibleAccounts(req);
    const contacts = (await db.select().from(mediaContactsTable).where(isNull(mediaContactsTable.deletedAt)))
      .filter((contact) => contact.accountId === null || visible === null || visible.includes(contact.accountId));
    const [departed, restrictions] = await Promise.all([
      departedContactIds(contacts.map((contact) => contact.id), owner),
      restrictedContactIds(owner, projectId, storyKey),
    ]);
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
      const departedContact = departed.has(contact.id);
      const doNotContact = restrictions.has(contact.id);
      const assessment = assessEditorialFit({
        contact,
        outlet,
        brief,
        terms,
        targetPhrases,
        evidence: priorEvidence[String(contact.id)] ?? [],
        departed: departedContact,
        doNotContact,
      });
      return {
        contact: {
          ...contact,
          outletName: outlet?.name ?? null,
          outletCategory: outlet?.category ?? null,
          outletWebsite: outlet?.website ?? null,
          outletCountry: outlet?.country ?? null,
          outletReachBand: outlet?.reachBand ?? null,
        },
        score: Math.max(Number(assessment.fitScore ?? 0), phraseMatches.exact.length * 15 + phraseMatches.topic.length * 5),
        reasons,
        assessment,
        phraseAttributions: buildPhraseAttributions({
          role: contact.role,
          beats: contact.beats,
          sectors: contact.sectors,
          publicationAuthority: outlet?.category ? contact.publicationAuthority : contact.publicationAuthority,
          publicationReach: outlet?.reachBand || contact.publicationReach,
          outletCategory: outlet?.category,
        }, targetPhrases),
      };
    }).filter((item) => item.score > 0 && item.assessment.readiness.status !== "blocked"
      && (!item.contact.outletId || outletById.has(item.contact.outletId)))
      .sort((a, b) => b.score - a.score || a.contact.id - b.contact.id).slice(0, 100);
    const assessments = Object.fromEntries(contacts.map((contact) => {
      const item = ranked.find((entry) => entry.contact.id === contact.id);
      if (item) return [String(contact.id), item.assessment];
      const outlet = contact.outletId ? outletById.get(contact.outletId) : undefined;
      return [String(contact.id), assessEditorialFit({ contact, outlet, brief, terms, targetPhrases, evidence: priorEvidence[String(contact.id)] ?? [], departed: departed.has(contact.id), doNotContact: restrictions.has(contact.id) })];
    }));
    const [set] = await db.insert(mediaRecommendationSetsTable).values({
      accountId,
      projectId,
      storyKey,
      criteria: { terms, targetPhrases, brief, assessments, evidence: priorEvidence, warnings: priorWarnings, rankingVersion: "editorial-v1", baseScores: Object.fromEntries(ranked.map((item) => [String(item.contact.id), item.score])) },
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
         assessment: (set.criteria as RecommendationCriteria).assessments?.[String(entry.item.contactId)] ?? null,
      })),
       brief,
       evaluation: await evaluationSummary(accountId, projectId, storyKey, contacts.length, ranked.length),
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

router.get("/store/media-db/recommendations", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
  const storyKey = typeof req.query.storyKey === "string" ? req.query.storyKey.trim().slice(0, 200) : "";
  if (!projectId || !storyKey || !(await assertCanonicalStoryVisible(req, projectId, storyKey))) { res.status(404).json({ error: "Project or article not found" }); return; }
  const accountId = await visibleProjectOwner(req, projectId);
  if (!accountId) { res.status(404).json({ error: "Project not found" }); return; }
  const [set] = await db.select().from(mediaRecommendationSetsTable).where(and(
    eq(mediaRecommendationSetsTable.accountId, accountId), eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey),
  )).orderBy(desc(mediaRecommendationSetsTable.id)).limit(1);
  if (!set) {
    res.json({ ok: true, recommendationSet: null, items: [], brief: null, evaluation: await evaluationSummary(accountId, projectId, storyKey, 0, 0) });
    return;
  }
  const criteria = (set.criteria ?? {}) as RecommendationCriteria;
  const savedBrief = criteria.brief ?? await savedRecommendationBrief(accountId, projectId, storyKey);
  const visible = await visibleAccounts(req);
  const rows = await db.select({
    item: mediaRecommendationItemsTable,
    contact: mediaContactsTable,
    outletName: mediaOutletsTable.name,
    outletCategory: mediaOutletsTable.category,
    outletWebsite: mediaOutletsTable.website,
    outletCountry: mediaOutletsTable.country,
    outletReachBand: mediaOutletsTable.reachBand,
    outletAccountId: mediaOutletsTable.accountId,
    outletDeletedAt: mediaOutletsTable.deletedAt,
  }).from(mediaRecommendationItemsTable)
    .innerJoin(mediaContactsTable, eq(mediaRecommendationItemsTable.contactId, mediaContactsTable.id))
    .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
    .where(and(eq(mediaRecommendationItemsTable.recommendationSetId, set.id), isNull(mediaContactsTable.deletedAt)));
  const visibleRows = filterVisibleRecommendationItems(rows.map((row) => ({ ...row, contact: row.contact })), visible);
  const [currentRestrictions, currentDeparted] = await Promise.all([
    restrictedContactIds(accountId, projectId, storyKey),
    departedContactIds(visibleRows.map((row) => row.contact.id), accountId),
  ]);
  const items = visibleRows.map((row) => {
    const canSeeOutlet = !row.outletDeletedAt && outletVisible(row.outletAccountId, visible);
    const outletFields = canSeeOutlet
      ? { outletName: row.outletName, outletCategory: row.outletCategory, outletWebsite: row.outletWebsite, outletCountry: row.outletCountry, outletReachBand: row.outletReachBand }
      : { outletName: null, outletCategory: null, outletWebsite: null, outletCountry: null, outletReachBand: null };
    const baseAssessment = assessEditorialFit({
      contact: row.contact,
      outlet: canSeeOutlet ? { name: row.outletName, category: row.outletCategory, website: row.outletWebsite, country: row.outletCountry, reachBand: row.outletReachBand } : {},
    brief: savedBrief ?? emptyTargetingBrief(criteria.terms ?? [], criteria.targetPhrases ?? []),
      terms: criteria.terms,
      targetPhrases: criteria.targetPhrases,
      evidence: criteria.evidence?.[String(row.contact.id)] ?? [],
      departed: currentDeparted.has(row.contact.id),
      doNotContact: currentRestrictions.has(row.contact.id),
    });
    const assessment = {
      ...baseAssessment,
      warnings: [...baseAssessment.warnings, ...(criteria.warnings?.[String(row.contact.id)] ?? [])],
    };
    return {
      rank: row.item.rank, contact: { ...row.contact, ...outletFields }, score: row.item.score, reasons: row.item.reasons,
      phraseAttributions: row.item.phraseAttributions, assessment,
    };
  });
  res.json({
    ok: true, recommendationSet: set, items, brief: savedBrief,
    evaluation: await evaluationSummary(accountId, projectId, storyKey, Object.keys(criteria.assessments ?? {}).length, items.length),
  });
});

router.post("/store/media-db/recommendations/enrich", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
    const storyKey = typeof req.body?.storyKey === "string" ? req.body.storyKey.trim().slice(0, 200) : "";
    const recommendationSetId = Number(req.body?.recommendationSetId);
    if (!projectId || !storyKey || !Number.isInteger(recommendationSetId) || !(await assertCanonicalStoryVisible(req, projectId, storyKey))) {
      res.status(400).json({ error: "Invalid recommendation set or project" }); return;
    }
    const owner = await visibleProjectOwner(req, projectId);
    if (!owner) { res.status(404).json({ error: "Project not found" }); return; }
    const accountId = owner;
    const spend = await checkMonthlySpendLimit(accountId);
    if (!spend.allowed) { res.status(429).json({ error: "Monthly spending limit reached." }); return; }
    const usage = await checkFairUsage(accountId, projectId);
    if (!usage.allowed) { res.status(429).json({ error: "This project's AI usage limit has been reached." }); return; }
    const [set] = await db.select().from(mediaRecommendationSetsTable).where(and(
      eq(mediaRecommendationSetsTable.id, recommendationSetId), eq(mediaRecommendationSetsTable.accountId, accountId),
      eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey),
    )).limit(1);
    if (!set) { res.status(404).json({ error: "Recommendation set not found" }); return; }
    const criteria = (set.criteria ?? {}) as RecommendationCriteria;
    const brief = await savedRecommendationBrief(owner, projectId, storyKey);
    if (!brief) {
      res.status(409).json({ error: "A saved targeting brief is required before enrichment." });
      return;
    }
    const rows = await db.select({ item: mediaRecommendationItemsTable, contact: mediaContactsTable, outlet: mediaOutletsTable })
      .from(mediaRecommendationItemsTable).innerJoin(mediaContactsTable, eq(mediaRecommendationItemsTable.contactId, mediaContactsTable.id))
      .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
      .where(eq(mediaRecommendationItemsTable.recommendationSetId, set.id))
      .orderBy(mediaRecommendationItemsTable.rank);
    const enrichmentRows = rows.slice(0, 5);
    const restrictions = await restrictedContactIds(owner, projectId, storyKey);
    const departed = await departedContactIds(rows.map((row) => row.contact.id), owner);
    const assessments: Record<string, EditorialAssessment> = { ...(criteria.assessments ?? {}) };
    const evidence: Record<string, unknown[]> = { ...(criteria.evidence ?? {}) };
    const warnings: Record<string, string[]> = { ...(criteria.warnings ?? {}) };
    const enriched: Array<typeof rows[number] & { assessment: EditorialAssessment; score: number }> = [];
    try {
      // Keep provider calls bounded and auditable. The set itself is already
      // sorted, and only its first five candidates may trigger enrichment.
      for (const row of enrichmentRows) {
        const collected = await collectJournalistCoverage({
          contact: {
            name: `${row.contact.firstName} ${row.contact.lastName}`.trim(),
            outletName: row.outlet?.name,
            sourceUrl: row.contact.sourceUrl,
          },
          brief,
          now: new Date(),
        });
        const priorEvidence = criteria.evidence?.[String(row.contact.id)] ?? [];
        evidence[String(row.contact.id)] = mergeCoverageEvidence(priorEvidence, collected.evidence);
        warnings[String(row.contact.id)] = [...new Set([
          ...(criteria.warnings?.[String(row.contact.id)] ?? []),
          ...collected.warnings,
        ])];
        const baseAssessment = assessEditorialFit({
          contact: row.contact, outlet: row.outlet, brief, terms: criteria.terms,
          targetPhrases: criteria.targetPhrases, evidence: evidence[String(row.contact.id)],
          departed: departed.has(row.contact.id), doNotContact: restrictions.has(row.contact.id),
        });
        const assessment = { ...baseAssessment, warnings: [...baseAssessment.warnings, ...collected.warnings] };
        assessments[String(row.contact.id)] = assessment;
        enriched.push({ ...row, assessment, score: assessment.fitScore ?? row.item.score });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Coverage collection failed";
      res.status(502).json({ error: `Failed to collect journalist coverage: ${message}` });
      return;
    }
    // Count the completed provider action only after all bounded collection
    // calls succeed. A failed enrichment therefore consumes no AI usage.
    await db.insert(tokenUsageTable).values({
      accountId,
      operation: "content-media-recommendations-enrich",
      model: "gpt-5.4-mini",
      inputTokens: 0,
      outputTokens: 0,
      costGbpEstimate: "0",
      projectId,
    });
    const latestBrief = await savedRecommendationBrief(owner, projectId, storyKey);
    if (latestBrief && !briefsEqual(latestBrief, brief)) {
      res.status(409).json({ error: "Recommendations changed while enrichment was running. Reload and try again." });
      return;
    }
    const nextCriteria: RecommendationCriteria = { ...criteria, brief, assessments, evidence, warnings, rankingVersion: "editorial-v1" };
    const committed = await db.transaction(async (tx) => {
      // Criteria is the optimistic-lock snapshot. Two slow enrichments can
      // both finish provider calls, but only the first one may commit its
      // evidence and item scores.
      const [updated] = await tx.update(mediaRecommendationSetsTable)
        .set({ criteria: nextCriteria })
        .where(and(
          eq(mediaRecommendationSetsTable.id, set.id),
          sql`${mediaRecommendationSetsTable.criteria} = ${JSON.stringify(criteria)}::jsonb`,
        ))
        .returning();
      if (!updated) return { race: true as const };
      await Promise.all(enriched.map((row, index) => tx.update(mediaRecommendationItemsTable)
        .set({ score: row.score, rank: index + 1 }).where(and(
          eq(mediaRecommendationItemsTable.id, row.item.id),
          eq(mediaRecommendationItemsTable.recommendationSetId, set.id),
        ))));
      return { race: false as const, updated };
    });
    if (committed.race) {
      res.status(409).json({ error: "Recommendations changed while enrichment was running. Reload and try again." });
      return;
    }
    const updatedSet = committed.updated;
    res.json({
      ok: true, recommendationSet: updatedSet,
       items: rows.map((row, index) => {
         const enrichedRow = enriched.find((candidate) => candidate.contact.id === row.contact.id);
         return {
           rank: index + 1,
           contact: { ...row.contact, outletName: row.outlet?.name ?? null, outletCategory: row.outlet?.category ?? null, outletWebsite: row.outlet?.website ?? null, outletCountry: row.outlet?.country ?? null, outletReachBand: row.outlet?.reachBand ?? null },
           score: enrichedRow?.score ?? row.item.score,
           reasons: row.item.reasons,
           phraseAttributions: row.item.phraseAttributions,
           assessment: enrichedRow?.assessment ?? assessments[String(row.contact.id)] ?? null,
         };
       }),
      brief, evaluation: await evaluationSummary(accountId, projectId, storyKey, Object.keys(assessments).length, enriched.length),
    });
  } catch (error) {
    req.log.error({ err: error }, "media recommendation enrichment failed");
    res.status(500).json({ error: "Failed to enrich recommendations" });
  }
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
  const sets = await db.select({ id: mediaRecommendationSetsTable.id, criteria: mediaRecommendationSetsTable.criteria })
    .from(mediaRecommendationSetsTable)
    .where(and(eq(mediaRecommendationSetsTable.accountId, accountId), eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey)))
    .orderBy(desc(mediaRecommendationSetsTable.createdAt), desc(mediaRecommendationSetsTable.id))
    .limit(1);
  const feedback = await db.select().from(mediaRecommendationFeedbackTable).where(and(eq(mediaRecommendationFeedbackTable.accountId, accountId), eq(mediaRecommendationFeedbackTable.projectId, projectId), eq(mediaRecommendationFeedbackTable.storyKey, storyKey)));
  const recommendationCriteria = (sets[0]?.criteria ?? {}) as RecommendationCriteria;
  const candidateItems = sets.length ? await db.select({ id: mediaRecommendationItemsTable.id, recommendationSetId: mediaRecommendationItemsTable.recommendationSetId, score: mediaRecommendationItemsTable.score, rank: mediaRecommendationItemsTable.rank, reasons: mediaRecommendationItemsTable.reasons, phraseAttributions: mediaRecommendationItemsTable.phraseAttributions, contact: mediaContactsTable, outletName: mediaOutletsTable.name, outletCategory: mediaOutletsTable.category, outletWebsite: mediaOutletsTable.website, outletCountry: mediaOutletsTable.country, outletReachBand: mediaOutletsTable.reachBand, outletAccountId: mediaOutletsTable.accountId, outletDeletedAt: mediaOutletsTable.deletedAt })
    .from(mediaRecommendationItemsTable)
    .innerJoin(mediaContactsTable, eq(mediaRecommendationItemsTable.contactId, mediaContactsTable.id))
    .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
    .where(and(eq(mediaRecommendationItemsTable.recommendationSetId, sets[0].id), isNull(mediaContactsTable.deletedAt))) : [];
  const [decisionRestrictions, decisionDeparted] = await Promise.all([
    restrictedContactIds(accountId, projectId, storyKey),
    departedContactIds(candidateItems.map((item) => item.contact.id), accountId),
  ]);
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
      assessment: {
        ...assessEditorialFit({
          contact: item.contact,
          outlet: canSeeOutlet ? { name: item.outletName, category: item.outletCategory, website: item.outletWebsite, country: item.outletCountry, reachBand: item.outletReachBand } : {},
          brief: recommendationCriteria.brief ?? emptyTargetingBrief(recommendationCriteria.terms ?? [], recommendationCriteria.targetPhrases ?? []),
          terms: recommendationCriteria.terms,
          targetPhrases: recommendationCriteria.targetPhrases,
          evidence: recommendationCriteria.evidence?.[String(item.contact.id)] ?? [],
          departed: decisionDeparted.has(item.contact.id),
          doNotContact: decisionRestrictions.has(item.contact.id),
        }),
        warnings: [
          ...(recommendationCriteria.assessments?.[String(item.contact.id)]?.warnings ?? []),
          ...(recommendationCriteria.warnings?.[String(item.contact.id)] ?? []),
        ],
      },
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
    const baseAssessment = assessEditorialFit({
      contact: row.contact,
      outlet: canSeeOutlet ? { name: row.outletName, category: row.outletCategory, website: row.outletWebsite, country: row.outletCountry, reachBand: row.outletReachBand } : {},
      brief: recommendationCriteria.brief ?? emptyTargetingBrief(recommendationCriteria.terms ?? [], recommendationCriteria.targetPhrases ?? []),
      terms: recommendationCriteria.terms,
      targetPhrases: recommendationCriteria.targetPhrases,
      evidence: recommendationCriteria.evidence?.[String(row.contact.id)] ?? [],
      departed: decisionDeparted.has(row.contact.id),
      doNotContact: decisionRestrictions.has(row.contact.id),
    });
    return [{ contactId: row.contact.id, contact: { ...row.contact, ...outletFields }, assessment: {
      ...baseAssessment,
      warnings: [...baseAssessment.warnings, ...(recommendationCriteria.warnings?.[String(row.contact.id)] ?? [])],
    } }];
  });
  res.json({ decisions, items, decisionContacts, feedback });
});

router.get("/store/media-db/outreach", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const storyKey = typeof req.query.storyKey === "string" ? req.query.storyKey : "";
  const accountId = projectId ? await visibleProjectOwner(req, projectId) : null;
  if (!accountId) { res.status(404).json({ error: "Project not found" }); return; }
  const outreachScope = storyKey
    ? and(eq(mediaOutreachTable.accountId, accountId), eq(mediaOutreachTable.projectId, projectId), eq(mediaOutreachTable.storyKey, storyKey))
    : and(eq(mediaOutreachTable.accountId, accountId), eq(mediaOutreachTable.projectId, projectId));
  const outreach = await db.select().from(mediaOutreachTable).where(outreachScope).orderBy(desc(mediaOutreachTable.updatedAt));
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
    const [blockedByStatus, restrictions] = await Promise.all([
      departedContactIds([contactId], accountId),
      restrictedContactIds(accountId, projectId, storyKey),
    ]);
    if (blockedByStatus.has(contactId) || restrictions.has(contactId)) {
      res.status(409).json({ error: "This contact is not eligible for new outreach." });
      return;
    }
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
    if (nextStatus === "pitched") {
      const [blockedByStatus, restrictions] = await Promise.all([
        current.contactId ? departedContactIds([current.contactId], accountId) : Promise.resolve(new Set<number>()),
        current.contactId ? restrictedContactIds(accountId, current.projectId, current.storyKey) : Promise.resolve(new Set<number>()),
      ]);
      if ((current.contactId && blockedByStatus.has(current.contactId)) || (current.contactId && restrictions.has(current.contactId))) {
        res.status(409).json({ error: "This contact is not eligible to be pitched." });
        return;
      }
    }
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
