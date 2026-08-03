import { db, adminEventsTable } from "@workspace/db";
import { logger } from "./logger";

export interface AdminActor {
  id?: string;
  username: string;
}

export type AdminAction =
  | "forced_llm_audit"
  | "forced_website_audit"
  | "account_delete"
  | "account_self_delete"
  | "account_role_change"
  | "project_owner_reassign"
  | "platform_migrate"
  | "impersonate_start"
  | "impersonate_exit"
  | "account_reparent"
  | "account_approve"
  | "account_reject"
  | "master_owner_set"
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_admin_reset"
  | "mfa_recovery_code_used"
  | "switch_to_master"
  | "team_invite_sent"
  | "team_member_removed";

export async function logAdminEvent(
  actor: AdminActor,
  action: AdminAction,
  targetId?: string | null,
  targetType?: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await db.insert(adminEventsTable).values({
      actorId: actor.id ?? "",
      actorUsername: actor.username,
      action,
      targetId: targetId ?? null,
      targetType: targetType ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    logger.warn({ err, action, actor: actor.username }, "logAdminEvent: failed to write audit record (non-fatal)");
  }
}
