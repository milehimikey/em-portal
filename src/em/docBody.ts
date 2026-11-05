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

/** Rewrites sibling-doc links in a rendered doc body to the portal's own
 *  slice pages. em's generated `em-slice-story` line (GH #418, right under
 *  the doc's `![Diagram]` line) links the previous/next step as
 *  `[Name](./other-slice.md)` — a sibling file in the same `slices/`
 *  directory. The portal serves that sibling as `other-slice.html` in the
 *  same output directory, so only the extension changes. Conservative on
 *  purpose: just bare/`./`-relative kebab-case `.md` hrefs — an absolute
 *  URL or a path with directories is somebody else's link. */
function rewriteSiblingDocLinks(html: string): string {
  return html.replace(/(href=")(?:\.\/)?([a-z0-9][a-z0-9-]*)\.md(")/g, "$1./$2.html$3");
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
  return rewriteSiblingDocLinks(marked.parse(body, { async: false }) as string);
}
