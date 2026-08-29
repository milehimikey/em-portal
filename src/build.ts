// SPDX-License-Identifier: MIT
// Orchestrates the portal's static-site build: one `em export --json` +
// `em render` pass per input model, one `em status --json` pass across all of
// them, the cross-model link heuristic, then every page written to disk.
//
//   <outDir>/
//     index.html                 landing page: em status rollup + model index
//     <model-key>/
//       index.html                model page: diagram + slice table
//       diagram.svg
//       slices/
//         <slice-key>.html        slice page: diagram, doc, driftSignal, PR link
//         <slice-key>.svg
//
// Every model gets its own output directory (mirroring `em catalog`'s
// convention) so slice keys from different models can never collide, even
// without a cross-file dedupe pass.

import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { emExportJson, emRenderModel, emRenderSlice, emStatusJson } from "./em/run.js";
import { checkExportSchemaCompatible, ExportDoc } from "./em/exportDoc.js";
import { renderDocBody } from "./em/docBody.js";
import { checkStatusSchemaCompatible, StatusDoc } from "./em/statusDoc.js";
import { buildCrossModelLinks, CompiledModel } from "./crossModel.js";
import { dedupe, kebabSlug } from "./slug.js";
import { renderIndexPage } from "./pages/index.js";
import { renderModelPage } from "./pages/model.js";
import { renderSlicePage } from "./pages/slice.js";
import { ModelSummary, PortalSummary, SliceSummary } from "./pages/types.js";

export interface BuildOptions {
  outDir: string;
  title?: string;
  testsDir?: string;
  repo?: string;
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

export async function buildPortal(files: string[], opts: BuildOptions): Promise<BuildResult> {
  const t0 = performance.now();
  if (files.length === 0) throw new Error("em-portal build: at least one model file is required");

  const outDir = opts.outDir;
  await mkdir(outDir, { recursive: true });

  const warnings: string[] = [];
  const usedModelKeys = new Set<string>();
  const compiled: CompiledModel[] = [];
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
    const tExportEnd = performance.now();

    const modelKey = dedupe(kebabSlug(doc.model.name ?? basename(file, extname(file))), usedModelKeys);
    const modelDir = join(outDir, modelKey);
    const slicesDir = join(modelDir, "slices");
    await mkdir(slicesDir, { recursive: true });

    const tRenderStart = performance.now();
    const diagramFile = "diagram.svg";
    await emRenderModel(file, join(modelDir, diagramFile));

    const sliceSummaries: SliceSummary[] = [];
    for (const slice of doc.model.slices) {
      const sliceDiagramFile = `${slice.key}.svg`;
      await emRenderSlice(file, slice.name, join(slicesDir, sliceDiagramFile));

      const page = renderSlicePage({
        modelName: doc.model.name ?? modelKey,
        modelKey,
        diagramFile: `../${diagramFile}`,
        sliceDiagramFile,
        slice,
        pattern: slice.pattern,
        doc: slice.doc,
        docBodyHtml: renderDocBody(file, slice.doc.path),
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

    const modelPage = renderModelPage({
      modelKey,
      modelName: doc.model.name ?? modelKey,
      file,
      diagramFile,
      slices: sliceSummaries,
    });
    await writeFile(join(modelDir, "index.html"), modelPage, "utf8");

    modelSummaries.push({
      key: modelKey,
      name: doc.model.name ?? modelKey,
      file,
      sliceCount: doc.model.slices.length,
      slices: sliceSummaries,
    });
    compiled.push({ modelKey, file, doc });
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

  const summary: PortalSummary = {
    title: opts.title ?? "em portal",
    models: modelSummaries,
    crossModelLinks,
  };
  const indexHtml = renderIndexPage(statusDoc, summary);
  await writeFile(join(outDir, "index.html"), indexHtml, "utf8");

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
