type DatabaseEnvironment = Record<string, string | undefined>;

export function bindPublishedDatabaseTarget(env: DatabaseEnvironment): void {
  const deploymentEnv = env.DEPLOYMENT_ENV?.toLowerCase().trim();
  if (deploymentEnv !== "staging" && deploymentEnv !== "production") return;

  // Both published modes must use this project's main database, never the
  // separate beta database or an implicit runtime-provided default.
  const mainDatabaseUrl = env.PRODUCTION_DATABASE_URL?.trim();
  if (!mainDatabaseUrl) {
    throw new Error(
      `PRODUCTION_DATABASE_URL is required when DEPLOYMENT_ENV=${deploymentEnv}.`,
    );
  }

  const betaDatabaseUrl = env.BETA_DATABASE_URL?.trim();
  if (betaDatabaseUrl && mainDatabaseUrl === betaDatabaseUrl) {
    throw new Error(
      "PRODUCTION_DATABASE_URL must not equal BETA_DATABASE_URL.",
    );
  }

  // Bind before importing index.ts: @workspace/db creates its pool at import time.
  env.DATABASE_URL = mainDatabaseUrl;
}