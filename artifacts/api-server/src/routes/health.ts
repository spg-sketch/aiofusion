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
  const configuredRevision = process.env["RELEASE_GIT_REVISION"]?.trim().toLowerCase();
  const releaseRevision = configuredRevision && /^[0-9a-f]{40}$/.test(configuredRevision)
    ? configuredRevision
    : undefined;
  const data = HealthCheckResponse.parse({
    status: "ok",
    features: activeFlags,
    ...(releaseRevision ? { releaseRevision } : {}),
  });
  res.json(data);
});

export default router;
