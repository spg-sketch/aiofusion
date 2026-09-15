import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { features } from "../lib/features";
import { getRuntimeState } from "../lib/runtime-lifecycle";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const state = getRuntimeState();
  if (state !== "ready") {
    res.status(503).json({ status: "unavailable", state });
    return;
  }
  const activeFlags = Object.entries(features)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const data = HealthCheckResponse.parse({ status: "ok", features: activeFlags });
  res.json(data);
});

export default router;
