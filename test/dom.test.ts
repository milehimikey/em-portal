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
    expect(firstRowCells.length).toBe(3);
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
});
