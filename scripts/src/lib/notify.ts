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

const LOGO_URL = "https://aiofusion.ai/images/logo-color.png";
const SITE_URL = "https://aiofusion.ai";
const RASPBERRY = "#C8497A";
const NAVY = "#102B36";
const CREAM = "#FBF6EC";

export interface NotifyOptions {
  /** Short label printed in the console warning if delivery fails. */
  label?: string;
  /** Email subject. Defaults to a generic backup alert subject. */
  subject?: string;
  /** Header label shown inside the email card (e.g. "Backup Success"). */
  emailLabel?: string;
}

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return process.env.RESEND_FROM ?? "AIO Fusion Alerts <info@aiofusion.ai>";
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(label: string, bodyText: string): string {
  const escapedLines = bodyText
    .split("\n")
    .map((l) => escHtml(l))
    .join("<br />");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Alice&display=swap" rel="stylesheet" />
  <title>${escHtml(label)}</title>
  <style>body { margin: 0; padding: 0; background: ${CREAM}; }</style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px 0 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <a href="${SITE_URL}">
                <img src="${LOGO_URL}" alt="AIO Fusion" width="160" style="height:auto;max-width:160px;" />
              </a>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;
                      border:1px solid #E2E8F0;box-shadow:0 2px 8px rgba(16,43,54,0.06);">
          <tr>
            <td style="background:${NAVY};border-radius:16px 16px 0 0;padding:18px 32px;">
              <span style="font-family:'Alice',Georgia,serif;font-size:18px;color:#ffffff;">
                ${escHtml(label)}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:15px;
                        color:${NAVY};line-height:1.8;white-space:pre-wrap;">
                ${escapedLines}
              </p>
              <p style="margin:28px 0 0 0;text-align:center;">
                <a href="${SITE_URL}"
                   style="display:inline-block;background:${RASPBERRY};color:#ffffff;
                          font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;
                          text-decoration:none;padding:14px 32px;border-radius:8px;">
                  Open Admin Panel
                </a>
              </p>
            </td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;padding:28px 0 40px 0;">
          <tr>
            <td style="text-align:center;font-family:Inter,Arial,sans-serif;
                       font-size:12px;color:#64748B;line-height:1.8;">
              <a href="${SITE_URL}" style="color:#64748B;text-decoration:none;">${SITE_URL}</a>
              &nbsp;|&nbsp;
              <a href="mailto:info@aiofusion.ai" style="color:#64748B;text-decoration:none;">info@aiofusion.ai</a><br />
              &copy; AIO Fusion. All rights reserved.<br />
              <span style="font-size:11px;color:#94a3b8;">
                You received this alert because you are an AIO Fusion administrator.
                To unsubscribe, contact <a href="mailto:info@aiofusion.ai" style="color:#94a3b8;">info@aiofusion.ai</a>.
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a notification email via Resend (plain-text + HTML).
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
  const subject = opts.subject ?? "[AIO Fusion] Backup alert";
  const emailLabel = opts.emailLabel ?? "Backup Alert";
  const html = buildHtml(emailLabel, text);

  try {
    const result = await resend.emails.send({
      from: fromAddress(),
      to: ALERT_RECIPIENTS,
      subject,
      text,
      html,
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
  return notify(`✅ ${text}`, { emailLabel: "Backup Success", ...opts, subject });
}

/** Convenience: send a failure notification. */
export async function notifyFailure(
  text: string,
  opts?: NotifyOptions,
): Promise<void> {
  const subject = opts?.subject ?? "[AIO Fusion] Backup FAILED ❌";
  return notify(`❌ ${text}`, { emailLabel: "Backup Failed", ...opts, subject });
}
