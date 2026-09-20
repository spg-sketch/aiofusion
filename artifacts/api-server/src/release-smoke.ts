import app from "./app";
import { logger } from "./lib/logger";
import { markRuntimeReady, markRuntimeDraining } from "./lib/runtime-lifecycle";

if (process.env.RELEASE_SMOKE_MODE !== "1") {
  throw new Error("The isolated release smoke entry requires RELEASE_SMOKE_MODE=1.");
}
if (process.env.DEPLOYMENT_ENV === "production") {
  throw new Error("The isolated release smoke entry refuses DEPLOYMENT_ENV=production.");
}

const rawPort = process.env.PORT;
if (!rawPort || !Number.isInteger(Number(rawPort)) || Number(rawPort) <= 0) {
  throw new Error("A valid PORT is required.");
}

const server = app.listen(Number(rawPort), "127.0.0.1", () => {
  markRuntimeReady();
  logger.info({ port: Number(rawPort) }, "Isolated production-build smoke server ready");
});

let closing = false;
function close(signal: NodeJS.Signals): void {
  if (closing) return;
  closing = true;
  markRuntimeDraining();
  server.close((error) => {
    if (error) {
      logger.error({ error, signal }, "Smoke server shutdown failed");
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGTERM", () => close("SIGTERM"));
process.once("SIGINT", () => close("SIGINT"));