// SPDX-License-Identifier: MIT
// MIL-173: unit tests for the deep-link URL scheme itself, independent of a
// full site build — parse/build round-trips and the edge cases the scheme
// has to survive (a slug carrying a `~2` dedupe suffix, a slice-level link
// with no element fragment, a non-portal string).

import { describe, it, expect } from "vitest";
import { elementDeepLink, parseDeepLink, parseElementRef, sliceUrl } from "../src/refs.js";

describe("parseElementRef", () => {
  it("splits a plain ref into sliceKey/kind/slug", () => {
    expect(parseElementRef("checkout/command.submit-payment")).toEqual({
      sliceKey: "checkout",
      kind: "command",
      slug: "submit-payment",
    });
  });

  it("keeps a dedupe suffix as part of the slug, not the kind", () => {
    // em export suffixes a same-kind-same-name collision on the SLUG side
    // (`event.payment-requested~2`), never the kind — see docs/cli.md.
    expect(parseElementRef("checkout/event.payment-requested~2")).toEqual({
      sliceKey: "checkout",
      kind: "event",
      slug: "payment-requested~2",
    });
  });

  it("throws on a string with no slash", () => {
    expect(() => parseElementRef("not-a-ref")).toThrow();
  });

  it("throws on a string with a slash but no dot after it", () => {
    expect(() => parseElementRef("checkout/nodothere")).toThrow();
  });
});

describe("sliceUrl / elementDeepLink", () => {
  it("builds a slice page URL from a model key and slice key", () => {
    expect(sliceUrl("order-fulfillment", "checkout")).toBe("order-fulfillment/slices/checkout.html");
  });

  it("builds a full deep link as the slice URL plus a ref fragment", () => {
    expect(elementDeepLink("order-fulfillment", "checkout/command.submit-payment")).toBe(
      "order-fulfillment/slices/checkout.html#checkout/command.submit-payment",
    );
  });

  it("derives the slice segment from the ref itself, not a separately-passed slice key", () => {
    // The whole point of building the URL from the ref is that the caller
    // never has to separately track/pass a matching sliceKey — it's already
    // encoded in the ref's own prefix.
    const link = elementDeepLink("m", "return-confirmation/event.return-accepted");
    expect(link).toBe("m/slices/return-confirmation.html#return-confirmation/event.return-accepted");
  });
});

describe("parseDeepLink", () => {
  it("round-trips a link built by elementDeepLink", () => {
    const link = elementDeepLink("order-fulfillment", "checkout/command.submit-payment");
    expect(parseDeepLink(link)).toEqual({
      modelKey: "order-fulfillment",
      sliceKey: "checkout",
      elementRef: "checkout/command.submit-payment",
    });
  });

  it("round-trips a slice-level link (no element fragment)", () => {
    const link = sliceUrl("order-fulfillment", "checkout");
    expect(parseDeepLink(link)).toEqual({
      modelKey: "order-fulfillment",
      sliceKey: "checkout",
      elementRef: null,
    });
  });

  it("returns null for the site's own landing page", () => {
    expect(parseDeepLink("index.html")).toBeNull();
  });

  it("returns null for an external URL", () => {
    expect(parseDeepLink("https://example.com/checkout/slices/checkout.html")).toBeNull();
  });

  it("returns null for a model index page (no /slices/ segment)", () => {
    expect(parseDeepLink("order-fulfillment/index.html")).toBeNull();
  });
});
