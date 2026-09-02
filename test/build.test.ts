// SPDX-License-Identifier: MIT
// End-to-end build test: runs the real `em-portal build` pipeline (which
// shells out to the real, packed `em` CLI — see package.json's
// `@milehimikey/em` devDependency) over the fixture models copied from the em
// repo's examples/order-fulfillment and examples/multi-model (see
// README.md's "Test fixtures" section for how those were captured). This is
// the only place em-portal's export-ingestion layer is exercised against a
// real em binary rather than hand-built fixtures.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
