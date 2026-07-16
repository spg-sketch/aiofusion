import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";
import {
  sendBookDemoInternalAlert,
  sendBookDemoConfirmation,
  sendEnquiryInternalAlert,
  sendEnquiryConfirmation,
} from "../lib/notify-email";

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

    try {
      await Promise.all([
        sendBookDemoInternalAlert({ name, email, company, goal }),
        sendBookDemoConfirmation({ name, toEmail: email }),
      ]);
      logger.info({ email }, "contact/book-demo: emails dispatched");
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, email }, "contact/book-demo: unexpected error");
      res.status(500).json({ error: "Failed to submit your request. Please try again." });
    }
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

    try {
      await Promise.all([
        sendEnquiryInternalAlert({ name, email, company, subject, message }),
        sendEnquiryConfirmation({ name, toEmail: email }),
      ]);
      logger.info({ email }, "contact/enquiry: emails dispatched");
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, email }, "contact/enquiry: unexpected error");
      res.status(500).json({ error: "Failed to submit your message. Please try again." });
    }
  },
);

export default contactRouter;
