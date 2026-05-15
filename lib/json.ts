/**
 * Extract a JSON object from a model's text output.
 *
 * Handles:
 *  - Plain JSON
 *  - JSON wrapped in ```json fences
 *  - JSON with preamble/postamble text
 *  - JSON with web-search citation markers around it
 *
 * Returns the parsed object, or null if no valid JSON found.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;

  // Strip markdown fences
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Optimistic: maybe the whole thing parses
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }

  // Find the first { and walk to its matching close, respecting strings
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
