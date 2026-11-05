// SPDX-License-Identifier: MIT
// The hand-authored content layer (GH #3 item 2): MDX lives HERE — the site
// layer — never in slice docs, per em#396's constraint (slice `.md` docs
// stay canonical plain markdown; a team's hand-written narrative is a
// site concern). `--content <dir>` names a directory of `.mdx` files:
//
//   <dir>/index.mdx         landing-page narrative (above the status rollup)
//   <dir>/<model-key>.mdx   that model's intro, under its page's h1
//
// Compiled AT BUILD TIME (@mdx-js/mdx evaluate -> preact render-to-string)
// into the same self-contained static HTML every other page is — no client
// runtime, no hydration, nothing fetched. That is the recorded outcome of
// the issue's Starlight-vs-bespoke evaluation: Astro/Starlight's output
// needs a server-ish base (absolute asset paths, client JS) and inverts the
// portal's data-driven architecture around authored content collections,
// while the portal's hard constraints (mil-162: fully static, file://
// works, pages self-contained) are exactly what the bespoke generator
// already guarantees — so MDX joins the generator as a compile step rather
// than the generator moving into a framework.
//
// MDX files get a small component set matching the portal's own CSS
// (html.ts): <Badge kind="ok|warn|bad">, <InvChip id href?>. Imports inside
// an .mdx file resolve relative to the file itself (evaluate's baseUrl), so
// shared snippets between content files work the normal ESM way.

import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evaluate } from "@mdx-js/mdx";
import { h, Fragment, ComponentChildren } from "preact";
import * as jsxRuntime from "preact/jsx-runtime";
import { render } from "preact-render-to-string";

const COMPONENTS = {
  Badge: ({ kind, children }: { kind?: "ok" | "warn" | "bad"; children?: ComponentChildren }) =>
    h("span", { class: `badge${kind ? ` ${kind}` : ""}` }, children),
  InvChip: ({ id, href }: { id: string; href?: string }) =>
    href ? h("a", { class: "inv-chip", href }, id) : h("span", { class: "inv-chip" }, id),
};

/** Compiles and renders one `.mdx` file to static HTML. Throws on a compile
 *  error — a broken content file should fail the build loudly, exactly like
 *  a model that doesn't compile, not ship a half-rendered page. */
export async function renderMdxFile(path: string): Promise<string> {
  const source = await readFile(path, "utf8");
  const mod = await evaluate(source, {
    ...jsxRuntime,
    Fragment,
    baseUrl: pathToFileURL(path).href,
  });
  return render(h(mod.default, { components: COMPONENTS }));
}

/** Every `.mdx` file in a content directory (basenames). The build consumes
 *  `index.mdx` and `<model-key>.mdx` as it goes and warns about leftovers —
 *  an unconsumed file is almost always a typo'd model key, surfaced instead
 *  of silently skipped. */
export async function listMdxFiles(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith(".mdx")).sort();
}
