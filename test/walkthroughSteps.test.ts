// SPDX-License-Identifier: MIT
// Unit tests for buildWalkthroughSteps (MIL-174) — the pure, deterministic
// step-derivation logic, isolated from HTML rendering the same way
// test/pages/slice.test.ts isolates renderSlicePage's doc-metadata logic:
// hand-built ExportDoc fixtures rather than a real `.em` file, since what's
// under test here is "which real element/slice did we pick, and why," not
// em's own compiler.

import { describe, it, expect } from "vitest";
import {
  buildWalkthroughSteps,
  ElementStep,
  MarkerStep,
  PatternStep,
  WalkthroughStep,
} from "../src/walkthroughSteps.js";
import { EmElement, EmModel, EmSlice, ExportDoc, SliceDocJoin } from "../src/em/exportDoc.js";

function makeDoc(overrides: Partial<SliceDocJoin> = {}): SliceDocJoin {
  return {
    found: false,
    path: "slices/x.md",
    reason: "no-doc-bound",
    status: null,
    version: null,
    implementedIn: null,
    splitFrom: null,
    mergedFrom: null,
    supersededBy: null,
    driftSignal: null,
    ratifiedBy: null,
    ratifiedOn: null,
    owner: null,
    tracking: null,
    ...overrides,
  };
}

function makeElement(overrides: Partial<EmElement> & { kind: string; name: string }): EmElement {
  const slug = overrides.name.toLowerCase().replace(/\s+/g, "-");
  return {
    ref: `slice/${overrides.kind}.${slug}`,
    line: 1,
    fields: null,
    note: null,
    issue: null,
    divergence: null,
    from: null,
    persona: null,
    context: null,
    again: false,
    public: false,
    tags: null,
    renamedFrom: null,
    logicalRef: null,
    ...overrides,
  };
}

function makeSlice(overrides: Partial<EmSlice> & { key: string; name: string; index: number }): EmSlice {
  return {
    line: overrides.index + 1,
    source: null,
    elements: [],
    pattern: "unclassified",
    doc: makeDoc(),
    ...overrides,
  };
}

function makeModel(overrides: Partial<EmModel> = {}): EmModel {
  return {
    name: "Test Model",
    personas: ["Customer"],
    contexts: ["Order"],
    hasAutomation: false,
    types: [],
    slices: [],
    arrows: [],
    ...overrides,
  };
}

function makeExportDoc(model: EmModel): ExportDoc {
  return {
    schemaVersion: "1.8",
    generator: { name: "em", version: "1.8.1" },
    source: { path: "test.em", sha256: "abc" },
    model,
    diagnostics: [],
  };
}

const EXPECTED_STEP_IDS = [
  "intro",
  "event",
  "command",
  "view",
  "swimlanes",
  "pattern-state-change",
  "pattern-state-view",
  "pattern-automation",
  "pattern-translation",
  "marker-note",
  "marker-issue",
  "marker-divergence",
  "status",
  "next",
];

describe("buildWalkthroughSteps — step sequence shape", () => {
  it("always returns the same 14 steps, in the same order, regardless of model content", () => {
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel()));
    expect(steps.map((s) => s.id)).toEqual(EXPECTED_STEP_IDS);
  });

  it("returns the same 14-step sequence even for a model with zero slices", () => {
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [] })));
    expect(steps.map((s) => s.id)).toEqual(EXPECTED_STEP_IDS);
    expect(steps).toHaveLength(14);
  });
});

describe("buildWalkthroughSteps — deterministic element picks", () => {
  it("picks the first event/command/view in model order (slice order, then declaration order)", () => {
    const sliceA = makeSlice({
      key: "browse",
      name: "Browse",
      index: 0,
      pattern: "state-change",
      elements: [
        makeElement({ kind: "ui", name: "Catalog" }),
        makeElement({ kind: "command", name: "Place Order" }),
        makeElement({ kind: "event", name: "Order Placed" }),
      ],
    });
    const sliceB = makeSlice({
      key: "checkout",
      name: "Checkout",
      index: 1,
      pattern: "state-change",
      elements: [
        makeElement({ kind: "command", name: "Submit Payment" }),
        makeElement({ kind: "event", name: "Payment Requested" }),
      ],
    });
    const doc = makeExportDoc(makeModel({ slices: [sliceA, sliceB] }));
    const steps = buildWalkthroughSteps(doc);

    const eventStep = steps.find((s) => s.id === "event") as ElementStep;
    expect(eventStep.element?.name).toBe("Order Placed");
    expect(eventStep.element?.sliceKey).toBe("browse");
    expect(eventStep.sliceIndex).toBe(0);

    const commandStep = steps.find((s) => s.id === "command") as ElementStep;
    expect(commandStep.element?.name).toBe("Place Order");

    // No `view` element anywhere in this fixture.
    const viewStep = steps.find((s) => s.id === "view") as ElementStep;
    expect(viewStep.element).toBeNull();
    expect(viewStep.sliceIndex).toBeNull();
  });

  it("never picks an element from a later slice when an earlier slice has one, even out of within-slice declaration order", () => {
    const slice = makeSlice({
      key: "s",
      name: "S",
      index: 0,
      elements: [
        makeElement({ kind: "event", name: "First Event" }),
        makeElement({ kind: "event", name: "Second Event" }),
      ],
    });
    const doc = makeExportDoc(makeModel({ slices: [slice] }));
    const steps = buildWalkthroughSteps(doc);
    const eventStep = steps.find((s) => s.id === "event") as ElementStep;
    expect(eventStep.element?.name).toBe("First Event");
  });

  it("carries a view's `from` names for the 'always built from events' explanation", () => {
    const slice = makeSlice({
      key: "s",
      name: "S",
      index: 0,
      elements: [
        makeElement({
          kind: "view",
          name: "Open Orders",
          from: [{ name: "Order Placed", ref: "s/event.order-placed" }],
        }),
      ],
    });
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [slice] })));
    const viewStep = steps.find((s) => s.id === "view") as ElementStep;
    expect(viewStep.element?.name).toBe("Open Orders");
    expect(viewStep.fromNames).toEqual(["Order Placed"]);
  });

  it("is deterministic: building the same model twice picks the exact same elements", () => {
    const build = () => {
      const slice = makeSlice({
        key: "s",
        name: "S",
        index: 0,
        elements: [makeElement({ kind: "event", name: "Order Placed" })],
      });
      return buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [slice] })));
    };
    const a = build();
    const b = build();
    expect(a.find((s) => s.id === "event")).toEqual(b.find((s) => s.id === "event"));
  });
});

describe("buildWalkthroughSteps — pattern coverage and skip-missing-patterns", () => {
  it("teaches each of the four patterns on the first slice classified with that pattern", () => {
    const slices: EmSlice[] = [
      makeSlice({ key: "a", name: "A", index: 0, pattern: "state-change", elements: [makeElement({ kind: "command", name: "Do A" })] }),
      makeSlice({ key: "b", name: "B", index: 1, pattern: "state-view", elements: [makeElement({ kind: "view", name: "View B" })] }),
      makeSlice({ key: "c", name: "C", index: 2, pattern: "automation", elements: [makeElement({ kind: "processor", name: "Proc C" })] }),
      makeSlice({ key: "d", name: "D", index: 3, pattern: "translation", elements: [makeElement({ kind: "translation", name: "Trans D" })] }),
    ];
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices })));
    const patternSteps = steps.filter((s): s is PatternStep => s.kind === "pattern");
    expect(patternSteps).toHaveLength(4);
    for (const step of patternSteps) {
      expect(step.found).toBe(true);
      expect(step.slice).not.toBeNull();
    }
    expect(patternSteps.find((s) => s.pattern === "state-change")?.slice?.key).toBe("a");
    expect(patternSteps.find((s) => s.pattern === "state-view")?.slice?.key).toBe("b");
    expect(patternSteps.find((s) => s.pattern === "automation")?.slice?.key).toBe("c");
    expect(patternSteps.find((s) => s.pattern === "translation")?.slice?.key).toBe("d");
  });

  it("skips a pattern the model doesn't contain — found: false, slice: null, elements: []", () => {
    const slices: EmSlice[] = [
      makeSlice({ key: "a", name: "A", index: 0, pattern: "state-change", elements: [] }),
    ];
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices })));
    const translationStep = steps.find((s) => s.id === "pattern-translation") as PatternStep;
    expect(translationStep.found).toBe(false);
    expect(translationStep.slice).toBeNull();
    expect(translationStep.elements).toEqual([]);
    expect(translationStep.sliceIndex).toBeNull();

    const automationStep = steps.find((s) => s.id === "pattern-automation") as PatternStep;
    expect(automationStep.found).toBe(false);
  });

  it("never matches an 'unclassified' slice to any of the four taught patterns", () => {
    const slices: EmSlice[] = [makeSlice({ key: "u", name: "U", index: 0, pattern: "unclassified", elements: [] })];
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices })));
    const patternSteps = steps.filter((s): s is PatternStep => s.kind === "pattern");
    for (const step of patternSteps) expect(step.found).toBe(false);
  });

  it("a zero-slice model reports every pattern as not found, without throwing", () => {
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [] })));
    const patternSteps = steps.filter((s): s is PatternStep => s.kind === "pattern");
    expect(patternSteps).toHaveLength(4);
    for (const step of patternSteps) {
      expect(step.found).toBe(false);
      expect(step.slice).toBeNull();
    }
  });
});

describe("buildWalkthroughSteps — markers (note/issue/divergence)", () => {
  it("finds the first element carrying each marker, independent of the others", () => {
    const slice = makeSlice({
      key: "s",
      name: "S",
      index: 0,
      elements: [
        makeElement({ kind: "event", name: "Noted Event", note: "notes/x.md" }),
        makeElement({ kind: "command", name: "Questioned Command", issue: "is this right?" }),
        makeElement({ kind: "event", name: "Diverged Event", divergence: "accepted: field renamed post-hoc" }),
      ],
    });
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [slice] })));
    const markerSteps = steps.filter((s): s is MarkerStep => s.kind === "marker");
    expect(markerSteps).toHaveLength(3);

    const note = markerSteps.find((s) => s.marker === "note")!;
    expect(note.found).toBe(true);
    expect(note.element?.name).toBe("Noted Event");
    expect(note.text).toBe("notes/x.md");

    const issue = markerSteps.find((s) => s.marker === "issue")!;
    expect(issue.found).toBe(true);
    expect(issue.element?.name).toBe("Questioned Command");
    expect(issue.text).toBe("is this right?");

    const divergence = markerSteps.find((s) => s.marker === "divergence")!;
    expect(divergence.found).toBe(true);
    expect(divergence.element?.name).toBe("Diverged Event");
  });

  it("an element with more than one marker is still findable by each marker independently", () => {
    const slice = makeSlice({
      key: "s",
      name: "S",
      index: 0,
      elements: [makeElement({ kind: "event", name: "Busy Event", note: "notes/x.md", issue: "open question", divergence: "accepted" })],
    });
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [slice] })));
    const markerSteps = steps.filter((s): s is MarkerStep => s.kind === "marker");
    for (const step of markerSteps) {
      expect(step.found).toBe(true);
      expect(step.element?.name).toBe("Busy Event");
    }
  });

  it("reports a marker as not found, honestly, when no element in the model sets it", () => {
    const slice = makeSlice({
      key: "s",
      name: "S",
      index: 0,
      elements: [makeElement({ kind: "event", name: "Plain Event" })],
    });
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [slice] })));
    const markerSteps = steps.filter((s): s is MarkerStep => s.kind === "marker");
    for (const step of markerSteps) {
      expect(step.found).toBe(false);
      expect(step.element).toBeNull();
      expect(step.text).toBeNull();
    }
  });
});

describe("buildWalkthroughSteps — status & ratification", () => {
  it("picks the first slice with a doc status, and separately the first with a ratifiedBy", () => {
    const slices: EmSlice[] = [
      makeSlice({ key: "a", name: "A", index: 0, doc: makeDoc({ found: true, status: "draft" }) }),
      makeSlice({ key: "b", name: "B", index: 1, doc: makeDoc({ found: true, status: "implemented", ratifiedBy: "Alex Chen", ratifiedOn: "2026-08-20" }) }),
    ];
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices })));
    const statusStep = steps.find((s) => s.id === "status") as import("../src/walkthroughSteps.js").StatusStep;
    expect(statusStep.exampleStatus).toEqual({ sliceKey: "a", sliceName: "A", status: "draft" });
    expect(statusStep.exampleRatified).toEqual({
      sliceKey: "b",
      sliceName: "B",
      ratifiedBy: "Alex Chen",
      ratifiedOn: "2026-08-20",
    });
  });

  it("reports no example, honestly, when no slice doc sets status or ratifiedBy", () => {
    const slices: EmSlice[] = [makeSlice({ key: "a", name: "A", index: 0, doc: makeDoc() })];
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices })));
    const statusStep = steps.find((s) => s.id === "status") as import("../src/walkthroughSteps.js").StatusStep;
    expect(statusStep.exampleStatus).toBeNull();
    expect(statusStep.exampleRatified).toBeNull();
  });
});

describe("buildWalkthroughSteps — intro and next steps", () => {
  it("anchors the intro step to the model's first slice", () => {
    const slices: EmSlice[] = [makeSlice({ key: "first", name: "First Slice", index: 0 })];
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ name: "My Model", slices })));
    const intro = steps[0] as WalkthroughStep & { kind: "intro" };
    expect(intro.kind).toBe("intro");
    expect((intro as any).modelName).toBe("My Model");
    expect((intro as any).firstSlice).toEqual({ key: "first", name: "First Slice", index: 0 });
    expect(intro.sliceIndex).toBe(0);
  });

  it("the next step points at the first slice for 'read a real slice', or null when there are none", () => {
    const withSlices = buildWalkthroughSteps(
      makeExportDoc(makeModel({ slices: [makeSlice({ key: "s", name: "S", index: 0 })] })),
    );
    const nextWith = withSlices.find((s) => s.id === "next") as import("../src/walkthroughSteps.js").NextStep;
    expect(nextWith.firstSlice).toEqual({ key: "s", name: "S" });

    const withoutSlices = buildWalkthroughSteps(makeExportDoc(makeModel({ slices: [] })));
    const nextWithout = withoutSlices.find((s) => s.id === "next") as import("../src/walkthroughSteps.js").NextStep;
    expect(nextWithout.firstSlice).toBeNull();
  });
});

describe("buildWalkthroughSteps — every step carries a resolvable sliceIndex or null", () => {
  it("swimlanes/status/next never spotlight a slice (sliceIndex null)", () => {
    const slices: EmSlice[] = [makeSlice({ key: "s", name: "S", index: 0, elements: [makeElement({ kind: "event", name: "E" })] })];
    const steps = buildWalkthroughSteps(makeExportDoc(makeModel({ slices })));
    for (const id of ["swimlanes", "status", "next"]) {
      expect(steps.find((s) => s.id === id)?.sliceIndex).toBeNull();
    }
  });
});
