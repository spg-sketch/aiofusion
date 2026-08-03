import type { Request, Response, NextFunction } from "express";
import { canAccessProjects, canWriteProjects } from "./platform-auth";

// --- Fine-grained membership gates -------------------------------------------
//
// Team members carry a membership role on their session: billing members have
// no project access at all, viewers are read-only, and content/viewer members
// may be restricted to an explicit list of project ids (projectAccess).
// These helpers centralize that authorization so every project-data surface
// (projects, archive, planner, audits, media database) enforces it identically.

// Billing members may not read project data. Sends the response and returns
// false when blocked.
export function guardProjectRead(req: Request, res: Response): boolean {
  if (!canAccessProjects(req.account!)) {
    res.status(403).json({ error: "Billing members don't have access to projects." });
    return false;
  }
  return true;
}

// Viewers and billing members may not modify project data.
export function guardProjectWrite(req: Request, res: Response): boolean {
  if (!guardProjectRead(req, res)) return false;
  if (!canWriteProjects(req.account!)) {
    res.status(403).json({ error: "Your role is read-only. Ask an account owner or admin for edit access." });
    return false;
  }
  return true;
}

// The explicit project-id allowlist for this member, or null = all projects.
export function assignedProjectIds(req: Request): string[] | null {
  return req.account!.projectAccess ?? null;
}

// Whether this member may touch the given project id under their allowlist.
export function inAssignedScope(req: Request, projectId: string): boolean {
  const assigned = assignedProjectIds(req);
  return assigned === null || assigned.includes(projectId);
}

// Intersect a project-visibility list with the member's allowlist.
// null means "no restriction" on either side.
export function restrictToAssigned(
  req: Request,
  projectIds: string[] | null,
): string[] | null {
  const assigned = assignedProjectIds(req);
  if (assigned === null) return projectIds;
  if (projectIds === null) return assigned;
  return projectIds.filter((id) => assigned.includes(id));
}

// Router-level gate: GET/HEAD requests require project read access, everything
// else requires write access. Signed-out requests pass through so each route's
// own requirePlatformAuth still returns 401 first.
export function memberProjectGate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.account) {
    next();
    return;
  }
  const readOnly = req.method === "GET" || req.method === "HEAD";
  const ok = readOnly ? guardProjectRead(req, res) : guardProjectWrite(req, res);
  if (ok) next();
}
