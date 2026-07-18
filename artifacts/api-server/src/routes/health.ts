import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { features } from "../lib/features";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  const activeFlags = Object.entries(features)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  res.json({ ...data, features: activeFlags });
});

export default router;
