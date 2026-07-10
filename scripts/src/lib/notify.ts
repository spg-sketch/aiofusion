/**
 * Backup notification helper.
 *
 * Sends a Slack-compatible webhook notification on backup/restore events.
 * Set BACKUP_NOTIFY_WEBHOOK to a Slack Incoming Webhook URL (or any URL that
 * accepts a JSON POST with a `text` field) to enable notifications.
 *
 * If the variable is not set the helper is a no-op — existing behaviour is
 * fully preserved.
 *
 * Notification is fire-and-forget: a delivery failure logs a warning but never
 * crashes the backup/restore job.
 */

export interface NotifyOptions {
  /** Short label printed in the console warning if delivery fails. */
  label?: string;
}

/**
 * Send a plain-text notification to the configured webhook.
 * Never throws — all errors are caught and logged as warnings.
 */
export async function notify(
  text: string,
  opts: NotifyOptions = {},
): Promise<void> {
  const webhookUrl = process.env.BACKUP_NOTIFY_WEBHOOK;
  if (!webhookUrl) return;

  const label = opts.label ?? "backup notify";
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn(
        `[${label}] ⚠️  Webhook delivery failed: HTTP ${res.status} ${res.statusText}`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${label}] ⚠️  Webhook delivery error: ${msg}`);
  }
}

/** Convenience: send a success notification. */
export async function notifySuccess(
  text: string,
  opts?: NotifyOptions,
): Promise<void> {
  return notify(`✅ ${text}`, opts);
}

/** Convenience: send a failure notification. */
export async function notifyFailure(
  text: string,
  opts?: NotifyOptions,
): Promise<void> {
  return notify(`❌ ${text}`, opts);
}
