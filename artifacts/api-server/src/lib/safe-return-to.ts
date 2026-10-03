const RETURN_TO_ORIGIN = "https://return-to.invalid";

/** Keep post-login navigation on this origin without rewriting valid paths. */
export function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }
  try {
    // Browsers treat backslashes as separators and ignore some control bytes.
    // Check URL interpretation as well as the root-relative path requirement.
    if (new URL(value, RETURN_TO_ORIGIN).origin !== RETURN_TO_ORIGIN) return "/";
    return value;
  } catch {
    return "/";
  }
}