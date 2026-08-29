# em-portal

A stakeholder-facing, **fully static** portal for [`em`](https://github.com/milehimikey/em)
event models — a read-only, multi-model browser built entirely from `em export`/`em status`
JSON. No server, no database, no storage of its own: git stays the only history store, and
`em-portal build` is a pure function of your `.em` files that a CI job runs and publishes to
static hosting (GitHub Pages, an S3/GCS bucket, ...).

This executes the decision recorded in the `em` repo at
[`docs/decisions/mil-162-teachable-navigator.md`](https://github.com/milehimikey/em/blob/main/docs/decisions/mil-162-teachable-navigator.md):
a **separate add-on tool**, not a rework of `em catalog`, built for the audience `em catalog`
names but doesn't fully serve — a non-technical stakeholder who wants "is this healthy" up
front and a way to navigate a system of several models, not a flat per-model site.

## Status

**0.1.0 — read-only multi-model browser.** See [What 0.1.0 includes](#what-01-includes) below.

## Quickstart

```bash
npm install --save-dev @milehimikey/em @milehimikey/em-portal
npx em-portal build models/*/*.em -o site
```

```
site/
  index.html                 # landing page: em status rollup (state up front)
  <model-key>/
    index.html                # model page: diagram + slice table
    diagram.svg
    slices/
      <slice-key>.html         # slice page: diagram, doc, driftSignal, PR link
      <slice-key>.svg
```

Open `site/index.html` directly (`file://` works, no server needed) or serve the directory with
anything that serves static files.

### CLI

```
em-portal build <models...> [options]

Arguments:
  models             Paths to .em model files (same argument form as `em status`)

Options:
  -o, --out <dir>     Output directory (default: "site")
  --title <title>     Site title shown on the landing page (default: "em portal")
  --tests <dir>       Directory to scan for INV-* test citations (enables invariant
                       coverage on the landing page — forwarded to `em status --tests`)
  --repo <path>       Git repo to compute commits-behind-HEAD in (forwarded to
                       `em status --repo`; default: each model's own directory)
```

Multiple models in one invocation is how a multi-model system's cross-model index and
`em status` rollup get built — same "one directory per model" convention
[`examples/multi-model`](https://github.com/milehimikey/em/tree/main/examples/multi-model) in
the em repo documents:

```bash
em-portal build models/checkout/checkout.em models/fulfillment/fulfillment.em -o site
```

## How it works

em-portal is a **separate package from `em`** — it never imports em's internal modules. Every
fact it shows comes from shelling out to the installed `em` CLI (a real dependency of your
project, resolved the normal npm way):

- `em export <file>` — the normalized model as JSON (schema 1.8+): slices, elements, stable
  `ref`s, the slice-doc frontmatter join (`status`, `driftSignal`, `implementedIn`, ...).
- `em status <files...> --json` — the state-of-the-system rollup across every model given:
  slices by lifecycle status, drift-signal breakdown, invariant coverage (with `--tests`),
  open issues, and freshness (last-conformed revision, commits/slice-PRs behind HEAD).
- `em render <file>` / `em render <file> --slice <name>` — the model's full diagram and each
  slice's own canonical-pattern diagram (SVG).

`em export`'s doc join is deliberately frontmatter-only ("never the markdown body" — see the em
repo's `docs/cli.md`); em-portal reads the bound `slices/<key>.md` file itself (the same
`doc.path` the join already names) and renders its body with `marked`, the same markdown engine
`em catalog` uses.

**Consumers must tolerate unknown fields.** em's own versioning policy is additive-minor-bump,
breaking-major-bump; `src/em/exportDoc.ts`/`statusDoc.ts` declare only the fields em-portal
reads (nothing is `.strict()`-validated), and `checkExportSchemaCompatible`/
`checkStatusSchemaCompatible` only warn on a **major** version mismatch. MIL-171 (landing in the
em repo in parallel with this ticket) adds `owner:`/`tracking:` fields to the doc join — this is
exactly the kind of change em-portal's ingestion layer is built to shrug off.

## Deep links (MIL-173)

Portal URLs are built on em's own stable element `ref`s (`<sliceKey>/<kind>.<slug>`, assigned by
`em export` and edit-stable — inserting or reordering slices never changes an existing ref). One
addressing scheme for both audiences: an agent citing `checkout/event.order-placed` (via
`em query`/MCP) and a stakeholder clicking the matching row on a slice page mean the same
element.

A slice page's URL already **is** its slice's own key (`<model-key>/slices/<sliceKey>.html`);
every element row on that page carries its full `ref` as both its DOM `id` and a visible,
copyable `#`-fragment permalink next to it (`src/refs.ts`). The full deep link to one element is:

```
<model-key>/slices/<sliceKey>.html#<sliceKey>/<kind>.<slug>
```

For example, in `examples/order-fulfillment`'s `Checkout` slice, the `Submit Payment` command's
deep link is:

```
order-fulfillment/slices/checkout.html#checkout/command.submit-payment
```

`src/refs.ts` exports `elementDeepLink(modelKey, ref)` / `sliceUrl(modelKey, sliceKey)` to build
these, and `parseDeepLink(link)` to resolve one back into `{ modelKey, sliceKey, elementRef }`
(returns `null` for anything not shaped like a page this portal generates — an external URL, the
site's own landing page, ...). The landing page's cross-model links table (below) uses the same
builder to link straight at the specific publishing/referencing element on each side, not just
the two models' index pages. Refs never depend on layout/coordinates or on the portal's own
directory-naming choices for the `<model-key>` segment (see `src/slug.ts`) — only on `em
export`'s own ref-stability guarantee.

## Multi-model navigation

The landing page indexes every model given to `em-portal build` and rolls up `em status` across
all of them. Where one model's `public` event feeds another model's slice, em-portal resolves
that as a **cross-model link** (`src/crossModel.ts`) — matching a public event's exact name
against every other model's element names. This is a naming-convention join, **not** a
compiler-verified reference: em has no DSL-level construct for "this element's trigger is
another model file's public event" (confirmed against `em validate`'s `view-from-unresolved`
error — see the decision doc). If a link looks wrong, the fix is in the `.em` naming, not in
em-portal.

## What 0.1.0 includes

- Package scaffold, CLI (`em-portal build`), export/status-ingestion tolerant of schema minor
  bumps.
- Landing page: the `em status` rollup up front (slice counts, drift signal, invariant coverage,
  open issues, freshness/commits-behind-HEAD per model) — a reader's first question ("is this
  healthy") answered before any slice list.
- Multi-model index + the cross-model link heuristic.
- Per-model pages (diagram + slice table) and per-slice pages (diagram, rendered doc,
  driftSignal, implemented-in link).
- Deep links on em's stable element refs (MIL-173) — see [Deep links](#deep-links-mil-173) above.
- Fully static, self-contained output; deterministic builds (same inputs -> byte-identical
  site, verified in `test/build.test.ts`); no LLM anywhere.

**Deferred to 0.2.0** (MIL-174, "guided first read"): the onboarding/teaching layer — real
click-driven interaction that annotates a first-time reader's own model as they encounter each
element/pattern kind, rather than a glossary page. 0.1.0's pages are informative but not
teaching-aware.

**Deferred to 0.3.0** (MIL-175, "async review intake"): a "raise a question" affordance on a
slice page, triaged into an `issue "..."` marker through the normal ratified path. 0.1.0 is
read-only.

**Also deferred / open, not yet built**:
- A real GitHub Pages/bucket deploy workflow wired to a specific target repo — see
  [CI publish recipe](#ci-publish-recipe) below for the pattern; this repo's own CI only builds
  and tests, since it has no real event models of its own to publish.
- Parallelizing the per-model `em export`/`em render` calls (they run sequentially today — see
  [Open questions](#open-questions)).
- Any client-side JS (search, filtering, sort) — pages are plain static HTML, same posture as
  `em catalog`.

## CI publish recipe

A downstream project (one that actually has `.em` models) publishes the portal from CI like
this — build, then hand the output directory to whichever static-hosting deploy action you use:

```yaml
# .github/workflows/portal.yml
name: em-portal
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx em-portal build models/*/*.em -o site
      - uses: actions/upload-pages-artifact@v3
        with: { path: site }
      - uses: actions/deploy-pages@v4
```

This repo's own [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm test` (which
builds the portal against the fixture models under `test/fixtures/`) on every push — the build
half of the recipe above, exercised continuously; the deploy half needs a real target repo with
real models, which this package intentionally isn't.

## Test fixtures

`test/fixtures/` holds `.em` files (plus their `slices/*.md` docs) copied verbatim from the `em`
repo's own `examples/order-fulfillment` and `examples/multi-model`, generated by running that
`em` checkout's CLI (`npx tsx src/cli.ts` from the em repo) against those examples and confirming
they still compile clean. `test/fixtures/invalid/broken.em` is hand-written to exercise the
refuse-on-error path (an unresolvable `view ... from`). `test/fixtures/cross-model/` is a small
hand-written pair (`producer`/`consumer`) exercising the cross-model link heuristic end to end: a
`public` event in one model whose exact name appears inside two of the other model's element
names.

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest — packs and shells out to the real @milehimikey/em devDependency
npm run typecheck
```

`@milehimikey/em` is installed from a packed tarball checked into `vendor/` (`npm pack` output
from the em repo) rather than a registry version, since em-portal is developed alongside
unreleased em changes; see `package.json`'s devDependency and re-pack with a newer em checkout
as needed (`cd ../em && npm run build && npm pack && cp *.tgz ../em-portal/vendor/`, then bump
the `vendor/*.tgz` filename referenced in `package.json` and `npm install`). A production
install of em-portal in a downstream project instead takes `@milehimikey/em` as a normal
(published) dependency — see [Quickstart](#quickstart).

## License

MIT
