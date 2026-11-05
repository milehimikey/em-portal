// SPDX-License-Identifier: MIT
// Shared summary shapes passed between build.ts and the page builders.

import { SlicePattern } from "../em/exportDoc.js";
import { SystemDoc } from "../em/systemDoc.js";
import { CrossModelLink } from "../crossModel.js";

export interface SliceSummary {
  key: string;
  name: string;
  pattern: SlicePattern;
  hasDoc: boolean;
  status: string | null;
  driftSignal: string | null;
}

export interface ModelSummary {
  /** The portal's output-directory key (deduped across inputs). */
  key: string;
  name: string;
  /** em's own cross-model key (`model.key`, MIL-193) — what `em system`'s
   *  contextMap nodes carry. Equal to `key` except when the portal's
   *  collision dedupe suffixed the directory. */
  emKey: string;
  file: string;
  sliceCount: number;
  /** Whether this model's directory holds a storyline canvas
   *  (`storylines/map.html`, GH #4) — true exactly when the model declares
   *  storylines. */
  hasCanvas: boolean;
  slices: SliceSummary[];
}

export interface PortalSummary {
  title: string;
  models: ModelSummary[];
  crossModelLinks: CrossModelLink[];
  /** `em system --json`'s contextMap, when a `system.yaml` was found (or
   *  given) — null means the landing page has no system map section. */
  systemMap: SystemDoc["contextMap"] | null;
}
