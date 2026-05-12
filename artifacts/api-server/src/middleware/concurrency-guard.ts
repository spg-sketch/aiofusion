import { type Request, type Response, type NextFunction } from "express";

export function createConcurrencyGuard(maxConcurrent: number) {
  let inFlight = 0;

  return function concurrencyGuard(_req: Request, res: Response, next: NextFunction): void {
    if (inFlight >= maxConcurrent) {
      res.status(503).json({ error: "Server is busy processing other requests. Please try again shortly." });
      return;
    }

    inFlight++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlight--;
      }
    };

    res.on("finish", release);
    res.on("close", release);

    next();
  };
}

export const diagnosticConcurrencyGuard = createConcurrencyGuard(3);
export const llmCheckConcurrencyGuard = createConcurrencyGuard(2);
export const seoAuditConcurrencyGuard = createConcurrencyGuard(5);
