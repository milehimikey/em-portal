// SPDX-License-Identifier: MIT
// Per-slice page: this slice's own diagram, its rendered doc, driftSignal,
// and a link to wherever it was implemented (MIL-172's scope: "diagram,
// rendered doc, driftSignal, PR link"). MIL-173: every element row also
// carries its own `em export` ref as a DOM id plus a visible, copyable
// deep-link permalink (src/refs.ts) — the URL scheme an agent's `em query`/
// MCP citation and a stakeholder's portal link share.

import { escapeHtml, layout } from "./html.js";
import { EmElement, EmSlice, SliceDocJoin, SlicePattern } from "../em/exportDoc.js";
import { elementDeepLink } from "../refs.js";

const PATTERN_LABEL: Record<SlicePattern, string> = {
  "state-change": "State Change",
  "state-view": "State View",
  automation: "Automation",
  translation: "Translation",
  unclassified: "Unclassified",
};

function statusBadge(status: string | null): string {
  if (!status) return `<span class="badge">unknown</span>`;
  const cls = status === "implemented" ? "ok" : "";
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function driftBadge(drift: string | null): string {
  if (!drift) return `<span class="badge">n/a</span>`;
  const cls = drift === "in-sync" ? "ok" : drift === "never-implemented" ? "warn" : "bad";
  return `<span class="badge ${cls}">${escapeHtml(drift)}</span>`;
}

/** Renders a doc's `implementedIn` value as a link when it looks like a URL
 *  (a PR/commit link — the common case per docs/slice-doc-schema.md), or as
 *  plain code text otherwise (a bare file path — no portal-side path
 *  resolution is attempted, since the target repo isn't necessarily the one
 *  the portal was built from). */
function implementedInHtml(implementedIn: string | null): string {
  if (!implementedIn) return `<span class="no-doc">not linked</span>`;
  if (/^https?:\/\//.test(implementedIn)) {
    return `<a href="${escapeHtml(implementedIn)}">${escapeHtml(implementedIn)}</a>`;
  }
  return `<code>${escapeHtml(implementedIn)}</code>`;
}

/** `ratifiedBy`/`ratifiedOn` (schema 1.8, MIL-165) — who signed off on this
 *  doc's current status/version, and when. Both are hand-filled and often
 *  absent even on an `implemented` doc predating the feature (or ratified by
 *  hand before it existed) — that's routine, not a gap, so it renders as a
 *  plain "not recorded" note rather than a warning badge. */
function ratifiedByHtml(ratifiedBy: string | null, ratifiedOn: string | null): string {
  if (!ratifiedBy) return `<span class="no-doc">not recorded</span>`;
  return ratifiedOn ? `${escapeHtml(ratifiedBy)} <span class="pattern">(${escapeHtml(ratifiedOn)})</span>` : escapeHtml(ratifiedBy);
}

/** `owner`/`tracking` (schema 1.9, MIL-171) — rendered as one optional line
 *  beneath the stat row, omitted entirely when neither is set (same
 *  "nothing to report" convention `em status`'s own text report uses for
 *  its doc-issues line), rather than two more always-present "not set"
 *  tiles cluttering the common case. */
function ownerTrackingHtml(owner: string | null, tracking: string | null): string {
  if (!owner && !tracking) return "";
  const parts: string[] = [];
  if (owner) parts.push(`Owner: <strong>${escapeHtml(owner)}</strong>`);
  if (tracking) {
    parts.push(
      /^https?:\/\//.test(tracking)
        ? `Tracking: <a href="${escapeHtml(tracking)}">${escapeHtml(tracking)}</a>`
        : `Tracking: <code>${escapeHtml(tracking)}</code>`,
    );
  }
  return `    <p>${parts.join(" &middot; ")}</p>\n`;
}

function formatFields(el: EmElement): string {
  if (!el.fields || el.fields.length === 0) return "";
  return el.fields.map((f) => (f.type ? `${f.name}: ${f.type}` : f.name)).join(", ");
}

function elementDetail(el: EmElement): string {
  const parts: string[] = [];
  if (el.persona) parts.push(`@${el.persona}`);
  if (el.context) parts.push(`@${el.context}`);
  if (el.from && el.from.length > 0) parts.push(`from ${el.from.map((f) => f.name).join(", ")}`);
  if (el.again) parts.push("again");
  if (el.public) parts.push("public");
  const fields = formatFields(el);
  if (fields) parts.push(`{ ${fields} }`);
  return parts.map(escapeHtml).join(" &middot; ");
}

function renderElementsTable(elements: EmElement[], modelKey: string): string {
  const rows = elements
    .map((el) => {
      const annotations: string[] = [];
      if (el.issue) annotations.push(`<div><span class="badge warn">issue</span> ${escapeHtml(el.issue)}</div>`);
      if (el.divergence) annotations.push(`<div><span class="badge">divergence</span> ${escapeHtml(el.divergence)}</div>`);
      // The fragment jump target for THIS page is always local ("#<ref>") — a
      // relative deep link never needs the "<model-key>/slices/<key>.html"
      // prefix when it's already pointing at the page it's sitting on. The
      // full portable citation (what elementDeepLink returns) is shown as
      // the visible, copyable permalink text instead, so a reader can grab
      // the whole address without leaving the page.
      const deepLink = elementDeepLink(modelKey, el.ref);
      return `      <tr id="${escapeHtml(el.ref)}">
        <td>${escapeHtml(el.kind)}</td>
        <td>${escapeHtml(el.name)}</td>
        <td>${elementDetail(el)}${annotations.join("")}</td>
        <td class="permalink"><a href="#${escapeHtml(el.ref)}" title="Deep link: ${escapeHtml(deepLink)}">#${escapeHtml(el.ref)}</a></td>
      </tr>`;
    })
    .join("\n");

  return `    <table>
      <thead><tr><th>Kind</th><th>Name</th><th>Detail</th><th>Ref</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

export interface SlicePageArgs {
  modelName: string;
  modelKey: string;
  diagramFile: string;
  sliceDiagramFile: string;
  slice: EmSlice;
  pattern: SlicePattern;
  doc: SliceDocJoin;
  /** Rendered markdown body of the bound doc (src/em/docBody.ts) — `em
   *  export`'s own `doc` field never carries this (frontmatter only). `null`
   *  when no doc is bound, the bound file couldn't be read, or it has no
   *  body content after its frontmatter block. */
  docBodyHtml: string | null;
}

export function renderSlicePage(args: SlicePageArgs): string {
  const { modelName, diagramFile, sliceDiagramFile, slice, pattern, doc, docBodyHtml } = args;

  const docSection = docBodyHtml
    ? `    <div class="doc">${docBodyHtml}</div>`
    : `    <p class="no-doc">${doc.found ? `Doc bound at <code>${escapeHtml(doc.path)}</code> but has no rendered body.` : `No slice doc bound. Expected at <code>${escapeHtml(doc.path)}</code>.`}</p>`;

  const body = `    <h1>${escapeHtml(slice.name)}</h1>
    <p class="pattern">${escapeHtml(PATTERN_LABEL[pattern])}</p>
    <div class="stat-row">
      <div class="stat"><span class="label">Status</span>${statusBadge(doc.status)}</div>
      <div class="stat"><span class="label">Drift signal</span>${driftBadge(doc.driftSignal)}</div>
      <div class="stat"><span class="label">Implemented in</span>${implementedInHtml(doc.implementedIn)}</div>
      <div class="stat"><span class="label">Ratified by</span>${ratifiedByHtml(doc.ratifiedBy, doc.ratifiedOn)}</div>
    </div>
${ownerTrackingHtml(doc.owner, doc.tracking)}    <div class="diagram-frame"><object class="diagram" type="image/svg+xml" data="${escapeHtml(sliceDiagramFile)}"></object></div>
    <p class="full-diagram-link"><a href="${escapeHtml(diagramFile)}">View full model diagram &rarr;</a></p>
${renderElementsTable(slice.elements, args.modelKey)}
${docSection}`;

  return layout(`${slice.name} — ${modelName}`, body, "../../index.html", [
    { label: modelName, href: ".." },
    { label: slice.name, href: "." },
  ]);
}
