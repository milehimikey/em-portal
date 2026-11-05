// SPDX-License-Identifier: MIT
// Types for `em system --json` (systemSchemaVersion 2.0, docs/cli.md in the
// em repo). Same tolerant-of-unknown-fields posture as exportDoc.ts — only
// the fields em-portal reads are declared. The portal reads `contextMap`,
// which em's own docs call "the org-level view em-portal renders": models
// are nodes, `consumes` bindings are edges (one per ordered producer →
// consumer pair, `seams` counting the bindings). The map counts the declared
// topology whether or not each binding verified — a failing binding shows up
// in diagnostics, never silently drops off the map.

export interface SystemContextNode {
  key: string;
  name: string;
  owner: string[];
}

export interface SystemContextEdge {
  from: string;
  to: string;
  seams: number;
}

export interface SystemDoc {
  systemSchemaVersion: string;
  generator: { name: string; version: string };
  /** Null when the system was discovered from a directory instead. */
  manifest: { path: string; sha256: string; name: string | null } | null;
  contextMap: {
    nodes: SystemContextNode[];
    edges: SystemContextEdge[];
  };
}

export function checkSystemSchemaCompatible(doc: SystemDoc): string | null {
  const major = doc.systemSchemaVersion?.split(".")[0];
  if (major !== "2") {
    return `em system systemSchemaVersion ${doc.systemSchemaVersion} has a different major version than the 2.x line em-portal was built against — the system map may be incomplete or wrong.`;
  }
  return null;
}
