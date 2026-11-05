// SPDX-License-Identifier: MIT
// Orchestrates the portal's static-site build: one `em export --json` +
// `em render` pass per input model, one `em status --json` pass across all of
// them, the cross-model link heuristic, then every page written to disk.
//
//   <outDir>/
//     index.html                 landing page: em status rollup + system map + model index
//     <model-key>/
//       index.html                model page: storylines (if any) + diagram + slice table
//       walkthrough.html          guided first read (MIL-174) over this model
//       diagram.svg
//       storylines/               only when the model declares storylines (GH #4)
//         map.html                 em's own canvas (`em render --map`) — one canvas
//         <storyline>.svg          implementation, em's page, never a portal re-implementation
//       slices/
//         <slice-key>.html        slice page: diagram, doc, driftSignal, PR link
//         <slice-key>.svg
//
// Every model gets its own output directory (mirroring `em catalog`'s
// convention) so slice keys from different models can never collide, even
// without a cross-file dedupe pass.

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { emExportDocJson, emExportJson, emRenderModel, emRenderSlice, emRenderStorylineMap, emStatusJson, emSystemJson } from "./em/run.js";
import { checkExportSchemaCompatible, ExportDoc } from "./em/exportDoc.js";
import { checkDocJsonSchemaCompatible, DocJsonExportDoc, DocJsonSlice } from "./em/docJsonDoc.js";
import { checkStatusSchemaCompatible, StatusDoc } from "./em/statusDoc.js";
import { checkSystemSchemaCompatible, SystemDoc } from "./em/systemDoc.js";
import { linkExternalInvChips, rewriteSiblingDocLinks } from "./pages/components.js";
import { listMdxFiles, renderMdxFile } from "./content.js";
import { buildSearchIndex, SearchSource } from "./searchIndex.js";
import { SEARCH_JS } from "./pages/searchClient.js";
import { buildCrossModelLinks, CompiledModel } from "./crossModel.js";
import { dedupe, kebabSlug } from "./slug.js";
import { renderIndexPage } from "./pages/index.js";
import { renderModelPage } from "./pages/model.js";
import { renderSlicePage } from "./pages/slice.js";
import { renderWalkthroughPage } from "./pages/walkthrough.js";
import { buildWalkthroughSteps } from "./walkthroughSteps.js";
import { ModelSummary, PortalSummary, SliceSummary } from "./pages/types.js";

export interface BuildOptions {
  outDir: string;
  title?: string;
  testsDir?: string;
  repo?: string;
  /** Path to a `system.yaml` manifest for the landing page's system map.
   *  When omitted, the nearest `system.yaml` above the first model file is
   *  used (same walk-up `em status` does: stop after the repo root — the
   *  first directory holding `.git` — or the filesystem root); when none is
   *  found, the landing page simply has no system map. */
  system?: string;
  /** Directory of hand-authored `.mdx` content (GH #3 item 2 — MDX is
   *  site-layer only, never slice docs): `index.mdx` is the landing
   *  narrative, `<model-key>.mdx` a model page's intro. Compiled to static
   *  HTML at build time (src/content.ts). */
  content?: string;
}

export interface BuildTiming {
  file: string;
  exportMs: number;
  renderMs: number;
}

export interface BuildResult {
  models: number;
  slices: number;
  crossModelLinks: number;
  warnings: string[];
  timing: BuildTiming[];
  statusTimingMs: number;
  totalMs: number;
}

/** Rewrites the slice-doc links em bakes into every rendered artifact (full
 *  diagram, slice/storyline SVGs, the canvas map.html) to the portal's own
 *  slice pages. em wraps each slice header in an `<a>` to its design doc —
 *  `slices/<key>.md` resolved RELATIVE TO THE SOURCE MODEL, so in a portal
 *  build the href climbs back into the source tree (`../../src/.../slices/
 *  checkout.md`): dead on any deployed site, and pointing at markdown even
 *  where it resolves. The portal serves those same slices as pages, so this
 *  keeps em's deep-link scheme working (GH #4 item 4) by retargeting every
 *  `.../slices/<key>.md` href whose key is a known slice to
 *  `<prefix><key>.html`. Unknown keys (another model's doc, a `notes/*.md`
 *  element note) are left alone rather than rewritten into 404s. */
export function rewriteSliceDocLinks(content: string, sliceKeys: ReadonlySet<string>, prefix: string): string {
  return content.replace(
    /((?:xlink:)?href=")([^"]*?)slices\/([a-z0-9][a-z0-9-]*)\.md(")/g,
    (match, attr: string, _lead: string, key: string, close: string) =>
      sliceKeys.has(key) ? `${attr}${prefix}${key}.html${close}` : match,
  );
}

/** The nearest `system.yaml` walking up from `file`'s own directory — the
 *  same stop conditions as em's own findSystemManifestAbove (cli/
 *  systemInputs.ts): give up after the repo root (the first directory
 *  holding `.git`) or at the filesystem root. */
function findSystemManifestAbove(file: string): string | null {
  let dir = resolve(dirname(file));
  for (;;) {
    const candidate = join(dir, "system.yaml");
    if (existsSync(candidate)) return candidate;
    if (existsSync(join(dir, ".git"))) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Makes a rendered SVG resize with its container/window: drops the root
 *  element's fixed `width`/`height` attributes, keeping `viewBox` (which em
 *  always writes). A viewBox-only SVG scales to fit — the browser window on
 *  direct navigation, the embedding element's CSS box in an `<object>`/
 *  inline embed — instead of rendering at a fixed canvas size that a big
 *  model blows straight past. First `<svg>` tag only: em's canvas map.html
 *  inlines SVGs with its own frame sizing and is never passed through here. */
export function responsiveSvg(content: string): string {
  return content.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, "")}>`);
}

/** Reads, rewrites (rewriteSliceDocLinks + responsiveSvg for SVGs), and
 *  writes back one rendered file. */
async function retargetFile(path: string, sliceKeys: ReadonlySet<string>, prefix: string): Promise<void> {
  const content = await readFile(path, "utf8");
  const rewritten = rewriteSliceDocLinks(content, sliceKeys, prefix);
  await writeFile(path, path.endsWith(".svg") ? responsiveSvg(rewritten) : rewritten, "utf8");
}

export async function buildPortal(files: string[], opts: BuildOptions): Promise<BuildResult> {
  const t0 = performance.now();
  if (files.length === 0) throw new Error("em-portal build: at least one model file is required");

  const outDir = opts.outDir;
  await mkdir(outDir, { recursive: true });

  const warnings: string[] = [];
  // Hand-authored MDX content (GH #3 item 2): compiled to static HTML up
  // front for index.mdx, per model inside the loop. `consumedContent`
  // tracks which files a page actually used so a leftover (typo'd model
  // key) warns instead of silently not appearing.
  const contentDir = opts.content ?? null;
  const consumedContent = new Set<string>();
  let landingNarrativeHtml: string | null = null;
  if (contentDir && existsSync(join(contentDir, "index.mdx"))) {
    landingNarrativeHtml = await renderMdxFile(join(contentDir, "index.mdx"));
    consumedContent.add("index.mdx");
  }

  const usedModelKeys = new Set<string>();
  const compiled: CompiledModel[] = [];
  const searchSources: SearchSource[] = [];
  const modelSummaries: ModelSummary[] = [];
  const timing: BuildTiming[] = [];
  let sliceCount = 0;

  for (const file of files) {
    const tExportStart = performance.now();
    const doc = (await emExportJson(file)) as ExportDoc;
    const exportWarning = checkExportSchemaCompatible(doc);
    if (exportWarning) warnings.push(`${file}: ${exportWarning}`);
    for (const d of doc.diagnostics) {
      if (d.severity === "warning") warnings.push(`${file}:${d.line ?? "?"}: ${d.message}`);
    }
    // GH #3 item 2: the structured slice-doc export drives the component
    // layer, and its `--include-html` body (em's section-aware render,
    // GH #402) replaced the portal's own markdown re-parse of slices/*.md.
    const docJson = (await emExportDocJson(file)) as DocJsonExportDoc;
    const docJsonWarning = checkDocJsonSchemaCompatible(docJson);
    if (docJsonWarning) warnings.push(`${file}: ${docJsonWarning}`);
    const docJsonByKey = new Map<string, DocJsonSlice>(docJson.model.slices.map((s) => [s.key, s]));
    const tExportEnd = performance.now();

    const modelKey = dedupe(kebabSlug(doc.model.name ?? basename(file, extname(file))), usedModelKeys);
    const modelDir = join(outDir, modelKey);
    const slicesDir = join(modelDir, "slices");
    await mkdir(slicesDir, { recursive: true });

    const sliceKeys: ReadonlySet<string> = new Set(doc.model.slices.map((s) => s.key));

    const tRenderStart = performance.now();
    const diagramFile = "diagram.svg";
    await emRenderModel(file, join(modelDir, diagramFile));
    await retargetFile(join(modelDir, diagramFile), sliceKeys, "slices/");

    // GH #4: the storyline canvas — em's own `em render --map` page, copied
    // as-is (one canvas implementation, em's, never a portal re-render).
    // `--map` refuses on a model with no storylines, so gate on the export.
    const hasCanvas = doc.model.storylines.length > 0;
    if (hasCanvas) {
      const storylinesDir = join(modelDir, "storylines");
      await emRenderStorylineMap(file, join(storylinesDir, "map.html"));
      for (const entry of await readdir(storylinesDir)) {
        if (entry.endsWith(".svg") || entry === "map.html") {
          await retargetFile(join(storylinesDir, entry), sliceKeys, "../slices/");
        }
      }
    }

    const sliceSummaries: SliceSummary[] = [];
    for (const slice of doc.model.slices) {
      const sliceDiagramFile = `${slice.key}.svg`;
      await emRenderSlice(file, slice.name, join(slicesDir, sliceDiagramFile));
      await retargetFile(join(slicesDir, sliceDiagramFile), sliceKeys, "");

      const docJsonSlice = docJsonByKey.get(slice.key);
      const rawBodyHtml = docJsonSlice?.html ?? null;
      const docBodyHtml = rawBodyHtml
        ? linkExternalInvChips(rewriteSiblingDocLinks(rawBodyHtml), docJson.model.invariants, slice.key)
        : null;

      const page = renderSlicePage({
        modelName: doc.model.name ?? modelKey,
        modelKey,
        diagramFile: `../${diagramFile}`,
        sliceDiagramFile,
        slice,
        pattern: slice.pattern,
        doc: slice.doc,
        docBodyHtml,
        hasCanvas,
        fields: docJsonSlice?.fields ?? [],
        invariants: docJsonSlice?.invariants ?? [],
        openQuestions: docJsonSlice?.openQuestions ?? [],
        invariantCatalog: docJson.model.invariants,
      });
      await writeFile(join(slicesDir, `${slice.key}.html`), page, "utf8");

      sliceSummaries.push({
        key: slice.key,
        name: slice.name,
        pattern: slice.pattern,
        hasDoc: slice.doc.found,
        status: slice.doc.status,
        driftSignal: slice.doc.driftSignal,
      });
      sliceCount++;
    }
    const tRenderEnd = performance.now();

    let introHtml: string | null = null;
    if (contentDir) {
      const introFile = `${modelKey}.mdx`;
      if (existsSync(join(contentDir, introFile))) {
        introHtml = await renderMdxFile(join(contentDir, introFile));
        consumedContent.add(introFile);
      }
    }

    const modelPage = renderModelPage({
      modelKey,
      modelName: doc.model.name ?? modelKey,
      file,
      diagramFile,
      slices: sliceSummaries,
      storylines: doc.model.storylines,
      storylineEdges: doc.model.storylineEdges,
      invariantCatalog: docJson.model.invariants,
      docJsonSlices: docJson.model.slices,
      introHtml,
    });
    await writeFile(join(modelDir, "index.html"), modelPage, "utf8");

    // MIL-174: the guided first read — built from SVGs already written to
    // disk (read back rather than re-rendered, so this never shells out to
    // `em` a second time for a file already sitting there).
    //
    // A model WITH storylines teaches on its FIRST storyline, not the full
    // diagram: the full render of a grown model is the 80-column wall the
    // canvas exists to replace, and a first-time reader needs one chapter,
    // not the whole book. The storyline SVG renumbers `data-slice` from 0
    // in column order, so the steps are built from a doc filtered to that
    // storyline's slices with indexes remapped to match (timeline order is
    // preserved by the filter — em renders the storyline's columns in the
    // same order). Its doc links were retargeted for storylines/ depth
    // (../slices/); inlined into walkthrough.html at the model root they
    // need the model page's own prefix instead.
    const firstStoryline = doc.model.storylines[0] ?? null;
    let walkthroughDoc = doc;
    let walkthroughSvgSource: string;
    if (firstStoryline) {
      const storylineKeys = new Set(firstStoryline.sliceKeys);
      walkthroughDoc = {
        ...doc,
        model: {
          ...doc.model,
          slices: doc.model.slices.filter((s) => storylineKeys.has(s.key)).map((s, i) => ({ ...s, index: i })),
        },
      };
      const storylineSvg = join(modelDir, "storylines", `${kebabSlug(firstStoryline.name)}.svg`);
      walkthroughSvgSource = (await readFile(storylineSvg, "utf8")).replaceAll('href="../slices/', 'href="slices/');
    } else {
      walkthroughSvgSource = await readFile(join(modelDir, diagramFile), "utf8");
    }
    const walkthroughPage = renderWalkthroughPage({
      modelKey,
      modelName: doc.model.name ?? modelKey,
      steps: buildWalkthroughSteps(walkthroughDoc),
      diagramSvgSource: walkthroughSvgSource,
      storylineName: firstStoryline?.name ?? null,
    });
    await writeFile(join(modelDir, "walkthrough.html"), walkthroughPage, "utf8");

    modelSummaries.push({
      key: modelKey,
      name: doc.model.name ?? modelKey,
      // em's own cross-model key (MIL-193) — the join point against `em
      // system`'s contextMap nodes; usually equal to the portal's directory
      // key, but the portal's dedupe (`~2`) can make them differ.
      emKey: doc.model.key,
      file,
      sliceCount: doc.model.slices.length,
      hasCanvas,
      slices: sliceSummaries,
    });
    compiled.push({ modelKey, file, doc });
    searchSources.push({ modelKey, modelName: doc.model.name ?? modelKey, doc, docJson });
    timing.push({
      file,
      exportMs: tExportEnd - tExportStart,
      renderMs: tRenderEnd - tRenderStart,
    });
  }

  const tStatusStart = performance.now();
  const statusDoc = (await emStatusJson(files, { testsDir: opts.testsDir, repo: opts.repo })) as StatusDoc;
  const statusWarning = checkStatusSchemaCompatible(statusDoc);
  if (statusWarning) warnings.push(statusWarning);
  const tStatusEnd = performance.now();

  const crossModelLinks = buildCrossModelLinks(compiled);

  // GH #4 item 3: the system map. `em system --json`'s contextMap is "the
  // org-level view em-portal renders" (docs/cli.md) — models as nodes,
  // `consumes` seams as edges. A seam that fails verification makes em
  // system exit 1 but still carries the full document (emSystemJson
  // tolerates that), so a broken seam never silently drops off the map OR
  // kills the build.
  let systemMap: SystemDoc["contextMap"] | null = null;
  const manifestPath = opts.system ?? findSystemManifestAbove(files[0]);
  if (manifestPath) {
    try {
      const systemDoc = (await emSystemJson(manifestPath)) as SystemDoc;
      const systemWarning = checkSystemSchemaCompatible(systemDoc);
      if (systemWarning) warnings.push(systemWarning);
      systemMap = systemDoc.contextMap;
    } catch (err) {
      // A manifest that refuses (unreadable, invalid, a source with compile
      // errors) costs the landing page its system map, nothing more — the
      // per-model pages are built from exports that already compiled.
      warnings.push(`em system ${manifestPath} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (contentDir) {
    for (const f of await listMdxFiles(contentDir)) {
      if (!consumedContent.has(f)) {
        warnings.push(`--content: ${f} matches no model key in this build (built: ${modelSummaries.map((m) => m.key).join(", ")}) — expected index.mdx or <model-key>.mdx`);
      }
    }
  }

  const summary: PortalSummary = {
    title: opts.title ?? "em portal",
    models: modelSummaries,
    crossModelLinks,
    systemMap,
    narrativeHtml: landingNarrativeHtml,
  };
  const indexHtml = renderIndexPage(statusDoc, summary);
  await writeFile(join(outDir, "index.html"), indexHtml, "utf8");

  // GH #3 item 3: the client-side search — a static JSON index plus a
  // dependency-free vanilla script, both at the site root. The client
  // fetches the index lazily; over file:// that fetch fails and search
  // degrades to an explanatory note (README's documented caveat) while
  // every page keeps working straight off disk.
  await writeFile(join(outDir, "search-index.json"), JSON.stringify({ entries: buildSearchIndex(searchSources) }, null, 2), "utf8");
  await writeFile(join(outDir, "search.js"), SEARCH_JS, "utf8");

  const t1 = performance.now();
  return {
    models: modelSummaries.length,
    slices: sliceCount,
    crossModelLinks: crossModelLinks.length,
    warnings,
    timing,
    statusTimingMs: tStatusEnd - tStatusStart,
    totalMs: t1 - t0,
  };
}
