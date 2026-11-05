// SPDX-License-Identifier: MIT
// Per-model page: the model's full diagram plus its slice table — the
// drill-down step between the multi-model landing index and an individual
// slice page (model -> slice -> doc, per MIL-162's "state up front" design).

import { escapeHtml, layout } from "./html.js";
import { EmStoryline, EmStorylineEdge, SlicePattern } from "../em/exportDoc.js";
import { kebabSlug } from "../slug.js";
// Note: this page's slice links are relative to the model directory itself
// ("slices/<key>.html"), not the site-root-relative form src/refs.ts's
// sliceUrl() returns (which is for cross-page links, e.g. the landing
// page's cross-model-links table) — so this page builds its own hrefs
// rather than reusing that helper.

const PATTERN_LABEL: Record<SlicePattern, string> = {
  "state-change": "State Change",
  "state-view": "State View",
  automation: "Automation",
  translation: "Translation",
  unclassified: "Unclassified",
};

function statusBadge(hasDoc: boolean, status: string | null): string {
  if (!hasDoc) return `<span class="badge">no doc</span>`;
  if (!status) return `<span class="badge">unknown</span>`;
  const cls = status === "implemented" ? "ok" : "";
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

/** Same severity rule as slice.ts's driftBadge: only `implemented-without-link`
 *  is a defect in em 1.21's drift vocabulary; the rest are expected states. */
function driftBadge(drift: string | null): string {
  if (!drift) return "";
  const cls = drift === "in-sync" ? "ok" : drift === "implemented-without-link" ? "bad" : "warn";
  return `<span class="badge ${cls}">${escapeHtml(drift)}</span>`;
}

export interface ModelPageSliceRow {
  key: string;
  name: string;
  pattern: SlicePattern;
  hasDoc: boolean;
  status: string | null;
  driftSignal: string | null;
}

export interface ModelPageArgs {
  modelKey: string;
  modelName: string;
  file: string;
  diagramFile: string;
  slices: ModelPageSliceRow[];
  /** `model.storylines` / `model.storylineEdges` straight from the export
   *  (GH #277/#421). Empty for a model without storyline blocks. */
  storylines: EmStoryline[];
  storylineEdges: EmStorylineEdge[];
}

/** The storylines section (GH #4 item 2): a reader's entry point when the
 *  model declares storylines — the canvas link plus one row per storyline
 *  (its own SVG, step count, what it follows). The canvas itself is em's
 *  `em render --map` page copied into `storylines/`, never re-implemented
 *  here. The "follows" column folds in both edge kinds: a declared `after`,
 *  and a "reads" edge (elements of one storyline feeding another). */
function storylinesSection(storylines: EmStoryline[], edges: EmStorylineEdge[]): string {
  const readsInto = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind === "reads") readsInto.set(e.to, [...(readsInto.get(e.to) ?? []), e.from]);
  }
  const rows = storylines
    .map((s) => {
      const follows: string[] = [];
      if (s.after) follows.push(`after ${s.after}`);
      for (const from of readsInto.get(s.name) ?? []) follows.push(`reads from ${from}`);
      return `      <tr>
        <td><a href="storylines/${escapeHtml(kebabSlug(s.name))}.svg">${escapeHtml(s.name)}</a></td>
        <td>${s.sliceKeys.length}</td>
        <td>${follows.length > 0 ? escapeHtml(follows.join(" · ")) : "&mdash;"}</td>
      </tr>`;
    })
    .join("\n");

  return `    <h2>Storylines</h2>
    <p><a class="first-read-cta" href="storylines/map.html">Open the storyline canvas &rarr;</a></p>
    <table>
      <thead><tr><th>Storyline</th><th>Steps</th><th>Follows</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

export function renderModelPage(args: ModelPageArgs): string {
  const { modelName, file, diagramFile, slices, storylines, storylineEdges } = args;
  const rows = slices
    .map(
      (s) => `      <tr id="${escapeHtml(s.key)}">
        <td><a href="slices/${escapeHtml(s.key)}.html">${escapeHtml(s.name)}</a></td>
        <td class="pattern">${escapeHtml(PATTERN_LABEL[s.pattern])}</td>
        <td>${statusBadge(s.hasDoc, s.status)}</td>
        <td>${driftBadge(s.driftSignal)}</td>
      </tr>`,
    )
    .join("\n");

  const sliceTable = `    <table>
      <thead><tr><th>Slice</th><th>Pattern</th><th>Status</th><th>Drift</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
  const diagramEmbed = `    <div class="diagram-frame"><object class="diagram" type="image/svg+xml" data="${escapeHtml(diagramFile)}"></object></div>
    <p class="full-diagram-link"><a href="${escapeHtml(diagramFile)}">Open full diagram &rarr;</a></p>`;

  // GH #4: a model WITH storylines leads with them (the canvas is the thing
  // a reader consumes; the 80-column full diagram is demoted below the slice
  // table). A model without storylines keeps the diagram-first layout.
  const sections =
    storylines.length > 0
      ? `${storylinesSection(storylines, storylineEdges)}\n${sliceTable}\n${diagramEmbed}`
      : `${diagramEmbed}\n${sliceTable}`;

  const body = `    <p><code>${escapeHtml(file)}</code></p>
    <h1>${escapeHtml(modelName)}</h1>
    <p><a class="first-read-cta" href="walkthrough.html">First read: learn the notation on this model &rarr;</a></p>
${sections}`;

  return layout(`${modelName} — em portal`, body, "../index.html", [{ label: modelName, href: "." }]);
}
