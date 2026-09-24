type DatabaseEnvironment = Record<string, string | undefined>;

export function bindStagingDatabaseTarget(env: DatabaseEnvironment): void {
  const deploymentEnv = env.DEPLOYMENT_ENV?.toLowerCase().trim();
  if (deploymentEnv !== "staging") return;

  // This staging deployment uses this project's main published database.
  // The separate beta site must never become its data source implicitly.
  const mainDatabaseUrl = env.PRODUCTION_DATABASE_URL?.trim();
  if (!mainDatabaseUrl) {
    throw new Error(
      "PRODUCTION_DATABASE_URL is required when DEPLOYMENT_ENV=staging.",
    );
  }

  const betaDatabaseUrl = env.BETA_DATABASE_URL?.trim();
  if (betaDatabaseUrl && mainDatabaseUrl === betaDatabaseUrl) {
    throw new Error(
      "PRODUCTION_DATABASE_URL must not equal BETA_DATABASE_URL.",
    );
  }

  // This must happen before importing index.ts because the database workspace
  // package creates its pool during module initialisation.
  env.DATABASE_URL = mainDatabaseUrl;
}