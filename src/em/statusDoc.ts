// SPDX-License-Identifier: MIT
// Types for `em status --json` (statusSchemaVersion 1.1+, docs/cli.md in the
// em repo). Same tolerant-of-unknown-fields posture as exportDoc.ts.

export interface StatusConformanceEntry {
  file: string;
  modelDir: string;
  hasStateFile: boolean;
  lastConformance: { date: string; revision: string } | null;
  repo: string;
  commitsBehindHead: number | null;
  slicePRsBehindHead: number | null;
  error: string | null;
}

export interface StatusInvariants {
  testsDir: string;
  total: number;
  cited: number;
  uncovered: number;
}

export interface StatusDoc {
  statusSchemaVersion: string;
  generator: { name: string; version: string };
  files: string[];
  slices: {
    total: number;
    byStatus: {
      draft: number;
      reviewed: number;
      readyToImplement: number;
      implemented: number;
      noDoc: number;
      frontmatterInvalid: number;
      unknown: number;
    };
  };
  driftSignal: {
    inSync: number;
    neverImplemented: number;
    unpropagatedDelta: number;
    implementedWithoutLink: number;
    notApplicable: number;
    frontmatterInvalid: number;
  };
  invariants: StatusInvariants | null;
  issues: {
    openIssues: number;
    openQuestionsTotal: number;
    openQuestionsUnchecked: number;
  };
  conformance: StatusConformanceEntry[];
  diagnostics: unknown[];
}

export function checkStatusSchemaCompatible(doc: StatusDoc): string | null {
  const major = doc.statusSchemaVersion?.split(".")[0];
  if (major !== "1") {
    return `em status statusSchemaVersion ${doc.statusSchemaVersion} has a different major version than the 1.x line em-portal was built against — output may be incomplete or wrong.`;
  }
  return null;
}
