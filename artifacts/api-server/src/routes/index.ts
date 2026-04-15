import { Router, type IRouter } from "express";
import healthRouter from "./health";
import diagnosticRouter from "./diagnostic";
import seoAuditRouter from "./seo-audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(diagnosticRouter);
router.use(seoAuditRouter);

export default router;
