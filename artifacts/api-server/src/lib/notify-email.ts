import { Resend } from "resend";
import { logger } from "./logger";

const ALERT_RECIPIENTS = [
  "patrick@aiofusion.ai",
  "natalie@aiofusion.ai",
  "spg@bluhalo.com",
];

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return process.env.RESEND_FROM ?? "AIO Fusion Alerts <info@aiofusion.ai>";
}

export async function sendSpikeAlert(opts: {
  slug: string;
  last7Cost: number;
  prior7Cost: number;
  ratio: number;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ slug: opts.slug }, "notify-email: RESEND_API_KEY not set — spike alert not sent");
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
    await resend.emails.send({
      from: fromAddress(),
      to: ALERT_RECIPIENTS,
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
  const resend = getClient();
  if (!resend) {
    logger.warn({ slug: opts.slug }, "notify-email: RESEND_API_KEY not set — quota breach alert not sent");
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
    await resend.emails.send({
      from: fromAddress(),
      to: ALERT_RECIPIENTS,
      subject,
      text,
    });
    logger.info({ slug: opts.slug, callCount: opts.callCount }, "notify-email: quota breach alert sent");
  } catch (err) {
    logger.warn({ err, slug: opts.slug }, "notify-email: failed to send quota breach alert (non-fatal)");
  }
}

export async function sendSpendCapAlert(opts: {
  slug: string;
  spendGbp: number;
  limitGbp: number;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ slug: opts.slug }, "notify-email: RESEND_API_KEY not set — spend cap alert not sent");
    return;
  }

  const subject = `[AIO Fusion] Monthly spend cap reached — ${opts.slug}`;
  const text = [
    `Account ${opts.slug} has hit their monthly GBP spend cap.`,
    ``,
    `Current month spend: £${opts.spendGbp.toFixed(4)}`,
    `Monthly cap:         £${opts.limitGbp.toFixed(2)}`,
    ``,
    `The account is now receiving 429 responses on all AI routes until the cap is raised`,
    `or the calendar month resets.`,
    ``,
    `Admin token usage panel: https://aiofusion.ai`,
  ].join("\n");

  try {
    await resend.emails.send({
      from: fromAddress(),
      to: ALERT_RECIPIENTS,
      subject,
      text,
    });
    logger.info({ slug: opts.slug, spendGbp: opts.spendGbp }, "notify-email: spend cap alert sent");
  } catch (err) {
    logger.warn({ err, slug: opts.slug }, "notify-email: failed to send spend cap alert (non-fatal)");
  }
}
