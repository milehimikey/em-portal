// SPDX-License-Identifier: MIT
// Unit tests for renderSlicePage's doc-metadata rendering (ratifiedBy/
// ratifiedOn, schema 1.8 MIL-165; owner/tracking, schema 1.9 MIL-171).
// Written against real content pulled from meridian-goods during the em
// 1.9.0 integration pass: none of that project's slice docs actually set
// these fields yet (an accurate, if unglamorous, finding — see the PR
// description), so there was no real fixture to build an end-to-end test
// against. These are synthetic SliceDocJoin values instead, isolating
// exactly the rendering logic that has to be right whenever a doc DOES set
// them.

import { describe, it, expect } from "vitest";
import { renderSlicePage } from "../../src/pages/slice.js";
import { EmSlice, SliceDocJoin } from "../../src/em/exportDoc.js";

function makeDoc(overrides: Partial<SliceDocJoin> = {}): SliceDocJoin {
  return {
    found: true,
    path: "slices/checkout.md",
    reason: null,
    status: "implemented",
    version: 2,
    implementedIn: null,
    splitFrom: null,
    mergedFrom: [],
    supersededBy: [],
    driftSignal: "in-sync",
    ratifiedBy: null,
    ratifiedOn: null,
    shipped: null,
    owner: null,
    tracking: null,
    conformedVersion: null,
    conformedAt: null,
    conformedOn: null,
    ...overrides,
  };
}

function makeSlice(doc: SliceDocJoin): EmSlice {
  return {
    key: "checkout",
    name: "Checkout",
    index: 0,
    line: 1,
    source: null,
    storyline: null,
    pattern: "state-change",
    doc,
    elements: [
      {
        ref: "checkout/command.submit-payment",
        kind: "command",
        name: "Submit Payment",
        line: 2,
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
      },
    ],
  };
}

function render(doc: SliceDocJoin): string {
  const slice = makeSlice(doc);
  return renderSlicePage({
    modelName: "Order Fulfillment",
    modelKey: "order-fulfillment",
    diagramFile: "../diagram.svg",
    sliceDiagramFile: "checkout.svg",
    slice,
    pattern: slice.pattern,
    doc,
    docBodyHtml: "<p>body</p>",
    hasCanvas: false,
  });
}

describe("renderSlicePage — ratifiedBy (MIL-165, schema 1.8)", () => {
  it("shows who ratified the doc and when, together", () => {
    const html = render(makeDoc({ ratifiedBy: "Alex Chen", ratifiedOn: "2026-08-20" }));
    expect(html).toContain("Ratified by");
    expect(html).toContain("Alex Chen");
    expect(html).toContain("2026-08-20");
  });

  it("renders a plain 'not recorded' note, not a warning, when absent", () => {
    // Routine, not a defect: many implemented docs predate ratifiedBy, or
    // were ratified by hand before the feature existed (docs/cli.md).
    const html = render(makeDoc({ ratifiedBy: null, ratifiedOn: null }));
    expect(html).toContain("not recorded");
    expect(html).not.toContain("badge warn\">not recorded");
  });
});

describe("renderSlicePage — shipped record (MIL-283, schema 1.15)", () => {
  it("shows the shipped version and date when a version has shipped", () => {
    const html = render(
      makeDoc({
        shipped: { version: 2, ratifiedRef: "a".repeat(40), implementedIn: "https://github.com/x/y/pull/7", on: "2026-10-12" },
      }),
    );
    expect(html).toContain("Shipped");
    expect(html).toContain("v2");
    expect(html).toContain("2026-10-12");
  });

  it("renders a bare 'shipped' badge for a pre-1.15 record with no version", () => {
    const html = render(makeDoc({ shipped: { version: null, ratifiedRef: null, implementedIn: null, on: null } }));
    expect(html).toContain(">shipped</span>");
  });

  it("renders a plain 'not shipped' note, not a warning, when nothing has shipped", () => {
    const html = render(makeDoc({ shipped: null }));
    expect(html).toContain("not shipped");
    expect(html).not.toContain('badge warn">not shipped');
  });
});

describe("renderSlicePage — certification (MIL-214, schema 1.15)", () => {
  it("shows the certified version, short revision, and date", () => {
    const html = render(makeDoc({ conformedVersion: 2, conformedAt: "0123456789abcdef0123456789abcdef01234567", conformedOn: "2026-10-13" }));
    expect(html).toContain("Certified");
    expect(html).toContain("v2");
    expect(html).toContain("<code>0123456</code>");
    expect(html).toContain("2026-10-13");
  });

  it("keeps a non-sha revision string whole", () => {
    const html = render(makeDoc({ conformedVersion: 1, conformedAt: "release-2026-10", conformedOn: null }));
    expect(html).toContain("<code>release-2026-10</code>");
  });

  it("renders a plain 'not certified' note when never certified — em's expected post-ship default", () => {
    const html = render(makeDoc({ conformedVersion: null, conformedAt: null, conformedOn: null, driftSignal: "uncertified" }));
    expect(html).toContain("not certified");
    expect(html).toContain("uncertified");
    expect(html).not.toContain('badge bad">uncertified');
  });
});

describe("renderSlicePage — owner/tracking (MIL-171, schema 1.9)", () => {
  it("shows both when both are set", () => {
    const html = render(makeDoc({ owner: "Team Checkout", tracking: "https://tracker.example/CHK-42" }));
    expect(html).toContain("Owner:");
    expect(html).toContain("Team Checkout");
    expect(html).toContain("Tracking:");
    expect(html).toContain('href="https://tracker.example/CHK-42"');
  });

  it("renders a non-URL tracking value as plain code, not a broken link", () => {
    const html = render(makeDoc({ owner: null, tracking: "CHK-42" }));
    expect(html).toContain("<code>CHK-42</code>");
    expect(html).not.toContain('href="CHK-42"');
  });

  it("omits the owner/tracking line entirely when both are absent (no empty-field clutter)", () => {
    const html = render(makeDoc({ owner: null, tracking: null }));
    expect(html).not.toContain("Owner:");
    expect(html).not.toContain("Tracking:");
  });

  it("shows owner alone when tracking is absent", () => {
    const html = render(makeDoc({ owner: "Team Checkout", tracking: null }));
    expect(html).toContain("Owner:");
    expect(html).toContain("Team Checkout");
    expect(html).not.toContain("Tracking:");
  });
});
