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
});
