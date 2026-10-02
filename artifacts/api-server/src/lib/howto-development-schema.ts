type SetupEnvironment = Record<string, string | undefined>;
type SchemaClient = { query: (statement: string) => Promise<unknown> };

function databaseIdentity(value: string): string {
  const url = new URL(value);
  return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
}

export function assertHowtoDevelopmentTarget(env: SetupEnvironment): void {
  if (env.DEPLOYMENT_ENV !== "development" || env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT) {
    throw new Error("How-to schema setup is development-only and refuses deployed or unknown environments.");
  }
  if (!env.DATABASE_URL) throw new Error("A development database must be configured.");
  const target = databaseIdentity(env.DATABASE_URL);
  for (const key of ["PRODUCTION_DATABASE_URL", "BETA_DATABASE_URL", "STAGING_TIER_VERIFICATION_DATABASE_URL"]) {
    if (env[key] && databaseIdentity(env[key]!) === target) {
      throw new Error("How-to development setup refuses a protected database target.");
    }
  }
}

// Post-merge DEVELOPMENT setup only. Publish remains responsible for production
// schema changes. Never push a partial schema or drop/rename existing objects.
export async function createHowtoDevelopmentTables(client: SchemaClient): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS public.howto_entries (
      id varchar PRIMARY KEY,
      title text NOT NULL,
      description text NOT NULL,
      type varchar NOT NULL,
      read_time varchar NOT NULL,
      display_order integer NOT NULL DEFAULT 0,
      status varchar NOT NULL DEFAULT 'draft',
      body jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS public.howto_migration_ledger (
      id varchar PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}