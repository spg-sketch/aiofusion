import { Router, type IRouter } from "express";
import { blockReadOnlyMembers, requirePaidOrTrial } from "../middleware/platform-auth";
import healthRouter from "./health";
import authRouter from "./auth";
import diagnosticRouter from "./diagnostic";
import seoAuditRouter from "./seo-audit";
import llmCheckRouter from "./llm-check";
import aiAssistRouter from "./ai-assist";
import contentAiRouter from "./content-ai";
import storeRouter from "./store";
import storeContentRouter from "./store-content";
import storeAuditsRouter from "./store-audits";
import mediaDbRouter from "./media-db";
import mediaDiscoveryInstructionsRouter from "./media-discovery-instructions";
import platformRouter from "./platform";
import billingRouter from "./billing";
import teamRouter from "./team";
import adminRouter from "./admin";
import contactRouter from "./contact";
import supportRouter from "./support";
import publicAssetsRouter from "./public-assets";
import insightsRouter from "./insights";
import journalistPrivacyRouter from "./journalist-privacy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicAssetsRouter);
router.use(journalistPrivacyRouter);
router.use(insightsRouter);
router.use(authRouter);
router.use(platformRouter);
router.use(billingRouter);
router.use(teamRouter);
router.use(adminRouter);
// AI action routes are off-limits for viewer (read-only) and billing members.
router.use(
  ["/diagnostic", "/seo-audit", "/llm-check", "/ai-assist", "/content"],
  blockReadOnlyMembers,
  requirePaidOrTrial,
);
// Recommendation enrichment performs a paid provider lookup and records AI
// usage, so protect this exact media route before mounting the rest of the
// media database (which also contains non-AI reads and mutations).
router.use(
  "/store/media-db/recommendations/enrich",
  blockReadOnlyMembers,
  requirePaidOrTrial,
);
router.use(
  "/store/projects/:id/audits/:auditId/retry-assessment",
  blockReadOnlyMembers,
  requirePaidOrTrial,
);
router.use(diagnosticRouter);
router.use(seoAuditRouter);
router.use(llmCheckRouter);
router.use(aiAssistRouter);
router.use(contentAiRouter);
router.use(storeRouter);
router.use(storeContentRouter);
router.use(storeAuditsRouter);
router.use(mediaDiscoveryInstructionsRouter);
router.use(mediaDbRouter);
router.use(contactRouter);
router.use(supportRouter);

export default router;
