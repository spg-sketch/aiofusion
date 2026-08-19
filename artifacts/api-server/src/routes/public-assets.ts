import { Router, type IRouter, type Request, type Response } from "express";
import { servePublicEmailLogo } from "../lib/public-email-logo";

const router: IRouter = Router();

/**
 * A durable, public logo URL for email clients. This route intentionally
 * exposes one fixed asset only - it does not create a general object-store
 * browser or expose private uploads.
 */
router.get("/assets/email-logo", async (_req: Request, res: Response) => {
  try {
    await servePublicEmailLogo(res);
  } catch (error) {
    res.status(503).json({ error: "Email logo is temporarily unavailable" });
  }
});

export default router;