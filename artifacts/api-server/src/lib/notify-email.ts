import nodemailer from "nodemailer";
import { logger } from "./logger";

const ALERT_RECIPIENTS = [
  "patrick@aiofusion.ai",
  "natalie@aiofusion.ai",
  "spg@bluhalo.com",
];

function createTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function fromAddress(): string {
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@aiofusion.ai";
}

export async function sendSpikeAlert(opts: {
  slug: string;
  last7Cost: number;
  prior7Cost: number;
  ratio: number;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    logger.warn({ slug: opts.slug }, "notify-email: SMTP not configured — spike alert not sent");
    return;
  }
  const subject = `[AIO Fusion] Spend spike detected — ${opts.slug}`;
  const text = [
    `A content AI spend spike has been detected on account: ${opts.slug}`,
    ``,
    `Last 7 days spend:   £${opts.last7Cost.toFixed(4)}`,
    `Prior 7 days spend:  £${opts.prior7Cost.toFixed(4)}`,
    `Ratio:               ${opts.ratio.toFixed(1)}× (threshold: 3×)`,
    ``,
    `Log in to the admin panel to review the account's usage, adjust their quota,`,
    `or block the account if the activity looks abusive.`,
    ``,
    `Admin token usage panel: https://aiofusion.ai`,
  ].join("\n");

  try {
    await transport.sendMail({
      from: fromAddress(),
      to: ALERT_RECIPIENTS.join(", "),
      subject,
      text,
    });
    logger.info({ slug: opts.slug, ratio: opts.ratio.toFixed(2) }, "notify-email: spike alert sent");
  } catch (err) {
    logger.warn({ err, slug: opts.slug }, "notify-email: failed to send spike alert (non-fatal)");
  }
}

export async function sendQuotaBreachAlert(opts: {
  slug: string;
  callCount: number;
  limit: number;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    logger.warn({ slug: opts.slug }, "notify-email: SMTP not configured — quota breach alert not sent");
    return;
  }
  const subject = `[AIO Fusion] Fair usage limit reached — ${opts.slug}`;
  const text = [
    `Account ${opts.slug} has reached their 30-day content AI fair usage limit.`,
    ``,
    `30-day content AI calls: ${opts.callCount}`,
    `Account limit:           ${opts.limit}`,
    ``,
    `The account is now receiving 429 responses on all content AI and LLM check routes.`,
    `Log in to the admin panel to adjust their quota multiplier (e.g. grant 2× headroom)`,
    `or block the account if needed.`,
    ``,
    `Admin token usage panel: https://aiofusion.ai`,
  ].join("\n");

  try {
    await transport.sendMail({
      from: fromAddress(),
      to: ALERT_RECIPIENTS.join(", "),
      subject,
      text,
    });
    logger.info({ slug: opts.slug, callCount: opts.callCount }, "notify-email: quota breach alert sent");
  } catch (err) {
    logger.warn({ err, slug: opts.slug }, "notify-email: failed to send quota breach alert (non-fatal)");
  }
}
