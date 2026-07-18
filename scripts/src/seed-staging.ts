/**
 * Staging seed script for AIO Fusion.
 *
 * Creates representative accounts, projects, and audit records so testers
 * always start from a known, realistic state instead of an empty database.
 *
 * Safe to re-run — every insert uses ON CONFLICT DO NOTHING so existing rows
 * are left untouched. Run against a staging DATABASE_URL only; never against
 * production.
 *
 * Usage:
 *   DATABASE_URL=<staging-url> pnpm --filter @workspace/scripts run seed-staging
 *
 * Or, if DATABASE_URL is already in the environment:
 *   pnpm --filter @workspace/scripts run seed-staging
 */

import crypto from "node:crypto";
import {
  db,
  platformAccountsTable,
  platformCompaniesTable,
  platformUsersTable,
  platformMembershipsTable,
  projectsTable,
  savedAuditsTable,
  savedDiagnosticsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SEED_PREFIX = "seed-staging";

const ACCOUNTS = [
  {
    username: `${SEED_PREFIX}-agency`,
    password: "Staging-Agency-2026!",
    role: "agency" as const,
    parent: null,
    email: `agency@${SEED_PREFIX}.invalid`,
    website: "https://example-agency.invalid",
  },
  {
    username: `${SEED_PREFIX}-client`,
    password: "Staging-Client-2026!",
    role: "client" as const,
    parent: `${SEED_PREFIX}-agency`,
    email: `client@${SEED_PREFIX}.invalid`,
    website: "https://example-client.invalid",
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
    id: `${SEED_PREFIX}-proj-greenleaf`,
    name: "Greenleaf Sustainability",
    owner: `${SEED_PREFIX}-agency`,
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
    id: `${SEED_PREFIX}-proj-finbridge`,
    name: "FinBridge Capital",
    owner: `${SEED_PREFIX}-agency`,
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
    id: `${SEED_PREFIX}-proj-healthnext`,
    name: "HealthNext Diagnostics",
    owner: `${SEED_PREFIX}-client`,
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

async function requireDatabaseUrl(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[seed-staging] ❌ DATABASE_URL is not set.\n" +
        "  Set it to your staging database URL before running this script.\n" +
        "  Never point this at the production database.",
    );
    process.exit(1);
  }
}

async function seedAccounts(): Promise<void> {
  console.log("[seed-staging] Seeding accounts...");
  for (const account of ACCOUNTS) {
    const passwordHash = hashPassword(account.password);

    // 1. platform_accounts (legacy auth row)
    const inserted = await db
      .insert(platformAccountsTable)
      .values({
        username: account.username,
        passwordHash,
        role: account.role,
        parent: account.parent ?? undefined,
        email: account.email,
        website: account.website,
        status: "active",
      })
      .onConflictDoNothing({ target: platformAccountsTable.username })
      .returning({ username: platformAccountsTable.username });

    if (inserted.length > 0) {
      console.log(`  ✅ Created account: ${account.username} (${account.role})`);
    } else {
      console.log(`  ⏭  Account already exists: ${account.username}`);
    }

    // 2. platform_companies (workspace row — idempotent upsert)
    const [company] = await db
      .insert(platformCompaniesTable)
      .values({
        slug: account.username,
        role: account.role,
        parentSlug: account.parent,
        email: account.email,
        website: account.website,
        status: "active",
      })
      .onConflictDoUpdate({
        target: platformCompaniesTable.slug,
        set: { role: account.role, status: "active" },
      })
      .returning({ id: platformCompaniesTable.id });

    const companyId = company!.id;

    // 3. platform_users (human identity row)
    const [user] = await db
      .insert(platformUsersTable)
      .values({
        email: account.email,
        name: `Staging ${account.role.charAt(0).toUpperCase() + account.role.slice(1)} User`,
        passwordHash,
      })
      .onConflictDoUpdate({
        target: platformUsersTable.email,
        set: { name: `Staging ${account.role.charAt(0).toUpperCase() + account.role.slice(1)} User` },
      })
      .returning({ id: platformUsersTable.id });

    const userId = user!.id;

    // 4. platform_memberships (links user ↔ company)
    await db
      .insert(platformMembershipsTable)
      .values({
        userId,
        companyId,
        companySlug: account.username,
        role: "owner",
      })
      .onConflictDoNothing();
  }
}

async function seedProjects(): Promise<void> {
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

    const inserted = await db
      .insert(projectsTable)
      .values({
        id: project.id,
        name: project.name,
        owner: project.owner,
        data,
        intake: project.intake,
      })
      .onConflictDoNothing({ target: projectsTable.id })
      .returning({ id: projectsTable.id });

    if (inserted.length > 0) {
      console.log(`  ✅ Created project: ${project.name} (owner: ${project.owner})`);
    } else {
      console.log(`  ⏭  Project already exists: ${project.name}`);
    }
  }
}

async function seedAudits(): Promise<void> {
  console.log("[seed-staging] Seeding audit records...");
  for (const project of PROJECTS) {
    const audit = makeSavedAudit(project.id, project.owner, project.name, project.sector);
    const insertedAudit = await db
      .insert(savedAuditsTable)
      .values({
        id: audit.id,
        projectId: audit.projectId,
        owner: audit.owner,
        savedAt: audit.savedAt,
        result: audit.result,
      })
      .onConflictDoNothing({ target: savedAuditsTable.id })
      .returning({ id: savedAuditsTable.id });

    if (insertedAudit.length > 0) {
      console.log(`  ✅ Created audit record for: ${project.name}`);
    } else {
      console.log(`  ⏭  Audit record already exists for: ${project.name}`);
    }

    const diag = makeSavedDiagnostic(project.id, project.owner, project.website);
    const insertedDiag = await db
      .insert(savedDiagnosticsTable)
      .values({
        id: diag.id,
        projectId: diag.projectId,
        owner: diag.owner,
        savedAt: diag.savedAt,
        result: diag.result,
      })
      .onConflictDoNothing({ target: savedDiagnosticsTable.id })
      .returning({ id: savedDiagnosticsTable.id });

    if (insertedDiag.length > 0) {
      console.log(`  ✅ Created diagnostic record for: ${project.name}`);
    } else {
      console.log(`  ⏭  Diagnostic record already exists for: ${project.name}`);
    }
  }
}

async function printSummary(): Promise<void> {
  console.log("\n[seed-staging] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[seed-staging] Staging seed complete. Test credentials:");
  console.log("[seed-staging]");
  for (const account of ACCOUNTS) {
    console.log(`[seed-staging]   ${account.role.padEnd(8)} login: ${account.username}`);
    console.log(`[seed-staging]            password: ${account.password}`);
  }
  console.log("[seed-staging]");
  console.log("[seed-staging] Projects seeded:");
  for (const project of PROJECTS) {
    console.log(`[seed-staging]   • ${project.name} (${project.sector}) — owner: ${project.owner}`);
  }
  console.log("[seed-staging] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

async function main(): Promise<void> {
  await requireDatabaseUrl();

  const url = process.env.DATABASE_URL!;
  // Safety guard: refuse to run if the URL contains obvious production markers.
  // This is a best-effort check — not a security boundary. Staging and production
  // should use separate Replit Deployments with completely different DATABASE_URL values.
  if (url.includes("aio-fusion") && !url.includes("staging") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    console.warn(
      "[seed-staging] ⚠️  DATABASE_URL does not look like a staging URL.\n" +
        "  This script is intended for staging only. Set SEED_STAGING_FORCE=1 to bypass this check.",
    );
    if (!process.env.SEED_STAGING_FORCE) {
      process.exit(1);
    }
    console.warn("[seed-staging] SEED_STAGING_FORCE=1 set — proceeding.");
  }

  console.log("[seed-staging] Starting staging seed...\n");

  await seedAccounts();
  console.log();
  await seedProjects();
  console.log();
  await seedAudits();

  await printSummary();
}

main().catch((err) => {
  console.error("[seed-staging] ❌ Seed failed:", err?.stack || err);
  process.exit(1);
});
