#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { buildPortal } from "./build.js";
import { EmCliError } from "./em/run.js";

const program = new Command();

program
  .name("em-portal")
  .description("Stakeholder-facing static portal for em event models")
  .version("0.2.0");

program
  .command("build")
  .description("Build a static, read-only multi-model portal site from one or more .em model files")
  .argument("<models...>", "Paths to .em model files (same argument form as `em status`)")
  .option("-o, --out <dir>", "Output directory", "site")
  .option("--title <title>", "Site title shown on the landing page", "em portal")
  .option("--tests <dir>", "Directory to scan for INV-* test citations (enables invariant coverage on the landing page)")
  .option("--repo <path>", "Git repo to compute commits-behind-HEAD in (default: each model's own directory)")
  .action(async (models: string[], options: { out: string; title: string; tests?: string; repo?: string }) => {
    try {
      const result = await buildPortal(models, {
        outDir: options.out,
        title: options.title,
        testsDir: options.tests,
        repo: options.repo,
      });
      for (const w of result.warnings) console.warn(`warning: ${w}`);
      console.log(
        `${result.models} model(s), ${result.slices} slice(s), ${result.crossModelLinks} cross-model link(s) — wrote ${options.out}/ in ${result.totalMs.toFixed(0)}ms`,
      );
    } catch (err) {
      if (err instanceof EmCliError) {
        process.stderr.write(`${err.message}\n`);
        if (err.stdout.trim()) process.stderr.write(`${err.stdout}\n`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
  });

program.parseAsync(process.argv);
