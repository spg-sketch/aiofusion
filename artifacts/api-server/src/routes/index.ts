import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import diagnosticRouter from "./diagnostic";
import seoAuditRouter from "./seo-audit";
import llmCheckRouter from "./llm-check";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(diagnosticRouter);
router.use(seoAuditRouter);
router.use(llmCheckRouter);

export default router;
