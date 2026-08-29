// SPDX-License-Identifier: MIT
// The only place em-portal talks to `em`. em-portal is a separate package/repo
// from em (per docs/decisions/mil-162-teachable-navigator.md in the em repo) —
// it never imports em's internal model/pipeline modules, only its published
// CLI surface (`em export --json`, `em status --json`, `em render`). Every
// call here shells out to the exact `em` binary resolved from this package's
// own `@milehimikey/em` devDependency (a production install would add it as a
// real dependency instead — see README), so a portal build always uses
// whichever em version is actually installed, never a hardcoded path.
//
// This is also where MIL-162's unmeasured "process-spawn overhead" question
// gets an answer: build.ts times every call it makes through here (see
// BuildTiming) instead of assuming the in-process numbers the prototype
// measured still apply.

import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);

export interface EmRunResult {
  stdout: string;
  stderr: string;
}

export class EmCliError extends Error {
  constructor(
    public readonly args: string[],
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
  ) {
    super(`em ${args.join(" ")} failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`);
    this.name = "EmCliError";
  }
}

let cachedCliPath: string | null = null;

/** Resolves the absolute path to the installed `em` CLI's entry point by reading
 *  the resolved `@milehimikey/em` package's own `package.json` (`bin.em`), rather
 *  than assuming a `node_modules/.bin/em` shim is on PATH — works the same way
 *  whether em-portal is run via `npm test`, a global install, or `npx`. */
export function resolveEmCliPath(fromDir: string = process.cwd()): string {
  if (cachedCliPath) return cachedCliPath;
  const require = createRequire(join(fromDir, "package.json"));
  const pkgJsonPath = require.resolve("@milehimikey/em/package.json");
  const pkg = require("@milehimikey/em/package.json") as { bin?: Record<string, string> | string };
  const binRel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.em;
  if (!binRel) {
    throw new Error(`@milehimikey/em's package.json (${pkgJsonPath}) declares no "em" bin entry`);
  }
  cachedCliPath = join(dirname(pkgJsonPath), binRel);
  return cachedCliPath;
}

/** Runs `node <em-cli> ...args` and returns stdout/stderr. Throws EmCliError on
 *  a non-zero exit so callers don't have to remember to check `stderr`/exit
 *  code themselves — every em command that can refuse (a model with errors)
 *  does so via a non-zero exit, so this is the single choke point for that. */
export async function runEm(args: string[], opts: { cwd?: string } = {}): Promise<EmRunResult> {
  const cliPath = resolveEmCliPath(opts.cwd ?? process.cwd());
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: opts.cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number | null };
    throw new EmCliError(args, e.stdout ?? "", e.stderr ?? "", e.code ?? null);
  }
}

/** `em export <file>` — the command's stdout IS JSON by default (no `--json`
 *  flag exists on `em export`; unlike most other em subcommands, JSON is its
 *  only output shape). Parsed, untyped-at-this-layer; the schema shape lives
 *  in exportDoc.ts, kept separate so run.ts stays a pure process boundary
 *  with no knowledge of em's document shapes. */
export async function emExportJson(file: string): Promise<unknown> {
  const { stdout } = await runEm(["export", file]);
  return JSON.parse(stdout);
}

export interface EmStatusOptions {
  testsDir?: string;
  repo?: string;
}

/** `em status <files...> --json`. */
export async function emStatusJson(files: string[], opts: EmStatusOptions = {}): Promise<unknown> {
  const args = ["status", ...files, "--json"];
  if (opts.testsDir) args.push("--tests", opts.testsDir);
  if (opts.repo) args.push("--repo", opts.repo);
  const { stdout } = await runEm(args);
  return JSON.parse(stdout);
}

/** `em render <file> -o <outPath>` — the full model diagram. */
export async function emRenderModel(file: string, outPath: string): Promise<void> {
  await runEm(["render", file, "-o", outPath]);
}

/** `em render <file> --slice <name> -o <outPath>` — one slice's own canonical
 *  pattern-shape diagram. `name` is the slice's display NAME (em render's
 *  `--slice` matches by exact name, not export key — see docs/cli.md). */
export async function emRenderSlice(file: string, sliceName: string, outPath: string): Promise<void> {
  await runEm(["render", file, "--slice", sliceName, "-o", outPath]);
}
