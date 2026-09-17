import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";
import {
  DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS,
  getMediaDiscoveryInstructions,
  updateMediaDiscoveryInstructions,
  MediaDiscoveryInstructionsConflictError,
  MediaDiscoveryInstructionsStorageError,
} from "../lib/media-discovery-instructions";
import { masterSubrole } from "../lib/platform-auth";
import { requirePlatformAuth } from "../middleware/platform-auth";

const router: IRouter = Router();
const PATH = "/store/media-db/discovery-instructions";

function requireMasterOwner(req: Request, res: Response, next: NextFunction): void {
  // Check the authenticated role itself.  A username is an account label, not
  // an authority signal (and must never be used to grant Master access).
  if (!req.account || req.account.role !== "admin" || masterSubrole(req.account) !== "owner") {
    res.status(403).json({ error: "Only the master account owner can edit media discovery instructions." });
    return;
  }
  next();
}

function bodyFor(record: Awaited<ReturnType<typeof getMediaDiscoveryInstructions>>) {
  return {
    ok: true as const,
    instructions: record.instructions,
    defaultInstructions: DEFAULT_MEDIA_DISCOVERY_INSTRUCTIONS,
    version: record.version,
    updatedAt: record.updatedAt,
    canEdit: true,
  };
}

async function getInstructions(_req: Request, res: Response): Promise<void> {
  try {
    const record = await getMediaDiscoveryInstructions();
    res.json(bodyFor(record));
  } catch (error) {
    logger.error({ err: error }, "media discovery instructions: read failed");
    res.status(503).json({ error: "Media discovery instructions are unavailable. Please try again later." });
  }
}

async function putInstructions(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const instructions = body.instructions;
  const version = body.version;
  if (
    typeof instructions !== "string"
    || instructions.trim().length < 50
    || instructions.trim().length > 12000
  ) {
    res.status(400).json({ error: "instructions must be between 50 and 12000 characters." });
    return;
  }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    res.status(400).json({ error: "version must be a non-negative integer." });
    return;
  }

  try {
    const record = await updateMediaDiscoveryInstructions(
      instructions,
      version,
      req.account!.username,
    );
    res.json(bodyFor(record));
  } catch (error) {
    if (error instanceof MediaDiscoveryInstructionsConflictError) {
      try {
        const current = await getMediaDiscoveryInstructions();
        res.status(409).json({
          ...bodyFor(current),
          ok: false,
          error: "The instructions changed before your update was saved. Reload and try again.",
        });
      } catch (readError) {
        logger.error({ err: readError }, "media discovery instructions: conflict read failed");
        res.status(409).json({ error: "The instructions changed before your update was saved. Reload and try again." });
      }
      return;
    }
    if (error instanceof TypeError || error instanceof RangeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, "media discovery instructions: write failed");
    const message = error instanceof MediaDiscoveryInstructionsStorageError
      ? "Media discovery instructions are unavailable. Please try again later."
      : "Media discovery instructions could not be saved. Please try again later.";
    res.status(503).json({ error: message });
  }
}

router.get(PATH, requirePlatformAuth, requireMasterOwner, getInstructions);
router.put(PATH, requirePlatformAuth, requireMasterOwner, putInstructions);

export default router;