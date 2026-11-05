// SPDX-License-Identifier: MIT
// Types for `em export --doc-json` (GH #401, docExportSchemaVersion 1.0 as of
// em 1.21.0) — the structured slice-doc export: per slice the frontmatter
// join plus the parsed sections AS DATA (field tables, invariants, scenarios,
// error flows, open questions), and a model-level invariant catalog. This is
// the surface the portal's component layer is driven by, so no portal code
// ever re-reads or re-parses `slices/*.md` itself (GH #3 item 2). Same
// tolerant-of-unknown-fields posture as exportDoc.ts.
//
// `html` (present because the portal passes `--include-html`) is em's own
// SECTION-AWARE render (em repo catalog/sliceDocRender.ts, GH #402): scenario
// cards (`.scenario-card`), INV chips (`.inv-chip`, with in-doc definition
// anchors `#inv-<id>` and `.inv-chip--external` for ids the doc doesn't
// declare), and `.field-table` classes — the baseline the portal styles and
// exceeds (cross-slice chip links) rather than re-implements.

import { SliceDocJoin } from "./exportDoc.js";

/** One field-table row as data: `name`/`type` are the table's first two
 *  columns; `notes` is the remaining column(s) joined with " · ", verbatim
 *  as `em slice sync` wrote them. */
export interface DocFieldRow {
  name: string;
  type: string;
  notes: string;
}

/** The generated field table for one element of a slice. Derived from the
 *  MODEL (em's buildSliceRegions), not the doc — present even for a slice
 *  with no doc bound, which is what lets the portal show a contract section
 *  on every slice page. */
export interface DocFieldGroup {
  element: string;
  kind: "command" | "event" | "view";
  fields: DocFieldRow[];
}

/** One invariant of a slice: model `invariant` lines win (`source: "model"`);
 *  a doc's own `**INV-X:**` label is the 1.13-era fallback (`source: "doc"`). */
export interface DocInvariant {
  id: string;
  text: string | null;
  source: "model" | "doc";
}

export interface DocScenario {
  title: string;
  given: string[];
  when: string[];
  then: string[];
}

export interface DocOpenQuestion {
  text: string;
  checked: boolean;
  /** The `v<n>` a `deferred to v<n>` marker names, or null. */
  deferredToVersion: number | null;
}

export interface DocJsonSlice {
  key: string;
  name: string;
  pattern: string;
  /** Byte-identical to the model export's `slice.doc`. */
  frontmatter: SliceDocJoin;
  fields: DocFieldGroup[];
  invariants: DocInvariant[];
  scenarios: DocScenario[];
  errorFlows: string[];
  openQuestions: DocOpenQuestion[];
  /** em's section-aware HTML render of the doc body (`--include-html`);
   *  null when no usable doc is bound. */
  html?: string | null;
}

/** One entry of the model-level invariant catalog: the slice that declares
 *  the id, and every OTHER slice whose doc body mentions it — the join the
 *  portal's cross-slice invariant chips are built from. */
export interface DocInvariantCatalogEntry {
  id: string;
  owningSlice: string;
  source: "model" | "doc";
  referencingSlices: string[];
}

export interface DocJsonExportDoc {
  schemaVersion: string;
  generator: { name: string; version: string };
  source: { path: string; sha256: string };
  model: {
    name: string | null;
    key: string;
    invariants: DocInvariantCatalogEntry[];
    slices: DocJsonSlice[];
  };
  diagnostics: unknown[];
}

/** Versioned independently of the model export's schemaVersion, on purpose
 *  (em emit/docJson.ts) — 1.0 as of em 1.21.0; same major-only check as
 *  export/status/system. */
export function checkDocJsonSchemaCompatible(doc: DocJsonExportDoc): string | null {
  const major = doc.schemaVersion?.split(".")[0];
  if (major !== "1") {
    return `em export --doc-json schemaVersion ${doc.schemaVersion} has a different major version than the 1.x line em-portal was built against — slice pages may be incomplete or wrong.`;
  }
  return null;
}
