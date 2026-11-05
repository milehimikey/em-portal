// SPDX-License-Identifier: MIT
// The build-time search index (GH #3 item 3): one JSON document at the site
// root covering slices, invariants (id → definition → referencing slices),
// events/commands/read-models, and open issues — everything from data the
// build already holds (`em export` + `--doc-json`), no extra em passes. The
// client (src/pages/searchClient.ts) fetches it lazily and matches in the
// browser: no backend, hand-rolled scoring, no search dependency shipped.
//
// Every `href` is SITE-ROOT-RELATIVE (the same scheme src/refs.ts defines);
// the client prefixes its own root (derived from the script tag's src) so
// the index works from any page depth and under any base path.

import { ExportDoc } from "./em/exportDoc.js";
import { DocJsonExportDoc } from "./em/docJsonDoc.js";
import { elementDeepLink, sliceUrl } from "./refs.js";

export interface SearchEntry {
  /** "slice" | "command" | "event" | "view" | "invariant" | "issue" —
   *  surfaced as the hit's type label; also what the client's result list
   *  groups on. */
  type: string;
  title: string;
  /** One-line context under the title (pattern · status, rule text, …). */
  detail: string;
  /** The owning model's display name. */
  model: string;
  /** Extra matchable text never displayed (keys, field names, slugs). */
  text: string;
  /** Site-root-relative target. */
  href: string;
}

export interface SearchSource {
  modelKey: string;
  modelName: string;
  doc: ExportDoc;
  docJson: DocJsonExportDoc;
}

/** Element kinds the issue names: "events/commands/read-models". A ui or
 *  processor is navigation noise in search — its slice already matches. */
const INDEXED_KINDS = new Set(["command", "event", "view"]);

export function buildSearchIndex(models: SearchSource[]): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const { modelKey, modelName, doc, docJson } of models) {
    const docJsonByKey = new Map(docJson.model.slices.map((s) => [s.key, s]));

    for (const slice of doc.model.slices) {
      entries.push({
        type: "slice",
        title: slice.name,
        detail: [slice.pattern, slice.doc.status ?? "no doc"].join(" · "),
        model: modelName,
        text: [slice.key, slice.storyline ?? ""].join(" "),
        href: sliceUrl(modelKey, slice.key),
      });

      for (const el of slice.elements) {
        if (INDEXED_KINDS.has(el.kind)) {
          entries.push({
            type: el.kind,
            title: el.name,
            detail: `${el.kind} in ${slice.name}`,
            model: modelName,
            text: [el.ref, el.context ?? "", el.persona ?? "", ...(el.fields ?? []).map((f) => f.name)].join(" "),
            href: elementDeepLink(modelKey, el.ref),
          });
        }
        if (el.issue) {
          entries.push({
            type: "issue",
            title: el.issue,
            detail: `open issue on ${el.kind} ${el.name}`,
            model: modelName,
            text: [el.name, slice.name].join(" "),
            href: elementDeepLink(modelKey, el.ref),
          });
        }
      }
    }

    for (const inv of docJson.model.invariants) {
      const owning = docJsonByKey.get(inv.owningSlice);
      const rule = owning?.invariants.find((i) => i.id === inv.id)?.text ?? null;
      entries.push({
        type: "invariant",
        title: inv.id,
        detail: rule ?? "(no rule text)",
        model: modelName,
        text: [inv.owningSlice, ...inv.referencingSlices].join(" "),
        href: `${sliceUrl(modelKey, inv.owningSlice)}#inv-${inv.id.toLowerCase()}`,
      });
    }
  }

  return entries;
}
