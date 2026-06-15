// Guards that decide whether an incoming Set-Up (intake) or project data record
// carries real content. Used by the store routes so a blank/empty payload can
// never overwrite a project that already has a populated copy saved. Kept free
// of any database imports so it can be unit-tested in isolation.

// True when an intake blob carries no real answers (e.g. a blank Draft). An
// intake counts as populated if any Set-Up answer, category list or dual-field
// entry has a value.
export function intakeIsEmpty(intake: unknown): boolean {
  if (intake == null || typeof intake !== "object") return true;
  const obj = intake as Record<string, unknown>;

  const fd = obj.formData;
  if (fd && typeof fd === "object") {
    for (const v of Object.values(fd as Record<string, unknown>)) {
      if (typeof v === "string") {
        if (v.trim() !== "") return false;
      } else if (Array.isArray(v)) {
        if (v.length > 0) return false;
      } else if (v != null && v !== false) {
        return false;
      }
    }
  }

  for (const key of ["businessCategories", "mediaCategories", "audienceCategories"]) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > 0) return false;
  }

  const duals = obj.duals;
  if (duals && typeof duals === "object" && Object.keys(duals as object).length > 0) {
    return false;
  }

  return true;
}

// True when a project hub data record carries no content (missing or an empty
// object), so it must not replace a populated record.
export function dataIsEmpty(data: unknown): boolean {
  if (data == null || typeof data !== "object") return true;
  return Object.keys(data as Record<string, unknown>).length === 0;
}
