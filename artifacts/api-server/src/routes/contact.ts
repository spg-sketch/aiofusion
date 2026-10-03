import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db, contactSubmissionsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendContactFormFailedAlert } from "../lib/notify-email";
import { deliverContactEmails } from "./contact-delivery";
import { parseContactAttribution } from "../lib/contact-attribution";

const contactRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    return ip;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many submissions. Please wait an hour before trying again.",
    });
  },
});

contactRouter.post(
  "/contact/book-demo",
  contactLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 128) : "";
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase().slice(0, 256)
        : "";
    const company =
      typeof req.body?.company === "string"
        ? req.body.company.trim().slice(0, 128)
        : "";
    const goal =
      typeof req.body?.goal === "string" ? req.body.goal.trim().slice(0, 1000) : "";

    if (!name) {
      res.status(400).json({ error: "Your name is required." });
      return;
    }
    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }
    if (!company) {
      res.status(400).json({ error: "Your company name is required." });
      return;
    }
    if (!goal) {
      res.status(400).json({
        error: "Please tell us what you're hoping to achieve.",
      });
      return;
    }

    // ── Step 1: Persist to DB (hard precondition) ────────────────────────────
    let attribution: ReturnType<typeof parseContactAttribution>;
    try { attribution = parseContactAttribution(req.body ?? {}); }
    catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    // If this fails the user gets a 500 and can retry; no lead is silently lost.
    let savedId: number;
    try {
      const [row] = await db
        .insert(contactSubmissionsTable)
        .values({ type: "book-demo", name, email, company, goal, ...attribution, emailFailed: true,
          internalEmailAccepted: false, customerEmailAccepted: false })
        .returning({ id: contactSubmissionsTable.id });
      savedId = row.id;
      logger.info({ savedId, email }, "contact/book-demo: submission saved to DB");
    } catch (dbErr) {
      logger.error({ dbErr, email }, "contact/book-demo: DB save failed - aborting");
      res.status(500).json({ error: "Failed to submit your request. Please try again." });
      return;
    }

    // ── Step 2: Attempt email delivery (non-fatal) ───────────────────────────
    // Submission is already persisted; email failure sets the flag and notifies admins.
    try {
      const errors = await deliverContactEmails(savedId);
      if (errors.length) {
        logger.warn({ savedId, errors }, "contact/book-demo: partial email delivery");
        void sendContactFormFailedAlert({
          submissionId: savedId, type: "book-demo", name, email, company, error: errors.join("; "),
        }).catch(() => {});
      }
    } catch (err) {
      logger.error(
        { err, savedId, email },
        `contact/book-demo: email delivery failed (non-fatal, submission #${savedId} already saved)`,
      );
      void sendContactFormFailedAlert({
        submissionId: savedId,
        type: "book-demo",
        name,
        email,
        company,
        error: String(err),
      }).catch(() => {});
    }

    res.json({ ok: true });
  },
);

contactRouter.post(
  "/contact/enquiry",
  contactLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 128) : "";
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase().slice(0, 256)
        : "";
    const company =
      typeof req.body?.company === "string"
        ? req.body.company.trim().slice(0, 128)
        : "";
    const subject =
      typeof req.body?.subject === "string"
        ? req.body.subject.trim().slice(0, 256)
        : "";
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim().slice(0, 4000)
        : "";

    if (!name) {
      res.status(400).json({ error: "Your name is required." });
      return;
    }
    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }
    if (!subject) {
      res.status(400).json({ error: "A subject is required." });
      return;
    }
    if (!message) {
      res.status(400).json({ error: "A message is required." });
      return;
    }

    // ── Step 1: Persist to DB (hard precondition) ────────────────────────────
    let attribution: ReturnType<typeof parseContactAttribution>;
    try { attribution = parseContactAttribution(req.body ?? {}); }
    catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    let savedId: number;
    try {
      const [row] = await db
        .insert(contactSubmissionsTable)
        .values({ type: "enquiry", name, email, company, subject, message, ...attribution, emailFailed: true,
          internalEmailAccepted: false, customerEmailAccepted: false })
        .returning({ id: contactSubmissionsTable.id });
      savedId = row.id;
      logger.info({ savedId, email }, "contact/enquiry: submission saved to DB");
    } catch (dbErr) {
      logger.error({ dbErr, email }, "contact/enquiry: DB save failed - aborting");
      res.status(500).json({ error: "Failed to submit your message. Please try again." });
      return;
    }

    // ── Step 2: Attempt email delivery (non-fatal) ───────────────────────────
    try {
      const errors = await deliverContactEmails(savedId);
      if (errors.length) {
        logger.warn({ savedId, errors }, "contact/enquiry: partial email delivery");
        void sendContactFormFailedAlert({
          submissionId: savedId, type: "enquiry", name, email, company, error: errors.join("; "),
        }).catch(() => {});
      }
    } catch (err) {
      logger.error(
        { err, savedId, email },
        `contact/enquiry: email delivery failed (non-fatal, submission #${savedId} already saved)`,
      );
      void sendContactFormFailedAlert({
        submissionId: savedId,
        type: "enquiry",
        name,
        email,
        company,
        error: String(err),
      }).catch(() => {});
    }

    res.json({ ok: true });
  },
);

export default contactRouter;
