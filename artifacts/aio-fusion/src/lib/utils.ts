import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Converts any run of em dashes (U+2014) or horizontal bars (U+2015) - including
// the "double em dash" that AI sometimes produces - into a plain spaced hyphen.
// Only spaces/tabs around the dash are consumed (never newlines), so line breaks
// and list layout are preserved. En dashes (U+2013) are left alone so numeric
// ranges like "10-20" are not disturbed. Mirrors the server-side guard so any
// existing content already saved is cleaned the moment it is shown.
const EM_DASH_RUN = /[ \t]*[\u2014\u2015]+[ \t]*/g

export function stripEmDashes(text: string): string {
  if (!text) return text
  return text.replace(EM_DASH_RUN, " - ")
}
