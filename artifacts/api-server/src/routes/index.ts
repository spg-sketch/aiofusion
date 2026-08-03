import { Router, type IRouter } from "express";
import { blockReadOnlyMembers } from "../middleware/platform-auth";
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
import platformRouter from "./platform";
import teamRouter from "./team";
import adminRouter from "./admin";
import contactRouter from "./contact";
import supportRouter from "./support";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(platformRouter);
router.use(teamRouter);
router.use(adminRouter);
// AI action routes are off-limits for viewer (read-only) and billing members.
router.use(
  ["/diagnostic", "/seo-audit", "/llm-check", "/ai-assist", "/content"],
  blockReadOnlyMembers,
);
router.use(diagnosticRouter);
router.use(seoAuditRouter);
router.use(llmCheckRouter);
router.use(aiAssistRouter);
router.use(contentAiRouter);
router.use(storeRouter);
router.use(storeContentRouter);
router.use(storeAuditsRouter);
router.use(mediaDbRouter);
router.use(contactRouter);
router.use(supportRouter);

export default router;
