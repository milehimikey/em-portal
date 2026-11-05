// SPDX-License-Identifier: MIT
// Unit tests for the search client's matching core — evaluating EXACTLY the
// shipped JS (SEARCH_CORE_JS, the same string build.ts writes into
// search.js) against a bare object standing in for `window`, so the scoring
// the tests pin down is the scoring a browser runs, not a TS re-statement
// of it.

import { describe, it, expect } from "vitest";
import { SEARCH_CORE_JS } from "../src/pages/searchClient.js";
import { SearchEntry } from "../src/searchIndex.js";

interface SearchApi {
  tokenize(q: string): string[];
  scoreEntry(entry: SearchEntry, tokens: string[]): number;
  search(entries: SearchEntry[], q: string, limit: number): SearchEntry[];
}

function loadCore(): SearchApi {
  const windowStub: { __emPortalSearch?: SearchApi } = {};
  new Function("window", SEARCH_CORE_JS)(windowStub);
  return windowStub.__emPortalSearch!;
}

function entry(overrides: Partial<SearchEntry>): SearchEntry {
  return { type: "slice", title: "", detail: "", model: "Test Model", text: "", href: "x.html", ...overrides };
}

describe("search client core (shipped JS)", () => {
  const api = loadCore();

  it("ranks exact title > title prefix > title substring > detail > hidden text", () => {
    const entries = [
      entry({ title: "Checkout", href: "exact.html" }),
      entry({ title: "Checkout Screen", href: "prefix.html" }),
      entry({ title: "Fast Checkout Path", href: "substring.html" }),
      entry({ title: "Pay", detail: "the checkout follow-up", href: "detail.html" }),
      entry({ title: "Receipts", text: "checkout receipt", href: "text.html" }),
    ];
    const hits = api.search(entries, "checkout", 10);
    expect(hits.map((h) => h.href)).toEqual(["exact.html", "prefix.html", "substring.html", "detail.html", "text.html"]);
  });

  it("requires every token to match somewhere (AND semantics)", () => {
    const entries = [
      entry({ title: "Order Placed", href: "both.html" }),
      entry({ title: "Order Cancelled", href: "one.html" }),
    ];
    const hits = api.search(entries, "order placed", 10);
    expect(hits.map((h) => h.href)).toEqual(["both.html"]);
  });

  it("matches INV ids case-insensitively", () => {
    const entries = [entry({ type: "invariant", title: "INV-CHK-1", detail: "positive total", href: "inv.html" })];
    expect(api.search(entries, "inv-chk-1", 10)).toHaveLength(1);
    expect(api.search(entries, "positive", 10)).toHaveLength(1);
  });

  it("returns nothing for an empty or whitespace query, and caps at the limit", () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry({ title: `Slice ${i}`, href: `${i}.html` }));
    expect(api.search(entries, "   ", 10)).toEqual([]);
    expect(api.search(entries, "slice", 10)).toHaveLength(10);
  });
});
