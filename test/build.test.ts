// SPDX-License-Identifier: MIT
// End-to-end build test: runs the real `em-portal build` pipeline (which
// shells out to the real, packed `em` CLI — see package.json's
// `@milehimikey/em` devDependency) over the fixture models copied from the em
// repo's examples/order-fulfillment and examples/multi-model (see
// README.md's "Test fixtures" section for how those were captured). This is
// the only place em-portal's export-ingestion layer is exercised against a
// real em binary rather than hand-built fixtures.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPortal } from "../src/build.js";

const FIXTURES = join(__dirname, "fixtures");
const ORDER_FULFILLMENT = join(FIXTURES, "order-fulfillment", "order-fulfillment.em");
const CHECKOUT = join(FIXTURES, "multi-model", "models", "checkout", "checkout.em");
const FULFILLMENT = join(FIXTURES, "multi-model", "models", "fulfillment", "fulfillment.em");
const PRODUCER = join(FIXTURES, "cross-model", "producer", "producer.em");
const CONSUMER = join(FIXTURES, "cross-model", "consumer", "consumer.em");

describe("buildPortal", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "em-portal-build-test-"));
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("builds a multi-model site from real em export/status/render output", async () => {
    const result = await buildPortal([ORDER_FULFILLMENT, CHECKOUT, FULFILLMENT], {
      outDir,
      title: "Test Portal",
    });

    expect(result.models).toBe(3);
    expect(result.slices).toBeGreaterThan(0);
    expect(result.totalMs).toBeGreaterThan(0);
  });

  it("writes a landing index page with the em status rollup", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain("Test Portal");
    expect(html).toContain("State of the system");
    expect(html).toContain("implemented");
    expect(html).toContain("Drift signal");
    expect(html).toContain("order-fulfillment/index.html");
    expect(html).toContain("checkout/index.html");
    expect(html).toContain("fulfillment/index.html");
  });

  it("gives each model its own output directory, even when two models share a slice name", async () => {
    // examples/multi-model deliberately declares "Checkout" as a slice name in BOTH
    // the checkout and fulfillment models (see that example's own README) — this is
    // the exact collision em-portal's one-directory-per-model layout must survive.
    expect(existsSync(join(outDir, "checkout", "slices", "checkout.html"))).toBe(true);
    expect(existsSync(join(outDir, "fulfillment", "slices", "checkout.html"))).toBe(true);

    const checkoutSlice = await readFile(join(outDir, "checkout", "slices", "checkout.html"), "utf8");
    const fulfillmentSlice = await readFile(join(outDir, "fulfillment", "slices", "checkout.html"), "utf8");
    expect(checkoutSlice).not.toBe(fulfillmentSlice);
  });

  it("writes a diagram and per-slice diagrams for each model", async () => {
    expect(existsSync(join(outDir, "order-fulfillment", "diagram.svg"))).toBe(true);
    expect(existsSync(join(outDir, "order-fulfillment", "slices", "checkout.svg"))).toBe(true);
    const svg = await readFile(join(outDir, "order-fulfillment", "diagram.svg"), "utf8");
    expect(svg).toContain("<svg");
  });

  it("renders the shipped record and certification from em 1.21's doc join", async () => {
    // order-fulfillment/slices/checkout.md carries the full shipped+certified
    // frontmatter (shippedVersion/shippedOn, conformedVersion/At/On) — the
    // real `em export` join, not a synthetic doc, drives these stats.
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.html"), "utf8");
    expect(html).toContain("Shipped");
    expect(html).toContain("2026-10-12");
    expect(html).toContain("Certified");
    expect(html).toContain("4f2a9c05d1b");
    expect(html).toContain("in-sync");
  });

  it("renders a bound slice doc's markdown body, not just its frontmatter", async () => {
    // order-fulfillment/slices/checkout.md has real prose in it (see fixtures/README) —
    // em export's own doc join never carries the body (frontmatter only), so this
    // is exercising em-portal's own docBody.ts markdown pass.
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.html"), "utf8");
    expect(html).toContain('class="doc"');
    expect(html).toContain("Intent");
  });

  it("is deterministic: building the same inputs twice produces byte-identical pages", async () => {
    const outDir2 = await mkdtemp(join(tmpdir(), "em-portal-build-test-2-"));
    try {
      await buildPortal([ORDER_FULFILLMENT], { outDir: outDir2, title: "Test Portal" });
      const a = await readFile(join(outDir, "order-fulfillment", "index.html"), "utf8");
      const b = await readFile(join(outDir2, "order-fulfillment", "index.html"), "utf8");
      expect(a).toBe(b);
    } finally {
      await rm(outDir2, { recursive: true, force: true });
    }
  });

  it("refuses with a clear error when a model fails to compile", async () => {
    const badFile = join(FIXTURES, "invalid", "broken.em");
    await expect(buildPortal([badFile], { outDir: join(outDir, "should-not-exist") })).rejects.toThrow();
  });

  it("gives every element row a stable ref id, matching src/refs.ts's parseElementRef shape", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.html"), "utf8");
    // em export ref shape: <sliceKey>/<kind>.<slug>
    expect(html).toMatch(/id="checkout\/command\.[a-z0-9-]+"/);
    // The visible permalink cites the same ref as its link text.
    expect(html).toMatch(/href="#checkout\/command\.[a-z0-9-]+"/);
  });
});

describe("buildPortal — storyline canvas and system map (GH #4)", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "em-portal-storyline-test-"));
    // Multi-model fixture FIRST: the system.yaml walk-up starts from the
    // first input, and fixtures/multi-model/system.yaml is what gives the
    // landing page its system map. order-fulfillment rides along as the
    // model WITHOUT storylines.
    await buildPortal([CHECKOUT, FULFILLMENT, ORDER_FULFILLMENT], { outDir, title: "Storyline Test Portal" });
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("renders em's storyline canvas (map.html + one SVG per storyline) for each model with storylines", async () => {
    expect(existsSync(join(outDir, "checkout", "storylines", "map.html"))).toBe(true);
    expect(existsSync(join(outDir, "checkout", "storylines", "buy-something.svg"))).toBe(true);
    expect(existsSync(join(outDir, "fulfillment", "storylines", "map.html"))).toBe(true);
    expect(existsSync(join(outDir, "fulfillment", "storylines", "fulfil-an-order.svg"))).toBe(true);
    expect(existsSync(join(outDir, "fulfillment", "storylines", "handle-a-return.svg"))).toBe(true);
  });

  it("writes no storylines directory for a model without storyline blocks", async () => {
    expect(existsSync(join(outDir, "order-fulfillment", "storylines"))).toBe(false);
  });

  it("leads the model page with the storyline list and canvas link instead of the full diagram", async () => {
    const html = await readFile(join(outDir, "fulfillment", "index.html"), "utf8");
    expect(html).toContain("Storylines");
    expect(html).toContain('href="storylines/map.html"');
    expect(html).toContain('href="storylines/fulfil-an-order.svg"');
    expect(html).toContain("after Fulfil an order");
    // Storylines section comes BEFORE the demoted full-diagram embed.
    expect(html.indexOf("storylines/map.html")).toBeLessThan(html.indexOf('data="diagram.svg"'));
  });

  it("keeps the diagram-first layout for a model without storylines", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "index.html"), "utf8");
    expect(html).not.toContain("Storylines");
    expect(html).toContain('data="diagram.svg"');
  });

  it("renders the system map from em system's contextMap on the landing page", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain("System map");
    expect(html).toContain("1 seam");
    // Both nodes link to their model's storyline canvas.
    expect(html).toContain('href="checkout/storylines/map.html"');
    expect(html).toContain('href="fulfillment/storylines/map.html"');
  });

  it("shows the slice's storyline on its page, linked to the canvas", async () => {
    const html = await readFile(join(outDir, "fulfillment", "slices", "receive-order.html"), "utf8");
    expect(html).toContain('<a href="../storylines/map.html">Fulfil an order</a>');
  });

  it("teaches the walkthrough on the first storyline, not the full diagram, when storylines exist", async () => {
    const html = await readFile(join(outDir, "fulfillment", "walkthrough.html"), "utf8");
    expect(html).toContain("Taught on the <strong>Fulfil an order</strong> storyline");
    expect(html).toContain('href="storylines/map.html"');
    // The inlined teaching diagram is the storyline's own render: its
    // em-slices metadata carries the storyline's slices, renumbered from 0,
    // and nothing from the "Handle a return" storyline.
    const svgStart = html.indexOf('<svg id="wt-diagram"');
    const svg = html.slice(svgStart, html.indexOf("</svg>", svgStart));
    expect(svg).toContain("Receive Order");
    expect(svg).not.toContain("Return Confirmation");
    expect(svg).toContain('data-slice="0"');
    // Inlined storyline doc links got the model-root prefix, not ../.
    expect(svg).not.toContain('href="../slices/');
  });

  it("keeps the full-diagram walkthrough, without a scope note, for a model with no storylines", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "walkthrough.html"), "utf8");
    expect(html).not.toContain("Taught on the");
    expect(html).toContain("Browse Catalog");
  });

  it("strips fixed dimensions from rendered SVG roots so diagrams resize (viewBox kept)", async () => {
    for (const file of [
      join(outDir, "order-fulfillment", "diagram.svg"),
      join(outDir, "order-fulfillment", "slices", "checkout.svg"),
      join(outDir, "fulfillment", "storylines", "fulfil-an-order.svg"),
    ]) {
      const svg = await readFile(file, "utf8");
      const root = svg.slice(svg.indexOf("<svg"), svg.indexOf(">", svg.indexOf("<svg")) + 1);
      expect(root).toContain("viewBox=");
      expect(root).not.toMatch(/\swidth="/);
      expect(root).not.toMatch(/\sheight="/);
    }
  });

  it("retargets em's slice-doc links in every rendered artifact to the portal's slice pages", async () => {
    // em bakes hrefs to `slices/<key>.md` (relative to the SOURCE tree) into
    // every SVG; the portal rewrites known slice keys to its own pages.
    const diagram = await readFile(join(outDir, "order-fulfillment", "diagram.svg"), "utf8");
    expect(diagram).toContain('href="slices/checkout.html"');
    expect(diagram).not.toMatch(/href="[^"]*slices\/checkout\.md"/);
    const sliceSvg = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.svg"), "utf8");
    expect(sliceSvg).toContain('href="checkout.html"');
  });
});

describe("buildPortal — component layer + MDX content (GH #3 item 2)", () => {
  let outDir: string;
  const CONTENT = join(FIXTURES, "multi-model", "content");

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "em-portal-components-test-"));
    await buildPortal([CHECKOUT, FULFILLMENT, ORDER_FULFILLMENT], {
      outDir,
      title: "Component Test Portal",
      content: CONTENT,
    });
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("renders slice doc bodies through em's section-aware renderer (scenario cards, field tables)", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "view-open-orders.html"), "utf8");
    expect(html).toContain('class="scenario-card"');
    expect(html).toContain("scenario-step--given");
    expect(html).toContain('class="field-table"');
  });

  it("upgrades em's external INV chips into cross-slice links via the invariant catalog", async () => {
    // view-open-orders.md cites INV-BC-1, which browse-catalog owns — em
    // renders that as an unlinked external chip; the portal links it to the
    // owning slice's page, landing on em's own definition anchor.
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "view-open-orders.html"), "utf8");
    expect(html).toContain('href="browse-catalog.html#inv-inv-bc-1"');
  });

  it("gives every slice page an Invariants row with its own declared ids", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "view-open-orders.html"), "utf8");
    expect(html).toContain("Invariants");
    expect(html).toContain("INV-VOO-1");
  });

  it("surfaces open questions as a stat from the structured export", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "view-open-orders.html"), "utf8");
    expect(html).toContain("Open questions");
    expect(html).toContain("1 open");
  });

  it("renders the model page's invariant catalog with rule text and owning-slice links", async () => {
    const html = await readFile(join(outDir, "fulfillment", "index.html"), "utf8");
    expect(html).toContain("INV-FUL-1");
    expect(html).toContain("accepted at most once");
    expect(html).toContain('href="slices/receive-order.html"');
  });

  it("renders a Contract section from structured fields on a doc-less slice", async () => {
    // fixtures/multi-model has no slices/*.md at all, so receive-order's
    // field tables can only come from --doc-json's model-derived data.
    const html = await readFile(join(outDir, "fulfillment", "slices", "receive-order.html"), "utf8");
    expect(html).toContain("Contract");
    expect(html).toContain('class="field-table"');
    expect(html).toContain("orderId");
  });

  it("compiles index.mdx into the landing narrative, with the portal component set", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain("Welcome to the example system");
    expect(html).toContain('class="badge ok"');
    expect(html).toContain('class="inv-chip"');
  });

  it("compiles <model-key>.mdx into that model page's intro", async () => {
    const html = await readFile(join(outDir, "checkout", "index.html"), "utf8");
    expect(html).toContain("owns the buying journey");
    const other = await readFile(join(outDir, "fulfillment", "index.html"), "utf8");
    expect(other).not.toContain("owns the buying journey");
  });

  it("writes a search index covering slices, elements, invariants, and open issues (GH #3 item 3)", async () => {
    const raw = await readFile(join(outDir, "search-index.json"), "utf8");
    const { entries } = JSON.parse(raw) as { entries: Array<{ type: string; title: string; href: string }> };
    const types = new Set(entries.map((e) => e.type));
    expect(types).toContain("slice");
    expect(types).toContain("command");
    expect(types).toContain("event");
    expect(types).toContain("view");
    expect(types).toContain("invariant");
    expect(types).toContain("issue");
    // Invariant hits land on em's definition anchor in the owning slice.
    const inv = entries.find((e) => e.type === "invariant" && e.title === "INV-FUL-1")!;
    expect(inv.href).toBe("fulfillment/slices/receive-order.html#inv-inv-ful-1");
    // Element hits use the portal's deep-link scheme (refs.ts).
    const event = entries.find((e) => e.type === "event" && e.title === "Order Submitted")!;
    expect(event.href).toMatch(/^checkout\/slices\/checkout\.html#checkout\/event\./);
    // The fixture's one open issue is findable by its text.
    expect(entries.some((e) => e.type === "issue" && e.title.includes("status has no event source"))).toBe(true);
  });

  it("ships the search client and wires the box into every page at the right depth", async () => {
    expect(existsSync(join(outDir, "search.js"))).toBe(true);
    const landing = await readFile(join(outDir, "index.html"), "utf8");
    expect(landing).toContain('id="portal-search"');
    expect(landing).toContain('<script src="search.js" defer>');
    const slicePage = await readFile(join(outDir, "fulfillment", "slices", "receive-order.html"), "utf8");
    expect(slicePage).toContain('<script src="../../search.js" defer>');
    const modelPage = await readFile(join(outDir, "fulfillment", "index.html"), "utf8");
    expect(modelPage).toContain('<script src="../search.js" defer>');
  });

  it("warns about a content file matching no model key instead of silently skipping it", async () => {
    const tmpContent = await mkdtemp(join(tmpdir(), "em-portal-content-typo-"));
    const tmpOut = await mkdtemp(join(tmpdir(), "em-portal-content-typo-out-"));
    try {
      await writeFile(join(tmpContent, "chekout.mdx"), "typo'd model key\n", "utf8");
      const result = await buildPortal([ORDER_FULFILLMENT], { outDir: tmpOut, content: tmpContent });
      expect(result.warnings.some((w) => w.includes("chekout.mdx"))).toBe(true);
    } finally {
      await rm(tmpContent, { recursive: true, force: true });
      await rm(tmpOut, { recursive: true, force: true });
    }
  });
});

describe("buildPortal — guided first read (MIL-174)", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "em-portal-walkthrough-test-"));
    await buildPortal([ORDER_FULFILLMENT], { outDir, title: "Walkthrough Test Portal" });
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("emits a walkthrough page for the model", async () => {
    expect(existsSync(join(outDir, "order-fulfillment", "walkthrough.html"))).toBe(true);
  });

  it("links to the walkthrough from the model page ('First read')", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "index.html"), "utf8");
    expect(html).toContain('href="walkthrough.html"');
    expect(html).toContain("First read");
  });

  it("links to the first model's walkthrough from the landing page", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain('href="order-fulfillment/walkthrough.html"');
    expect(html).toContain("First read");
  });

  it("embeds the step data as a JSON blob covering all 14 steps, and the inline diagram it spotlights", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "walkthrough.html"), "utf8");
    expect(html).toContain('<script type="application/json" id="wt-data">');
    expect(html).toContain('"id":"intro"');
    expect(html).toContain('"id":"pattern-state-change"');
    expect(html).toContain('"id":"marker-note"');
    expect(html).toContain('"id":"next"');
    // The model's own diagram is inlined (not <object>-embedded) so the
    // client-side spotlight script can reach its data-slice nodes directly.
    expect(html).toContain('id="wt-diagram"');
    expect(html).toContain("data-slice=");
    expect(html).not.toContain("<?xml");
  });

  it("teaches with real element/slice names from THIS model, not placeholder copy", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "walkthrough.html"), "utf8");
    // order-fulfillment's first event/command are "Order Placed"/"Place Order" (Browse Catalog slice).
    expect(html).toContain("Order Placed");
    expect(html).toContain("Place Order");
    // This fixture model has a real Automation slice (Capture Payment) but no Translation slice.
    expect(html).toContain("Capture Payment");
    expect(html).toContain("This model has no Translation slice yet");
  });

  it("gives the walkthrough Next/Prev controls and a keyboard/exit affordance", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "walkthrough.html"), "utf8");
    expect(html).toContain('id="wt-prev"');
    expect(html).toContain('id="wt-next"');
    expect(html).toContain("Exit walkthrough");
    expect(html).toContain("ArrowRight");
    expect(html).toContain("ArrowLeft");
  });
});

describe("buildPortal — cross-model deep links (MIL-173)", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "em-portal-cross-model-test-"));
    await buildPortal([PRODUCER, CONSUMER], { outDir, title: "Cross-model test" });
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("resolves the producer's public event against the consumer's matching element names", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain("Cross-model links");
    expect(html).toContain("Signal Emitted");
  });

  it("links each side of a cross-model link straight to the specific element, not just the model page", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain('href="producer/slices/emit-signal.html#emit-signal/event.signal-emitted"');
    expect(html).toContain('href="consumer/slices/react-to-signal.html#react-to-signal/command.handle-signal-emitted"');
  });

  it("every deep link on the landing page resolves to a real anchor id on its target page", async () => {
    const producerSlice = await readFile(join(outDir, "producer", "slices", "emit-signal.html"), "utf8");
    expect(producerSlice).toContain('id="emit-signal/event.signal-emitted"');
    const consumerSlice = await readFile(join(outDir, "consumer", "slices", "react-to-signal.html"), "utf8");
    expect(consumerSlice).toContain('id="react-to-signal/command.handle-signal-emitted"');
  });
});
