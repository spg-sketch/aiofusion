type DatabaseEnvironment = Record<string, string | undefined>;

export function bindStagingDatabaseTarget(env: DatabaseEnvironment): void {
  const deploymentEnv = env.DEPLOYMENT_ENV?.toLowerCase().trim();
  if (deploymentEnv !== "staging") return;

  const betaDatabaseUrl = env.BETA_DATABASE_URL?.trim();
  if (!betaDatabaseUrl) {
    throw new Error(
      "BETA_DATABASE_URL is required when DEPLOYMENT_ENV=staging.",
    );
  }

  const productionDatabaseUrl = env.PRODUCTION_DATABASE_URL?.trim();
  if (productionDatabaseUrl && betaDatabaseUrl === productionDatabaseUrl) {
    throw new Error(
      "BETA_DATABASE_URL must not equal PRODUCTION_DATABASE_URL.",
    );
  }

  // This must happen before importing index.ts because the database workspace
  // package creates its pool during module initialisation.
  env.DATABASE_URL = betaDatabaseUrl;
}