/**
 * Backup notification helper.
 *
 * Sends email notifications via Resend on backup/restore events.
 * Requires RESEND_API_KEY (and optionally RESEND_FROM) — the same env vars
 * used by the API server for all other operational alerts.
 *
 * If RESEND_API_KEY is not set the helper is a no-op — existing behaviour is
 * fully preserved.
 *
 * Notification is fire-and-forget: a delivery failure logs a warning but never
 * crashes the backup/restore job.
 */
import { Resend } from "resend";

const ALERT_RECIPIENTS = [
  "patrick@aiofusion.ai",
  "natalie@aiofusion.ai",
  "spg@bluhalo.com",
];

export interface NotifyOptions {
  /** Short label printed in the console warning if delivery fails. */
  label?: string;
  /** Email subject. Defaults to a generic backup alert subject. */
  subject?: string;
}

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return process.env.RESEND_FROM ?? "AIO Fusion Alerts <info@aiofusion.ai>";
}

/**
 * Send a plain-text notification email via Resend.
 * Never throws — all errors are caught and logged as warnings.
 */
export async function notify(
  text: string,
  opts: NotifyOptions = {},
): Promise<void> {
  const resend = getClient();
  if (!resend) {
    const label = opts.label ?? "backup notify";
    console.warn(
      `[${label}] ⚠️  RESEND_API_KEY not set — notification not sent`,
    );
    return;
  }

  const label = opts.label ?? "backup notify";
  const subject =
    opts.subject ?? "[AIO Fusion] Backup alert";

  try {
    const result = await resend.emails.send({
      from: fromAddress(),
      to: ALERT_RECIPIENTS,
      subject,
      text,
    });
    if (result.error) {
      console.warn(
        `[${label}] ⚠️  Email delivery failed: ${JSON.stringify(result.error)}`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${label}] ⚠️  Email delivery error: ${msg}`);
  }
}

/** Convenience: send a success notification. */
export async function notifySuccess(
  text: string,
  opts?: NotifyOptions,
): Promise<void> {
  const subject = opts?.subject ?? "[AIO Fusion] Backup succeeded ✅";
  return notify(`✅ ${text}`, { ...opts, subject });
}

/** Convenience: send a failure notification. */
export async function notifyFailure(
  text: string,
  opts?: NotifyOptions,
): Promise<void> {
  const subject = opts?.subject ?? "[AIO Fusion] Backup FAILED ❌";
  return notify(`❌ ${text}`, { ...opts, subject });
}
