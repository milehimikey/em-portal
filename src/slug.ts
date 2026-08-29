// SPDX-License-Identifier: MIT
// Portal-local slug/dedupe helpers for naming output directories (one per
// input model, mirroring `em catalog`'s convention). Deliberately NOT shared
// code with em's own src/util/slug.ts — em-portal is a separate package with
// no access to em's internals (see docs/decisions/mil-162-teachable-navigator.md
// in the em repo); slice keys and element refs always come straight from
// `em export`'s own JSON instead of being re-derived here.

export function kebabSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model";
}

/** Returns a slug unique within `used`, suffixing `~2`, `~3`, ... on collision
 *  (same separator em's own dedupe() uses, for a familiar convention) and
 *  records the chosen value into `used` before returning it. */
export function dedupe(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let n = 2;
  while (used.has(`${candidate}~${n}`)) n++;
  const deduped = `${candidate}~${n}`;
  used.add(deduped);
  return deduped;
}
