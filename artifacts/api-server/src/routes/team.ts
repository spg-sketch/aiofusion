import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  platformInvitationsTable,
  platformMembershipsTable,
  platformUsersTable,
  platformCompaniesTable,
  platformAccountsTable,
  projectsTable,
} from "@workspace/db";
import { and, asc, desc, eq, isNull, isNotNull, gt, lte, sql } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import {
  normUsername,
  hashPassword,
  createSignedInSession,
  setPlatformCookie,
  canManageTeam,
  normalizeMembershipRole,
  parseProjectAccess,
  incrementSessionVersion,
  getCompanyBySlug,
  getAccount,
  normalizeRole,
  getVisibleUsernames,
  type MembershipRole,
} from "../lib/platform-auth";
import {
  INVITE_TTL_MS,
  INVITABLE_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  PROJECT_TEAM_SEATS,
  getTeamSeatLimit,
  setTeamSeatLimit,
  countSeatsUsed,
  countAccountPoolSeats,
  getProjectSeatHolders,
  countProjectSeatHolders,
  type ProjectSeatHolder,
  getValidInvite,
  getInviteInvalidReason,
  INVITE_INVALID_MESSAGES,
  consumeInvite,
} from "../lib/team-invites";
import { sendTeamInviteEmail, sendTeamRoleDowngradedEmail, getAppBaseUrl } from "../lib/notify-email";
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

// Which team model a workspace runs:
//  - "agency"   Agency/Partner accounts: two seat pools - account-level seats
//               (people managing the account, any invitable role) plus up to
//               PROJECT_TEAM_SEATS content members per project.
//  - "client"   Direct client accounts (signed up themselves): a single pool
//               of colleagues, content role only.
//  - "standard" Master admin / legacy accounts: the original single-pool model.
//  - null       Agency-managed partner clients: no team at all - collaboration
//               on their projects happens through the agency's project seats.
export type TeamMode = "standard" | "agency" | "client";

async function resolveTeamMode(company: { slug: string; role: string }): Promise<TeamMode | null> {
  const role = normalizeRole(company.role);
  if (role === "agency") return "agency";
  if (role !== "client") return "standard";
  // A client is agency-managed when its parent account is an Agency/Partner.
  const acc = await getAccount(company.slug);
  if (acc?.parent) {
    const parent = await getAccount(normUsername(acc.parent));
    if (parent && normalizeRole(parent.role) === "agency") return null;
  }
  return "client";
}

const NO_TEAM_MESSAGE = "Team management is not available for this account.";

// The set of live project ids this workspace actually owns (its own projects
// plus those of its descendant client sub-accounts). Team invites and access
// changes must never reference a project outside this set - the browser's
// project list is a cache and cannot be trusted.
async function getOwnedProjectIds(companySlug: string): Promise<Set<string> | null> {
  const account = await getAccount(companySlug);
  if (!account) return new Set();
  if (account.role === "admin") return null; // master admin: any project
  // Downward-only ownership: self plus descendant sub-accounts. Deliberately
  // NOT getVisibleUsernames - that includes a client's direct parent for read
  // visibility, and a workspace must never grant team seats on a project it
  // can merely see but does not own.
  const rows = await db
    .select({
      username: platformAccountsTable.username,
      parent: platformAccountsTable.parent,
    })
    .from(platformAccountsTable);
  const childrenByParent = new Map<string, string[]>();
  for (const r of rows) {
    const parent = normUsername(r.parent);
    if (!parent) continue;
    const list = childrenByParent.get(parent) || [];
    list.push(normUsername(r.username));
    childrenByParent.set(parent, list);
  }
  const allowed = new Set<string>();
  const queue = [normUsername(companySlug)];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (allowed.has(cur)) continue;
    allowed.add(cur);
    for (const child of childrenByParent.get(cur) || []) queue.push(child);
  }
  const projectRows = await db
    .select({ id: projectsTable.id, owner: projectsTable.owner })
    .from(projectsTable)
    .where(isNull(projectsTable.deletedAt));
  return new Set(projectRows.filter((r) => allowed.has(normUsername(r.owner))).map((r) => r.id));
}

// 400 when any of the given project ids is not owned by this workspace.
async function rejectForeignProjects(
  companySlug: string,
  projectIds: string[],
  res: Response,
): Promise<boolean> {
  const owned = await getOwnedProjectIds(companySlug);
  if (owned === null) return false;
  const foreign = projectIds.filter((id) => !owned.has(id));
  if (foreign.length > 0) {
    res.status(400).json({
      error: "One or more selected projects don't belong to this account. Refresh the page and try again.",
    });
    return true;
  }
  return false;
}

// Human-readable "project is full" error listing who holds the seats.
function projectFullError(projectId: string, holders: ProjectSeatHolder[]): string {
  const names = holders.map((h) => h.label).join(", ");
  return `That project already has ${PROJECT_TEAM_SEATS} team members (${names}). Remove one before adding another.`;
}

// Sanitise an incoming projectAccess value: undefined/null = all projects;
// an array is filtered to non-empty strings and stored as JSON.
function normaliseProjectAccess(input: unknown): string | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const ids = Array.from(
    new Set(input.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())),
  );
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
    const teamMode = company ? await resolveTeamMode(company) : null;
    if (!company || !teamMode) {
      res.status(403).json({ error: NO_TEAM_MESSAGE });
      return;
    }

    const memberRows = await db
      .select({
        userId: platformMembershipsTable.userId,
        role: platformMembershipsTable.role,
        projectAccess: platformMembershipsTable.projectAccess,
        position: platformMembershipsTable.position,
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
    const pendingCount = inviteRows.filter((i) => !i.declinedAt && i.expiresAt > now).length;
        const seatLimit = await getTeamSeatLimit(company.slug);

    // Agency mode: the headline seat counter covers the ACCOUNT pool only
    // (members/invites with no project restriction); project-scoped people sit
    // in per-project pools reported separately.
    let seatsUsed = memberRows.length + pendingCount;
    let projectSeats: Record<string, number> | undefined;
    if (teamMode === "agency") {
      const account = await countAccountPoolSeats(company.id);
      seatsUsed = account.members + account.pendingInvites;
          const holders = await getProjectSeatHolders(company.id);
      projectSeats = {};
      for (const [projectId, list] of holders) projectSeats[projectId] = list.length;
    }

    res.json({
      teamMode,
      ...(teamMode === "agency" ? { projectSeatLimit: PROJECT_TEAM_SEATS, projectSeats } : {}),
      members: memberRows.map((m) => ({
        userId: m.userId,
        email: m.email,
        name: m.name,
        role: normalizeMembershipRole(m.role),
        projectAccess: parseProjectAccess(m.projectAccess),
        position: m.position ?? null,
        createdAt: m.createdAt,
        isSelf: m.userId === req.account!.userId,
      })),
      invites: inviteRows.map((i) => ({
        token: i.token,
        email: i.email,
        name: i.invitedName ?? null,
        position: i.position ?? null,
        role: normalizeMembershipRole(i.role),
        projectAccess: parseProjectAccess(i.projectAccess),
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
        expired: !i.declinedAt && i.expiresAt <= now,
        declined: !!i.declinedAt,
        declinedAt: i.declinedAt,
      })),
      seatLimit,
      seatsUsed,
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
    const teamMode = company ? await resolveTeamMode(company) : null;
    if (!company || !teamMode) {
      res.status(403).json({ error: "Team invitations are not available for this account." });
      return;
    }

    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    let role = normalizeMembershipRole(req.body.role);
    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }
    if (!INVITABLE_ROLES.includes(role) || req.body?.role === undefined) {
      res.status(400).json({ error: "Role must be one of: admin, billing, content, viewer." });
      return;
    }
    let projectAccess = normaliseProjectAccess(req.body?.projectIds);

    // Client workspaces: colleagues are content team members on the client's
    // own projects - no other role, no project restriction, regardless of what
    // the request body says.
    if (teamMode === "client") {
      if (role !== "content") {
        res.status(400).json({ error: "Colleagues on a client account are always Content Team Members." });
        return;
      }
      role = "content";
      projectAccess = null;
    }

    // Agency workspaces, project seat: the invite is scoped to one or more
    // projects, must be a content member, and each chosen project has its own
    // PROJECT_TEAM_SEATS-seat pool (it does not consume account seats).
    const projectIdsParsed = parseProjectAccess(projectAccess);
    // Never trust the browser's project list: every referenced project must
    // actually belong to this workspace (or its client sub-accounts).
    if (projectIdsParsed && projectIdsParsed.length > 0) {
      if (await rejectForeignProjects(company.slug, projectIdsParsed, res)) return;
    }
    const isAgencyProjectSeat = teamMode === "agency" && projectAccess !== null;
    if (isAgencyProjectSeat) {
      if (!projectIdsParsed || projectIdsParsed.length === 0) {
        res.status(400).json({ error: "Choose at least one project for a project team member." });
        return;
      }
      if (role !== "content") {
        res.status(400).json({ error: "Project team members are always Content Team Members. Use an account seat for admin, billing or viewer roles." });
        return;
      }
          const holders = await getProjectSeatHolders(company.id);
          for (const projectId of projectIdsParsed) {
            const held = holders.get(projectId) ?? [];
            if (held.length >= PROJECT_TEAM_SEATS) {
              res.status(403).json({ error: projectFullError(projectId, held), limitReached: true, projectId });
              return;
            }
          }
    }
    const invitedName =
      typeof req.body?.fullName === "string" ? req.body.fullName.trim().slice(0, 128) : "";
    const position =
      typeof req.body?.position === "string" ? req.body.position.trim().slice(0, 128) : "";

    // Already a member of this workspace?
    const [existingUser] = await db
      .select({ id: platformUsersTable.id, passwordHash: platformUsersTable.passwordHash })
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
          isNull(platformInvitationsTable.declinedAt),
          gt(platformInvitationsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (pendingDupe) {
      res.status(409).json({ error: "An invitation for that email is already pending. Revoke it first to re-invite." });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    // Seat cap enforcement must be serialized in the database. A pre-flight
    // count alone lets two simultaneous invites both observe the last seat as
    // free. Locking the company row makes the count + invitation insert one
    // atomic allocation for the workspace's account-seat pool.
    const seatLimit = await getTeamSeatLimit(company.slug);
    const inviteResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM platform_companies WHERE id = ${company.id} FOR UPDATE`);
      // The type may have changed while this request waited on the workspace
      // lock. Never allocate using the mode observed before the lock: an
      // agency project-seat invite must become a client-pool allocation (or be
      // rejected) if the workspace was converted in the meantime.
      const [lockedCompany] = await tx
        .select()
        .from(platformCompaniesTable)
        .where(eq(platformCompaniesTable.id, company.id))
        .limit(1);
      let lockedTeamMode: TeamMode | null = null;
      if (lockedCompany) {
        const lockedRole = normalizeRole(lockedCompany.role);
        if (lockedRole === "agency") {
          lockedTeamMode = "agency";
        } else if (lockedRole !== "client") {
          lockedTeamMode = "standard";
        } else {
          // Do not call getAccount()/resolveTeamMode here: those use the
          // global connection and can deadlock while this transaction owns the
          // workspace lock. Resolve the managed-client exception locally.
          const [lockedAccount] = await tx
            .select({ parent: platformAccountsTable.parent })
            .from(platformAccountsTable)
            .where(eq(platformAccountsTable.username, lockedCompany.slug))
            .limit(1);
          if (lockedAccount?.parent) {
            const [parent] = await tx
              .select({ role: platformAccountsTable.role })
              .from(platformAccountsTable)
              .where(eq(platformAccountsTable.username, normUsername(lockedAccount.parent)))
              .limit(1);
            lockedTeamMode = parent && normalizeRole(parent.role) === "agency" ? null : "client";
          } else {
            lockedTeamMode = "client";
          }
        }
      }
      if (!lockedCompany || !lockedTeamMode) {
        return { ok: false as const, reason: "team_unavailable" as const };
      }

      let allocationRole = role;
      let allocationProjectAccess = projectAccess;
      if (lockedTeamMode === "client") {
        if (allocationRole !== "content") {
          return { ok: false as const, reason: "client_role" as const };
        }
        allocationRole = "content";
        allocationProjectAccess = null;
      }
      const allocationProjectIds = parseProjectAccess(allocationProjectAccess);
      const allocationIsAgencyProjectSeat =
        lockedTeamMode === "agency" && allocationProjectAccess !== null;

      // The partial unique index protects unresolved invitations. PostgreSQL
      // cannot put a moving expiry predicate in that index, so reclaim expired
      // links while holding this same workspace lock before inserting a new one.
      await tx
        .update(platformInvitationsTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(platformInvitationsTable.companyId, company.id),
            eq(platformInvitationsTable.email, email),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            isNull(platformInvitationsTable.declinedAt),
            lte(platformInvitationsTable.expiresAt, new Date()),
          ),
        );

      const [freshDupe] = await tx
        .select({ token: platformInvitationsTable.token })
        .from(platformInvitationsTable)
        .where(
          and(
            eq(platformInvitationsTable.companyId, company.id),
            eq(platformInvitationsTable.email, email),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            isNull(platformInvitationsTable.declinedAt),
            gt(platformInvitationsTable.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (freshDupe) return { ok: false as const, reason: "duplicate" as const };

      if (allocationIsAgencyProjectSeat) {
        // The workspace lock serializes every allocation. Re-count after the
        // lock so two concurrent requests cannot both claim a final project
        // seat based on stale pre-flight checks.
        for (const projectId of allocationProjectIds!) {
          if (await countProjectSeatHolders(company.id, projectId, tx) >= PROJECT_TEAM_SEATS) {
            return { ok: false as const, reason: "project_full" as const, projectId };
          }
        }
      } else {
        const usage =
          lockedTeamMode === "agency"
            ? await countAccountPoolSeats(company.id, tx)
            : await countSeatsUsed(company.id, tx);
        if (usage.members + usage.pendingInvites >= seatLimit) {
          return { ok: false as const, reason: "full" as const };
        }
      }

      await tx.insert(platformInvitationsTable).values({
        token,
        email,
        companyId: company.id,
        companySlug: company.slug,
        role: allocationRole,
        projectAccess: allocationProjectAccess,
        invitedName: invitedName || null,
        position: position || null,
        invitedByUserId: req.account!.userId ?? null,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      return { ok: true as const };
    });
    if (!inviteResult.ok) {
      if (inviteResult.reason === "duplicate") {
        res.status(409).json({ error: "An invitation for that email is already pending. Revoke it first to re-invite." });
      } else if (inviteResult.reason === "project_full") {
        res.status(403).json({
          error: `This project already has its ${PROJECT_TEAM_SEATS} team seats filled.`,
          limitReached: true,
          projectId: inviteResult.projectId,
        });
      } else if (inviteResult.reason === "client_role") {
        res.status(400).json({ error: "Colleagues on a client account are always Content Team Members." });
      } else if (inviteResult.reason === "team_unavailable") {
        res.status(403).json({ error: "Team invitations are not available for this account." });
      } else {
        res.status(403).json({
          error: `You've reached your team seat limit (${seatLimit}). Contact info@aiofusion.ai to add more seats.`,
          limitReached: true,
        });
      }
      return;
    }

    const inviteUrl = `${getAppBaseUrl()}/?invite=${token}`;
    const inviterName = req.platformUser?.name || req.platformUser?.email || company.displayName || company.slug;
    const emailSent = await sendTeamInviteEmail({
      toEmail: email,
      companyName: company.displayName || company.slug,
      inviterName,
      roleLabel: MEMBERSHIP_ROLE_LABELS[role],
      inviteUrl,
    });
    if (!emailSent) {
      // Do not leave a live seat allocation behind when the recipient never
      // received the only usable link. Guard by token so a concurrent state
      // change cannot be overwritten.
      await db
        .update(platformInvitationsTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(platformInvitationsTable.token, token),
            eq(platformInvitationsTable.companyId, company.id),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
          ),
        );
      res.status(502).json({
        error: "The invitation email could not be delivered. No active invitation was created - please try again.",
      });
      return;
    }

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

// --- Revoke a pending invite ---------------------------------------------------

router.post("/platform/team/invites/:token/resend", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!canManageTeam(req.account!)) {
      res.status(403).json({ error: "Only owners and admins can resend invitations." });
      return;
    }
    const company = await getActiveCompany(req);
    const teamMode = company ? await resolveTeamMode(company) : null;
    if (!company || !teamMode) { res.status(403).json({ error: NO_TEAM_MESSAGE }); return; }

    const oldToken = String(req.params.token || "").trim();

    // Seat limit is a config value; fetch it before the transaction.
    const resendSeatLimit = await getTeamSeatLimit(company.slug);

    // Pre-compute owned project IDs outside the transaction.
    // getOwnedProjectIds uses plain `db`; calling it inside db.transaction()
    // deadlocks on PGlite's single connection.  company.slug is stable for the
    // lifetime of this request so the pre-read is safe.
    const ownedProjectIds = teamMode === "agency" ? await getOwnedProjectIds(company.slug) : null;

    // Project-seat pre-check (outside transaction) gives an immediate response
    // for a plainly full project. The authoritative re-check happens inside
    // the workspace lock below, so a concurrent invite cannot take the last
    // seat between this read and the resend.
    if (teamMode === "agency") {
      const [preInvite] = await db
        .select({
          expiresAt: platformInvitationsTable.expiresAt,
          projectAccess: platformInvitationsTable.projectAccess,
          usedAt: platformInvitationsTable.usedAt,
          revokedAt: platformInvitationsTable.revokedAt,
        })
        .from(platformInvitationsTable)
        .where(
          and(
            eq(platformInvitationsTable.token, oldToken),
            eq(platformInvitationsTable.companyId, company.id),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            isNull(platformInvitationsTable.declinedAt),
          ),
        )
        .limit(1);

      if (preInvite) {
        const preProjects = parseProjectAccess(preInvite.projectAccess);
        const preExpired = preInvite.expiresAt <= new Date();
        if (preExpired && preProjects && preProjects.length > 0) {
          // This invite is expired and project-scoped: check each project's pool.
          const holders = await getProjectSeatHolders(company.id);
          for (const projectId of preProjects) {
            const held = holders.get(projectId) ?? [];
            if (held.length >= PROJECT_TEAM_SEATS) {
              res.status(403).json({
                error: `That project already has ${PROJECT_TEAM_SEATS} team members. Remove one before resending this invitation.`,
                limitReached: true,
                projectId,
              });
              return;
            }
          }
        }
      }
    }

    // Everything that depends on the invite's current state (lookup, expiry
    // determination, mode check, ownership check, seat cap, and token update)
    // runs inside a single transaction locked with FOR UPDATE on the company row.
    // This eliminates the TOCTOU window where an invite could expire, or a seat
    // could be taken, between the initial read and the seat check.
    type ResendResult =
      | {
          ok: true;
          newToken: string;
          newExpiresAt: Date;
          oldExpiresAt: Date;
          oldReminderSentAt: Date | null;
          email: string;
          role: string;
        }
      | { ok: false; status: 404 | 409 | 403; error: string; limitReached?: true; projectId?: string };

    let resendResult: ResendResult;
    try {
      resendResult = await db.transaction(async (tx) => {
        // Lock the company row to serialize all concurrent resend/invite requests
        // for this workspace.
        await tx.execute(
          sql`SELECT 1 FROM platform_companies WHERE id = ${company.id} FOR UPDATE`,
        );

        // Re-read the invite inside the lock so its state is authoritative.
        const [fresh] = await tx
          .select()
          .from(platformInvitationsTable)
          .where(
            and(
              eq(platformInvitationsTable.token, oldToken),
              eq(platformInvitationsTable.companyId, company.id),
              isNull(platformInvitationsTable.usedAt),
              isNull(platformInvitationsTable.revokedAt),
              isNull(platformInvitationsTable.declinedAt),
            ),
          )
          .limit(1);

        if (!fresh) {
          return {
            ok: false as const,
            status: 404 as const,
            error: "Invitation not found, already used, or already revoked.",
          };
        }

        // An invite that no longer fits this workspace's team model must not
        // be re-activated.
        const freshRole = normalizeMembershipRole(fresh.role);
        const freshProjects = parseProjectAccess(fresh.projectAccess);
        const violatesMode =
          (teamMode === "client" && freshRole !== "content") ||
          (teamMode === "agency" && freshProjects !== null && freshRole !== "content");
        if (violatesMode) {
          return {
            ok: false as const,
            status: 409 as const,
            error: "This invitation's role no longer matches your team set-up. Revoke it and send a new invitation instead.",
          };
        }

        // The invite's projects must still belong to this workspace. A legacy
        // invite created before ownership enforcement - or one whose project was
        // since reassigned elsewhere - must not be regenerated with foreign access.
        // NOTE: ownedProjectIds was pre-computed before the transaction because
        // getOwnedProjectIds uses plain `db`, which deadlocks in PGlite's
        // single-connection model when called inside db.transaction().
        if (freshProjects && freshProjects.length > 0) {
          if (ownedProjectIds !== null && freshProjects.some((id) => !ownedProjectIds.has(id))) {
            return {
              ok: false as const,
              status: 409 as const,
              error: "This invitation references a project that no longer belongs to this account. Revoke it and send a new invitation instead.",
            };
          }
        }

        // Seat cap: only applies when re-activating an expired invite.
        // Expiry is evaluated from the fresh DB read, not the pre-lock state.
        const isExpiredNow = fresh.expiresAt <= new Date();
        if (isExpiredNow) {
          if (teamMode === "agency" && freshProjects && freshProjects.length > 0) {
            // countProjectSeatHolders avoids the PGlite-hostile isNotNull
            // predicate, so it is safe inside this locked transaction.
            for (const projectId of freshProjects) {
              if (await countProjectSeatHolders(company.id, projectId, tx) >= PROJECT_TEAM_SEATS) {
                return {
                  ok: false as const,
                  status: 403 as const,
                  error: `That project already has ${PROJECT_TEAM_SEATS} team members. Remove one before resending this invitation.`,
                  limitReached: true as const,
                  projectId,
                };
              }
            }
          } else {
            const { members, pendingInvites } =
              teamMode === "agency"
                ? await countAccountPoolSeats(company.id, tx)
                : await countSeatsUsed(company.id, tx);
            if (members + pendingInvites >= resendSeatLimit) {
              return {
                ok: false as const,
                status: 403 as const,
                error: "Seat limit reached - remove a member or invite before resending this expired invitation.",
                limitReached: true as const,
              };
            }
          }
        }

        // Regenerate: fresh token, fresh 7-day expiry, clear reminder flag.
        // The WHERE clause re-asserts the invite is still unused/unrevoked; if
        // another concurrent request claimed it between our SELECT and UPDATE
        // (impossible under FOR UPDATE, but guarded defensively), we return 404.
        const freshToken = crypto.randomBytes(32).toString("hex");
        const freshExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
        const updated = await tx
          .update(platformInvitationsTable)
          .set({ token: freshToken, expiresAt: freshExpiresAt, reminderSentAt: null })
          .where(
            and(
              eq(platformInvitationsTable.token, oldToken),
              eq(platformInvitationsTable.companyId, company.id),
              isNull(platformInvitationsTable.usedAt),
              isNull(platformInvitationsTable.revokedAt),
              isNull(platformInvitationsTable.declinedAt),
            ),
          )
          .returning({ token: platformInvitationsTable.token });

        if (updated.length === 0) {
          return {
            ok: false as const,
            status: 404 as const,
            error: "Invitation not found, already used, or already revoked.",
          };
        }

        return {
          ok: true as const,
          newToken: freshToken,
          newExpiresAt: freshExpiresAt,
          oldExpiresAt: fresh.expiresAt,
          oldReminderSentAt: fresh.reminderSentAt,
          email: fresh.email,
          role: fresh.role,
        };
      });
    } catch (err) {
      logger.error({ err }, "team: failed to resend invite");
      res.status(500).json({ error: "Failed to resend invitation." });
      return;
    }

    if (!resendResult.ok) {
      res.status(resendResult.status).json({
        error: resendResult.error,
        ...(resendResult.limitReached ? { limitReached: true } : {}),
        ...(resendResult.projectId ? { projectId: resendResult.projectId } : {}),
      });
      return;
    }


    const {
      newToken,
      newExpiresAt,
      oldExpiresAt,
      oldReminderSentAt,
      email: resendEmail,
      role: resendRole,
    } = resendResult;
    const inviteUrl = `${getAppBaseUrl()}/?invite=${newToken}`;
    const inviterName = req.platformUser?.name || req.platformUser?.email || company.displayName || company.slug;
    const emailSent = await sendTeamInviteEmail({
      toEmail: resendEmail,
      companyName: company.displayName || company.slug,
      inviterName,
      roleLabel: MEMBERSHIP_ROLE_LABELS[normalizeMembershipRole(resendRole)] ?? resendRole,
      inviteUrl,
    });
    if (!emailSent) {
      // Restore the previously usable invitation when the replacement email
      // fails. The token guard ensures we do not undo a later resend/accept.
      await db
        .update(platformInvitationsTable)
        .set({
          token: oldToken,
          expiresAt: oldExpiresAt,
          reminderSentAt: oldReminderSentAt,
        })
        .where(
          and(
            eq(platformInvitationsTable.token, newToken),
            eq(platformInvitationsTable.companyId, company.id),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            isNull(platformInvitationsTable.declinedAt),
          ),
        );
      res.status(502).json({
        error: "The replacement invitation email could not be delivered. The previous invitation link is still valid.",
      });
      return;
    }

    void logAdminEvent(
      { username: req.account!.username, id: req.account!.userId },
      "team_invite_resent",
      resendEmail,
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
    if (!company || !(await resolveTeamMode(company))) { res.status(403).json({ error: NO_TEAM_MESSAGE }); return; }
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
    const teamMode = company ? await resolveTeamMode(company) : null;
    if (!company || !teamMode) { res.status(403).json({ error: NO_TEAM_MESSAGE }); return; }
    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) { res.status(400).json({ error: "Member id required." }); return; }
    if (targetUserId === req.account!.userId) {
      res.status(400).json({ error: "You cannot remove yourself from the team." });
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

    // Per-workspace-type rules on the RESULTING role/projectAccess.
    const resultingRole = normalizeMembershipRole(
      updates.role !== undefined ? (updates.role as string) : target.role,
    );
    let resultingAccess =
      updates.projectAccess !== undefined
        ? parseProjectAccess(updates.projectAccess as string | null)
        : parseProjectAccess(target.projectAccess);
    const movesIntoAgencyAccountPool =
      teamMode === "agency" &&
      parseProjectAccess(target.projectAccess) !== null &&
      resultingAccess === null;
    const addedProjectSeats =
      teamMode === "agency" && resultingAccess !== null
        ? resultingAccess.filter((id) => !(parseProjectAccess(target.projectAccess) ?? []).includes(id))
        : [];
    if (teamMode === "client" && resultingRole !== "content") {
      res.status(400).json({ error: "Colleagues on a client account are always Content Team Members." });
      return;
    }
    if (teamMode === "client") {
      // Client colleagues are never project-scoped. This also heals a legacy
      // project restriction whenever a client member is updated.
      updates.projectAccess = null;
      resultingAccess = null;
    }
    if (updates.projectAccess !== undefined && resultingAccess && resultingAccess.length > 0) {
      if (await rejectForeignProjects(company.slug, resultingAccess, res)) return;
    }
    if (teamMode === "agency") {
      const wasProjectSeat = parseProjectAccess(target.projectAccess) !== null;
      if (resultingAccess !== null) {
        // Project seat: content role only, at least one project, and any NEWLY
        // added project must still have room in its own pool (the member's
        // existing seats stay).
        if (resultingAccess.length === 0) {
          res.status(400).json({ error: "Choose at least one project for a project team member." });
          return;
        }
        if (resultingRole !== "content") {
          res.status(400).json({ error: "Project team members are always Content Team Members. Use an account seat for admin, billing or viewer roles." });
          return;
        }
        if (addedProjectSeats.length > 0) {
          const holders = await getProjectSeatHolders(company.id);
          for (const projectId of addedProjectSeats) {
            const held = (holders.get(projectId) ?? []).filter((h) => h.userId !== targetUserId);
            if (held.length >= PROJECT_TEAM_SEATS) {
              res.status(403).json({ error: projectFullError(projectId, held), limitReached: true, projectId });
              return;
            }
          }
        }
      } else if (wasProjectSeat) {
        // Moving from a project seat to an account seat consumes an account
        // seat. This first check gives a quick response; the authoritative
        // check is repeated below while the company row is locked.
        const seatLimit = await getTeamSeatLimit(company.slug);
        const { members, pendingInvites } = await countAccountPoolSeats(company.id);
        if (members + pendingInvites >= seatLimit) {
          res.status(403).json({
            error: `You've reached your account seat limit (${seatLimit}). Contact info@aiofusion.ai to add more seats.`,
            limitReached: true,
          });
          return;
        }
      }
    }

    // Every member edit takes the workspace lock, not only seat-consuming
    // moves. An agency→client conversion can complete while an edit waits;
    // the final role/access rules must therefore use the fresh, locked mode.
    const allocation = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM platform_companies WHERE id = ${company.id} FOR UPDATE`);
      const [lockedCompany] = await tx
        .select()
        .from(platformCompaniesTable)
        .where(eq(platformCompaniesTable.id, company.id))
        .limit(1);
      if (!lockedCompany) return { ok: false as const, reason: "team_unavailable" as const };

      let lockedTeamMode: TeamMode | null;
      const lockedRole = normalizeRole(lockedCompany.role);
      if (lockedRole === "agency") {
        lockedTeamMode = "agency";
      } else if (lockedRole !== "client") {
        lockedTeamMode = "standard";
      } else {
        const [lockedAccount] = await tx
          .select({ parent: platformAccountsTable.parent })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.username, lockedCompany.slug))
          .limit(1);
        if (lockedAccount?.parent) {
          const [parent] = await tx
            .select({ role: platformAccountsTable.role })
            .from(platformAccountsTable)
            .where(eq(platformAccountsTable.username, normUsername(lockedAccount.parent)))
            .limit(1);
          lockedTeamMode = parent && normalizeRole(parent.role) === "agency" ? null : "client";
        } else {
          lockedTeamMode = "client";
        }
      }
      if (!lockedTeamMode) return { ok: false as const, reason: "team_unavailable" as const };

      const [freshTarget] = await tx
        .select()
        .from(platformMembershipsTable)
        .where(
          and(
            eq(platformMembershipsTable.userId, targetUserId),
            eq(platformMembershipsTable.companyId, company.id),
          ),
        )
        .limit(1);
      if (!freshTarget) return { ok: false as const, reason: "missing_member" as const };
      if (normalizeMembershipRole(freshTarget.role) === "owner") {
        return { ok: false as const, reason: "owner" as const };
      }

      const freshRole = normalizeMembershipRole(
        updates.role !== undefined ? (updates.role as string) : freshTarget.role,
      );
      const freshAccess = updates.projectAccess !== undefined
        ? parseProjectAccess(updates.projectAccess as string | null)
        : parseProjectAccess(freshTarget.projectAccess);

      if (lockedTeamMode === "client") {
        if (freshRole !== "content") return { ok: false as const, reason: "client_role" as const };
        await tx
          .update(platformMembershipsTable)
          .set({ ...updates, role: "content", projectAccess: null })
          .where(
            and(
              eq(platformMembershipsTable.userId, targetUserId),
              eq(platformMembershipsTable.companyId, company.id),
            ),
          );
        return { ok: true as const };
      }

      if (lockedTeamMode === "agency") {
        const oldAccess = parseProjectAccess(freshTarget.projectAccess);
        if (freshAccess !== null) {
          if (freshAccess.length === 0) return { ok: false as const, reason: "project_empty" as const };
          if (freshRole !== "content") return { ok: false as const, reason: "project_role" as const };
          const added = freshAccess.filter((id) => !(oldAccess ?? []).includes(id));
          for (const projectId of added) {
            if (await countProjectSeatHolders(company.id, projectId, tx) >= PROJECT_TEAM_SEATS) {
              return { ok: false as const, reason: "project_full" as const, projectId };
            }
          }
        } else if (oldAccess !== null) {
          const seatLimit = await getTeamSeatLimit(company.slug);
          const { members, pendingInvites } = await countAccountPoolSeats(company.id, tx);
          if (members + pendingInvites >= seatLimit) {
            return { ok: false as const, reason: "account_full" as const, seatLimit };
          }
        }
      }

      await tx
        .update(platformMembershipsTable)
        .set(updates)
        .where(
          and(
            eq(platformMembershipsTable.userId, targetUserId),
            eq(platformMembershipsTable.companyId, company.id),
          ),
        );
      return { ok: true as const };
    });
    if (!allocation.ok) {
      if (allocation.reason === "project_full") {
        res.status(403).json({
          error: `This project already has its ${PROJECT_TEAM_SEATS} team seats filled.`,
          limitReached: true,
          projectId: allocation.projectId,
        });
      } else if (allocation.reason === "client_role") {
        res.status(400).json({ error: "Colleagues on a client account are always Content Team Members." });
      } else if (allocation.reason === "project_role") {
        res.status(400).json({ error: "Project team members are always Content Team Members. Use an account seat for admin, billing or viewer roles." });
      } else if (allocation.reason === "project_empty") {
        res.status(400).json({ error: "Choose at least one project for a project team member." });
      } else if (allocation.reason === "missing_member") {
        res.status(404).json({ error: "Member not found." });
      } else if (allocation.reason === "owner") {
        res.status(403).json({ error: "The account owner's role cannot be changed here." });
      } else if (allocation.reason === "team_unavailable") {
        res.status(403).json({ error: NO_TEAM_MESSAGE });
      } else {
        res.status(403).json({
          error: `You've reached your account seat limit (${allocation.seatLimit ?? await getTeamSeatLimit(company.slug)}). Contact info@aiofusion.ai to add more seats.`,
          limitReached: true,
        });
      }
      return;
    }
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
    if (!company || !(await resolveTeamMode(company))) { res.status(403).json({ error: NO_TEAM_MESSAGE }); return; }
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
      const reason = await getInviteInvalidReason(token);
      res.status(404).json({ error: INVITE_INVALID_MESSAGES[reason], reason });
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
      invitedName: invite.invitedName ?? null,
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

// --- Public: decline an invitation ----------------------------------------------
//
// The invitation URL is itself an unguessable, single-use capability. Declining
// from the landing page therefore does not require an account or a session.
// Keep the row (rather than revoking it) so the inviter can see a clear outcome.
router.post("/platform/invite/:token/decline", loginLimiter, async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "").trim();
    const invite = await getValidInvite(token);
    if (!invite) {
      const reason = await getInviteInvalidReason(token);
      res.status(404).json({ error: INVITE_INVALID_MESSAGES[reason], reason });
      return;
    }
    const declined = await db
      .update(platformInvitationsTable)
      .set({ declinedAt: new Date() })
      .where(
        and(
          eq(platformInvitationsTable.token, invite.token),
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
          isNull(platformInvitationsTable.declinedAt),
          gt(platformInvitationsTable.expiresAt, new Date()),
        ),
      )
      .returning({ token: platformInvitationsTable.token });
    if (declined.length === 0) {
      const reason = await getInviteInvalidReason(token);
      res.status(409).json({ error: INVITE_INVALID_MESSAGES[reason], reason });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "team: failed to decline invite");
    res.status(500).json({ error: "Failed to decline invitation." });
  }
});

// --- Public: accept an invitation with a password ---------------------------------

router.post("/platform/invite/accept", loginLimiter, async (req: Request, res: Response) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const suppliedName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 64) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const invite = await getValidInvite(token);
    if (!invite) {
      const reason = await getInviteInvalidReason(token);
      res.status(404).json({ error: INVITE_INVALID_MESSAGES[reason], reason });
      return;
    }

    // Never silently replace one human user's browser session with another
    // person's invited identity. A forwarded/reopened invite commonly lands in
    // a browser that is still signed in, so require that session to belong to
    // the invited email or make the user sign out first.
    if (req.account) {
      if (!req.account.userId) {
        res.status(409).json({
          error: "This browser is already signed in as a different user. Sign out, then reopen this invitation.",
          reason: "signed_in_as_different_user",
        });
        return;
      }
      const [signedInUser] = await db
        .select({ email: platformUsersTable.email })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, req.account.userId))
        .limit(1);
      if (!signedInUser?.email || signedInUser.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
        res.status(409).json({
          error: "This browser is already signed in as a different user. Sign out, then reopen this invitation.",
          reason: "signed_in_as_different_user",
        });
        return;
      }
    }

    // The invitee's own entry wins; otherwise fall back to the full name the
    // inviter recorded on the invitation.
    const name = suppliedName || (invite.invitedName ?? "").trim().slice(0, 64);

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
    const sid = await createSignedInSession(invite.companySlug, rawIp, userId, invite.companyId);
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

// ---------------------------------------------------------------------------
// Admin: team-violation report + fix
// ---------------------------------------------------------------------------

type ViolationItem = {
  kind: "member" | "invite";
  userId?: string | null;
  inviteToken?: string | null;
  email: string | null;
  name?: string | null;
  currentRole: MembershipRole;
  reason: string;
};

type CompanyViolations = {
  companyId: string;
  companySlug: string;
  // Standard workspaces never generate violations (no restricted seat rules),
  // so this is always narrowed to "agency" | "client" in practice.
  teamMode: "agency" | "client";
  ownerEmail: string | null;
  violations: ViolationItem[];
};

async function collectTeamViolations(companySlug?: string): Promise<CompanyViolations[]> {
  const companies = await db
    .select()
    .from(platformCompaniesTable)
    .where(
      companySlug
        ? and(
            eq(platformCompaniesTable.status, "active"),
            eq(platformCompaniesTable.slug, normUsername(companySlug)),
          )
        : eq(platformCompaniesTable.status, "active"),
    );

  const results: CompanyViolations[] = [];

  for (const company of companies) {
    const teamMode = await resolveTeamMode(company);
    if (!teamMode) continue; // agency-managed clients: no team, nothing to fix

    const violations: ViolationItem[] = [];

    // -- existing members -------------------------------------------------
    const members = await db
      .select({
        userId: platformMembershipsTable.userId,
        role: platformMembershipsTable.role,
        projectAccess: platformMembershipsTable.projectAccess,
        email: platformUsersTable.email,
        name: platformUsersTable.name,
      })
      .from(platformMembershipsTable)
      .leftJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
      .where(eq(platformMembershipsTable.companyId, company.id));

    for (const m of members) {
      const role = normalizeMembershipRole(m.role);
      if (role === "owner") continue; // owners are never touched
      const projectIds = parseProjectAccess(m.projectAccess);
      if (teamMode === "agency" && projectIds !== null && role !== "content") {
        violations.push({
          kind: "member",
          userId: m.userId,
          email: m.email,
          name: m.name ?? null,
          currentRole: role,
          reason: "Agency project-seat member must be Content Team Member",
        });
      } else if (teamMode === "client" && (role !== "content" || projectIds !== null)) {
        violations.push({
          kind: "member",
          userId: m.userId,
          email: m.email,
          name: m.name ?? null,
          currentRole: role,
          reason: role !== "content"
            ? "Client account members must be Content Team Members"
            : "Client account members cannot have project restrictions",
        });
      }
    }

    // -- pending invites (including expired ones not yet revoked) ---------
    const invites = await db
      .select()
      .from(platformInvitationsTable)
      .where(
        and(
          eq(platformInvitationsTable.companyId, company.id),
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
        ),
      );

    for (const inv of invites) {
      const role = normalizeMembershipRole(inv.role);
      const projectIds = parseProjectAccess(inv.projectAccess);
      if (teamMode === "agency" && projectIds !== null && role !== "content") {
        violations.push({
          kind: "invite",
          inviteToken: inv.token,
          email: inv.email,
          currentRole: role,
          reason: "Agency project-seat invite must be for Content Team Member",
        });
      } else if (teamMode === "client" && (role !== "content" || projectIds !== null)) {
        violations.push({
          kind: "invite",
          inviteToken: inv.token,
          email: inv.email,
          currentRole: role,
          reason: role !== "content"
            ? "Client account invite must be for Content Team Member"
            : "Client account invites cannot have project restrictions",
        });
      }
    }

    // Standard workspaces never produce violations, so if we have any, teamMode
    // must be "agency" or "client". The explicit check satisfies TypeScript.
    if (violations.length > 0 && (teamMode === "agency" || teamMode === "client")) {
      const ownerEmail = await getCompanyOwnerEmail(company.id);
      results.push({
        companyId: company.id,
        companySlug: company.slug,
        teamMode,
        ownerEmail,
        violations,
      });
    }
  }

  return results;
}

async function getCompanyOwnerEmail(companyId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: platformUsersTable.email })
    .from(platformMembershipsTable)
    .leftJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
    .where(
      and(
        eq(platformMembershipsTable.companyId, companyId),
        eq(platformMembershipsTable.role, "owner"),
      ),
    )
    .orderBy(asc(platformMembershipsTable.createdAt))
    .limit(1);
  return row?.email ?? null;
}

async function applyTeamViolationFixes(
  violations: CompanyViolations[],
  actor: { username: string; id?: string },
  dryRun: boolean,
): Promise<{ fixed: number; companies: number; notifications: number }> {
  let fixed = 0;
  let notifications = 0;

  for (const company of violations) {
    let companyFixed = 0;
    const affectedUserIds: string[] = [];

    for (const v of company.violations) {
      if (v.kind === "member" && v.userId) {
        if (!dryRun) {
          await db
            .update(platformMembershipsTable)
            .set(company.teamMode === "client" ? { role: "content", projectAccess: null } : { role: "content" })
            .where(
              and(
                eq(platformMembershipsTable.userId, v.userId),
                eq(platformMembershipsTable.companyId, company.companyId),
              ),
            );
          affectedUserIds.push(v.userId);
        }
        companyFixed++;
      } else if (v.kind === "invite" && v.inviteToken) {
        if (!dryRun) {
          await db
            .update(platformInvitationsTable)
            .set(company.teamMode === "client" ? { role: "content", projectAccess: null } : { role: "content" })
            .where(eq(platformInvitationsTable.token, v.inviteToken));
        }
        companyFixed++;
      }
    }

    if (!dryRun && companyFixed > 0) {
      // Revoke sessions for any members whose role was downgraded.
      for (const userId of affectedUserIds) {
        await incrementSessionVersion(userId);
      }

      // Notify the workspace owner.
      if (company.ownerEmail) {
        void sendTeamRoleDowngradedEmail({
          toEmail: company.ownerEmail,
          companyName: company.companySlug,
          downgradedCount: companyFixed,
          teamMode: company.teamMode,
        });
        notifications++;
      }

      void logAdminEvent(
        actor,
        "team_violations_fixed",
        company.companySlug,
        "company",
        { count: companyFixed, dryRun },
      );
    }

    fixed += companyFixed;
  }

  return { fixed, companies: violations.length, notifications };
}

// Used by account-type changes as well as the owner-facing team review. The
// account row is already updated before this runs, so collection sees the
// workspace's new team model and corrects only now-invalid roles.
export async function sweepTeamViolationsForCompany(
  companySlug: string,
  actor: { username: string; id?: string },
): Promise<{ fixed: number; companies: number; notifications: number }> {
  const violations = await collectTeamViolations(companySlug);
  return applyTeamViolationFixes(violations, actor, false);
}

function isWorkspaceOwner(req: Request): boolean {
  const role = req.account?.membershipRole;
  // Undefined is a legacy direct-account session, which has always carried
  // owner authority. Modern workspaces must have an explicit owner role.
  return role === undefined || role === null || role === "owner";
}

// Workspace owners can review only their own stale memberships/invitations.
// Master admins retain the cross-workspace endpoints below.
router.get("/platform/team/violations", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!isWorkspaceOwner(req)) {
      res.status(403).json({ error: "Only the account owner can review team role issues." });
      return;
    }
    const company = await getActiveCompany(req);
    const teamMode = company ? await resolveTeamMode(company) : null;
    if (!company || !teamMode) {
      res.status(403).json({ error: NO_TEAM_MESSAGE });
      return;
    }
    const [workspace] = await collectTeamViolations(company.slug);
    res.json({ violations: workspace?.violations ?? [] });
  } catch (err) {
    logger.error({ err }, "team: failed to load workspace role violations");
    res.status(500).json({ error: "Failed to load team role issues." });
  }
});

// Correct every stale role in the active owner workspace. Each listed member
// or invite is normalized to Content Team Member, then affected sessions are
// revoked by the shared fixer.
router.post("/platform/team/violations/fix", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (!isWorkspaceOwner(req)) {
      res.status(403).json({ error: "Only the account owner can fix team role issues." });
      return;
    }
    const company = await getActiveCompany(req);
    const teamMode = company ? await resolveTeamMode(company) : null;
    if (!company || !teamMode) {
      res.status(403).json({ error: NO_TEAM_MESSAGE });
      return;
    }
    const result = await sweepTeamViolationsForCompany(company.slug, {
      username: req.account!.username,
      id: req.account!.userId ?? undefined,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "team: failed to fix workspace role violations");
    res.status(500).json({ error: "Failed to fix team role issues." });
  }
});

// GET /platform/admin/team-violations : report all violations across all workspaces
router.get("/platform/admin/team-violations", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const companies = await collectTeamViolations();
    const total = companies.reduce((s, c) => s + c.violations.length, 0);
    res.json({ total, companies });
  } catch (err) {
    logger.error({ err }, "team: failed to collect violations");
    res.status(500).json({ error: "Failed to collect team violations." });
  }
});

// POST /platform/admin/team-violations/fix : apply (or dry-run) fixes
router.post("/platform/admin/team-violations/fix", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const dryRun = req.body?.dryRun === true;
    const violations = await collectTeamViolations();
    const actor = { username: req.account!.username, id: req.account!.userId ?? undefined };
    const result = await applyTeamViolationFixes(violations, actor, dryRun);
    res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    logger.error({ err }, "team: failed to fix violations");
    res.status(500).json({ error: "Failed to fix team violations." });
  }
});

export default router;
export type { MembershipRole };
