// SPDX-License-Identifier: MIT
// `em export`'s slice-doc join is deliberately frontmatter-only — "never the
// markdown body" (docs/cli.md) — so a portal that wants to show the rendered
// doc has to read and render the body itself. This reads the same
// `slices/<key>.md` file the join's own `path` field names (resolved
// relative to the `.em` file's directory, the same sibling-file convention
// every doc-aware em command uses), strips the leading YAML frontmatter
// block, and renders the remainder with `marked` — the same markdown engine
// em's own catalog/sliceDoc.ts uses, so headings/lists/code fences render
// the same way a reader would see in `em catalog`.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { marked } from "marked";

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const lines = markdown.split("\n");
  if (lines[0].trim() !== "---") return markdown;
  const closeIndex = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (closeIndex === -1) return markdown;
  return lines.slice(closeIndex + 1).join("\n");
}

/** Returns rendered HTML for the slice doc bound at `docRelPath` (relative to
 *  `modelFile`'s own directory), or `null` if the file can't be read — a
 *  routine, non-fatal state (no doc bound, or a stale `path` from a `found:
 *  false` join). */
export function renderDocBody(modelFile: string, docRelPath: string): string | null {
  const absPath = join(dirname(modelFile), docRelPath);
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const body = stripFrontmatter(raw).trim();
  if (!body) return null;
  return marked.parse(body, { async: false }) as string;
}
