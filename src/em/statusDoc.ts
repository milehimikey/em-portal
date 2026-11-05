// SPDX-License-Identifier: MIT
// Types for `em status --json` (statusSchemaVersion 1.12 as of em 1.21.0,
// docs/cli.md in the em repo). Same tolerant-of-unknown-fields posture as
// exportDoc.ts.

export interface StatusConformanceEntry {
  file: string;
  modelDir: string;
  hasStateFile: boolean;
  /** `partial` (schema 1.5, MIL-214): whether the marker was recorded with
   *  `em state set-conformance --partial` — a sweep that didn't cover the
   *  full shipped scope. */
  lastConformance: { date: string; revision: string; partial?: boolean } | null;
  repo: string;
  commitsBehindHead: number | null;
  slicePRsBehindHead: number | null;
  /** Unruled conformance findings in scope for this model's last conformance
   *  run (schema 1.5, MIL-214) — null when no findings JSON exists beside the
   *  recorded report. */
  unruledFindings: number | null;
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
      /** Working status `implemented` — the doc's current version is the shipped one. */
      implemented: number;
      /** Schema 1.9 (MIL-283): slices with a shipped record in ANY working
       *  status — `implemented` plus every slice whose next version is open
       *  (`draft`/`reviewed`/`ready-to-implement`) over a shipped one. The
       *  lifecycle headline since em 1.15. */
      shipped: number;
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
    /** Schema 1.5 (MIL-214): shipped slices whose current version has no
     *  matching conformance certification — expected post-ship default. */
    uncertified: number;
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
