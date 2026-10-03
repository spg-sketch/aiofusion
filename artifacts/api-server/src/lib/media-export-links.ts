/** Only HTTP(S) or unambiguous bare domain addresses may become workbook links.
 * No formulas, credentials, control characters, or other URL schemes.
 * Returns the original destination, not a normalised/re-encoded substitute.
 * Bare domain addresses receive HTTPS; their original text is kept separately.
 */
export function safeMediaExportLink(value: string): { target: string; hostname: string } | null {
  if (value.length > 32_767 || value !== value.trim()
    || /[\u0000-\u0020\u007F\\]/.test(value)) return null;
  const explicit = /^https?:\/\//i.test(value);
  if (!explicit && !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::\d{1,5})?(?:[/?#]|$)/i.test(value)) return null;
  const target = explicit ? value : `https://${value}`;
  try {
    const url = new URL(target);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || !url.hostname.includes(".") || !/[a-z]/i.test(url.hostname)) return null;
    return { target, hostname: url.hostname };
  } catch {
    return null;
  }
}