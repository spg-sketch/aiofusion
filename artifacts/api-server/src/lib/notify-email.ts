import { Resend } from "resend";
import { logger } from "./logger";
import { buildEmailHtml, buildDataRows, textToHtml, escHtml } from "./email-template";

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

// Returns the canonical base URL for this deployment so email links always
// point to the right environment (staging vs. live).
export function getAppBaseUrl(): string {
  const canonical = process.env.CANONICAL_DOMAIN?.trim();
  if (canonical) return `https://${canonical}`;
  return "https://www.aiofusion.ai";
}

export async function sendVerificationEmail(opts: {
  toEmail: string;
  toName: string;
  verifyUrl: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail }, "notify-email: RESEND_API_KEY not set — verification email not sent");
    return;
  }

  const subject = `Verify your AIO Fusion email address`;
  const text = [
    `Hi ${opts.toName},`,
    ``,
    `Thanks for creating an AIO Fusion account. Click the link below to verify your email address:`,
    ``,
    opts.verifyUrl,
    ``,
    `This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.`,
    ``,
    `The AIO Fusion team`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Verify Your Email",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi ${escHtml(opts.toName)},</p>
      <p style="margin: 0 0 16px 0; font-size: 17px; font-weight: 600; color: #102B36;">
        Thanks for creating an AIO Fusion account.
      </p>
      <p style="margin: 0 0 16px 0;">
        Click the button below to verify your email address and complete your signup.
        This link expires in <strong>24 hours</strong>.
      </p>
      <p style="margin: 24px 0 0 0; font-size: 13px; color: #475569;">
        If you didn't create an account, you can safely ignore this email.
      </p>
    `,
    cta: { text: "Verify email address", href: opts.verifyUrl },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject, text, html });
    logger.info({ toEmail: opts.toEmail }, "notify-email: verification email sent");
  } catch (err) {
    logger.warn({ err, toEmail: opts.toEmail }, "notify-email: failed to send verification email (non-fatal)");
  }
}

export async function sendTeamInviteEmail(opts: {
  toEmail: string;
  companyName: string;
  inviterName: string;
  roleLabel: string;
  inviteUrl: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail }, "notify-email: RESEND_API_KEY not set — team invite email not sent");
    return;
  }

  const subject = `You've been invited to join ${opts.companyName} on AIO Fusion`;
  const text = [
    `Hi,`,
    ``,
    `${opts.inviterName} has invited you to join ${opts.companyName} on AIO Fusion as ${opts.roleLabel}.`,
    ``,
    `Click the link below to accept the invitation and set up your login:`,
    ``,
    opts.inviteUrl,
    ``,
    `This link is single-use and expires in 7 days. If you weren't expecting this invitation, you can safely ignore this email.`,
    ``,
    `The AIO Fusion team`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Team Invitation",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi,</p>
      <p style="margin: 0 0 16px 0; font-size: 17px; font-weight: 600; color: #102B36;">
        ${escHtml(opts.inviterName)} has invited you to join ${escHtml(opts.companyName)} on AIO Fusion.
      </p>
      <p style="margin: 0 0 16px 0;">
        You've been invited as <strong>${escHtml(opts.roleLabel)}</strong>. Click the button below to accept
        the invitation and set your password — or sign in with Google or Microsoft.
        This link is single-use and expires in <strong>7 days</strong>.
      </p>
      <p style="margin: 24px 0 0 0; font-size: 13px; color: #475569;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    `,
    cta: { text: "Accept invitation", href: opts.inviteUrl },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject, text, html });
    logger.info({ toEmail: opts.toEmail }, "notify-email: team invite email sent");
  } catch (err) {
    logger.warn({ err, toEmail: opts.toEmail }, "notify-email: failed to send team invite email (non-fatal)");
  }
}

export async function sendNewSignupAlert(opts: {
  name: string;
  email: string;
  companyName: string;
  username: string;
  method: "password" | "google" | "microsoft";
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ username: opts.username }, "notify-email: RESEND_API_KEY not set — signup alert not sent");
    return;
  }

  const methodLabel = opts.method === "google" ? "Google OAuth" : opts.method === "microsoft" ? "Microsoft SSO" : "Email & password";
  const adminPanel = getAppBaseUrl();

  const subject = `[AIO Fusion] New signup — ${opts.companyName}`;
  const text = [
    `A new account has been registered.`,
    ``,
    `Name:         ${opts.name}`,
    `Email:        ${opts.email}`,
    `Company:      ${opts.companyName}`,
    `Username:     ${opts.username}`,
    `Sign-up via:  ${methodLabel}`,
    ``,
    `Admin panel: ${adminPanel}`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "New Signup",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">A new account has been registered.</p>
      ${buildDataRows([
        ["Name", opts.name],
        ["Email", opts.email],
        ["Company", opts.companyName],
        ["Username", opts.username],
        ["Sign-up via", methodLabel],
      ])}
    `,
    cta: { text: "Open Admin Panel", href: adminPanel },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: ALERT_RECIPIENTS, subject, text, html });
    logger.info({ username: opts.username, method: opts.method }, "notify-email: signup alert sent");
  } catch (err) {
    logger.warn({ err, username: opts.username }, "notify-email: failed to send signup alert (non-fatal)");
  }
}

export async function sendApprovalEmail(opts: {
  toEmail: string;
  toName: string;
  loginUrl: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail }, "notify-email: RESEND_API_KEY not set — approval email not sent");
    return;
  }

  const subject = `Your AIO Fusion account has been approved`;
  const text = [
    `Hi ${opts.toName},`,
    ``,
    `Great news — your AIO Fusion account has been approved and is ready to use.`,
    ``,
    `Sign in here: ${opts.loginUrl}`,
    ``,
    `If you signed up with Google, use the "Continue with Google" button on the`,
    `sign-in page. If you signed up with a password, use your email and password.`,
    ``,
    `Welcome aboard,`,
    `The AIO Fusion team`,
    ``,
    `Questions? Reply to this email or contact info@aiofusion.ai`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Account Approved",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi ${escHtml(opts.toName)},</p>
      <p style="margin: 0 0 16px 0; font-size: 17px; font-weight: 600; color: #102B36;">
        Great news — your AIO Fusion account has been approved and is ready to use.
      </p>
      <p style="margin: 0 0 16px 0;">
        You can sign in now and start exploring the platform. If you signed up with Google,
        use the <strong>Continue with Google</strong> button. If you signed up with a password,
        use your email and password.
      </p>
      <p style="margin: 24px 0 0 0; font-size: 13px; color: #475569;">
        Questions? Reply to this email or write to
        <a href="mailto:info@aiofusion.ai" style="color: #C8497A;">info@aiofusion.ai</a>
      </p>
    `,
    cta: { text: "Sign in to AIO Fusion", href: opts.loginUrl },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject, text, html });
    logger.info({ toEmail: opts.toEmail }, "notify-email: approval email sent");
  } catch (err) {
    logger.warn({ err, toEmail: opts.toEmail }, "notify-email: failed to send approval email (non-fatal)");
  }
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
    `Admin token usage panel: https://www.aiofusion.ai`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Spend Alert",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">
        A content AI spend spike has been detected on account
        <strong>${escHtml(opts.slug)}</strong>.
      </p>
      ${buildDataRows([
        ["Last 7 days spend", `£${opts.last7Cost.toFixed(4)}`],
        ["Prior 7 days spend", `£${opts.prior7Cost.toFixed(4)}`],
        ["Ratio", `${opts.ratio.toFixed(1)}× (threshold: 3×)`],
      ])}
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #475569;">
        Review the account's usage, adjust their quota, or block the account if the activity looks abusive.
      </p>
    `,
    cta: { text: "Open Admin Panel", href: "https://www.aiofusion.ai" },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: ALERT_RECIPIENTS, subject, text, html });
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
    `Admin token usage panel: https://www.aiofusion.ai`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Fair Usage Limit Reached",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">
        Account <strong>${escHtml(opts.slug)}</strong> has reached their 30-day content AI fair usage limit.
      </p>
      ${buildDataRows([
        ["30-day content AI calls", String(opts.callCount)],
        ["Account limit", String(opts.limit)],
      ])}
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #475569;">
        The account is now receiving 429 responses on all content AI and LLM check routes.
        Adjust their quota multiplier or block the account if needed.
      </p>
    `,
    cta: { text: "Open Admin Panel", href: "https://www.aiofusion.ai" },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: ALERT_RECIPIENTS, subject, text, html });
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
    `Admin token usage panel: https://www.aiofusion.ai`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Monthly Spend Cap Reached",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">
        Account <strong>${escHtml(opts.slug)}</strong> has hit their monthly GBP spend cap.
      </p>
      ${buildDataRows([
        ["Current month spend", `£${opts.spendGbp.toFixed(4)}`],
        ["Monthly cap", `£${opts.limitGbp.toFixed(2)}`],
      ])}
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #475569;">
        The account is now receiving 429 responses on all AI routes until the cap is raised
        or the calendar month resets.
      </p>
    `,
    cta: { text: "Open Admin Panel", href: "https://www.aiofusion.ai" },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: ALERT_RECIPIENTS, subject, text, html });
    logger.info({ slug: opts.slug, spendGbp: opts.spendGbp }, "notify-email: spend cap alert sent");
  } catch (err) {
    logger.warn({ err, slug: opts.slug }, "notify-email: failed to send spend cap alert (non-fatal)");
  }
}

export async function sendBookDemoInternalAlert(opts: {
  name: string;
  email: string;
  company: string;
  goal: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({}, "notify-email: RESEND_API_KEY not set — book demo internal alert not sent");
    return;
  }

  const subject = `[AIO Fusion] Demo request — ${opts.company || opts.name}`;
  const text = [
    `A new demo request has been submitted via the website.`,
    ``,
    `Name:    ${opts.name}`,
    `Email:   ${opts.email}`,
    `Company: ${opts.company}`,
    `Goal:    ${opts.goal}`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Demo Request",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">A new demo request has been submitted via the website.</p>
      ${buildDataRows([
        ["Name", opts.name],
        ["Email", opts.email],
        ["Company", opts.company],
        ["What they hope to achieve", opts.goal],
      ])}
    `,
    cta: { text: "Reply to enquiry", href: `mailto:${opts.email}` },
  });

  await resend.emails.send({
    from: fromAddress(),
    to: ["info@aiofusion.ai"],
    subject,
    text,
    html,
  });
  logger.info({ email: opts.email }, "notify-email: book demo internal alert sent");
}

export async function sendBookDemoConfirmation(opts: {
  name: string;
  toEmail: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail }, "notify-email: RESEND_API_KEY not set — book demo confirmation not sent");
    return;
  }

  const subject = `We've received your demo request — AIO Fusion`;
  const text = [
    `Hi ${opts.name},`,
    ``,
    `Thank you for requesting a demo of AIO Fusion. We'll be in touch within one`,
    `business day to arrange a time that works for you.`,
    ``,
    `In the meantime, if you have any questions, feel free to reply to this email`,
    `or write to us at info@aiofusion.ai.`,
    ``,
    `Warm regards,`,
    `The AIO Fusion team`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Demo Request Received",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi ${escHtml(opts.name)},</p>
      <p style="margin: 0 0 16px 0;">
        Thank you for requesting a demo of AIO Fusion. We'll be in touch within
        <strong>one business day</strong> to arrange a time that works for you.
      </p>
      <p style="margin: 0 0 0 0; font-size: 13px; color: #475569;">
        In the meantime, if you have any questions, feel free to reply to this email
        or write to us at
        <a href="mailto:info@aiofusion.ai" style="color: #C8497A;">info@aiofusion.ai</a>.
      </p>
    `,
    cta: { text: "Visit AIO Fusion", href: "https://www.aiofusion.ai" },
  });

  await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject, text, html });
  logger.info({ toEmail: opts.toEmail }, "notify-email: book demo confirmation sent");
}

export async function sendEnquiryInternalAlert(opts: {
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({}, "notify-email: RESEND_API_KEY not set — enquiry internal alert not sent");
    return;
  }

  const emailSubject = `[AIO Fusion] Enquiry — ${opts.subject}`;
  const text = [
    `A new general enquiry has been submitted via the website.`,
    ``,
    `Name:    ${opts.name}`,
    `Email:   ${opts.email}`,
    `Company: ${opts.company || "(not provided)"}`,
    `Subject: ${opts.subject}`,
    ``,
    `Message:`,
    opts.message,
  ].join("\n");

  const html = buildEmailHtml({
    label: "General Enquiry",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">A new general enquiry has been submitted via the website.</p>
      ${buildDataRows([
        ["Name", opts.name],
        ["Email", opts.email],
        ["Company", opts.company || "(not provided)"],
        ["Subject", opts.subject],
      ])}
      <p style="margin: 16px 0 6px 0; font-weight: 600; font-size: 13px; color: #475569;">Message:</p>
      <div style="background: #F8FAFC; border-left: 3px solid #C8497A; padding: 14px 16px;
                  border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.7; color: #102B36;">
        ${textToHtml(opts.message)}
      </div>
    `,
    cta: { text: "Reply to enquiry", href: `mailto:${opts.email}` },
  });

  await resend.emails.send({
    from: fromAddress(),
    to: ["info@aiofusion.ai"],
    subject: emailSubject,
    text,
    html,
  });
  logger.info({ email: opts.email }, "notify-email: enquiry internal alert sent");
}

export async function sendSupportTicketAlert(opts: {
  ticketId: number;
  subject: string;
  category: string;
  description: string;
  accountUsername: string;
  displayName?: string;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ ticketId: opts.ticketId }, "notify-email: RESEND_API_KEY not set — support ticket alert not sent");
    return false;
  }

  const accountLabel = opts.displayName
    ? `${opts.displayName} (${opts.accountUsername})`
    : opts.accountUsername;

  const emailSubject = `[AIO Fusion] New support ticket #${opts.ticketId} — ${opts.subject}`;
  const text = [
    `A new support ticket has been submitted.`,
    ``,
    `Ticket ID:   #${opts.ticketId}`,
    `Subject:     ${opts.subject}`,
    `Category:    ${opts.category}`,
    `Account:     ${accountLabel}`,
    ``,
    `Description:`,
    opts.description,
    ``,
    `Log in to the admin panel to view and respond to this ticket.`,
    ``,
    `Admin panel: https://www.aiofusion.ai`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "New Support Ticket",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">A new support ticket has been submitted and is awaiting a response.</p>
      ${buildDataRows([
        ["Ticket ID", `#${opts.ticketId}`],
        ["Subject", opts.subject],
        ["Category", opts.category],
        ["Account", accountLabel],
      ])}
      <p style="margin: 16px 0 6px 0; font-weight: 600; font-size: 13px; color: #475569;">Description:</p>
      <div style="background: #F8FAFC; border-left: 3px solid #C8497A; padding: 14px 16px;
                  border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.7; color: #102B36;">
        ${textToHtml(opts.description)}
      </div>
    `,
    cta: { text: "Open Admin Panel", href: "https://www.aiofusion.ai" },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: ALERT_RECIPIENTS, subject: emailSubject, text, html });
    logger.info({ ticketId: opts.ticketId, accountUsername: opts.accountUsername }, "notify-email: support ticket alert sent");
    return true;
  } catch (err) {
    logger.warn({ err, ticketId: opts.ticketId }, "notify-email: failed to send support ticket alert (non-fatal)");
    return false;
  }
}

export async function sendSupportTicketAck(opts: {
  toEmail: string;
  toName: string;
  displayName?: string;
  ticketId: number;
  subject: string;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail, ticketId: opts.ticketId }, "notify-email: RESEND_API_KEY not set — support ticket ack not sent");
    return false;
  }

  const greeting = opts.displayName || opts.toName;

  const emailSubject = `We've received your support request — AIO Fusion [#${opts.ticketId}]`;
  const text = [
    `Hi ${greeting},`,
    ``,
    `Thank you for getting in touch. We've received your support ticket and a member`,
    `of our team will get back to you as soon as possible.`,
    ``,
    `Your ticket reference is: #${opts.ticketId}`,
    `Subject: ${opts.subject}`,
    ``,
    `If you have any additional information to share, you can reply directly to this`,
    `email or contact us at info@aiofusion.ai.`,
    ``,
    `Warm regards,`,
    `The AIO Fusion team`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Support Request Received",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi ${escHtml(greeting)},</p>
      <p style="margin: 0 0 16px 0;">
        Thank you for getting in touch. We've received your support ticket and a member
        of our team will get back to you as soon as possible.
      </p>
      ${buildDataRows([
        ["Ticket reference", `#${opts.ticketId}`],
        ["Subject", opts.subject],
      ])}
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #475569;">
        If you have additional information to share, reply to this email or write to
        <a href="mailto:info@aiofusion.ai" style="color: #C8497A;">info@aiofusion.ai</a>.
      </p>
    `,
    cta: { text: "Visit AIO Fusion", href: "https://www.aiofusion.ai" },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject: emailSubject, text, html });
    logger.info({ toEmail: opts.toEmail, ticketId: opts.ticketId }, "notify-email: support ticket ack sent");
    return true;
  } catch (err) {
    logger.warn({ err, toEmail: opts.toEmail, ticketId: opts.ticketId }, "notify-email: failed to send support ticket ack (non-fatal)");
    return false;
  }
}

export async function sendSupportTicketReplyNotification(opts: {
  toEmail: string;
  toName: string;
  displayName?: string;
  ticketId: number;
  subject: string;
  replyBody: string;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail, ticketId: opts.ticketId }, "notify-email: RESEND_API_KEY not set — support ticket reply notification not sent");
    return false;
  }

  const greeting = opts.displayName || opts.toName;

  const emailSubject = `Re: Your support request [#${opts.ticketId}] — ${opts.subject}`;
  const text = [
    `Hi ${greeting},`,
    ``,
    `A member of the AIO Fusion support team has replied to your ticket.`,
    ``,
    `Ticket reference: #${opts.ticketId}`,
    `Subject: ${opts.subject}`,
    ``,
    `Reply:`,
    opts.replyBody,
    ``,
    `You can reply directly to this email or log in to view the full thread.`,
    ``,
    `Warm regards,`,
    `The AIO Fusion team`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Support Reply",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi ${escHtml(greeting)},</p>
      <p style="margin: 0 0 16px 0;">
        A member of the AIO Fusion support team has replied to your ticket.
      </p>
      ${buildDataRows([
        ["Ticket reference", `#${opts.ticketId}`],
        ["Subject", opts.subject],
      ])}
      <p style="margin: 16px 0 6px 0; font-weight: 600; font-size: 13px; color: #475569;">Reply:</p>
      <div style="background: #F8FAFC; border-left: 3px solid #C8497A; padding: 14px 16px;
                  border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.7; color: #102B36;">
        ${textToHtml(opts.replyBody)}
      </div>
      <p style="margin: 16px 0 0 0; font-size: 13px; color: #475569;">
        Reply to this email or log in to
        <a href="https://www.aiofusion.ai" style="color: #C8497A;">AIO Fusion</a>
        to view the full thread.
      </p>
    `,
    cta: { text: "View your support thread", href: "https://www.aiofusion.ai" },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject: emailSubject, text, html });
    logger.info({ toEmail: opts.toEmail, ticketId: opts.ticketId }, "notify-email: support ticket reply notification sent");
    return true;
  } catch (err) {
    logger.warn({ err, toEmail: opts.toEmail, ticketId: opts.ticketId }, "notify-email: failed to send support ticket reply notification (non-fatal)");
    return false;
  }
}

export async function sendContactFormFailedAlert(opts: {
  submissionId: number;
  type: "book-demo" | "enquiry";
  name: string;
  email: string;
  company: string;
  error: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ submissionId: opts.submissionId }, "notify-email: RESEND_API_KEY not set — contact form failed alert not sent");
    return;
  }

  const typeLabel = opts.type === "book-demo" ? "Demo Request" : "General Enquiry";
  const subject = `[AIO Fusion] ALERT — Contact form email delivery failed (#${opts.submissionId})`;
  const text = [
    `A contact form submission was received and saved to the database, but`,
    `the confirmation and alert emails failed to send.`,
    ``,
    `Submission ID: #${opts.submissionId}`,
    `Type:          ${typeLabel}`,
    `Name:          ${opts.name}`,
    `Email:         ${opts.email}`,
    `Company:       ${opts.company || "(not provided)"}`,
    ``,
    `Error: ${opts.error}`,
    ``,
    `The lead is safe in the database. Log in to the admin panel → Leads to`,
    `re-send the emails once Resend is back online.`,
    ``,
    `Admin panel: https://www.aiofusion.ai`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Contact Form Email Failed",
    bodyHtml: `
      <p style="margin: 0 0 16px 0;">
        A contact form submission was saved to the database but email delivery failed.
        The lead is safe — use the admin panel to re-send once Resend is back online.
      </p>
      ${buildDataRows([
        ["Submission ID", `#${opts.submissionId}`],
        ["Type", typeLabel],
        ["Name", opts.name],
        ["Email", opts.email],
        ["Company", opts.company || "(not provided)"],
      ])}
      <p style="margin: 16px 0 6px 0; font-weight: 600; font-size: 13px; color: #475569;">Error:</p>
      <div style="background: #FFF1F2; border-left: 3px solid #E11D48; padding: 12px 16px;
                  border-radius: 0 8px 8px 0; font-size: 13px; font-family: monospace; color: #881337;
                  word-break: break-all;">
        ${escHtml(opts.error)}
      </div>
    `,
    cta: { text: "Open Leads Panel", href: "https://www.aiofusion.ai" },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: ALERT_RECIPIENTS, subject, text, html });
    logger.info({ submissionId: opts.submissionId }, "notify-email: contact form failed alert sent");
  } catch (err) {
    logger.warn({ err, submissionId: opts.submissionId }, "notify-email: failed to send contact form failed alert");
  }
}

export async function sendEnquiryConfirmation(opts: {
  name: string;
  toEmail: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail }, "notify-email: RESEND_API_KEY not set — enquiry confirmation not sent");
    return;
  }

  const subject = `We've received your message — AIO Fusion`;
  const text = [
    `Hi ${opts.name},`,
    ``,
    `Thank you for getting in touch with AIO Fusion. We've received your message`,
    `and a member of our team will get back to you as soon as possible.`,
    ``,
    `If your enquiry is urgent, you can also reach us directly at info@aiofusion.ai.`,
    ``,
    `Warm regards,`,
    `The AIO Fusion team`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Enquiry Received",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi ${escHtml(opts.name)},</p>
      <p style="margin: 0 0 16px 0;">
        Thank you for getting in touch with AIO Fusion. We've received your message
        and a member of our team will get back to you as soon as possible.
      </p>
      <p style="margin: 0 0 0 0; font-size: 13px; color: #475569;">
        If your enquiry is urgent, you can also reach us directly at
        <a href="mailto:info@aiofusion.ai" style="color: #C8497A;">info@aiofusion.ai</a>.
      </p>
    `,
    cta: { text: "Visit AIO Fusion", href: "https://www.aiofusion.ai" },
  });

  await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject, text, html });
  logger.info({ toEmail: opts.toEmail }, "notify-email: enquiry confirmation sent");
}

export async function sendPasswordResetEmail(opts: {
  toEmail: string;
  toName: string;
  resetUrl: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ toEmail: opts.toEmail }, "notify-email: RESEND_API_KEY not set — password reset email not sent");
    return;
  }

  const subject = `Reset your AIO Fusion password`;
  const text = [
    `Hi ${opts.toName},`,
    ``,
    `We received a request to reset the password for your AIO Fusion account.`,
    `Click the link below to choose a new password:`,
    ``,
    opts.resetUrl,
    ``,
    `This link can be used once and expires in 1 hour. If you didn't request a`,
    `password reset, you can safely ignore this email — your password will not change.`,
    ``,
    `The AIO Fusion team`,
  ].join("\n");

  const html = buildEmailHtml({
    label: "Reset Your Password",
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hi ${escHtml(opts.toName)},</p>
      <p style="margin: 0 0 16px 0; font-size: 17px; font-weight: 600; color: #102B36;">
        We received a request to reset your AIO Fusion password.
      </p>
      <p style="margin: 0 0 16px 0;">
        Click the button below to choose a new password. This link can be used
        <strong>once</strong> and expires in <strong>1 hour</strong>.
      </p>
      <p style="margin: 24px 0 0 0; font-size: 13px; color: #475569;">
        If you didn't request a password reset, you can safely ignore this email —
        your password will not change.
      </p>
    `,
    cta: { text: "Reset password", href: opts.resetUrl },
  });

  try {
    await resend.emails.send({ from: fromAddress(), to: [opts.toEmail], subject, text, html });
    logger.info({ toEmail: opts.toEmail }, "notify-email: password reset email sent");
  } catch (err) {
    logger.warn({ err, toEmail: opts.toEmail }, "notify-email: failed to send password reset email (non-fatal)");
  }
}
