/**
 * Staging seed script for AIO Fusion.
 *
 * Creates representative accounts, projects, and audit records so testers
 * always start from a known, realistic state instead of an empty database.
 *
 * Safe to re-run — the dedicated review rows are only inserted when they do
 * not already exist. Existing rows are checked, never updated, and a
 * collision with anything other than the expected review fixture aborts the
 * transaction. Run against the beta database only; never against production.
 *
 * Usage:
 *   DATABASE_URL=<beta-url> \
 *   BETA_DATABASE_URL=<beta-url> \
 *   PRODUCTION_DATABASE_URL=<production-url> \
 *   STAGING_REVIEW_PASSWORD=<secret> \
 *     pnpm --filter @workspace/scripts run seed-staging
 *
 * Or, if the four values are already in the environment:
 *   pnpm --filter @workspace/scripts run seed-staging
 */

import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * This prefix is deliberately different from the historical `seed-staging`
 * fixture. Keeping the review accounts in their own namespace means that a
 * tester's old fixture cannot accidentally be treated as the managed review
 * fixture (or vice versa).
 */
export const STAGING_REVIEW_PREFIX = "staging-review";

type ReviewRole = "agency" | "client";

interface ReviewAccount {
  username: string;
  role: ReviewRole;
  parent: string | null;
  email: string;
  website: string;
  name: string;
}

const ACCOUNTS: ReviewAccount[] = [
  {
    username: `${STAGING_REVIEW_PREFIX}-agency`,
    role: "agency" as const,
    parent: null,
    email: `agency@${STAGING_REVIEW_PREFIX}.invalid`,
    website: "https://example-agency.invalid",
    name: "Staging Review Agency User",
  },
  {
    username: `${STAGING_REVIEW_PREFIX}-client`,
    role: "client" as const,
    // This is a direct client review account, not a child account of the
    // agency fixture. Keeping parent null also exercises the direct-client
    // onboarding path.
    parent: null,
    email: `client@${STAGING_REVIEW_PREFIX}.invalid`,
    website: "https://example-client.invalid",
    name: "Staging Review Client User",
  },
];

// ---------------------------------------------------------------------------
// Password hashing (mirrors platform-auth.ts — no cross-package import to keep
// scripts self-contained and avoid bundling the entire api-server)
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: unknown): boolean {
  try {
    if (typeof stored !== "string") return false;
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, expectedHex] = parts;
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length !== SCRYPT_KEYLEN || expectedHex.length !== SCRYPT_KEYLEN * 2) {
      return false;
    }
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Safe environment guards
// ---------------------------------------------------------------------------

export class SeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedSafetyError";
  }
}

export interface DatabaseIdentity {
  host: string;
  path: string;
}

/**
 * Return the database identity that is relevant to the seed safety check.
 * Credentials and query parameters are intentionally excluded. The returned
 * values are safe to compare and safe to use in tests, but are never logged.
 */
export function getDatabaseIdentity(rawUrl: string): DatabaseIdentity {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    if (!parsed.host) throw new Error("missing host");

    // A trailing slash does not identify a different PostgreSQL database.
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return { host: parsed.host.toLowerCase(), path };
  } catch {
    throw new SeedSafetyError("Database URLs must be valid PostgreSQL URLs.");
  }
}

export function sameDatabaseIgnoringCredentials(leftUrl: string, rightUrl: string): boolean {
  const left = getDatabaseIdentity(leftUrl);
  const right = getDatabaseIdentity(rightUrl);
  return left.host === right.host && left.path === right.path;
}

export interface SeedEnvironment {
  databaseUrl: string;
  betaDatabaseUrl: string;
  productionDatabaseUrl: string;
  reviewPassword: string;
}

/**
 * The script is intentionally stricter than a "production-looking URL"
 * heuristic:
 *   - all three database settings must be present;
 *   - DATABASE_URL must byte-for-byte equal BETA_DATABASE_URL; and
 *   - the target's host/path must differ from production even if credentials
 *     or query parameters differ.
 *
 * There is deliberately no force/bypass environment variable.
 */
export function validateSeedEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): SeedEnvironment {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new SeedSafetyError("DATABASE_URL is required.");
  }

  const betaDatabaseUrl = env.BETA_DATABASE_URL;
  if (!betaDatabaseUrl) {
    throw new SeedSafetyError("BETA_DATABASE_URL is required.");
  }

  const productionDatabaseUrl = env.PRODUCTION_DATABASE_URL;
  if (!productionDatabaseUrl) {
    throw new SeedSafetyError("PRODUCTION_DATABASE_URL is required.");
  }

  const reviewPassword = env.STAGING_REVIEW_PASSWORD;
  if (!reviewPassword) {
    throw new SeedSafetyError("STAGING_REVIEW_PASSWORD is required.");
  }

  if (databaseUrl !== betaDatabaseUrl) {
    throw new SeedSafetyError("DATABASE_URL must exactly match BETA_DATABASE_URL.");
  }

  if (sameDatabaseIgnoringCredentials(databaseUrl, productionDatabaseUrl)) {
    throw new SeedSafetyError("DATABASE_URL points at the production database.");
  }

  return {
    databaseUrl,
    betaDatabaseUrl,
    productionDatabaseUrl,
    reviewPassword,
  };
}

type WorkspaceDb = typeof import("@workspace/db");

async function loadWorkspaceDb(): Promise<WorkspaceDb> {
  // Loading this module only after the environment guard prevents an unsafe
  // target from even opening a database pool.
  return import("@workspace/db");
}

// ---------------------------------------------------------------------------
// Realistic seed data
// ---------------------------------------------------------------------------

type IntakeData = Record<string, unknown>;

interface SeedProject {
  id: string;
  name: string;
  owner: string;
  sector: string;
  website: string;
  intake: IntakeData;
}

const PROJECTS: SeedProject[] = [
  {
    id: `${STAGING_REVIEW_PREFIX}-proj-greenleaf`,
    name: "Greenleaf Sustainability",
    owner: `${STAGING_REVIEW_PREFIX}-agency`,
    sector: "Sustainability & ESG",
    website: "https://greenleaf-sustainability.invalid",
    intake: {
      "4.1": "Greenleaf Sustainability",
      "4.2": "Greenleaf",
      "4.3": "https://greenleaf-sustainability.invalid",
      "4.4": "Sustainability & ESG",
      "4.5": "Greenleaf Sustainability helps mid-market companies measure, report, and reduce their carbon footprint through a SaaS platform and expert advisory services.",
      "4.6": "Chief Sustainability Officers, ESG Directors, CFOs at companies with 250–5,000 employees",
      "4.7": ["carbon accounting", "ESG reporting", "scope 3 emissions", "sustainability software"],
      "4.8": "UK",
      "1.1": "Greenleaf Sustainability is the trusted partner for companies that want to move beyond compliance to genuine environmental leadership.",
      "1.2": ["We make ESG reporting simple and credible", "Our data is audit-ready from day one", "We help clients lead industry sustainability standards"],
      "1.3": "Sarah Chen, CEO",
      "1.4": "James Okafor, Head of Partnerships",
    },
  },
  {
    id: `${STAGING_REVIEW_PREFIX}-proj-finbridge`,
    name: "FinBridge Capital",
    owner: `${STAGING_REVIEW_PREFIX}-agency`,
    sector: "Financial Services",
    website: "https://finbridge-capital.invalid",
    intake: {
      "4.1": "FinBridge Capital",
      "4.2": "FinBridge",
      "4.3": "https://finbridge-capital.invalid",
      "4.4": "Financial Services",
      "4.5": "FinBridge Capital provides alternative lending and invoice finance solutions for UK SMEs that have been underserved by traditional banks.",
      "4.6": "SME founders and FDs seeking working capital, finance brokers, and accountants who advise SME clients",
      "4.7": ["invoice finance", "alternative lending", "SME finance", "working capital"],
      "4.8": "UK",
      "1.1": "FinBridge Capital turns unpaid invoices into immediate working capital so ambitious SMEs can grow without waiting for slow-paying customers.",
      "1.2": ["Fast decisions, funds within 24 hours", "No personal guarantees required", "Transparent flat-fee pricing"],
      "1.3": "Marcus Webb, Founder & CEO",
      "1.4": "Priya Sharma, Head of Marketing",
    },
  },
  {
    id: `${STAGING_REVIEW_PREFIX}-proj-healthnext`,
    name: "HealthNext Diagnostics",
    owner: `${STAGING_REVIEW_PREFIX}-client`,
    sector: "Healthcare & Life Sciences",
    website: "https://healthnext-diagnostics.invalid",
    intake: {
      "4.1": "HealthNext Diagnostics",
      "4.2": "HealthNext",
      "4.3": "https://healthnext-diagnostics.invalid",
      "4.4": "Healthcare & Life Sciences",
      "4.5": "HealthNext Diagnostics develops AI-assisted point-of-care diagnostic tools for GP surgeries and urgent care centres, reducing time-to-result from days to minutes.",
      "4.6": "NHS procurement teams, GP surgery partners, urgent care medical directors, and health technology investors",
      "4.7": ["point-of-care diagnostics", "AI diagnostics", "rapid testing", "health technology"],
      "4.8": "UK",
      "1.1": "HealthNext Diagnostics is bringing hospital-grade diagnostic accuracy to the front line of primary care — fast enough to change the same consultation.",
      "1.2": ["Clinically validated, UKCA-marked devices", "Results in under 10 minutes at point of care", "Seamlessly integrates with EMIS and SystmOne"],
      "1.3": "Dr. Amara Osei, CEO & Co-founder",
      "1.4": "Tom Bradley, VP Commercial",
    },
  },
];

// ---------------------------------------------------------------------------
// Representative audit result shapes (minimal but structurally valid)
// ---------------------------------------------------------------------------

function makeSavedAudit(projectId: string, owner: string, companyName: string, sector: string) {
  const id = `${projectId}-audit-001`;
  const savedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week ago
  const result = {
    id,
    savedAt,
    companyName,
    sector,
    visibilityScore: 62,
    totalProbes: 10,
    mentionedCount: 6,
    probes: [
      {
        question: `Which companies offer ${sector} solutions in the UK?`,
        engine: "chatgpt",
        mentioned: true,
        competitors: ["CompetitorA", "CompetitorB", "CompetitorC"],
        response: `There are several leading providers in the ${sector} space including ${companyName} and others...`,
      },
      {
        question: `What are the best ${sector} tools for mid-market companies?`,
        engine: "claude",
        mentioned: true,
        competitors: ["CompetitorA", "CompetitorD"],
        response: `For mid-market companies looking at ${sector}, ${companyName} is frequently cited...`,
      },
      {
        question: `Who are the top ${sector} advisors in the UK?`,
        engine: "chatgpt",
        mentioned: false,
        competitors: ["CompetitorB", "CompetitorC", "CompetitorE"],
        response: `Leading ${sector} advisors include several established firms...`,
      },
    ],
    topCompetitors: [
      { name: "CompetitorA", count: 2 },
      { name: "CompetitorB", count: 2 },
      { name: "CompetitorC", count: 2 },
    ],
  };
  return { id, projectId, owner, savedAt, result };
}

function makeSavedDiagnostic(projectId: string, owner: string, website: string) {
  const id = `${projectId}-diag-001`;
  const savedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
  const result = {
    id,
    savedAt,
    url: website,
    geoScore: 71,
    sections: {
      llmsText: { score: 8, maxScore: 10, present: true, notes: "llms.txt found and well-structured" },
      robotsTxt: { score: 9, maxScore: 10, present: true, notes: "robots.txt allows AI crawlers" },
      structuredData: { score: 7, maxScore: 10, present: true, notes: "Schema.org markup detected" },
      metaTags: { score: 8, maxScore: 10, present: true, notes: "Title and description tags present" },
      canonicalUrls: { score: 6, maxScore: 10, present: true, notes: "Canonical tags partially implemented" },
      pageSpeed: { score: 7, maxScore: 10, present: true, notes: "Core Web Vitals pass on mobile" },
      accessibility: { score: 8, maxScore: 10, present: true, notes: "WCAG 2.1 AA largely met" },
      internalLinking: { score: 8, maxScore: 10, present: true, notes: "Good internal link structure" },
    },
    recommendations: [
      "Add an agents.md file for AI agent discoverability",
      "Implement FAQ schema markup on key landing pages",
      "Add canonical tags to all paginated content",
    ],
  };
  return { id, projectId, owner, savedAt, result };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface AccountRowShape {
  username: string;
  passwordHash: string;
  role: string;
  parent: string | null;
  maxSeats: number | null;
  email: string | null;
  website: string | null;
  status: string;
}

interface CompanyRowShape {
  id: string;
  slug: string;
  role: string;
  parentSlug: string | null;
  maxSeats: number | null;
  email: string | null;
  billingEmail: string | null;
  keyAccountHolderEmail: string | null;
  vatNumber: string | null;
  billingAddress: string | null;
  billingAddressVersion: number | null;
  website: string | null;
  displayName: string | null;
  freeAccess: boolean;
  status: string;
  setupComplete: boolean | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: string | null;
  billingFrequency: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  renewalReminderPeriodEnd: Date | null;
}

interface UserRowShape {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  googleId: string | null;
  microsoftId: string | null;
  sessionVersion: number;
  emailVerified: boolean | null;
}

interface MembershipRowShape {
  userId: string;
  companyId: string;
  companySlug: string;
  role: string;
  projectAccess: string | null;
  position: string | null;
}

function rejectCollision(): never {
  throw new SeedSafetyError(
    "A dedicated staging review row does not match the expected structure; no changes were made.",
  );
}

function accountMatches(
  row: AccountRowShape,
  account: ReviewAccount,
  password: string,
): boolean {
  return (
    row.username === account.username &&
    row.role === account.role &&
    row.parent === account.parent &&
    row.maxSeats === null &&
    row.email === account.email &&
    row.website === account.website &&
    row.status === "active" &&
    verifyPassword(password, row.passwordHash)
  );
}

function companyMatches(row: CompanyRowShape, account: ReviewAccount): boolean {
  return (
    row.slug === account.username &&
    row.role === account.role &&
    row.parentSlug === account.parent &&
    row.maxSeats === null &&
    row.email === account.email &&
    row.billingEmail === null &&
    row.keyAccountHolderEmail === null &&
    row.vatNumber === null &&
    row.billingAddress === null &&
    row.billingAddressVersion === null &&
    row.website === account.website &&
    row.displayName === null &&
    row.freeAccess === false &&
    row.status === "active" &&
    row.setupComplete === true &&
    row.stripeCustomerId === null &&
    row.stripeSubscriptionId === null &&
    row.plan === null &&
    row.billingFrequency === null &&
    row.subscriptionStatus === null &&
    row.currentPeriodEnd === null &&
    row.cancelAtPeriodEnd === false &&
    row.renewalReminderPeriodEnd === null
  );
}

function userMatches(
  row: UserRowShape,
  account: ReviewAccount,
  password: string,
): boolean {
  return (
    row.email === account.email &&
    row.name === account.name &&
    row.googleId === null &&
    row.microsoftId === null &&
    row.sessionVersion === 0 &&
    row.emailVerified === null &&
    verifyPassword(password, row.passwordHash)
  );
}

function membershipMatches(
  row: MembershipRowShape,
  userId: string,
  companyId: string,
  account: ReviewAccount,
): boolean {
  return (
    row.userId === userId &&
    row.companyId === companyId &&
    row.companySlug === account.username &&
    row.role === "owner" &&
    row.projectAccess === null &&
    row.position === null
  );
}

/**
 * Insert the four identity rows in one transaction. Every conflict is
 * re-read and checked before proceeding. In particular, an existing email
 * cannot be silently adopted, renamed, or given a new password.
 */
async function seedAccounts(workspace: WorkspaceDb, password: string): Promise<void> {
  await workspace.db.transaction(async (tx) => {
    for (const account of ACCOUNTS) {
      // 1. platform_accounts (legacy auth row)
      let [accountRow] = await tx
        .select()
        .from(workspace.platformAccountsTable)
        .where(eq(workspace.platformAccountsTable.username, account.username))
        .limit(1);

      if (!accountRow) {
        const passwordHash = hashPassword(password);
        [accountRow] = await tx
          .insert(workspace.platformAccountsTable)
          .values({
            username: account.username,
            passwordHash,
            role: account.role,
            parent: account.parent,
            maxSeats: null,
            email: account.email,
            website: account.website,
            status: "active",
          })
          .onConflictDoNothing({ target: workspace.platformAccountsTable.username })
          .returning();
      }

      if (!accountRow || !accountMatches(accountRow, account, password)) {
        rejectCollision();
      }

      // 2. platform_companies (workspace row)
      let [companyRow] = await tx
        .select()
        .from(workspace.platformCompaniesTable)
        .where(eq(workspace.platformCompaniesTable.slug, account.username))
        .limit(1);

      if (!companyRow) {
        [companyRow] = await tx
          .insert(workspace.platformCompaniesTable)
          .values({
            slug: account.username,
            role: account.role,
            parentSlug: account.parent,
            maxSeats: null,
            email: account.email,
            billingEmail: null,
            keyAccountHolderEmail: null,
            vatNumber: null,
            billingAddress: null,
            billingAddressVersion: null,
            website: account.website,
            displayName: null,
            freeAccess: false,
            status: "active",
            setupComplete: true,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            plan: null,
            billingFrequency: null,
            subscriptionStatus: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            renewalReminderPeriodEnd: null,
          })
          .onConflictDoNothing({ target: workspace.platformCompaniesTable.slug })
          .returning();
      }

      if (!companyRow || !companyMatches(companyRow, account)) {
        rejectCollision();
      }

      // 3. platform_users (human identity row)
      let [userRow] = await tx
        .select()
        .from(workspace.platformUsersTable)
        .where(eq(workspace.platformUsersTable.email, account.email))
        .limit(1);

      if (!userRow) {
        const passwordHash = hashPassword(password);
        [userRow] = await tx
          .insert(workspace.platformUsersTable)
          .values({
            email: account.email,
            name: account.name,
            passwordHash,
            googleId: null,
            microsoftId: null,
            sessionVersion: 0,
            emailVerified: null,
          })
          .onConflictDoNothing({ target: workspace.platformUsersTable.email })
          .returning();
      }

      if (!userRow || !userMatches(userRow, account, password)) {
        rejectCollision();
      }

      // A review identity is dedicated. Unexpected memberships would mean the
      // email was adopted by another workspace, so fail rather than attaching
      // the review company to it.
      const userMemberships = await tx
        .select()
        .from(workspace.platformMembershipsTable)
        .where(eq(workspace.platformMembershipsTable.userId, userRow.id));
      if (
        userMemberships.some(
          (membership) => membership.companyId !== companyRow.id,
        )
      ) {
        rejectCollision();
      }

      const companyMemberships = await tx
        .select()
        .from(workspace.platformMembershipsTable)
        .where(eq(workspace.platformMembershipsTable.companyId, companyRow.id));
      if (
        companyMemberships.some(
          (membership) => membership.userId !== userRow.id,
        )
      ) {
        rejectCollision();
      }

      // 4. platform_memberships (links user ↔ company)
      const existingMembership = userMemberships.find(
        (membership) => membership.companyId === companyRow.id,
      );
      if (existingMembership) {
        if (!membershipMatches(existingMembership, userRow.id, companyRow.id, account)) {
          rejectCollision();
        }
        continue;
      }

      await tx
        .insert(workspace.platformMembershipsTable)
        .values({
          userId: userRow.id,
          companyId: companyRow.id,
          companySlug: account.username,
          role: "owner",
          projectAccess: null,
          position: null,
        })
        .onConflictDoNothing();
    }
  });
}

async function seedProjects(workspace: WorkspaceDb): Promise<void> {
  console.log("[seed-staging] Seeding projects...");
  for (const project of PROJECTS) {
    const data = {
      id: project.id,
      name: project.name,
      sector: project.sector,
      website: project.website,
      colour: "#4f46e5",
      owner: project.owner,
    };

    const inserted = await workspace.db
      .insert(workspace.projectsTable)
      .values({
        id: project.id,
        name: project.name,
        owner: project.owner,
        data,
        intake: project.intake,
      })
      .onConflictDoNothing({ target: workspace.projectsTable.id })
      .returning({ id: workspace.projectsTable.id });

    if (inserted.length > 0) {
      console.log(`  ✅ Created project: ${project.name} (owner: ${project.owner})`);
    } else {
      console.log(`  ⏭  Project already exists: ${project.name}`);
    }
  }
}

async function seedAudits(workspace: WorkspaceDb): Promise<void> {
  console.log("[seed-staging] Seeding audit records...");
  for (const project of PROJECTS) {
    const audit = makeSavedAudit(project.id, project.owner, project.name, project.sector);
    const insertedAudit = await workspace.db
      .insert(workspace.savedAuditsTable)
      .values({
        id: audit.id,
        projectId: audit.projectId,
        owner: audit.owner,
        savedAt: audit.savedAt,
        result: audit.result,
      })
      .onConflictDoNothing({ target: workspace.savedAuditsTable.id })
      .returning({ id: workspace.savedAuditsTable.id });

    if (insertedAudit.length > 0) {
      console.log(`  ✅ Created audit record for: ${project.name}`);
    } else {
      console.log(`  ⏭  Audit record already exists for: ${project.name}`);
    }

    const diag = makeSavedDiagnostic(project.id, project.owner, project.website);
    const insertedDiag = await workspace.db
      .insert(workspace.savedDiagnosticsTable)
      .values({
        id: diag.id,
        projectId: diag.projectId,
        owner: diag.owner,
        savedAt: diag.savedAt,
        result: diag.result,
      })
      .onConflictDoNothing({ target: workspace.savedDiagnosticsTable.id })
      .returning({ id: workspace.savedDiagnosticsTable.id });

    if (insertedDiag.length > 0) {
      console.log(`  ✅ Created diagnostic record for: ${project.name}`);
    } else {
      console.log(`  ⏭  Diagnostic record already exists for: ${project.name}`);
    }
  }
}

export function shouldSeedRepresentativeData(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const setting = env.STAGING_REVIEW_INCLUDE_DATA?.trim().toLowerCase();
  return setting !== "0" && setting !== "false";
}

async function printSummary(includeRepresentativeData: boolean): Promise<void> {
  console.log("\n[seed-staging] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[seed-staging] Staging review access is ready:");
  console.log("[seed-staging]");
  for (const account of ACCOUNTS) {
    console.log(`[seed-staging]   ${account.role.padEnd(8)} account ready (login details in staging review configuration)`);
    console.log("[seed-staging]            password: supplied via STAGING_REVIEW_PASSWORD");
  }
  if (includeRepresentativeData) {
    console.log("[seed-staging]");
    console.log("[seed-staging] Projects seeded:");
    for (const project of PROJECTS) {
      console.log(`[seed-staging]   • ${project.name} (${project.sector}) — owner: ${project.owner}`);
    }
  }
  console.log("[seed-staging] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

async function main(): Promise<void> {
  const environment = validateSeedEnvironment();
  const workspace = await loadWorkspaceDb();
  const includeRepresentativeData = shouldSeedRepresentativeData();

  console.log("[seed-staging] Starting staging seed...\n");

  await seedAccounts(workspace, environment.reviewPassword);
  console.log();
  if (includeRepresentativeData) {
    await seedProjects(workspace);
    console.log();
    await seedAudits(workspace);
  } else {
    console.log("[seed-staging] Representative project data disabled.");
  }

  await printSummary(includeRepresentativeData);
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof SeedSafetyError
        ? error.message
        : "Database operation failed; no internal details are available.";
    console.error(`[seed-staging] Seed failed safely: ${message}`);
    process.exitCode = 1;
  });
}
