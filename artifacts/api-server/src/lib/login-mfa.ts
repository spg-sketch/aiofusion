import type { Response } from "express";
import { createSignedInSession, isAgencyPartnerClient, setPlatformCookie } from "./platform-auth";
import {
  createMfaPendingToken, getMfaGeneration, getMfaState, isTrustedDevice,
  mfaSubject, personalMfaMigrationRequired, validateMfaIdentity,
} from "./mfa";

export interface LoginIdentity {
  username: string;
  role: string;
  userId?: string;
  activeCompanyId?: string;
  needsSetup: boolean;
  securityGeneration?: number;
}

export async function personalMfaPolicy(identity: { username: string; userId?: string; activeCompanyId?: string }) {
  const policy = await validateMfaIdentity(identity);
  const subject = mfaSubject(identity);
  const generation = await getMfaGeneration(subject);
  const migrationRequired = !!identity.userId && await personalMfaMigrationRequired(identity.userId);
  return { ...policy, subject, generation, migrationRequired };
}

/** Shared primary-authentication completion for password login and invitations.
 * Membership may already be established, but no usable session is issued until
 * the invited human's own MFA requirement has been satisfied. */
export async function finishPersonalLogin(
  res: Response,
  identity: LoginIdentity,
  rawIp: string | undefined,
  trustedDeviceCookie?: string,
  invitationMembershipRole?: string,
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (await isAgencyPartnerClient(identity.username)) {
    res.status(403).json({ error: "This account is managed by its agency and does not accept direct sign-ins." });
    return;
  }
  const policy = await personalMfaPolicy(identity);
  if (identity.securityGeneration !== undefined && identity.securityGeneration !== policy.generation) {
    res.status(401).json({ error: "Your security settings changed. Please sign in again." });
    return;
  }
  if (policy.migrationRequired) {
    res.status(403).json({ error: "Your existing two-factor protection needs verified individual recovery. Contact an authorised Master Owner.", code: "MFA_MIGRATION_REQUIRED" });
    return;
  }
  const mfa = await getMfaState(policy.subject);
  const trusted = mfa?.enabled && await isTrustedDevice(policy.subject, trustedDeviceCookie);
  if (!trusted && (mfa?.enabled || policy.required)) {
    const mode = mfa?.enabled ? "verify" : "enroll";
    const mfaToken = createMfaPendingToken({
      u: identity.username, uid: identity.userId, cid: identity.activeCompanyId,
      role: policy.role, needsSetup: identity.needsSetup || undefined,
      mode, g: policy.generation,
    });
    res.json({ [mode === "verify" ? "mfaRequired" : "mfaEnrollRequired"]: true, mfaToken, email: policy.email });
    return;
  }
  const sid = await createSignedInSession(
    identity.username, rawIp, identity.userId, identity.activeCompanyId,
    trusted ? policy.generation : undefined,
  );
  setPlatformCookie(res, sid);
  res.json({
    ...(invitationMembershipRole ? { ok: true } : {}),
    account: {
      username: identity.username, role: policy.role,
      ...(invitationMembershipRole ? { membershipRole: invitationMembershipRole } : {}),
    },
    ...(identity.needsSetup ? { needsSetup: true } : {}),
  });
}