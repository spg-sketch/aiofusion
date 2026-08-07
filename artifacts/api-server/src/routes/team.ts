import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  platformInvitationsTable,
  platformMembershipsTable,
  platformUsersTable,
  platformCompaniesTable,
} from "@workspace/db";
import { and, desc, eq, isNull, gt } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import {
  normUsername,
  hashPassword,
  createPlatformSession,
  setPlatformCookie,
  makeIpHint,
  canManageTeam,
  normalizeMembershipRole,
  parseProjectAccess,
  incrementSessionVersion,
  getCompanyBySlug,
  type MembershipRole,
} from "../lib/platform-auth";
import {
  INVITE_TTL_MS,
  INVITABLE_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  getTeamSeatLimit,
  setTeamSeatLimit,
  countSeatsUsed,
  getValidInvite,
  consumeInvite,
} from "../lib/team-invites";
import { sendTeamInviteEmail, getAppBaseUrl } from "../lib/notify-email";
import { loginLimiter } from "../middleware/rate-limit";
import { logAdminEvent } from "../lib/admin-events";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resolve the caller's active company row, or null. Team management always
// operates on the caller's own workspace - never on a sub-account's.
async function getActiveCompany(req: Request) {
  if (req.company) return req.company;
  return getCompanyBySlug(normUsername(req.account!.username));
}

// Only Agency/Partner (and master admin) workspaces have teams; a client
// sub-account does not manage team members.
function companyMayHaveTeam(role: string): boolean {
  return role !== "client";
}

// Sanitise an incoming projectAccess value: undefined/null = all projects;
// an array is filtered to non-empty strings and stored as JSON.
function normaliseProjectAccess(input: unknown): string | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const ids = input.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  return JSON.stringify(ids);
}

// --- List team members + pending invites -------------------------------------

router.get("/platform/team", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!canManageTeam(req.account!)) {
      res.status(403).json({ error: "Only owners and admins can manage the team." });
      return;
    }
    const company = await getActiveCompany(req);
    if (!company || !companyMayHaveTeam(company.role)) {
      res.status(403).json({ error: "Team management is not available for this account." });
      return;
    }

    const memberRows = await db
      .select({
        userId: platformMembershipsTable.userId,
        role: platformMembershipsTable.role,
        projectAccess: platformMembershipsTable.projectAccess,
        createdAt: platformMembershipsTable.createdAt,
        email: platformUsersTable.email,
        name: platformUsersTable.name,
      })
      .from(platformMembershipsTable)
      .leftJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
      .where(eq(platformMembershipsTable.companyId, company.id))
      .orderBy(desc(platformMembershipsTable.createdAt));

    // Include expired (not yet used/revoked) invites so the UI can show them
    // distinctly; they are flagged below and excluded from the seat count.
    const inviteRows = await db
      .select()
      .from(platformInvitationsTable)
      .where(
        and(
          eq(platformInvitationsTable.companyId, company.id),
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
        ),
      )
      .orderBy(desc(platformInvitationsTable.createdAt));

    const now = new Date();
    const pendingCount = inviteRows.filter((i) => i.expiresAt > now).length;

    const seatLimit = await getTeamSeatLimit(company.slug);
    res.json({
      members: memberRows.map((m) => ({
        userId: m.userId,
        email: m.email,
        name: m.name,
        role: normalizeMembershipRole(m.role),
        projectAccess: parseProjectAccess(m.projectAccess),
        createdAt: m.createdAt,
        isSelf: m.userId === req.account!.userId,
      })),
      invites: inviteRows.map((i) => ({
        token: i.token,
        email: i.email,
        role: normalizeMembershipRole(i.role),
        projectAccess: parseProjectAccess(i.projectAccess),
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
        expired: i.expiresAt <= now,
      })),
      seatLimit,
      seatsUsed: memberRows.length + pendingCount,
    });
  } catch (err) {
    logger.error({ err }, "team: failed to list team");
    res.status(500).json({ error: "Failed to load team." });
  }
});

// --- Invite a team member -----------------------------------------------------

router.post("/platform/team/invite", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!canManageTeam(req.account!)) {
      res.status(403).json({ error: "Only owners and admins can invite team members." });
      return;
    }
    const company = await getActiveCompany(req);
    if (!company || !companyMayHaveTeam(company.role)) {
      res.status(403).json({ error: "Team invitations are not available for this account." });
      return;
    }

    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const role = normalizeMembershipRole(req.body?.role);
    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }
    if (!INVITABLE_ROLES.includes(role) || req.body?.role === undefined) {
      res.status(400).json({ error: "Role must be one of: admin, billing, content, viewer." });
      return;
    }
    const projectAccess = normaliseProjectAccess(req.body?.projectIds);

    // Already a member of this workspace?
    const [existingUser] = await db
      .select({ id: platformUsersTable.id })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, email))
      .limit(1);
    if (existingUser) {
      const [existingMembership] = await db
        .select({ userId: platformMembershipsTable.userId })
        .from(platformMembershipsTable)
        .where(
          and(
            eq(platformMembershipsTable.userId, existingUser.id),
            eq(platformMembershipsTable.companyId, company.id),
          ),
        )
        .limit(1);
      if (existingMembership) {
        res.status(409).json({ error: "That person is already a member of your team." });
        return;
      }
    }

    // Duplicate pending invite?
    const [pendingDupe] = await db
      .select({ token: platformInvitationsTable.token })
      .from(platformInvitationsTable)
      .where(
        and(
          eq(platformInvitationsTable.companyId, company.id),
          eq(platformInvitationsTable.email, email),
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
          gt(platformInvitationsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (pendingDupe) {
      res.status(409).json({ error: "An invitation for that email is already pending. Revoke it first to re-invite." });
      return;
    }

    // Seat limit: members + pending invites must stay under the cap.
    const seatLimit = await getTeamSeatLimit(company.slug);
    const { members, pendingInvites } = await countSeatsUsed(company.id);
    if (members + pendingInvites >= seatLimit) {
      res.status(403).json({
        error: `You've reached your team seat limit (${seatLimit}). Contact info@aiofusion.ai to add more seats.`,
        limitReached: true,
      });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(platformInvitationsTable).values({
      token,
      email,
      companyId: company.id,
      companySlug: company.slug,
      role,
      projectAccess,
      invitedByUserId: req.account!.userId ?? null,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    const inviteUrl = `${getAppBaseUrl()}/?invite=${token}`;
    const inviterName = req.platformUser?.name || req.platformUser?.email || company.displayName || company.slug;
    void sendTeamInviteEmail({
      toEmail: email,
      companyName: company.displayName || company.slug,
      inviterName,
      roleLabel: MEMBERSHIP_ROLE_LABELS[role],
      inviteUrl,
    });

    void logAdminEvent(
      { username: req.account!.username, id: req.account!.userId },
      "team_invite_sent",
      email,
      "invitation",
      { role, companySlug: company.slug },
    );

    res.status(201).json({ ok: true, token, inviteUrl });
  } catch (err) {
    logger.error({ err }, "team: failed to create invite");
    res.status(500).json({ error: "Failed to send invitation." });
  }
});

// --- Resend (regenerate) a pending or expired invite --------------------------

router.post("/platform/team/invites/:token/resend", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!canManageTeam(req.account!)) {
      res.status(403).json({ error: "Only owners and admins can resend invitations." });
      return;
    }
    const company = await getActiveCompany(req);
    if (!company) { res.status(403).json({ error: "No active workspace." }); return; }

    const oldToken = String(req.params.token || "").trim();

    // Look up the existing invite - scoped to this company, not yet used/revoked.
    const [existing] = await db
      .select()
      .from(platformInvitationsTable)
      .where(
        and(
          eq(platformInvitationsTable.token, oldToken),
          eq(platformInvitationsTable.companyId, company.id),
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Invitation not found, already used, or already revoked." });
      return;
    }

    // Resending an EXPIRED invite re-adds a pending seat, so enforce the seat
    // cap (still-pending invites already hold their seat - no check needed).
    if (existing.expiresAt <= new Date()) {
      const { members, pendingInvites } = await countSeatsUsed(company.id);
      const seatLimit = await getTeamSeatLimit(company.slug);
      if (members + pendingInvites >= seatLimit) {
        res.status(403).json({
          error: "Seat limit reached - remove a member or invite before resending this expired invitation.",
          limitReached: true,
        });
        return;
      }
    }

    // Regenerate: fresh token, fresh 7-day expiry, clear reminder flag.
    const newToken = crypto.randomBytes(32).toString("hex");
    const newExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await db
      .update(platformInvitationsTable)
      .set({ token: newToken, expiresAt: newExpiresAt, reminderSentAt: null })
      .where(eq(platformInvitationsTable.token, oldToken));

    const inviteUrl = `${getAppBaseUrl()}/?invite=${newToken}`;
    const inviterName = req.platformUser?.name || req.platformUser?.email || company.displayName || company.slug;
    void sendTeamInviteEmail({
      toEmail: existing.email,
      companyName: company.displayName || company.slug,
      inviterName,
      roleLabel: MEMBERSHIP_ROLE_LABELS[normalizeMembershipRole(existing.role)] ?? existing.role,
      inviteUrl,
    });

    void logAdminEvent(
      { username: req.account!.username, id: req.account!.userId },
      "team_invite_resent",
      existing.email,
      "invitation",
      { companySlug: company.slug },
    );

    res.status(200).json({ ok: true, token: newToken, inviteUrl, expiresAt: newExpiresAt });
  } catch (err) {
    logger.error({ err }, "team: failed to resend invite");
    res.status(500).json({ error: "Failed to resend invitation." });
  }
});

// --- Revoke a pending invite ---------------------------------------------------

router.post("/platform/team/invites/:token/revoke", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!canManageTeam(req.account!)) {
      res.status(403).json({ error: "Only owners and admins can revoke invitations." });
      return;
    }
    const company = await getActiveCompany(req);
    if (!company) { res.status(403).json({ error: "No active workspace." }); return; }
    const token = String(req.params.token || "").trim();
    const revoked = await db
      .update(platformInvitationsTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(platformInvitationsTable.token, token),
          eq(platformInvitationsTable.companyId, company.id),
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
        ),
      )
      .returning({ token: platformInvitationsTable.token });
    if (revoked.length === 0) {
      res.status(404).json({ error: "Invitation not found or already used." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "team: failed to revoke invite");
    res.status(500).json({ error: "Failed to revoke invitation." });
  }
});

// --- Update a member's role / project access ------------------------------------

router.patch("/platform/team/members/:userId", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!canManageTeam(req.account!)) {
      res.status(403).json({ error: "Only owners and admins can change team roles." });
      return;
    }
    const company = await getActiveCompany(req);
    if (!company) { res.status(403).json({ error: "No active workspace." }); return; }
    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) { res.status(400).json({ error: "Member id required." }); return; }
    if (targetUserId === req.account!.userId) {
      res.status(400).json({ error: "You cannot change your own role." });
      return;
    }

    const [target] = await db
      .select()
      .from(platformMembershipsTable)
      .where(
        and(
          eq(platformMembershipsTable.userId, targetUserId),
          eq(platformMembershipsTable.companyId, company.id),
        ),
      )
      .limit(1);
    if (!target) { res.status(404).json({ error: "Member not found." }); return; }
    if (normalizeMembershipRole(target.role) === "owner") {
      res.status(403).json({ error: "The account owner's role cannot be changed here." });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body?.role !== undefined) {
      const role = normalizeMembershipRole(req.body.role);
      if (!INVITABLE_ROLES.includes(role)) {
        res.status(400).json({ error: "Role must be one of: admin, billing, content, viewer." });
        return;
      }
      updates.role = role;
    }
    if (req.body?.projectIds !== undefined) {
      updates.projectAccess = normaliseProjectAccess(req.body.projectIds);
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update." });
      return;
    }

    await db
      .update(platformMembershipsTable)
      .set(updates)
      .where(
        and(
          eq(platformMembershipsTable.userId, targetUserId),
          eq(platformMembershipsTable.companyId, company.id),
        ),
      );
    // Access changed: invalidate the member's existing sessions immediately.
    await incrementSessionVersion(targetUserId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "team: failed to update member");
    res.status(500).json({ error: "Failed to update team member." });
  }
});

// --- Remove a member -------------------------------------------------------------

router.post("/platform/team/members/:userId/remove", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!canManageTeam(req.account!)) {
      res.status(403).json({ error: "Only owners and admins can remove team members." });
      return;
    }
    const company = await getActiveCompany(req);
    if (!company) { res.status(403).json({ error: "No active workspace." }); return; }
    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) { res.status(400).json({ error: "Member id required." }); return; }
    if (targetUserId === req.account!.userId) {
      res.status(400).json({ error: "You cannot remove yourself from the team." });
      return;
    }

    const [target] = await db
      .select({ role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(
        and(
          eq(platformMembershipsTable.userId, targetUserId),
          eq(platformMembershipsTable.companyId, company.id),
        ),
      )
      .limit(1);
    if (!target) { res.status(404).json({ error: "Member not found." }); return; }
    if (normalizeMembershipRole(target.role) === "owner") {
      res.status(403).json({ error: "The account owner cannot be removed." });
      return;
    }

    await db
      .delete(platformMembershipsTable)
      .where(
        and(
          eq(platformMembershipsTable.userId, targetUserId),
          eq(platformMembershipsTable.companyId, company.id),
        ),
      );
    // Revoke the removed member's sessions immediately.
    await incrementSessionVersion(targetUserId);

    void logAdminEvent(
      { username: req.account!.username, id: req.account!.userId },
      "team_member_removed",
      targetUserId,
      "membership",
      { companySlug: company.slug },
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "team: failed to remove member");
    res.status(500).json({ error: "Failed to remove team member." });
  }
});

// --- Master admin: configure a workspace's team seat limit -----------------------

router.post("/platform/team/seat-limit", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const slug = normUsername(req.body?.username);
    const seats = Number(req.body?.seats);
    if (!slug) { res.status(400).json({ error: "Username required." }); return; }
    if (!Number.isInteger(seats) || seats < 1 || seats > 500) {
      res.status(400).json({ error: "Seats must be a whole number between 1 and 500." });
      return;
    }
    await setTeamSeatLimit(slug, seats);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "team: failed to set seat limit");
    res.status(500).json({ error: "Failed to set seat limit." });
  }
});

// --- Public: look up an invitation (invite landing page) --------------------------

router.get("/platform/invite/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "").trim();
    const invite = await getValidInvite(token);
    if (!invite) {
      res.status(404).json({ error: "This invitation is invalid, expired, or has already been used." });
      return;
    }
    const [company] = await db
      .select({ displayName: platformCompaniesTable.displayName, slug: platformCompaniesTable.slug })
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.id, invite.companyId))
      .limit(1);
    const [existingUser] = await db
      .select({ id: platformUsersTable.id, passwordHash: platformUsersTable.passwordHash })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, invite.email))
      .limit(1);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      email: invite.email,
      companyName: company?.displayName || company?.slug || invite.companySlug,
      role: normalizeMembershipRole(invite.role),
      roleLabel: MEMBERSHIP_ROLE_LABELS[normalizeMembershipRole(invite.role)],
      existingUser: !!existingUser,
    });
  } catch (err) {
    logger.error({ err }, "team: failed to load invite");
    res.status(500).json({ error: "Failed to load invitation." });
  }
});

// --- Public: accept an invitation with a password ---------------------------------

router.post("/platform/invite/accept", loginLimiter, async (req: Request, res: Response) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 64) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const invite = await getValidInvite(token);
    if (!invite) {
      res.status(404).json({ error: "This invitation is invalid, expired, or has already been used." });
      return;
    }

    // Resolve or create the user for the invited email. An existing user keeps
    // their current password (no password required); a new user must set one.
    const [existing] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, invite.email))
      .limit(1);

    let userId: string;
    if (existing) {
      userId = existing.id;
      if (!existing.passwordHash && password) {
        if (password.length < 8) {
          res.status(400).json({ error: "Password must be at least 8 characters." });
          return;
        }
        await db
          .update(platformUsersTable)
          .set({ passwordHash: hashPassword(password), ...(name ? { name } : {}) })
          .where(eq(platformUsersTable.id, existing.id));
      } else if (!existing.passwordHash && !password) {
        res.status(400).json({ error: "Set a password (or use Google/Microsoft sign-in from the invite page)." });
        return;
      }
    } else {
      if (!password || password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters." });
        return;
      }
      const [created] = await db
        .insert(platformUsersTable)
        .values({
          email: invite.email,
          name: name || null,
          passwordHash: hashPassword(password),
          emailVerified: true,
        })
        .returning({ id: platformUsersTable.id });
      userId = created!.id;
    }

    const ok = await consumeInvite(invite, userId);
    if (!ok) {
      res.status(409).json({ error: "This invitation has already been used." });
      return;
    }

    // Issue the session directly into the inviting workspace. Invited users
    // skip account-type selection - the workspace is already set up.
    const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress;
    const sid = await createPlatformSession(invite.companySlug, makeIpHint(rawIp), userId, invite.companyId);
    setPlatformCookie(res, sid);

    const [company] = await db
      .select({ role: platformCompaniesTable.role })
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.id, invite.companyId))
      .limit(1);
    res.json({
      ok: true,
      account: {
        username: invite.companySlug,
        role: company?.role ?? "agency",
        membershipRole: normalizeMembershipRole(invite.role),
      },
    });
  } catch (err) {
    logger.error({ err }, "team: failed to accept invite");
    res.status(500).json({ error: "Failed to accept invitation." });
  }
});

export default router;
export type { MembershipRole };
