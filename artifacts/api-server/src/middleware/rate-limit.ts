import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import type { Options } from "express-rate-limit";

function retryAfterHandler(message: string) {
  return (req: Request, res: Response, _next: NextFunction, options: Options) => {
    const rl = (req as any).rateLimit as { resetTime?: Date } | undefined;
    const resetTime = rl?.resetTime;
    const retryAfter = resetTime instanceof Date
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil((options.windowMs as number) / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(options.statusCode as number).json({ error: message });
  };
}

// General API limit - covers all data routes (project sync, accounts, store,
// etc.). Set high enough that normal interactive use never hits it. A single
// page load can fire 10–15 requests; a user with many projects fires more on
// sync. 500 per 15 minutes = ~33/minute, well above any legitimate session.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler("Too many requests. Please try again later."),
});

// Login-specific limit - tight to prevent brute-force password guessing.
// 20 attempts per 15 minutes per IP is generous for a human, strict for a bot.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
});

export const sessionTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler("Too many token requests. Please try again later."),
});

export const diagnosticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler("Too many analysis requests. Please wait before running another analysis."),
});

export const llmCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler("Too many LLM check requests. Please wait before running another check."),
});

export const seoAuditLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler("Too many audit requests. Please wait before running another audit."),
});

export const aiAssistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler("Too many AI draft requests. Please wait a moment before trying again."),
});

export const contentAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: retryAfterHandler("Too many content requests. Please wait a moment before trying again."),
});
