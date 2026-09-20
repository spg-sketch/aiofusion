import { type Request, type Response, type NextFunction } from "express";

export function createConcurrencyGuard(maxConcurrent: number) {
  let inFlight = 0;

  return function concurrencyGuard(req: Request, res: Response, next: NextFunction): void {
    if (inFlight >= maxConcurrent) {
      res.status(503).json({ error: "Server is busy processing other requests. Please try again shortly." });
      return;
    }

    inFlight++;
    let released = false;
    let heldAfterResponse = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlight--;
      }
    };

    (req as any).holdConcurrencyGuard = () => {
      heldAfterResponse = true;
      return release;
    };
    const releaseUnlessHeld = () => {
      if (!heldAfterResponse) release();
    };
    res.on("finish", releaseUnlessHeld);
    res.on("close", releaseUnlessHeld);

    next();
  };
}

export const diagnosticConcurrencyGuard = createConcurrencyGuard(3);
export const llmCheckConcurrencyGuard = createConcurrencyGuard(2);
export const seoAuditConcurrencyGuard = createConcurrencyGuard(5);
