// SPDX-License-Identifier: MIT
// Shared summary shapes passed between build.ts and the page builders.

import { SlicePattern } from "../em/exportDoc.js";
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
  key: string;
  name: string;
  file: string;
  sliceCount: number;
  slices: SliceSummary[];
}

export interface PortalSummary {
  title: string;
  models: ModelSummary[];
  crossModelLinks: CrossModelLink[];
}
