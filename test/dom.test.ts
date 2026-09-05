// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// DOM-level assertions over the generated static pages — parses each page's
// HTML the way a browser would (JSDOM) and asserts on the resulting element
// tree, complementing build.test.ts's string/file-presence checks. Mirrors
// the em repo's own test/viewerBehavior.test.ts convention of driving
// generated markup through a real DOM rather than only grepping strings.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPortal } from "../src/build.js";

const FIXTURES = join(__dirname, "fixtures");
const ORDER_FULFILLMENT = join(FIXTURES, "order-fulfillment", "order-fulfillment.em");

describe("generated pages (DOM)", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "em-portal-dom-test-"));
    await buildPortal([ORDER_FULFILLMENT], { outDir, title: "DOM Test Portal" });
  });

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("landing page: title, stat tiles, and a link to the model page resolve in the DOM", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelector("title")?.textContent).toBe("DOM Test Portal");
    expect(doc.querySelector("h1")?.textContent).toBe("State of the system");

    const stats = doc.querySelectorAll(".stat");
    expect(stats.length).toBeGreaterThanOrEqual(4);

    const modelLink = Array.from(doc.querySelectorAll("a")).find((a) => a.getAttribute("href") === "order-fulfillment/index.html");
    expect(modelLink).toBeTruthy();
    expect(modelLink?.textContent).toBe("Order Fulfillment");
  });

  it("model page: diagram object embed and slice links resolve in the DOM", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "index.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const diagram = doc.querySelector("object.diagram");
    expect(diagram?.getAttribute("data")).toBe("diagram.svg");
    expect(diagram?.getAttribute("type")).toBe("image/svg+xml");

    const sliceLink = doc.querySelector('a[href="slices/checkout.html"]');
    expect(sliceLink).toBeTruthy();
    expect(sliceLink?.textContent).toBe("Checkout");
  });

  it("slice page: the elements table lists every element with its kind and name", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const rows = doc.querySelectorAll("table tbody tr");
    expect(rows.length).toBeGreaterThan(0);
    const firstRowCells = rows[0].querySelectorAll("td");
    expect(firstRowCells.length).toBe(4);
  });

  it("slice page: every element row carries a stable ref id addressable by fragment (MIL-173)", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const rows = doc.querySelectorAll("table tbody tr[id]");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of Array.from(rows)) {
      const id = row.getAttribute("id")!;
      // em export ref shape: <sliceKey>/<kind>.<slug>
      expect(id).toMatch(/^checkout\/[a-z]+\.[a-z0-9-]+$/);
      // A same-page fragment link exists pointing right back at this id.
      // (Attribute-value selector, not an ID selector, so no CSS.escape is
      // needed even though `id` itself contains "/" and "." — jsdom doesn't
      // ship CSS.escape.)
      const permalink = doc.querySelector(`a[href="#${id}"]`);
      expect(permalink).toBeTruthy();
    }
  });

  it("slice page: breadcrumbs link back up to the model and the site root", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const homeLink = doc.querySelector("header > a");
    expect(homeLink?.getAttribute("href")).toBe("../../index.html");

    const crumbLinks = doc.querySelectorAll(".crumbs a");
    expect(crumbLinks.length).toBe(2);
    expect(crumbLinks[0].getAttribute("href")).toBe("..");
    expect(crumbLinks[0].textContent).toBe("Order Fulfillment");
  });

  it("slice page: the rendered doc body appears as real DOM nodes, not escaped text", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "slices", "checkout.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const docSection = doc.querySelector(".doc");
    expect(docSection).toBeTruthy();
    expect(docSection?.querySelector("h1, h2")).toBeTruthy();
  });

  it("walkthrough page (MIL-174): 14 step panels, one visible, the rest hidden, in a real DOM", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "walkthrough.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const panels = doc.querySelectorAll(".wt-step");
    expect(panels.length).toBe(14);
    expect(panels[0].hasAttribute("hidden")).toBe(false);
    for (let i = 1; i < panels.length; i++) {
      expect(panels[i].hasAttribute("hidden")).toBe(true);
    }
  });

  it("walkthrough page: the model's own diagram is inlined as a real <svg>, not an <object> embed", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "walkthrough.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    const svg = doc.querySelector("#wt-diagram");
    expect(svg?.tagName.toLowerCase()).toBe("svg");
    expect(doc.querySelectorAll("[data-slice]").length).toBeGreaterThan(0);
    expect(doc.querySelector("object.diagram")).toBeNull();
  });

  it("walkthrough page: Prev starts disabled, Next and the exit link resolve back to the model page", async () => {
    const html = await readFile(join(outDir, "order-fulfillment", "walkthrough.html"), "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelector("#wt-prev")?.hasAttribute("disabled")).toBe(true);
    expect(doc.querySelector("#wt-next")).toBeTruthy();
    const exitLink = Array.from(doc.querySelectorAll("a")).find((a) => a.textContent === "Exit walkthrough");
    expect(exitLink?.getAttribute("href")).toBe("index.html");
  });
});
