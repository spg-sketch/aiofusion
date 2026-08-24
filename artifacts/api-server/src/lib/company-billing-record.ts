import {
  db,
  platformAccountsTable,
  platformCompaniesTable,
  platformMembershipsTable,
  platformMetaTable,
  platformUsersTable,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { normUsername } from "./platform-auth";

export type CompanyBillingFields = {
  companyName: string;
  billingEmail: string;
  keyAccountHolderEmail: string;
  addressLine1: string;
  addressLine2: string;
  townCity: string;
  postcode: string;
  country: string;
  vatNumber: string;
};

export type CompanyBillingRecord = CompanyBillingFields & {
  complete: boolean;
  legacyBillingAddress: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROFILE_PREFIX = "account:profile:";

export function splitStoredBillingAddress(text: string | null | undefined): {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  townCity: string;
  postcode: string;
  country: string;
} {
  const lines = (text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const result = {
    companyName: lines[0] ?? "",
    addressLine1: lines[1] ?? "",
    addressLine2: "",
    townCity: "",
    postcode: "",
    country: "",
  };
  const rest = lines.slice(2);
  if (rest.length >= 4) {
    result.addressLine2 = rest[0] ?? "";
    result.townCity = rest[1] ?? "";
    result.postcode = rest[2] ?? "";
    result.country = rest.slice(3).join(", ");
  } else {
    result.townCity = rest[0] ?? "";
    result.postcode = rest[1] ?? "";
    result.country = rest[2] ?? "";
  }
  return result;
}

export function composeStoredBillingAddress(fields: CompanyBillingFields): string {
  return [
    fields.companyName,
    fields.addressLine1,
    fields.addressLine2,
    fields.townCity,
    fields.postcode,
    fields.country,
  ].map((value) => value.trim()).filter(Boolean).join("\n");
}

function parseProfileName(value: string | undefined): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { displayName?: unknown };
    return typeof parsed.displayName === "string" ? parsed.displayName.trim() : "";
  } catch {
    return "";
  }
}

async function getOwnerEmail(slug: string): Promise<string> {
  const [owner] = await db
    .select({ email: platformUsersTable.email })
    .from(platformMembershipsTable)
    .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
    .where(and(
      eq(platformMembershipsTable.companySlug, slug),
      eq(platformMembershipsTable.role, "owner"),
    ))
    .orderBy(asc(platformMembershipsTable.createdAt))
    .limit(1);
  return owner?.email?.trim().toLowerCase() ?? "";
}

export async function getCompanyBillingRecord(slugValue: string): Promise<CompanyBillingRecord | null> {
  const slug = normUsername(slugValue);
  const [company, account, profile, ownerEmail] = await Promise.all([
    db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, slug)).limit(1).then((rows) => rows[0]),
    db.select({ email: platformAccountsTable.email }).from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, slug)).limit(1).then((rows) => rows[0]),
    db.select({ value: platformMetaTable.value }).from(platformMetaTable)
      .where(eq(platformMetaTable.key, `${PROFILE_PREFIX}${slug}`)).limit(1).then((rows) => rows[0]),
    getOwnerEmail(slug),
  ]);
  if (!company) return null;

  const structuredAddress = company.billingAddressVersion === 1;
  const address = structuredAddress
    ? splitStoredBillingAddress(company.billingAddress)
    : splitStoredBillingAddress("");
  const companyName = company.displayName?.trim()
    || parseProfileName(profile?.value)
    || (structuredAddress ? address.companyName : "");
  const companyEmail = company.email?.trim().toLowerCase()
    || account?.email?.trim().toLowerCase()
    || ownerEmail;
  const billingEmail = company.billingEmail?.trim().toLowerCase() || companyEmail;
  const keyAccountHolderEmail = company.keyAccountHolderEmail?.trim().toLowerCase() || ownerEmail || companyEmail;

  const complete = Boolean(
    company.displayName?.trim()
    && company.billingEmail?.trim()
    && company.keyAccountHolderEmail?.trim()
    && structuredAddress
    && address.addressLine1
    && address.townCity
    && address.postcode
    && address.country,
  );

  return {
    companyName,
    billingEmail,
    keyAccountHolderEmail,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    townCity: address.townCity,
    postcode: address.postcode,
    country: address.country,
    vatNumber: company.vatNumber?.trim() ?? "",
    complete,
    legacyBillingAddress: structuredAddress ? "" : company.billingAddress?.trim() ?? "",
  };
}

export function validateCompanyBillingFields(input: unknown):
  | { ok: true; fields: CompanyBillingFields; billingAddress: string }
  | { ok: false; fieldErrors: Partial<Record<keyof CompanyBillingFields, string>> } {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const fields: CompanyBillingFields = {
    companyName: typeof body.companyName === "string" ? body.companyName.trim() : "",
    billingEmail: typeof body.billingEmail === "string" ? body.billingEmail.trim().toLowerCase() : "",
    keyAccountHolderEmail: typeof body.keyAccountHolderEmail === "string" ? body.keyAccountHolderEmail.trim().toLowerCase() : "",
    addressLine1: typeof body.addressLine1 === "string" ? body.addressLine1.trim() : "",
    addressLine2: typeof body.addressLine2 === "string" ? body.addressLine2.trim() : "",
    townCity: typeof body.townCity === "string" ? body.townCity.trim() : "",
    postcode: typeof body.postcode === "string" ? body.postcode.trim() : "",
    country: typeof body.country === "string" ? body.country.trim() : "",
    vatNumber: typeof body.vatNumber === "string" ? body.vatNumber.trim().toUpperCase() : "",
  };
  const errors: Partial<Record<keyof CompanyBillingFields, string>> = {};
  const required: Array<keyof CompanyBillingFields> = [
    "companyName", "billingEmail", "keyAccountHolderEmail", "addressLine1", "townCity", "postcode", "country",
  ];
  for (const key of required) {
    if (!fields[key]) errors[key] = "This field is required.";
  }
  if (fields.companyName.length > 128) errors.companyName = "Use 128 characters or fewer.";
  if (fields.billingEmail && (!EMAIL_RE.test(fields.billingEmail) || fields.billingEmail.length > 255)) {
    errors.billingEmail = "Enter a valid billing email address.";
  }
  if (fields.keyAccountHolderEmail && (!EMAIL_RE.test(fields.keyAccountHolderEmail) || fields.keyAccountHolderEmail.length > 255)) {
    errors.keyAccountHolderEmail = "Enter a valid key account holder email address.";
  }
  for (const key of ["addressLine1", "addressLine2", "townCity"] as const) {
    if (fields[key].length > 120) errors[key] = "Use 120 characters or fewer.";
  }
  if (fields.postcode.length > 32) errors.postcode = "Use 32 characters or fewer.";
  if (fields.country.length > 80) errors.country = "Use 80 characters or fewer.";
  if (fields.vatNumber.length > 64) errors.vatNumber = "Use 64 characters or fewer.";

  const billingAddress = composeStoredBillingAddress(fields);
  if (billingAddress.length > 512) {
    errors.addressLine1 = "The complete address is too long.";
  }
  return Object.keys(errors).length > 0
    ? { ok: false, fieldErrors: errors }
    : { ok: true, fields, billingAddress };
}

export async function saveCompanyBillingRecord(slugValue: string, fields: CompanyBillingFields, billingAddress: string): Promise<void> {
  const slug = normUsername(slugValue);
  await db.transaction(async (tx) => {
    await tx.update(platformCompaniesTable).set({
      displayName: fields.companyName,
      billingEmail: fields.billingEmail,
      keyAccountHolderEmail: fields.keyAccountHolderEmail,
      billingAddress,
      billingAddressVersion: 1,
      vatNumber: fields.vatNumber || null,
    }).where(eq(platformCompaniesTable.slug, slug));

    const key = `${PROFILE_PREFIX}${slug}`;
    const [existing] = await tx.select({ value: platformMetaTable.value })
      .from(platformMetaTable).where(eq(platformMetaTable.key, key)).limit(1);
    let profile: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(existing?.value ?? "{}");
      if (parsed && typeof parsed === "object") profile = parsed as Record<string, unknown>;
    } catch { /* replace malformed legacy profile */ }
    const value = JSON.stringify({ ...profile, displayName: fields.companyName });
    await tx.insert(platformMetaTable).values({ key, value })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
  });
}