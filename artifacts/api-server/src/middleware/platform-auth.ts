import { type Request, type Response, type NextFunction } from "express";
import { db, platformUsersTable, platformCompaniesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getPlatformSessionId,
  getPlatformSessionAccount,
  getCompanyBySlug,
  type PlatformAccount,
} from "../lib/platform-auth";

// Re-export the resolved user and company shapes for downstream use.
export type ResolvedPlatformUser = typeof platformUsersTable.$inferSelect;
export type ResolvedCompany = typeof platformCompaniesTable.$inferSelect;

declare global {
  namespace Express {
    interface Request {
      // The signed-in platform account (AIO Fusion application login), set by
      // resolvePlatformAccount when a valid platform session cookie is present.
      // Contains `username` (= company slug), `role`, and optional `userId` /
      // `activeCompanyId` from the new identity layer.
      account?: PlatformAccount | undefined;

      // The resolved human user from platform_users. Present when the session
      // was created after the users table was introduced and the user has an
      // email-linked account. May be undefined for legacy sessions.
      // Named `platformUser` to avoid colliding with the OIDC `req.user`.
      platformUser?: ResolvedPlatformUser | undefined;

      // The resolved workspace from platform_companies. Present when the
      // session was created after the companies table was introduced. May be
      // undefined for legacy sessions (fall back to req.account.username).
      company?: ResolvedCompany | undefined;
    }
  }
}

// Resolve the platform session (if any) and attach it to req.account,
// req.platformUser, and req.company. Always calls next() - never blocks.
// Pair with requirePlatformAuth on routes that must be protected.
export async function resolvePlatformAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sid = getPlatformSessionId(req);
  if (sid) {
    const account = (await getPlatformSessionAccount(sid)) ?? undefined;
    req.account = account;

    if (account) {
      // Resolve the human user when we have a userId in the session.
      if (account.userId) {
        try {
          const [userRow] = await db
            .select()
            .from(platformUsersTable)
            .where(eq(platformUsersTable.id, account.userId))
            .limit(1);
          req.platformUser = userRow ?? undefined;
        } catch {
          // Non-fatal - legacy session, req.platformUser stays undefined.
        }
      }

      // Resolve the active company. Prefer the explicit activeCompanyId
      // stored in the session; fall back to looking up by slug.
      try {
        if (account.activeCompanyId) {
          const [companyRow] = await db
            .select()
            .from(platformCompaniesTable)
            .where(eq(platformCompaniesTable.id, account.activeCompanyId))
            .limit(1);
          req.company = companyRow ?? undefined;
        }
        if (!req.company) {
          // Slug-based fallback - always works even for legacy sessions.
          req.company = (await getCompanyBySlug(account.username)) ?? undefined;
        }
      } catch {
        // Non-fatal - company resolution fails gracefully.
      }
    }
  }
  next();
}

// Block read-only team members (viewer) and billing members from AI action
// routes (audits, content generation, AI assist). Signed-out requests pass
// through so the routers' own auth handling still applies.
export function blockReadOnlyMembers(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = req.account?.membershipRole;
  if (role === "viewer" || role === "billing") {
    res.status(403).json({
      error:
        role === "billing"
          ? "Billing members don't have access to this feature."
          : "Your role is read-only. Ask an account owner or admin for edit access.",
    });
    return;
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
