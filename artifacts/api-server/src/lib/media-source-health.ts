import type { MediaSourceDifference } from "@workspace/db";
import type { MediaSourceEvidence } from "./safe-fetch";

export type MediaSourceContact = {
  firstName: string;
  lastName: string;
  role: string;
  email: string;
};

export function evaluateMediaSource(contact: MediaSourceContact, evidence: MediaSourceEvidence) {
  const lowerText = evidence.text.toLowerCase();
  const fullName = `${contact.firstName} ${contact.lastName}`.trim().toLowerCase();
  const nameFound = !!fullName && lowerText.includes(fullName);
  const storedRole = contact.role.trim();
  const roleFound = !!storedRole && lowerText.includes(storedRole.toLowerCase());
  const storedEmail = contact.email.trim().toLowerCase();
  const emailFound = !!storedEmail && evidence.emails.includes(storedEmail);
  const nameTokens = fullName.split(/\s+/).filter((token) => token.length > 1);
  const nearby = evidence.roleCandidates.filter((candidate) => {
    const lower = candidate.toLowerCase();
    return nameTokens.length > 0 && nameTokens.every((token) => lower.includes(token));
  });
  const observedRole = nearby
    .map((candidate) => candidate.replace(new RegExp(nameTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i"), "").replace(/^[\s|,–—-]+|[\s|,–—-]+$/g, "").trim())
    .find((candidate) => candidate.length >= 2 && candidate.length <= 100) ?? "";
  const differences: MediaSourceDifference[] = [];

  if (storedRole && nameFound && !roleFound) {
    differences.push({ field: "role", kind: observedRole ? "changed" : "removed", storedValue: storedRole, observedValue: observedRole, supported: !!observedRole });
  } else if (!storedRole && observedRole) {
    differences.push({ field: "role", kind: "added", storedValue: "", observedValue: observedRole, supported: true });
  }
  if (storedEmail && !emailFound && evidence.emails.length === 1) {
    differences.push({ field: "email", kind: "changed", storedValue: contact.email, observedValue: evidence.emails[0], supported: true });
  } else if (storedEmail && !emailFound) {
    differences.push({ field: "email", kind: "removed", storedValue: contact.email, observedValue: "", supported: false });
  } else if (!storedEmail && evidence.emails.length === 1) {
    differences.push({ field: "email", kind: "added", storedValue: "", observedValue: evidence.emails[0], supported: true });
  }

  return {
    outcome: differences.length ? "changed" as const : "current" as const,
    observedEvidence: {
      nameFound,
      roleFound,
      emailFound,
      observedRole,
      observedEmails: evidence.emails,
      excerpt: nearby[0]?.slice(0, 500) ?? evidence.text.slice(0, 500),
    },
    differences,
  };
}

export function sourceFetchError(error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : "The source could not be reached.";
  return { errorCode: /HTTP 404/i.test(message) ? "page_missing" : "fetch_failed", errorMessage: message };
}

export function approvedSourceUpdates(
  differences: MediaSourceDifference[],
  requestedFields: unknown,
  blockedFields: Iterable<string>,
) {
  const requested = new Set(Array.isArray(requestedFields) ? requestedFields.filter((field): field is "role" | "email" => field === "role" || field === "email") : []);
  const blocked = new Set(blockedFields);
  const updates: Partial<Record<"role" | "email", string>> = {};
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const difference of differences) {
    if (!requested.has(difference.field) || !difference.supported || !difference.observedValue) continue;
    if (blocked.has(difference.field)) { skipped.push(difference.field); continue; }
    updates[difference.field] = difference.observedValue;
    applied.push(difference.field);
  }
  return { updates, applied, skipped };
}