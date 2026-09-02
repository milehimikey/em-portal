// SPDX-License-Identifier: MIT
// MIL-174: build-time derivation of the "guided first read" walkthrough's
// steps — a pure, deterministic function of one model's own `em export`
// document. This is deliberately separate from src/pages/walkthrough.ts
// (which turns these into HTML + the client-side stepper's JSON blob), the
// same split crossModel.ts (pure join) / pages/index.ts (HTML) already uses:
// keeps "which element did we pick, and why" unit-testable without a DOM or
// an HTML string to grep.
//
// Per docs/decisions/mil-162-teachable-navigator.md's "guided first read"
// property, every example the walkthrough teaches with is a REAL element
// from the team's own model, picked deterministically — first occurrence in
// model order (slice order, then element-declaration order within a slice),
// never randomly and never hardcoded copy. A model with no matching element
// (a pattern this model doesn't use, a marker kind it never sets, or a model
// with zero slices at all) degrades honestly: the step still appears (so the
// reader learns the full vocabulary and the progress count stays stable),
// but its body says so instead of pointing at nothing — never a broken
// reference, never a silently-vanished step.

import { EmElement, EmModel, EmSlice, ExportDoc, SlicePattern } from "./em/exportDoc.js";

/** The four canonical patterns taught by the walkthrough, in the order
 *  they're introduced — "unclassified" (a slice em couldn't classify) is
 *  never one of them; it isn't a pattern a reader should learn as normal
 *  vocabulary. */
export const TAUGHT_PATTERNS: readonly SlicePattern[] = ["state-change", "state-view", "automation", "translation"];

export const PATTERN_LABEL: Record<SlicePattern, string> = {
  "state-change": "State Change",
  "state-view": "State View",
  automation: "Automation",
  translation: "Translation",
  unclassified: "Unclassified",
};

export interface WalkthroughElementPick {
  ref: string;
  kind: string;
  name: string;
  sliceKey: string;
  sliceName: string;
  sliceIndex: number;
}

interface BaseStep {
  id: string;
  title: string;
  /** Which slice (by `EmSlice.index`) the inline diagram should spotlight
   *  while this step is active, or `null` to show the whole diagram at full
   *  opacity — used for steps that aren't anchored to one slice (swimlanes,
   *  status, where-to-go-next). */
  sliceIndex: number | null;
}

export interface IntroStep extends BaseStep {
  kind: "intro";
  modelName: string;
  firstSlice: { key: string; name: string; index: number } | null;
}

export interface ElementStep extends BaseStep {
  kind: "event" | "command" | "view";
  element: WalkthroughElementPick | null;
  /** `view` only: the names this view's `from` clause cites, when present —
   *  "always built from events" is easier to believe pointing at the actual
   *  source name(s). */
  fromNames: string[] | null;
}

export interface SwimlanesStep extends BaseStep {
  kind: "swimlanes";
  personas: string[];
  contexts: string[];
}

export interface PatternStep extends BaseStep {
  kind: "pattern";
  pattern: SlicePattern;
  patternLabel: string;
  found: boolean;
  slice: { key: string; name: string; index: number } | null;
  /** The matched slice's own elements, in declaration order, so the
   *  renderer can narrate its actual flow (e.g. ui -> command -> event) —
   *  empty when `found` is false. */
  elements: WalkthroughElementPick[];
}

export type MarkerKind = "note" | "issue" | "divergence";

export interface MarkerStep extends BaseStep {
  kind: "marker";
  marker: MarkerKind;
  found: boolean;
  element: WalkthroughElementPick | null;
  /** The marker's own text: the note's doc path, the issue's question, or
   *  the divergence's rationale. */
  text: string | null;
}

export interface StatusStep extends BaseStep {
  kind: "status";
  exampleStatus: { sliceKey: string; sliceName: string; status: string } | null;
  exampleRatified: { sliceKey: string; sliceName: string; ratifiedBy: string; ratifiedOn: string | null } | null;
}

export interface NextStep extends BaseStep {
  kind: "next";
  firstSlice: { key: string; name: string } | null;
}

export type WalkthroughStep =
  | IntroStep
  | ElementStep
  | SwimlanesStep
  | PatternStep
  | MarkerStep
  | StatusStep
  | NextStep;

function toPick(el: EmElement, slice: EmSlice): WalkthroughElementPick {
  return {
    ref: el.ref,
    kind: el.kind,
    name: el.name,
    sliceKey: slice.key,
    sliceName: slice.name,
    sliceIndex: slice.index,
  };
}

/** First element of `kind` in model order (slice order, then declaration
 *  order within the slice) — the deterministic "pick a real example" rule
 *  every step in this module follows. `null` for a model with no element of
 *  that kind at all (including a model with zero slices). */
function firstElementOfKind(model: EmModel, kind: string): { el: EmElement; slice: EmSlice } | null {
  for (const slice of model.slices) {
    for (const el of slice.elements) {
      if (el.kind === kind) return { el, slice };
    }
  }
  return null;
}

/** First slice (in model order) classified as `pattern`, or `null` if this
 *  model has none — the "skip patterns the model doesn't contain, saying
 *  so" case. */
function firstSliceOfPattern(model: EmModel, pattern: SlicePattern): EmSlice | null {
  return model.slices.find((s) => s.pattern === pattern) ?? null;
}

/** First element (model order) carrying a non-null value for `field`, or
 *  `null` if no element in this model sets that marker at all. */
function firstElementWithMarker(
  model: EmModel,
  field: "note" | "issue" | "divergence",
): { el: EmElement; slice: EmSlice } | null {
  for (const slice of model.slices) {
    for (const el of slice.elements) {
      if (el[field]) return { el, slice };
    }
  }
  return null;
}

function buildIntroStep(model: EmModel): IntroStep {
  const first = model.slices[0] ?? null;
  return {
    id: "intro",
    kind: "intro",
    title: "Reading the picture",
    sliceIndex: first?.index ?? null,
    modelName: model.name ?? "this model",
    firstSlice: first ? { key: first.key, name: first.name, index: first.index } : null,
  };
}

function buildElementStep(model: EmModel, kind: "event" | "command" | "view"): ElementStep {
  const found = firstElementOfKind(model, kind);
  const titleByKind: Record<"event" | "command" | "view", string> = {
    event: "Event",
    command: "Command",
    view: "View / read model",
  };
  return {
    id: kind,
    kind,
    title: titleByKind[kind],
    sliceIndex: found?.slice.index ?? null,
    element: found ? toPick(found.el, found.slice) : null,
    fromNames: kind === "view" && found?.el.from ? found.el.from.map((f) => f.name) : null,
  };
}

function buildSwimlanesStep(model: EmModel): SwimlanesStep {
  return {
    id: "swimlanes",
    kind: "swimlanes",
    title: "Personas & swimlanes",
    sliceIndex: null,
    personas: model.personas,
    contexts: model.contexts,
  };
}

function buildPatternSteps(model: EmModel): PatternStep[] {
  return TAUGHT_PATTERNS.map((pattern) => {
    const slice = firstSliceOfPattern(model, pattern);
    return {
      id: `pattern-${pattern}`,
      kind: "pattern",
      title: `Pattern: ${PATTERN_LABEL[pattern]}`,
      sliceIndex: slice?.index ?? null,
      pattern,
      patternLabel: PATTERN_LABEL[pattern],
      found: slice !== null,
      slice: slice ? { key: slice.key, name: slice.name, index: slice.index } : null,
      elements: slice ? slice.elements.map((el) => toPick(el, slice)) : [],
    };
  });
}

function buildMarkerSteps(model: EmModel): MarkerStep[] {
  const markers: { marker: MarkerKind; field: "note" | "issue" | "divergence"; title: string }[] = [
    { marker: "note", field: "note", title: "Marker: linked design doc" },
    { marker: "issue", field: "issue", title: "Marker: open question" },
    { marker: "divergence", field: "divergence", title: "Marker: accepted divergence" },
  ];
  return markers.map(({ marker, field, title }) => {
    const found = firstElementWithMarker(model, field);
    return {
      id: `marker-${marker}`,
      kind: "marker",
      title,
      sliceIndex: found?.slice.index ?? null,
      marker,
      found: found !== null,
      element: found ? toPick(found.el, found.slice) : null,
      text: found ? (found.el[field] as string | null) : null,
    };
  });
}

function buildStatusStep(model: EmModel): StatusStep {
  const withStatus = model.slices.find((s) => s.doc.found && s.doc.status);
  const withRatification = model.slices.find((s) => s.doc.found && s.doc.ratifiedBy);
  return {
    id: "status",
    kind: "status",
    title: "Status & ratification",
    sliceIndex: null,
    exampleStatus: withStatus
      ? { sliceKey: withStatus.key, sliceName: withStatus.name, status: withStatus.doc.status! }
      : null,
    exampleRatified: withRatification
      ? {
          sliceKey: withRatification.key,
          sliceName: withRatification.name,
          ratifiedBy: withRatification.doc.ratifiedBy!,
          ratifiedOn: withRatification.doc.ratifiedOn,
        }
      : null,
  };
}

function buildNextStep(model: EmModel): NextStep {
  const first = model.slices[0] ?? null;
  return {
    id: "next",
    kind: "next",
    title: "Where to go next",
    sliceIndex: null,
    firstSlice: first ? { key: first.key, name: first.name } : null,
  };
}

/** Derives the full, ordered "guided first read" step sequence for one
 *  model — always the same 14 steps in the same order (intro, event,
 *  command, view, swimlanes, the 4 patterns, the 3 markers, status, next),
 *  regardless of what the model contains, so the progress indicator ("Step
 *  N of 14") never has to depend on how much of the model's own vocabulary
 *  actually shows up. What differs per model is only each step's content —
 *  which real element/slice it points at, or, honestly, that it has none
 *  yet. */
export function buildWalkthroughSteps(doc: ExportDoc): WalkthroughStep[] {
  const model = doc.model;
  return [
    buildIntroStep(model),
    buildElementStep(model, "event"),
    buildElementStep(model, "command"),
    buildElementStep(model, "view"),
    buildSwimlanesStep(model),
    ...buildPatternSteps(model),
    ...buildMarkerSteps(model),
    buildStatusStep(model),
    buildNextStep(model),
  ];
}
