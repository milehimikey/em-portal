// SPDX-License-Identifier: MIT
// The component layer (GH #3 item 2): every piece here is driven by `em
// export --doc-json`'s STRUCTURED data (src/em/docJsonDoc.ts) — the portal
// never re-parses slice markdown. Where em's own section-aware HTML render
// (GH #402: scenario cards, INV chips, field tables) already carries a
// structure, the portal styles it (html.ts CSS) and EXCEEDS it with the one
// thing a single-doc render can't know: the model-level invariant catalog's
// cross-slice joins. Components that render whole sections return plain HTML
// strings, same hand-written-template convention as every page builder.

import { DocFieldGroup, DocInvariant, DocInvariantCatalogEntry, DocJsonSlice, DocOpenQuestion } from "../em/docJsonDoc.js";
import { escapeHtml } from "./html.js";

/** Rewrites sibling-doc links in em's rendered doc-body HTML to the portal's
 *  own slice pages. em's generated `em-slice-story` line links the previous/
 *  next step as `[Name](./other-slice.md)` — a sibling in the same `slices/`
 *  directory, served by the portal as `other-slice.html` beside this page.
 *  Conservative on purpose: just bare/`./`-relative kebab-case `.md` hrefs —
 *  an absolute URL or a path with directories is somebody else's link. */
export function rewriteSiblingDocLinks(html: string): string {
  return html.replace(/(href=")(?:\.\/)?([a-z0-9][a-z0-9-]*)\.md(")/g, "$1./$2.html$3");
}

/** Upgrades em's external INV chips into cross-slice links — the "exceed,
 *  don't duplicate" half of GH #3 item 2. em's renderer marks an id the doc
 *  doesn't declare as `<span class="inv-chip inv-chip--external">INV-X</span>`
 *  (a single-doc render can't know who owns it); the invariant catalog does
 *  know, so those spans become links to the owning slice's page, landing on
 *  em's own definition anchor (`#inv-<id>`). An id the catalog doesn't carry
 *  (a typo, a retired rule) stays a plain span rather than becoming a 404. */
export function linkExternalInvChips(html: string, catalog: DocInvariantCatalogEntry[], currentSliceKey: string): string {
  const ownerOf = new Map(catalog.map((e) => [e.id, e.owningSlice]));
  return html.replace(
    /<span class="inv-chip inv-chip--external">([^<]+)<\/span>/g,
    (match, id: string) => {
      const owner = ownerOf.get(id);
      if (!owner || owner === currentSliceKey) return match;
      return `<a class="inv-chip inv-chip--external" href="${escapeHtml(owner)}.html#inv-${escapeHtml(id.toLowerCase())}">${escapeHtml(id)}</a>`;
    },
  );
}

/** One INV chip for portal-built sections (the slice header's invariant row,
 *  the model page's catalog). `href` null renders an unlinked chip. */
function invChip(id: string, href: string | null): string {
  const inner = escapeHtml(id);
  return href ? `<a class="inv-chip" href="${escapeHtml(href)}">${inner}</a>` : `<span class="inv-chip">${inner}</span>`;
}

/** The slice page's invariant row: this slice's own invariants as chips
 *  (linking down to em's definition anchors inside the rendered doc body
 *  when one exists), each followed by its rule text, plus — from the
 *  catalog — which OTHER slices cite the id, linked. Empty string when the
 *  slice declares nothing (no empty-section clutter). */
export function invariantRow(
  invariants: DocInvariant[],
  catalog: DocInvariantCatalogEntry[],
  sliceKey: string,
  hasDocHtml: boolean,
): string {
  if (invariants.length === 0) return "";
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const items = invariants
    .map((inv) => {
      const chip = invChip(inv.id, hasDocHtml ? `#inv-${inv.id.toLowerCase()}` : null);
      const rule = inv.text ? ` ${escapeHtml(inv.text)}` : "";
      const refs = (byId.get(inv.id)?.referencingSlices ?? []).filter((k) => k !== sliceKey);
      const refHtml =
        refs.length > 0
          ? ` <span class="pattern">cited by ${refs.map((k) => `<a href="${escapeHtml(k)}.html">${escapeHtml(k)}</a>`).join(", ")}</span>`
          : "";
      return `      <li>${chip}${rule}${refHtml}</li>`;
    })
    .join("\n");
  return `    <h2>Invariants</h2>
    <ul class="invariant-list">
${items}
    </ul>\n`;
}

const FIELD_GROUP_LABEL: Record<DocFieldGroup["kind"], string> = {
  command: "Command",
  event: "Event",
  view: "View",
};

/** The contract section: the generated field tables as data. em derives
 *  these from the MODEL (not the doc), so this renders for a slice with no
 *  doc bound at all — which is exactly when it's shown: a documented slice's
 *  rendered body already carries the same tables (em keeps them synced),
 *  and showing both would be the duplication GH #3 warns about. */
export function contractSection(groups: DocFieldGroup[]): string {
  const withFields = groups.filter((g) => g.fields.length > 0);
  if (withFields.length === 0) return "";
  const tables = withFields
    .map((g) => {
      const rows = g.fields
        .map(
          (f) => `        <tr><td><code>${escapeHtml(f.name)}</code></td><td class="col-type">${escapeHtml(f.type)}</td><td class="col-notes">${escapeHtml(f.notes)}</td></tr>`,
        )
        .join("\n");
      return `    <h3>${escapeHtml(FIELD_GROUP_LABEL[g.kind])}: <code>${escapeHtml(g.element)}</code></h3>
    <table class="field-table">
      <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
    })
    .join("\n");
  return `    <h2>Contract</h2>
${tables}\n`;
}

/** "Open questions: N open (M deferred)" — a stat for the slice page's
 *  badge row, from the structured openQuestions (checked items are settled
 *  and don't count). Empty string when there's nothing open or deferred. */
export function openQuestionsStat(questions: DocOpenQuestion[]): string {
  const open = questions.filter((q) => !q.checked);
  if (open.length === 0) return "";
  const deferred = open.filter((q) => q.deferredToVersion !== null).length;
  const label = deferred > 0 ? `${open.length} open (${deferred} deferred)` : `${open.length} open`;
  return `      <div class="stat"><span class="label">Open questions</span><span class="badge warn">${escapeHtml(label)}</span></div>\n`;
}

/** The model page's invariant catalog (GH #3 item 2's "invariant chips with
 *  cross-slice links" at the model level): every declared INV id, its rule
 *  text (from the owning slice's own invariant list), the owning slice, and
 *  every other slice citing it — all linked. Empty string for a model that
 *  declares none. */
export function invariantCatalogSection(catalog: DocInvariantCatalogEntry[], slices: DocJsonSlice[]): string {
  if (catalog.length === 0) return "";
  const byKey = new Map(slices.map((s) => [s.key, s]));
  const rows = catalog
    .map((entry) => {
      const owning = byKey.get(entry.owningSlice);
      const text = owning?.invariants.find((i) => i.id === entry.id)?.text ?? null;
      const refs = entry.referencingSlices
        .map((k) => `<a href="slices/${escapeHtml(k)}.html">${escapeHtml(byKey.get(k)?.name ?? k)}</a>`)
        .join(", ");
      return `      <tr>
        <td>${invChip(entry.id, `slices/${entry.owningSlice}.html#inv-${entry.id.toLowerCase()}`)}</td>
        <td>${text ? escapeHtml(text) : `<span class="no-doc">no rule text</span>`}</td>
        <td><a href="slices/${escapeHtml(entry.owningSlice)}.html">${escapeHtml(owning?.name ?? entry.owningSlice)}</a></td>
        <td>${refs || "&mdash;"}</td>
      </tr>`;
    })
    .join("\n");
  return `    <h2>Invariants</h2>
    <table>
      <thead><tr><th>Id</th><th>Rule</th><th>Owned by</th><th>Cited by</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>\n`;
}
