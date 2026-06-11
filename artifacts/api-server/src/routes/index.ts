import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import diagnosticRouter from "./diagnostic";
import seoAuditRouter from "./seo-audit";
import llmCheckRouter from "./llm-check";
import aiAssistRouter from "./ai-assist";
import contentAiRouter from "./content-ai";
import storeRouter from "./store";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(diagnosticRouter);
router.use(seoAuditRouter);
router.use(llmCheckRouter);
router.use(aiAssistRouter);
router.use(contentAiRouter);
router.use(storeRouter);

export default router;
