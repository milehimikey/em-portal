// SPDX-License-Identifier: MIT
// Types for `em export --json` (schemaVersion 1.8+, docs/cli.md in the em repo).
// Deliberately loose, not zod-validated: em's own versioning policy says
// "additive optional fields are a minor bump ... consumers must tolerate
// unknown fields" (docs/cli.md), and MIL-171 is landing owner:/tracking:
// fields on the doc join in parallel with this ticket. Plain `as` casts over
// `JSON.parse` already tolerate unknown fields for free — a strict schema
// validator (zod `.strict()`) would actively fight that contract, so this
// file only declares the fields em-portal actually reads, nothing more.

export interface EmGenerator {
  name: string;
  version: string;
}

export interface EmDiagnostic {
  severity: "error" | "warning" | string;
  code: string | null;
  message: string;
  line: number | null;
  refs: string[];
}

export interface DocLineageRef {
  raw: string;
  sliceKey: string | null;
  version: number | null;
}

export interface SliceDocJoin {
  found: boolean;
  /** The conventional `slices/<key>.md` path (relative to the `.em` file's own
   *  directory) this slice's doc binding resolves to — present even when
   *  `found` is false, so a consumer can point at exactly where a doc is
   *  expected. em export's `doc` field is frontmatter-only, never the
   *  rendered markdown body (see docs/cli.md) — em-portal reads and renders
   *  that body itself (src/em/docBody.ts) using this path, joined against
   *  the model file's own directory, the same sibling-file convention every
   *  other doc-aware em command uses. */
  path: string;
  reason: "no-doc-bound" | "binding-missing-file" | "frontmatter-invalid" | null;
  status: string | null;
  version: number | null;
  implementedIn: string | null;
  splitFrom: DocLineageRef[] | null;
  mergedFrom: DocLineageRef[] | null;
  supersededBy: DocLineageRef | DocLineageRef[] | null;
  driftSignal: "in-sync" | "never-implemented" | "unpropagated-delta" | "implemented-without-link" | null;
  ratifiedBy: string | null;
  ratifiedOn: string | null;
}

export interface TypeRef {
  name: string;
  ref: string;
  array: boolean;
}

export interface EmField {
  name: string;
  type: string | null;
  typeRef: TypeRef | null;
  tag: boolean;
  renamedFrom: string[] | null;
  assigned?: boolean;
}

export interface EmTag {
  key: string;
  kind: "identity" | "composite" | "external";
  fields: string[] | null;
  description: string | null;
}

export interface EmElement {
  ref: string;
  kind: string;
  name: string;
  line: number;
  fields: EmField[] | null;
  note: string | null;
  issue: string | null;
  divergence: string | null;
  from: { name: string; ref: string }[] | null;
  persona: string | null;
  context: string | null;
  again: boolean;
  public: boolean;
  tags: EmTag[] | null;
  renamedFrom: string[] | null;
  logicalRef: string | null;
}

export type SlicePattern = "state-change" | "state-view" | "automation" | "translation" | "unclassified";

export interface EmSlice {
  key: string;
  name: string;
  index: number;
  line: number;
  source: string | null;
  elements: EmElement[];
  pattern: SlicePattern;
  doc: SliceDocJoin;
}

export interface EmArrow {
  from: string;
  to: string;
  fromRef: string | null;
  toRef: string | null;
}

export interface EmNamedType {
  ref: string;
  name: string;
  line: number;
  fields: EmField[];
}

export interface EmModel {
  name: string | null;
  personas: string[];
  contexts: string[];
  hasAutomation: boolean;
  types: EmNamedType[];
  slices: EmSlice[];
  arrows: EmArrow[];
}

export interface ExportDoc {
  schemaVersion: string;
  generator: EmGenerator;
  source: { path: string; sha256: string };
  model: EmModel;
  diagnostics: EmDiagnostic[];
}

/** `schemaVersion` is `"<major>.<minor>"`. em-portal was written against the
 *  1.x line (docs/cli.md, 1.8 as of this writing) — this only checks the
 *  major version, per em's own "renames/removals are a major bump" policy;
 *  a minor bump (new optional field) is exactly what "tolerate unknown
 *  fields" means and is never flagged. */
export function checkExportSchemaCompatible(doc: ExportDoc): string | null {
  const major = doc.schemaVersion?.split(".")[0];
  if (major !== "1") {
    return `em export schemaVersion ${doc.schemaVersion} has a different major version than the 1.x line em-portal was built against — output may be incomplete or wrong.`;
  }
  return null;
}
