// SPDX-License-Identifier: MIT
// MIL-173: the portal's URL scheme, built entirely on `em export`'s own
// stable identifiers — a slice's `key` and an element's `ref`
// (`<sliceKey>/<kind>.<slug>`, docs/cli.md in the em repo). One addressing
// scheme for both audiences: an agent citing a ref via `em query`/MCP and a
// stakeholder clicking a portal link name the same element, and the scheme
// survives re-renders and model growth because it depends only on export's
// ref-stability guarantee (inserting/reordering slices never changes an
// existing ref) — never on layout, coordinates, or this portal's own
// directory-naming choices for a model (`src/slug.ts`, portal-local, not
// part of the addressing scheme itself).
//
// A slice page's URL already IS that slice's export key
// (`<model-key>/slices/<sliceKey>.html`) — no separate per-element page is
// needed, since an element's ref always starts with its own slice's key.
// An element-level deep link is that same page plus a `#`-fragment of the
// element's full ref, so `<model-key>/slices/<sliceKey>.html#<ref>` and
// `<model-key>/<ref>` carry the exact same three pieces of information
// (model, slice, element) — just spelled with `/slices/` and `.html#`
// standing in for the ref's own internal `/`.

export interface ParsedElementRef {
  sliceKey: string;
  kind: string;
  slug: string;
}

/** Splits an `em export` element ref (`<sliceKey>/<kind>.<slug>`) into its
 *  three parts. `sliceKey` never contains `/` or `.` (kebab-slug, dedupe
 *  suffix `~2`/`~3`/... only); `kind` is a single bare word (`ui`, `command`,
 *  `event`, ...) and never contains `.`, so splitting on the FIRST `.` after
 *  the slice-key boundary is always unambiguous even though `slug` itself
 *  can carry a `~2`-style suffix. Throws on a string that doesn't have the
 *  `/` + `.` shape at all — a caller should never see that for a ref that
 *  actually came from `em export`. */
export function parseElementRef(ref: string): ParsedElementRef {
  const slashIndex = ref.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`not an em export element ref (missing "/"): ${ref}`);
  }
  const sliceKey = ref.slice(0, slashIndex);
  const rest = ref.slice(slashIndex + 1);
  const dotIndex = rest.indexOf(".");
  if (dotIndex === -1) {
    throw new Error(`not an em export element ref (missing "." after "/"): ${ref}`);
  }
  return { sliceKey, kind: rest.slice(0, dotIndex), slug: rest.slice(dotIndex + 1) };
}

/** The page URL for a whole slice, relative to the site root. */
export function sliceUrl(modelKey: string, sliceKey: string): string {
  return `${modelKey}/slices/${sliceKey}.html`;
}

/** The full portable deep link to one element: the slice page's URL plus a
 *  `#`-fragment of its own `em export` ref. Portable in the sense that it's
 *  exactly what you'd bookmark, paste into a doc, or hand to another tool —
 *  resolving it never requires knowing anything beyond the model key (a
 *  portal-build-time choice) and the ref itself (an em-export-time one). */
export function elementDeepLink(modelKey: string, ref: string): string {
  const { sliceKey } = parseElementRef(ref);
  return `${sliceUrl(modelKey, sliceKey)}#${ref}`;
}

export interface ParsedDeepLink {
  modelKey: string;
  sliceKey: string;
  /** The element ref's `<kind>.<slug>` fragment, or `null` for a slice-level
   *  link with no element fragment. */
  elementRef: string | null;
}

const DEEP_LINK_PATTERN = /^([^/]+)\/slices\/([^/]+)\.html(?:#(.+))?$/;

/** The inverse of `sliceUrl`/`elementDeepLink` — parses a portal-relative
 *  deep link back into its model/slice/element parts. Returns `null` for
 *  anything that isn't shaped like a page this portal generates (the site's
 *  own `index.html`, an external URL, ...), rather than throwing — a caller
 *  resolving an arbitrary string should treat "not a portal deep link" as a
 *  normal outcome. */
export function parseDeepLink(link: string): ParsedDeepLink | null {
  const match = DEEP_LINK_PATTERN.exec(link);
  if (!match) return null;
  const [, modelKey, sliceKey, elementRef] = match;
  return { modelKey, sliceKey, elementRef: elementRef ?? null };
}
