import { type Request, type Response, type NextFunction } from "express";
import {
  getPlatformSessionId,
  getPlatformSessionAccount,
  type PlatformAccount,
} from "../lib/platform-auth";

declare global {
  namespace Express {
    interface Request {
      // The signed-in platform account (AIO Fusion application login), set by
      // resolvePlatformAccount when a valid platform session cookie is present.
      account?: PlatformAccount | undefined;
    }
  }
}

// Resolve the platform session (if any) and attach it to req.account. Always
// calls next() - it never blocks. Pair with requirePlatformAuth on routes that
// must be protected.
export async function resolvePlatformAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sid = getPlatformSessionId(req);
  if (sid) {
    req.account = (await getPlatformSessionAccount(sid)) ?? undefined;
  }
  next();
}

export function requirePlatformAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.account) {
    res.status(401).json({ error: "Unauthorized: sign in required" });
    return;
  }
  next();
}
