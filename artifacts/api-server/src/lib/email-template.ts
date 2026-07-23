/**
 * Shared HTML email template builder.
 *
 * Produces a fully self-contained HTML email string suitable for use in the
 * `html` field of a Resend `emails.send()` call. Table-based layout for
 * maximum email-client compatibility.
 *
 * Palette:
 *   Raspberry  #C8497A
 *   Navy       #102B36
 *   Cream      #FBF6EC
 */

export interface EmailTemplateOpts {
  /** Short header label, e.g. "New Signup" or "Account Approved". */
  label: string;
  /** Main content HTML that goes inside the body card. */
  bodyHtml: string;
  /** Optional CTA button. */
  cta?: {
    text: string;
    href: string;
  };
  /** Optional footer note (small text below the standard footer). */
  footerNote?: string;
}

const LOGO_URL = "https://www.aiofusion.ai/images/logo-color.png";
const SITE_URL = "https://www.aiofusion.ai";
const CONTACT_EMAIL = "info@aiofusion.ai";

const RASPBERRY = "#C8497A";
const NAVY = "#102B36";
const CREAM = "#FBF6EC";
const CARD_BG = "#ffffff";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

export function buildEmailHtml(opts: EmailTemplateOpts): string {
  const ctaBlock = opts.cta
    ? `
      <tr>
        <td style="padding: 24px 0 8px 0; text-align: center;">
          <a href="${escHtml(opts.cta.href)}"
             style="display: inline-block; background: ${RASPBERRY}; color: #ffffff;
                    font-family: Inter, Arial, sans-serif; font-size: 15px; font-weight: 600;
                    text-decoration: none; padding: 14px 32px; border-radius: 8px;
                    letter-spacing: 0.02em;">
            ${escHtml(opts.cta.text)}
          </a>
        </td>
      </tr>`
    : "";

  const footerNoteBlock = opts.footerNote
    ? `<tr>
        <td style="padding: 16px 0 0 0; text-align: center;
                   font-family: Inter, Arial, sans-serif; font-size: 12px;
                   color: ${MUTED}; line-height: 1.6;">
          ${opts.footerNote}
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Alice&display=swap" rel="stylesheet" />
  <title>${escHtml(opts.label)}</title>
  <style>
    body { margin: 0; padding: 0; background: ${CREAM}; }
    img { border: 0; display: block; }
    a { color: ${RASPBERRY}; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background: ${CREAM}; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 16px 0 16px;">

        <!-- Logo header -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width: 600px; width: 100%;">
          <tr>
            <td style="padding-bottom: 24px; text-align: center;">
              <a href="${SITE_URL}" style="text-decoration: none;">
                <img src="${LOGO_URL}" alt="AIO Fusion" width="160"
                     style="height: auto; max-width: 160px;" />
              </a>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width: 600px; width: 100%; background: ${CARD_BG};
                      border-radius: 16px; border: 1px solid ${BORDER};
                      box-shadow: 0 2px 8px rgba(16,43,54,0.06);">
          <!-- Label bar -->
          <tr>
            <td style="background: ${NAVY}; border-radius: 16px 16px 0 0;
                       padding: 18px 32px;">
              <span style="font-family: 'Alice', Georgia, serif; font-size: 18px;
                           color: #ffffff; letter-spacing: 0.01em;">
                ${escHtml(opts.label)}
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family: Inter, Arial, sans-serif; font-size: 15px;
                             color: ${NAVY}; line-height: 1.7;">
                    ${opts.bodyHtml}
                  </td>
                </tr>
                ${ctaBlock}
                ${footerNoteBlock}
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width: 600px; width: 100%; padding: 28px 0 40px 0;">
          <tr>
            <td style="text-align: center; font-family: Inter, Arial, sans-serif;
                       font-size: 12px; color: ${MUTED}; line-height: 1.8;">
              <a href="${SITE_URL}" style="color: ${MUTED}; text-decoration: none;">${SITE_URL}</a>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <a href="mailto:${CONTACT_EMAIL}" style="color: ${MUTED}; text-decoration: none;">${CONTACT_EMAIL}</a>
              <br />
              &copy; AIO Fusion. All rights reserved.
              <br />
              <span style="font-size: 11px; color: #94a3b8;">
                You received this email because you have an account with AIO Fusion or contacted us via our website.
                To unsubscribe or update your preferences, contact us at
                <a href="mailto:${CONTACT_EMAIL}" style="color: #94a3b8;">${CONTACT_EMAIL}</a>.
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

/** Escape a string for safe inclusion in HTML attribute values or text nodes. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert a plain-text block (newline-separated) into safe HTML paragraphs.
 * Input is HTML-escaped first, then blank lines become paragraph breaks and
 * single newlines become <br />. Always escape before calling this function.
 */
export function textToHtml(text: string): string {
  return escHtml(text)
    .split(/\n\n+/)
    .map((para) => `<p style="margin: 0 0 14px 0;">${para.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Render a simple key→value table block for use inside email bodies. */
export function buildDataRows(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding: 6px 16px 6px 0; font-weight: 600; color: #475569;
                 font-size: 13px; white-space: nowrap; vertical-align: top;">
        ${escHtml(label)}
      </td>
      <td style="padding: 6px 0; font-size: 14px; color: #102B36; vertical-align: top;">
        ${escHtml(value)}
      </td>
    </tr>`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" border="0"
           style="width: 100%; border-top: 1px solid #E2E8F0;
                  border-bottom: 1px solid #E2E8F0; margin: 16px 0; padding: 8px 0;">
    ${cells}
  </table>`;
}
