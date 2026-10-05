import type { IRouter, Request, Response } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db, archiveItemsTable, mediaContactsTable, mediaOutletsTable, mediaRecommendationItemsTable,
  mediaRecommendationSetsTable, projectsTable, platformAccountsTable, platformMetaTable, mediaContactStatusEventsTable,
} from "@workspace/db";
import { GenerateMediaPitchSuggestionsBody } from "@workspace/api-zod";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { checkFairUsage, checkMonthlySpendLimit } from "../lib/fair-usage";
import {
  reserveJournalistCoverageUsageBatch, settleJournalistCoverageUsage,
  MonthlySpendCapReservationError, CoverageAccountingError, safeCoverageAccountingDiagnostic,
} from "../lib/token-usage";
import { acquirePrivacyIdentityLock, createSuppressionMatcherWithDb } from "../lib/journalist-privacy";
import {
  currentMediaPitch, generateMediaPitchSuggestions, mediaPitchConfigured, mediaPitchContextHash,
  type MediaPitchContext, type SavedMediaPitch,
} from "../lib/media-pitch-suggestions";
import type { TargetingBrief } from "../lib/media-editorial-ranking";

type Dependencies = {
  assertCanonicalStoryVisible(req: Request, projectId: string, storyKey: string): Promise<boolean>;
  visibleProjectOwner(req: Request, projectId: string): Promise<string | null>;
  visibleAccounts(req: Request): Promise<string[] | null>;
  visibleAccountsFromHierarchy(req: Request, rows: Array<{ username: string; parent: string | null }>): string[] | null;
  savedRecommendationBrief(owner: string, projectId: string, storyKey: string): Promise<TargetingBrief | null>;
  restrictedContactIds(owner: string, projectId: string, storyKey: string): Promise<Set<number>>;
  departedContactIds(ids: number[], owner: string): Promise<Set<number>>;
  withCommitLock<T>(key: string, operation: () => Promise<T>): Promise<T>;
};
type PitchCriteria = Record<string, unknown> & { pitchSuggestions?: Record<string, SavedMediaPitch> };
const OPERATION = "content-media-pitch-suggestions" as const;
const activeBatches = new Set<string>();

export function registerMediaPitchRoutes(router: IRouter, deps: Dependencies) {
  router.post("/store/media-db/recommendations/pitch-suggestions", requirePlatformAuth, async (req: Request, res: Response): Promise<void> => {
    let batchKey: string | undefined;
    try {
      const parsed = GenerateMediaPitchSuggestionsBody.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "Choose one to five distinct displayed contacts from a recommendation set." }); return; }
      const { projectId, storyKey, recommendationSetId, contactIds } = parsed.data;
      if (typeof projectId !== "string" || typeof storyKey !== "string"
          || !Number.isSafeInteger(recommendationSetId) || !Array.isArray(contactIds)
          || contactIds.length < 1 || contactIds.length > 5
          || contactIds.some((id) => !Number.isSafeInteger(id) || id < 1)
          || new Set(contactIds).size !== contactIds.length) {
        res.status(400).json({ error: "Choose one to five distinct displayed contacts from a recommendation set." }); return;
      }
      if (!(await deps.assertCanonicalStoryVisible(req, projectId, storyKey))) {
        res.status(404).json({ error: "Article or project not found." }); return;
      }
      const owner = await deps.visibleProjectOwner(req, projectId);
      if (!owner) { res.status(404).json({ error: "Project not found." }); return; }
      const setScope = and(eq(mediaRecommendationSetsTable.accountId, owner), eq(mediaRecommendationSetsTable.projectId, projectId), eq(mediaRecommendationSetsTable.storyKey, storyKey));
      const [set] = await db.select().from(mediaRecommendationSetsTable).where(setScope).orderBy(desc(mediaRecommendationSetsTable.id)).limit(1);
      if (!set || set.id !== recommendationSetId) {
        res.status(409).json({ error: "Recommendations changed. Reload the article's matches before generating pitches." }); return;
      }
      batchKey = `${owner}:${projectId}:${storyKey}:${set.id}`;
      if (activeBatches.has(batchKey)) {
        batchKey = undefined;
        res.status(409).json({ error: "Pitch suggestions are already being generated for this article." }); return;
      }
      activeBatches.add(batchKey);
      const criteria = (set.criteria ?? {}) as PitchCriteria;
      const brief = await deps.savedRecommendationBrief(owner, projectId, storyKey);
      const [story] = await db.select().from(archiveItemsTable).where(and(eq(archiveItemsTable.id, storyKey), eq(archiveItemsTable.projectId, projectId), isNull(archiveItemsTable.deletedAt))).limit(1);
      if (!brief || !story) { res.status(409).json({ error: "Save a targeting brief and article before generating pitches." }); return; }
      const visible = await deps.visibleAccounts(req);
      const rows = await db.select({ contact: mediaContactsTable, outlet: mediaOutletsTable })
        .from(mediaRecommendationItemsTable)
        .innerJoin(mediaContactsTable, eq(mediaRecommendationItemsTable.contactId, mediaContactsTable.id))
        .leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
        .where(and(eq(mediaRecommendationItemsTable.recommendationSetId, set.id), inArray(mediaContactsTable.id, contactIds), isNull(mediaContactsTable.deletedAt)));
      const [restrictions, departed, suppression] = await Promise.all([
        deps.restrictedContactIds(owner, projectId, storyKey), deps.departedContactIds(contactIds, owner), createSuppressionMatcherWithDb(db, owner),
      ]);
      const eligible = rows.filter(({ contact, outlet }) => (
        (contact.accountId === null || visible !== null && visible.includes(contact.accountId))
        && (!contact.outletId || outlet && !outlet.deletedAt && (outlet.accountId === null || visible !== null && visible.includes(outlet.accountId)))
        && !restrictions.has(contact.id) && !departed.has(contact.id)
        && !/\b(former|departed|retired|inactive)\b/i.test(contact.editorialStatus)
        && !suppression({ ...contact, name: `${contact.firstName} ${contact.lastName}`, outlet: outlet?.name, accountId: owner })
      ));
      if (eligible.length !== contactIds.length) {
        res.status(409).json({ error: "One or more selected contacts are unavailable. Reload the current matches." }); return;
      }
      const contexts = new Map(eligible.map(({ contact, outlet }) => [contact.id, { article: story, brief, contact, outlet } as MediaPitchContext]));
      const cached = eligible.flatMap(({ contact }) => {
        const pitch = currentMediaPitch(criteria.pitchSuggestions?.[String(contact.id)], contexts.get(contact.id)!);
        return pitch ? [{ contactId: contact.id, ...pitch, error: "" }] : [];
      });
      const cachedIds = new Set(cached.map((pitch) => pitch.contactId));
      const pending = eligible.filter(({ contact }) => !cachedIds.has(contact.id));
      if (!pending.length) { res.json({ suggestions: cached, generated: 0, reused: cached.length }); return; }
      const [fairUsage, spend] = await Promise.all([checkFairUsage(owner, projectId), checkMonthlySpendLimit(owner)]);
      if (!fairUsage.allowed || !spend.allowed) { res.status(429).json({ error: "AI usage or monthly spending limit reached." }); return; }
      if (!mediaPitchConfigured()) { res.status(503).json({ error: "Pitch generation is not configured." }); return; }
      const [reservationId] = await reserveJournalistCoverageUsageBatch({
        accountId: owner, projectId, limitGbp: spend.monitoringOnly ? null : spend.limitGbp, callCount: 1, operation: OPERATION,
      });
      // One paid batch call, no retry. An ambiguous failure retains its conservative reservation.
      const generated = await generateMediaPitchSuggestions(pending.map(({ contact }) => ({ contactId: contact.id, context: contexts.get(contact.id)! })));
      await settleJournalistCoverageUsage({ reservationId, accountId: owner, projectId, ...generated.usage, webSearchCalls: 0, operation: OPERATION });
      const latestBrief = await deps.savedRecommendationBrief(owner, projectId, storyKey);
      if (!(await deps.assertCanonicalStoryVisible(req, projectId, storyKey)) || await deps.visibleProjectOwner(req, projectId) !== owner
          || JSON.stringify(latestBrief) !== JSON.stringify(brief)) {
        res.status(409).json({ error: "Article access or targeting brief changed during generation. Reload before trying again." }); return;
      }
      const committed = await deps.withCommitLock(batchKey, () => db.transaction(async (tx) => {
        await acquirePrivacyIdentityLock(tx, "recommendations");
        const hierarchy = await tx.select({ username: platformAccountsTable.username, parent: platformAccountsTable.parent }).from(platformAccountsTable).for("share");
        const projectVisible = deps.visibleAccountsFromHierarchy(req, hierarchy);
        const mediaVisible = req.account ? [req.account.username.toLowerCase()] : [];
        const [project] = await tx.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), isNull(projectsTable.deletedAt))).for("share").limit(1);
        const [currentStory] = await tx.select().from(archiveItemsTable).where(and(eq(archiveItemsTable.id, storyKey), eq(archiveItemsTable.projectId, projectId), isNull(archiveItemsTable.deletedAt))).for("share").limit(1);
        const [currentSet] = await tx.select().from(mediaRecommendationSetsTable).where(setScope).orderBy(desc(mediaRecommendationSetsTable.id)).limit(1);
        const [briefRow] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, `mediaRecommendation:brief:${owner}:${projectId}:${storyKey}`)).for("share").limit(1);
        if (!project || project.owner !== owner || projectVisible !== null && !projectVisible.includes(owner)
            || !currentStory || currentSet?.id !== set.id || JSON.stringify(currentSet.criteria) !== JSON.stringify(set.criteria)
            || !briefRow || JSON.stringify(JSON.parse(briefRow.value)) !== JSON.stringify(brief)) return null;
        const currentRows = await tx.select({ contact: mediaContactsTable, outlet: mediaOutletsTable })
          .from(mediaContactsTable).leftJoin(mediaOutletsTable, eq(mediaContactsTable.outletId, mediaOutletsTable.id))
          .where(and(inArray(mediaContactsTable.id, contactIds), isNull(mediaContactsTable.deletedAt)));
        const currentSuppression = await createSuppressionMatcherWithDb(tx, owner);
        const currentRestrictions = await tx.select().from(platformMetaTable).where(inArray(
          platformMetaTable.key, contactIds.map((id) => `mediaRecommendation:restriction:${owner}:${projectId}:${storyKey}:${id}`),
        ));
        const statusRows = await tx.select().from(mediaContactStatusEventsTable).where(and(
          inArray(mediaContactStatusEventsTable.contactId, contactIds), eq(mediaContactStatusEventsTable.accountId, owner),
        )).orderBy(desc(mediaContactStatusEventsTable.id));
        const currentDeparted = new Map<number, string>();
        for (const row of statusRows) if (!currentDeparted.has(row.contactId)) currentDeparted.set(row.contactId, row.status);
        if (currentRestrictions.some((row) => row.value === "true") || [...currentDeparted.values()].includes("departed")) return null;
        if (currentRows.length !== contactIds.length || currentRows.some(({ contact, outlet }) => (
          contact.accountId !== null && !mediaVisible.includes(contact.accountId)
          || contact.outletId && (!outlet || outlet.deletedAt || outlet.accountId !== null && !mediaVisible.includes(outlet.accountId))
          || currentSuppression({ ...contact, name: `${contact.firstName} ${contact.lastName}`, outlet: outlet?.name, accountId: owner })
          || /\b(former|departed|retired|inactive)\b/i.test(contact.editorialStatus)
          || mediaPitchContextHash({ article: currentStory, brief, contact, outlet }) !== mediaPitchContextHash(contexts.get(contact.id)!)
        ))) return null;
        const pitches = { ...criteria.pitchSuggestions };
        const suggestions = generated.suggestions.map((suggestion) => {
          const context = contexts.get(suggestion.contactId);
          if (!context || !suggestion.angle) return { ...suggestion, kind: "ai-suggestion" as const };
          const pitch: SavedMediaPitch = { angle: suggestion.angle, contextHash: mediaPitchContextHash(context), generatedAt: new Date().toISOString(), kind: "ai-suggestion" };
          pitches[String(suggestion.contactId)] = pitch;
          return { contactId: suggestion.contactId, ...pitch, error: "" };
        });
        const [updated] = await tx.update(mediaRecommendationSetsTable).set({ criteria: {
          ...criteria, pitchSuggestions: pitches, pitchSuggestionVersion: Number(criteria.pitchSuggestionVersion || 0) + 1,
        } }).where(and(eq(mediaRecommendationSetsTable.id, set.id), sql`${mediaRecommendationSetsTable.criteria} = ${JSON.stringify(set.criteria)}::jsonb`)).returning({ id: mediaRecommendationSetsTable.id });
        return updated ? suggestions : null;
      }));
      if (!committed) { res.status(409).json({ error: "Article, contacts or recommendations changed during generation. Reload the matches." }); return; }
      res.json({ suggestions: [...cached, ...committed], generated: committed.filter((pitch) => pitch.angle).length, reused: cached.length });
    } catch (error) {
      if (error instanceof MonthlySpendCapReservationError) { res.status(429).json({ error: "Monthly spending limit reached." }); return; }
      if (error instanceof CoverageAccountingError) {
        req.log.error(safeCoverageAccountingDiagnostic(error), "media pitch accounting failed");
        res.status(503).json({ error: "Pitch usage could not be recorded safely. No automatic retry was made." }); return;
      }
      req.log.error({ err: error }, "media pitch generation failed");
      res.status(502).json({ error: "Pitch generation did not complete. Existing suggestions are unchanged; no automatic retry was made." });
    } finally {
      if (batchKey) activeBatches.delete(batchKey);
    }
  });
}
