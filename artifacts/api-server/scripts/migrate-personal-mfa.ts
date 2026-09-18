import crypto from "node:crypto";
import { parseMigrationOptions } from "./personal-mfa-migration-options";

// This command is deliberately not in startup, post-merge or deployment hooks.
// DATABASE_URL must be selected by the operator through the approved secrets
// workflow. The command neither selects another database nor prints its URL.
async function readFactorProof(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Existing-factor proof requires an interactive terminal; never pass codes as command arguments");
  }
  process.stderr.write("Enter current authenticator or recovery code (hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let code = "";
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stderr.write("\n");
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") { finish(); reject(new Error("Cancelled")); return; }
        if (char === "\r" || char === "\n") { finish(); resolve(code); return; }
        if (char === "\u007f") code = code.slice(0, -1);
        else if (/^[a-zA-Z0-9 -]$/.test(char) && code.length < 32) code += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const opts = parseMigrationOptions(process.argv.slice(2));
  const { db, pool, platformUsersTable, platformMembershipsTable, platformAccountsTable, platformCompaniesTable } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");
  const { inspectLegacyMfaMigration, migrateAttributableLegacyMfa, approvePersonalMfaRecovery } = await import("../src/lib/mfa-migration");
  try {
    const identity = await pool.query("SELECT current_database() AS database, current_user AS role, inet_server_addr()::text AS address, inet_server_port() AS port");
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(identity.rows[0])).digest("hex").slice(0, 24);
    const report = await inspectLegacyMfaMigration(opts.workspace);
    console.log(JSON.stringify({ mode: opts.apply ? "requested-apply" : "dry-run", environmentLabel: opts.environment,
      databaseFingerprint: fingerprint, ...report }, null, 2));
    if (!opts.apply) return;
    if (opts.fingerprint !== fingerprint) throw new Error("Database fingerprint differs from the approved dry-run");
    const [operator] = await db.select({ emailVerified: platformUsersTable.emailVerified })
      .from(platformUsersTable)
      .innerJoin(platformMembershipsTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
      .innerJoin(platformCompaniesTable, eq(platformCompaniesTable.id, platformMembershipsTable.companyId))
      .innerJoin(platformAccountsTable, eq(platformAccountsTable.username, platformCompaniesTable.slug))
      .where(and(eq(platformUsersTable.id, opts.operatorUserId!), eq(platformMembershipsTable.role, "owner"),
        eq(platformCompaniesTable.slug, "admin"), eq(platformCompaniesTable.role, "admin"),
        eq(platformAccountsTable.role, "admin"), eq(platformAccountsTable.status, "active"),
        eq(platformCompaniesTable.status, "active"))).limit(1);
    if (!operator?.emailVerified) throw new Error("Approval must name a current verified canonical Master Owner");
    const target = report.members.find(member => member.userId === opts.targetUserId);
    if (!target || target.emailVerified !== true || target.email?.toLowerCase() !== opts.targetEmail) {
      throw new Error("Target confirmation does not match a current verified workspace member");
    }
    // Helpers own the atomic move/reset and idempotency check. Only metadata
    // describing authorization is printed; never factor proof or returned state.
    if (opts.action === "move") {
      await migrateAttributableLegacyMfa(opts.workspace, opts.targetUserId!, await readFactorProof(), {
        operatorUserId: opts.operatorUserId!, approvalReference: opts.approvalReference,
      });
    } else {
      await approvePersonalMfaRecovery(opts.targetUserId!, opts.approvalReference!, { operatorUserId: opts.operatorUserId! });
    }
    console.log("Approved individual transition completed. Fresh primary sign-in is required. No workspace data or roles were changed.");
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // Database errors can contain SQL parameters. Do not print error objects.
  console.error("Migration stopped. Check option names, approved database fingerprint, current memberships and the verified recovery/move preconditions. No credential details have been logged.");
  process.exitCode = 1;
});