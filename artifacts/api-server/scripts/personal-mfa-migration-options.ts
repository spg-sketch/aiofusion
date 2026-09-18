export interface MigrationOptions {
  environment: "development" | "staging" | "production";
  workspace: string;
  apply: boolean;
  action?: "move" | "recovery";
  fingerprint?: string;
  operatorUserId?: string;
  targetUserId?: string;
  targetEmail?: string;
  approvalReference?: string;
}

/** Parse before importing the database. Unknown flags fail rather than hiding a
 * typo that could turn a dry-run into a write or expose a code in shell history. */
export function parseMigrationOptions(args: string[]): MigrationOptions {
  const allowed = new Set(["environment", "workspace", "apply", "action", "database-fingerprint",
    "operator-user-id", "target-user-id", "confirm-target-email", "approval-reference", "owner-access-verified"]);
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match || !allowed.has(match[1]) || values.has(match[1])) throw new Error("Unknown or duplicate migration option");
    const flag = match[1] === "apply" || match[1] === "owner-access-verified";
    if (flag ? match[2] !== undefined : !match[2]) throw new Error("Invalid migration option value");
    values.set(match[1], flag ? "true" : match[2]);
  }
  const environment = values.get("environment");
  const workspace = values.get("workspace")?.trim().toLowerCase();
  if (!environment || !["development", "staging", "production"].includes(environment) || !workspace || !/^[a-z0-9_.-]{2,64}$/.test(workspace)) {
    throw new Error("Explicit --environment=development|staging|production and --workspace=<slug> are required");
  }
  const apply = values.has("apply");
  const action = values.get("action");
  if (action !== undefined && action !== "move" && action !== "recovery") throw new Error("Action must be move or recovery");
  if (apply && (!action || !values.get("database-fingerprint")
    || !values.get("operator-user-id") || !values.get("target-user-id")
    || !values.get("confirm-target-email") || !values.get("approval-reference")
    || !values.has("owner-access-verified"))) {
    throw new Error("Apply requires action, dry-run database fingerprint, named operator and target, target email confirmation, approval reference and verified retained Owner access");
  }
  return {
    environment: environment as MigrationOptions["environment"], workspace, apply,
    action: action as MigrationOptions["action"], fingerprint: values.get("database-fingerprint"),
    operatorUserId: values.get("operator-user-id"), targetUserId: values.get("target-user-id"),
    targetEmail: values.get("confirm-target-email")?.trim().toLowerCase(),
    approvalReference: values.get("approval-reference"),
  };
}