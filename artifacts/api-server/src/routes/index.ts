import { Router, type IRouter } from "express";
import healthRouter from "./health";
import diagnosticRouter from "./diagnostic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(diagnosticRouter);

export default router;
