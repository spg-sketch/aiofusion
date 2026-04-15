import { Router, type IRouter } from "express";
import healthRouter from "./health";
import diagnosticRouter from "./diagnostic";
import seoAuditRouter from "./seo-audit";
import llmCheckRouter from "./llm-check";

const router: IRouter = Router();

router.use(healthRouter);
router.use(diagnosticRouter);
router.use(seoAuditRouter);
router.use(llmCheckRouter);

export default router;
