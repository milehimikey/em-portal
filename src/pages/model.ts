// SPDX-License-Identifier: MIT
// Per-model page: the model's full diagram plus its slice table — the
// drill-down step between the multi-model landing index and an individual
// slice page (model -> slice -> doc, per MIL-162's "state up front" design).

import { escapeHtml, layout } from "./html.js";
import { SlicePattern } from "../em/exportDoc.js";
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

function driftBadge(drift: string | null): string {
  if (!drift) return "";
  const cls = drift === "in-sync" ? "ok" : drift === "never-implemented" ? "warn" : "bad";
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
}

export function renderModelPage(args: ModelPageArgs): string {
  const { modelName, file, diagramFile, slices } = args;
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

  const body = `    <p><code>${escapeHtml(file)}</code></p>
    <h1>${escapeHtml(modelName)}</h1>
    <div class="diagram-frame"><object class="diagram" type="image/svg+xml" data="${escapeHtml(diagramFile)}"></object></div>
    <p class="full-diagram-link"><a href="${escapeHtml(diagramFile)}">Open full diagram &rarr;</a></p>
    <table>
      <thead><tr><th>Slice</th><th>Pattern</th><th>Status</th><th>Drift</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;

  return layout(`${modelName} — em portal`, body, "../index.html", [{ label: modelName, href: "." }]);
}
