/**
 * An offline compiler for a deliberately small, explicitly selected mapping.
 *
 * This is a draft compiler, not an importer.  In particular, a target login
 * in a decision is an opaque, reviewed mapping; it is never an instruction to
 * merge users, copy credentials, or discover an email address.
 */
import { createHash } from "node:crypto";

export interface MappingAccount {
  username: string;
  role: string;
  parent: string | null;
}
export interface MappingCompany { id: string; slug: string; }
export interface MappingProject { id: string; name: string; owner: string; }
export interface MappingUser { id: string; }

export interface WorkspaceDecision {
  sourceUsername: string; action: "reuse" | "new" | "reconstruct"; targetUsername: string;
  /** Reuse requires this exact source company ID; new/reconstruct require candidateSlug===targetUsername. */
  sourceCompanyId?: string; targetCompanyId?: string; targetCompanySlug?: string; candidateSlug?: string;
  sourceRole: string; sourceParent: string | null; targetRole: string; targetParent: string | null;
  targetHumanId?: string; retainExistingGoogle?: boolean; noCopySourcePassword?: boolean | null;
  preserveExistingMembers: boolean; preserveExistingSettings: boolean; preserveExistingCredentials: boolean;
}

export interface SelectiveMappingDraftInput {
  source: { accounts: readonly MappingAccount[]; companies: readonly MappingCompany[];
    projects: readonly MappingProject[]; physicalDatabaseSha256: string; };
  target: { accounts: readonly MappingAccount[]; companies: readonly MappingCompany[];
    users?: readonly MappingUser[]; physicalDatabaseSha256: string; };
  selectedProjectIds: readonly string[];
  /** Workspaces protected even when they own no selected project. */
  protectedAccountUsernames: readonly string[];
  excludedProjectIds: readonly string[];
  excludedLogins: readonly string[];
  workspaceDecisions: readonly WorkspaceDecision[];
}

export type MappingDraftBlockerCode =
  | "INVALID_RUNTIME_INPUT" | "INVALID_SHA256" | "SAME_DATABASE_DIGEST" | "EMPTY_SELECTION"
  | "SELECTED_PROJECT_MISSING" | "SELECTED_PROJECT_EXCLUDED" | "EXCLUDED_PARENT" | "EXCLUDED_LOGIN"
  | "DUPLICATE_PROJECT_ID" | "DUPLICATE_ACCOUNT_IDENTITY" | "INVALID_ACCOUNT" | "INVALID_COMPANY"
  | "INVALID_PROJECT" | "MISSING_ACCOUNT_PARENT" | "ACCOUNT_HIERARCHY_CYCLE" | "MISSING_WORKSPACE_DECISION"
  | "DUPLICATE_WORKSPACE_DECISION" | "DECISION_SOURCE_MISMATCH" | "DECISION_TARGET_MISSING"
  | "DECISION_HIERARCHY_MISMATCH" | "TARGET_WORKSPACE_MISSING" | "TARGET_WORKSPACE_COLLISION"
  | "NEW_WORKSPACE_NOT_AGENCY" | "NEW_WORKSPACE_SLUG_REQUIRED" | "RECONSTRUCTION_POLICY_REQUIRED"
  | "RECONSTRUCTION_HUMAN_REQUIRED" | "TARGET_HUMAN_NOT_FOUND" | "PRESERVE_EXISTING_REQUIRED"
  | "DUPLICATE_INVENTORY_IDENTITY" | "PROTECTED_ACCOUNT_MISSING" | "DECISION_OUTSIDE_SCOPE"
  | "SOURCE_COMPANY_MAPPING_MISSING" | "SOURCE_COMPANY_MAPPING_MISMATCH"
  | "RECONSTRUCTION_SOURCE_COMPANY_PRESENT" | "NEW_PASSWORD_POLICY_UNSAFE"
  | "DUPLICATE_TARGET_CANDIDATE" | "UNSUPPORTED_ACTION" | "PROJECT_OWNER_MAPPING_MISSING";

export interface MappingDraftBlocker {
  code: MappingDraftBlockerCode;
  sourceUsername?: string;
  projectId?: string;
}

export interface CandidateWorkspace {
  sourceUsername: string; action: WorkspaceDecision["action"]; companyId: string; slug: string; targetUsername: string;
  sourceCompanyId?: string;
  sourceRole: string; sourceParent: string | null; targetRole: string; targetParent: string | null;
  /** Deliberately explicit: this draft does not merge users. */
  userMerge: false;
  preserveExisting: { members: boolean; settings: boolean; credentials: boolean; googleIdentity?: boolean; };
  preserveExistingMembers: boolean; preserveExistingSettings: boolean; preserveExistingCredentials: boolean;
  preserveExistingGoogle?: boolean; noCopySourcePassword: boolean | null;
  credentialPolicy?: "not-reviewed"; targetHumanId?: string;
  membershipInsertApproved: false;
}

export interface CandidateProjectMapping {
  sourceProjectId: string;
  name: string;
  sourceOwner: string;
  targetWorkspaceId: string;
  targetOwner: string;
  preserveExisting: false;
}

export interface SelectiveMappingDraft {
  draft: true;
  applyAllowed: false;
  exactMappingApproved: false;
  blockers: readonly MappingDraftBlocker[];
  candidateWorkspaces: readonly CandidateWorkspace[];
  projectMappings: readonly CandidateProjectMapping[];
}

const HASH = /^[a-f0-9]{64}$/i;
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const key = (v: string): string => v.trim().toLocaleLowerCase();

function uuidFrom(sourceDigest: string, targetDigest: string, identity: string): string {
  const bytes = createHash("sha256").update(`${sourceDigest.toLowerCase()}\0${targetDigest.toLowerCase()}\0${identity}`).digest("hex");
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-5${bytes.slice(13, 16)}-${(parseInt(bytes.slice(16, 18), 16) & 0x3f | 0x80).toString(16).padStart(2, "0")}${bytes.slice(18, 20)}-${bytes.slice(20, 32)}`;
}

function emptyDraft(blockers: MappingDraftBlocker[] = []): SelectiveMappingDraft {
  return { draft: true, applyAllowed: false, exactMappingApproved: false, blockers,
    candidateWorkspaces: [], projectMappings: [] };
}

function add(set: Map<string, MappingDraftBlocker>, code: MappingDraftBlockerCode, extra: Partial<MappingDraftBlocker> = {}) {
  const id = `${code}:${extra.sourceUsername ?? ""}:${extra.projectId ?? ""}`;
  if (!set.has(id)) set.set(id, { code, ...extra });
}

function inventory(
  accounts: unknown, companies: unknown, projects: unknown, side: "source" | "target",
  blockers: Map<string, MappingDraftBlocker>,
) {
  if (!Array.isArray(accounts) || !Array.isArray(companies)) {
    add(blockers, "INVALID_RUNTIME_INPUT"); return null;
  }
  const accountMap = new Map<string, MappingAccount>();
  for (const raw of accounts) {
    if (!record(raw) || !text(raw.username) || !text(raw.role) ||
        !(raw.parent === null || text(raw.parent))) {
      add(blockers, "INVALID_ACCOUNT"); continue;
    }
    const account = { username: raw.username.trim(), role: raw.role.trim(), parent: raw.parent === null ? null : raw.parent.trim() };
    const k = key(account.username);
    if (accountMap.has(k)) add(blockers, "DUPLICATE_ACCOUNT_IDENTITY", { sourceUsername: account.username });
    else accountMap.set(k, account);
  }
  const companyMap = new Map<string, MappingCompany>();
  const companyIds = new Set<string>();
  for (const raw of companies) {
    if (!record(raw) || !text(raw.id) || !text(raw.slug)) { add(blockers, "INVALID_COMPANY"); continue; }
    const company = { id: raw.id.trim(), slug: raw.slug.trim() };
    if (companyIds.has(company.id) || companyMap.has(key(company.slug))) add(blockers, "TARGET_WORKSPACE_COLLISION");
    companyIds.add(company.id); companyMap.set(key(company.slug), company);
  }
  const projectMap = new Map<string, MappingProject>();
  if (projects !== undefined && !Array.isArray(projects)) { add(blockers, "INVALID_RUNTIME_INPUT"); return null; }
  for (const raw of (Array.isArray(projects) ? projects : [])) {
    if (!record(raw) || !text(raw.id) || !text(raw.name) || !text(raw.owner)) { add(blockers, "INVALID_PROJECT"); continue; }
    const project = { id: raw.id.trim(), name: raw.name, owner: raw.owner.trim() };
    if (projectMap.has(project.id)) add(blockers, "DUPLICATE_PROJECT_ID", { projectId: project.id });
    else projectMap.set(project.id, project);
  }
  for (const account of accountMap.values()) {
    if (account.parent !== null && !accountMap.has(key(account.parent))) add(blockers, "MISSING_ACCOUNT_PARENT", { sourceUsername: account.username });
  }
  for (const account of accountMap.values()) {
    const seen = new Set<string>(); let cursor: string | null = account.username;
    while (cursor !== null) {
      const k = key(cursor);
      if (seen.has(k)) { add(blockers, "ACCOUNT_HIERARCHY_CYCLE", { sourceUsername: account.username }); break; }
      seen.add(k); cursor = accountMap.get(k)?.parent ?? null;
    }
  }
  return { accountMap, companyMap, projectMap, side };
}

function compile(input: unknown): SelectiveMappingDraft {
  if (!record(input) || !record(input.source) || !record(input.target)) return emptyDraft([{ code: "INVALID_RUNTIME_INPUT" }]);
  const blockers = new Map<string, MappingDraftBlocker>();
  const sourceDigest = input.source.physicalDatabaseSha256;
  const targetDigest = input.target.physicalDatabaseSha256;
  if (!text(sourceDigest) || !HASH.test(sourceDigest) || !text(targetDigest) || !HASH.test(targetDigest)) add(blockers, "INVALID_SHA256");
  else if (sourceDigest.toLowerCase() === targetDigest.toLowerCase()) add(blockers, "SAME_DATABASE_DIGEST");
  const s = inventory(input.source.accounts, input.source.companies, input.source.projects, "source", blockers);
  const t = inventory(input.target.accounts, input.target.companies, undefined, "target", blockers);
  const selected = input.selectedProjectIds;
  const protectedNames = input.protectedAccountUsernames;
  const excludedProjects = input.excludedProjectIds;
  const excludedLogins = input.excludedLogins;
  const decisions = input.workspaceDecisions;
  if (!Array.isArray(selected) || selected.length === 0) add(blockers, "EMPTY_SELECTION");
  if (!Array.isArray(protectedNames) || !Array.isArray(excludedProjects) || !Array.isArray(excludedLogins) || !Array.isArray(decisions)) add(blockers, "INVALID_RUNTIME_INPUT");
  if (!s || !t || !Array.isArray(selected) || !Array.isArray(protectedNames) || !Array.isArray(excludedProjects) || !Array.isArray(excludedLogins) || !Array.isArray(decisions)) {
    return emptyDraft([...blockers.values()].sort((a, b) => a.code.localeCompare(b.code)));
  }
  const targetUsers = input.target.users;
  const targetUserIds = new Set<string>();
  if (targetUsers !== undefined) {
    if (!Array.isArray(targetUsers)) add(blockers, "INVALID_RUNTIME_INPUT");
    else for (const user of targetUsers) {
      if (!record(user) || !text(user.id)) add(blockers, "INVALID_RUNTIME_INPUT");
      else if (targetUserIds.has(user.id.trim())) add(blockers, "DUPLICATE_INVENTORY_IDENTITY");
      else targetUserIds.add(user.id.trim());
    }
  }
  const excludedP = new Set(excludedProjects.filter(text).map((v) => v.trim()));
  const excludedL = new Set(excludedLogins.filter(text).map(key));
  const selectedRecords: MappingProject[] = [];
  const selectedSet = new Set<string>();
  for (const id of selected) {
    if (!text(id)) {
      add(blockers, "INVALID_RUNTIME_INPUT", { projectId: String(id) }); continue;
    }
    if (selectedSet.has(id) || excludedP.has(id)) {
      add(blockers, excludedP.has(id) ? "SELECTED_PROJECT_EXCLUDED" : "DUPLICATE_PROJECT_ID", { projectId: String(id) }); continue;
    }
    selectedSet.add(id);
    const project = s.projectMap.get(id);
    if (!project) { add(blockers, "SELECTED_PROJECT_MISSING", { projectId: id }); continue; }
    selectedRecords.push(project);
    if (excludedL.has(key(project.owner))) add(blockers, "EXCLUDED_LOGIN", { sourceUsername: project.owner, projectId: id });
  }
  for (const id of excludedProjects) if (!text(id)) add(blockers, "INVALID_RUNTIME_INPUT");
  for (const login of excludedLogins) if (!text(login)) add(blockers, "INVALID_RUNTIME_INPUT");
  // A selected child or protected workspace does not make an unselected
  // parent optional. Every source parent row needs its own decision.
  const neededOwners = new Set<string>();
  for (const project of selectedRecords) {
    let cursor: string | null = project.owner;
    while (cursor !== null) {
      const normalized = key(cursor);
      if (neededOwners.has(normalized)) break;
      neededOwners.add(normalized);
      const account = s.accountMap.get(normalized);
      cursor = account?.parent ?? null;
      if (cursor !== null && excludedL.has(key(cursor))) {
        add(blockers, "EXCLUDED_PARENT", { sourceUsername: cursor, projectId: project.id });
        break;
      }
    }
  }
  for (const rawName of protectedNames) {
    if (!text(rawName)) { add(blockers, "INVALID_RUNTIME_INPUT"); continue; }
    const source = s.accountMap.get(key(rawName));
    if (!source) { add(blockers, "PROTECTED_ACCOUNT_MISSING", { sourceUsername: rawName }); continue; }
    let cursor: string | null = source.username;
    while (cursor !== null) {
      const normalized = key(cursor);
      if (neededOwners.has(normalized)) break;
      neededOwners.add(normalized);
      cursor = s.accountMap.get(normalized)?.parent ?? null;
      if (cursor !== null && excludedL.has(key(cursor))) {
        add(blockers, "EXCLUDED_PARENT", { sourceUsername: cursor });
        break;
      }
    }
  }
  const decisionMap = new Map<string, WorkspaceDecision>();
  for (const raw of decisions) {
    if (!record(raw) || !text(raw.sourceUsername)) { add(blockers, "INVALID_RUNTIME_INPUT"); continue; }
    const d = raw as unknown as WorkspaceDecision; const k = key(d.sourceUsername);
    if (decisionMap.has(k)) add(blockers, "DUPLICATE_WORKSPACE_DECISION", { sourceUsername: d.sourceUsername });
    else decisionMap.set(k, d);
    if (!s.accountMap.has(k)) add(blockers, "DECISION_SOURCE_MISMATCH", { sourceUsername: d.sourceUsername });
    else if (!neededOwners.has(k)) add(blockers, "DECISION_OUTSIDE_SCOPE", { sourceUsername: d.sourceUsername });
  }
  const candidates: CandidateWorkspace[] = [];
  const mapped = new Map<string, CandidateWorkspace>();
  const candidateAccounts = new Map<string, string>();
  const candidateCompanies = new Map<string, string>();
  for (const owner of neededOwners) {
    const source = s.accountMap.get(owner); const d = decisionMap.get(owner);
    if (!source || !d) { add(blockers, "MISSING_WORKSPACE_DECISION", { sourceUsername: owner }); continue; }
    if (!["reuse", "new", "reconstruct"].includes(d.action)) { add(blockers, "UNSUPPORTED_ACTION", { sourceUsername: owner }); continue; }
    if (d.sourceRole !== source.role || d.sourceParent !== source.parent || d.targetRole !== source.role) add(blockers, "DECISION_SOURCE_MISMATCH", { sourceUsername: owner });
    if (excludedL.has(owner)) add(blockers, "EXCLUDED_LOGIN", { sourceUsername: owner });
    if (source.parent !== null && excludedL.has(key(source.parent))) add(blockers, "EXCLUDED_PARENT", { sourceUsername: owner });
    if (source.parent === null && d.targetParent !== null) add(blockers, "DECISION_HIERARCHY_MISMATCH", { sourceUsername: owner });
    const target = text(d.targetUsername) ? t.accountMap.get(key(d.targetUsername)) : undefined;
    let companyId = "", slug = "";
    if (d.action === "new") {
      const sourceCompany = s.companyMap.get(key(source.username));
      if (!sourceCompany || d.sourceCompanyId !== sourceCompany.id) {
        add(blockers, "SOURCE_COMPANY_MAPPING_MISMATCH", { sourceUsername: owner });
      }
    }
    if (d.action === "reuse") {
      const sourceCompany = text(d.sourceCompanyId) ? [...s.companyMap.values()].find((c) => c.id === d.sourceCompanyId) : undefined;
      if (!sourceCompany || sourceCompany.slug !== source.username) add(blockers, "SOURCE_COMPANY_MAPPING_MISMATCH", { sourceUsername: owner });
      const company = text(d.targetCompanyId) ? [...t.companyMap.values()].find((c) => c.id === d.targetCompanyId) : undefined;
      const bySlug = text(d.targetCompanySlug) ? t.companyMap.get(key(d.targetCompanySlug)) : undefined;
      if (!company || !bySlug || company.id !== bySlug.id || bySlug.slug !== d.targetUsername) add(blockers, "TARGET_WORKSPACE_MISSING", { sourceUsername: owner });
      else { companyId = company.id; slug = company.slug; }
      if (!target) add(blockers, "DECISION_TARGET_MISSING", { sourceUsername: owner });
      else if (d.targetRole !== target.role || d.targetParent !== target.parent) add(blockers, "DECISION_HIERARCHY_MISMATCH", { sourceUsername: owner });
    } else {
      if (key(source.role) !== "agency") add(blockers, "NEW_WORKSPACE_NOT_AGENCY", { sourceUsername: owner });
      if (!text(d.candidateSlug) || d.targetUsername !== d.candidateSlug) add(blockers, "NEW_WORKSPACE_SLUG_REQUIRED", { sourceUsername: owner });
      else {
        slug = d.candidateSlug.trim(); companyId = uuidFrom(String(sourceDigest), String(targetDigest), source.username);
        if (target || t.companyMap.has(key(slug)) || [...t.companyMap.values()].some((c) => c.id === companyId)) add(blockers, "TARGET_WORKSPACE_COLLISION", { sourceUsername: owner });
      }
    }
    if (d.action === "reconstruct") {
      if (s.companyMap.has(key(source.username))) add(blockers, "RECONSTRUCTION_SOURCE_COMPANY_PRESENT", { sourceUsername: owner });
      if (!text(d.targetHumanId)) add(blockers, "RECONSTRUCTION_HUMAN_REQUIRED", { sourceUsername: owner });
      if (d.retainExistingGoogle !== true || d.noCopySourcePassword !== true) add(blockers, "RECONSTRUCTION_POLICY_REQUIRED", { sourceUsername: owner });
      if (text(d.targetHumanId) && (!Array.isArray(targetUsers) || !targetUserIds.has(d.targetHumanId.trim()))) {
        add(blockers, "TARGET_HUMAN_NOT_FOUND", { sourceUsername: owner });
      }
    }
    if (d.preserveExistingMembers !== true || d.preserveExistingSettings !== true || d.preserveExistingCredentials !== true) {
      add(blockers, "PRESERVE_EXISTING_REQUIRED", { sourceUsername: owner });
    }
    if (d.action === "new" && d.noCopySourcePassword === false) add(blockers, "NEW_PASSWORD_POLICY_UNSAFE", { sourceUsername: owner });
    if (companyId && slug && text(d.targetUsername)) {
      const accountKey = key(d.targetUsername), companyKey = key(slug);
      if (candidateAccounts.has(accountKey) || candidateCompanies.has(companyKey) || candidateCompanies.has(companyId)) {
        add(blockers, "DUPLICATE_TARGET_CANDIDATE", { sourceUsername: owner });
      }
      candidateAccounts.set(accountKey, source.username);
      candidateCompanies.set(companyKey, source.username);
      candidateCompanies.set(companyId, source.username);
      const candidate: CandidateWorkspace = {
        sourceUsername: source.username, action: d.action, companyId, slug,
        ...(text(d.sourceCompanyId) ? { sourceCompanyId: d.sourceCompanyId } : {}),
        targetUsername: d.targetUsername, sourceRole: source.role, sourceParent: source.parent,
        targetRole: d.targetRole, targetParent: d.targetParent, userMerge: false,
        preserveExisting: { members: d.preserveExistingMembers === true, settings: d.preserveExistingSettings === true,
          credentials: d.preserveExistingCredentials === true, ...(d.retainExistingGoogle === true ? { googleIdentity: true } : {}) },
        preserveExistingMembers: d.preserveExistingMembers === true,
        preserveExistingSettings: d.preserveExistingSettings === true,
        preserveExistingCredentials: d.preserveExistingCredentials === true,
        ...(d.retainExistingGoogle === true ? { preserveExistingGoogle: true } : {}),
        noCopySourcePassword: d.action === "new" ? (d.noCopySourcePassword === true ? true : null) : true,
        ...(d.action === "new" ? { credentialPolicy: "not-reviewed" as const } : {}),
        membershipInsertApproved: false,
        ...(text(d.targetHumanId) ? { targetHumanId: d.targetHumanId } : {}),
      };
      candidates.push(candidate); mapped.set(owner, candidate);
    }
  }
  // Parent identity is part of the exact mapping, not merely a matching role.
  for (const owner of neededOwners) {
    const source = s.accountMap.get(owner);
    const d = decisionMap.get(owner);
    if (!source || !d || source.parent === null) continue;
    const parentDecision = decisionMap.get(key(source.parent));
    if (!parentDecision || d.targetParent !== parentDecision.targetUsername) {
      add(blockers, "DECISION_HIERARCHY_MISMATCH", { sourceUsername: source.username });
    }
  }
  const projectMappings: CandidateProjectMapping[] = [];
  for (const project of selectedRecords) {
    const workspace = mapped.get(key(project.owner));
    if (!workspace) { add(blockers, "PROJECT_OWNER_MAPPING_MISSING", { projectId: project.id }); continue; }
    projectMappings.push({ sourceProjectId: project.id, name: project.name, sourceOwner: project.owner,
      targetWorkspaceId: workspace.companyId, targetOwner: workspace.targetUsername, preserveExisting: false });
  }
  const result = { ...emptyDraft([...blockers.values()].sort((a, b) => a.code.localeCompare(b.code))),
    candidateWorkspaces: candidates, projectMappings };
  return result;
}

export function compileSelectiveMappingDraft(input: SelectiveMappingDraftInput): SelectiveMappingDraft {
  try { return compile(input); } catch { return emptyDraft([{ code: "INVALID_RUNTIME_INPUT" }]); }
}
export const compileWorkspaceProjectMappingDraft = compileSelectiveMappingDraft;
export const compileMappingDraft = compileSelectiveMappingDraft;