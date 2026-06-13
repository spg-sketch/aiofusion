// Deterministic guard against em dashes in AI-generated copy.
//
// The content prompts already instruct the model to avoid em dashes (see
// BRITISH_RULE), but models are not reliable about it. This converts any run of
// em dashes (U+2014) or horizontal bars (U+2015) - including the "double em
// dash" the model sometimes emits - into a plain spaced hyphen. We only consume
// spaces/tabs around the dash (never newlines), so line breaks and list layout
// are preserved. En dashes (U+2013) are left alone to avoid breaking numeric
// ranges such as "10-20".
const EM_DASH_RUN = /[ \t]*[\u2014\u2015]+[ \t]*/g;

export function stripEmDashes(text: string): string {
  if (!text) return text;
  return text.replace(EM_DASH_RUN, " - ");
}

// Identifier-like fields that hold machine values rather than prose. A real em
// dash cannot legitimately appear in these, so we leave them byte-for-byte to
// avoid ever corrupting a URL or email address.
const SKIP_KEYS = new Set(["url", "email"]);

// Recursively walks an object/array and applies stripEmDashes to every prose
// string value, returning a sanitised copy. Values under SKIP_KEYS and
// non-string leaves are returned untouched.
export function deepStripEmDashes<T>(value: T): T {
  if (typeof value === "string") return stripEmDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepStripEmDashes(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SKIP_KEYS.has(k) ? v : deepStripEmDashes(v);
    }
    return out as T;
  }
  return value;
}
