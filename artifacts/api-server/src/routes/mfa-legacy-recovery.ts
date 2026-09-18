import { Router, type IRouter } from "express";
import { loginLimiter } from "../middleware/rate-limit";
import { isImpersonatedRequest } from "../lib/platform-auth";
import {
  LegacyRecoveryError, legacyRecoveryStatus, recoverLegacyMfa,
} from "../lib/mfa-legacy-recovery";

const router: IRouter = Router();
// Manual authentication contract, like the existing setup/enable endpoints:
// POST status {recoveryToken} -> {email}
// POST recovery {recoveryToken, code} -> {mfaEnrollRequired:true,mfaToken,email}
// Failures -> {error}. No session or trusted-device cookies are issued here.
for (const statusOnly of [true, false]) {
  router.post(`/platform/mfa/legacy-recovery${statusOnly ? "/status" : ""}`, loginLimiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (await isImpersonatedRequest(req)) throw new LegacyRecoveryError();
      res.json(statusOnly
        ? await legacyRecoveryStatus(req.body?.recoveryToken)
        : await recoverLegacyMfa(req.body?.recoveryToken, req.body?.code));
    } catch (err) {
      // Database exceptions may embed SQL parameters. Never log them here.
      res.status(err instanceof LegacyRecoveryError ? err.status : 503).json({
        error: err instanceof LegacyRecoveryError ? err.message : "Recovery is temporarily unavailable. Please sign in again.",
      });
    }
  });
}
export default router;