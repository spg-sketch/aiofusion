// Accepts a JSON object wrapped in a code fence or short explanatory text.
// Do not repair missing closing braces: a truncated draft must fail explicitly.
export function sanitiseJsonControlChars(value: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of value) {
    if (!inString) {
      if (char === '"') inString = true;
      out += char;
    } else if (escaped) {
      out += char;
      escaped = false;
    } else if (char === "\\") {
      out += char;
      escaped = true;
    } else if (char === '"') {
      out += char;
      inString = false;
    } else {
      const code = char.charCodeAt(0);
      out += code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : char;
    }
  }
  return out;
}

export function extractContentJson(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  for (let start = candidate.indexOf("{"); start !== -1; start = candidate.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < candidate.length; end++) {
      const char = candidate[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}" && --depth === 0) {
        const slice = candidate.slice(start, end + 1);
        try {
          return JSON.parse(slice);
        } catch {
          try {
            return JSON.parse(sanitiseJsonControlChars(slice));
          } catch {
            // Skip the whole invalid object, not a valid-looking nested object.
            start = end;
            break;
          }
        }
      }
    }
    if (depth > 0) return null;
  }
  return null;
}