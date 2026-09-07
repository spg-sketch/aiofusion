import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// PostgreSQL may recycle idle connections during maintenance or failover.
// pg removes the affected client from the pool, but Node will terminate the
// entire API process if the pool's resulting "error" event has no listener.
pool.on("error", (error) => {
  console.error("PostgreSQL idle pool connection failed; the client was removed", error);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
