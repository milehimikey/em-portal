// SPDX-License-Identifier: MIT
// Shared HTML-string helpers for every page builder. Hand-written template
// literals, no templating library or client-side framework — every page is
// plain, self-contained, static HTML (no external CDN, no build-time
// dependency the reader's browser needs to fetch), per the fully-static
// constraint in docs/decisions/mil-162-teachable-navigator.md.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5;
    background: #fafafa; color: #1f2933;
  }
  header {
    padding: .75rem 1.25rem; background: #1f2933; color: #fff;
    display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap;
  }
  header a { color: #fff; text-decoration: none; font-weight: 600; }
  header .crumbs { color: #cbd2d9; font-size: 13px; }
  header .crumbs a { color: #cbd2d9; font-weight: 400; text-decoration: underline; }
  main { max-width: 1000px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #ddd; font-size: 14px; vertical-align: top; }
  th { font-weight: 600; background: #f0f2f5; }
  .badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: 12px; background: #e4e7eb; }
  .badge.ok { background: #d3f3df; color: #10633c; }
  .badge.warn { background: #fdecc8; color: #8a5a00; }
  .badge.bad { background: #fbdbd6; color: #9c2b1d; }
  .pattern { font-size: 12px; color: #52606d; }
  .stat-row { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0 1.5rem; }
  .stat { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: .6rem .9rem; min-width: 9rem; }
  .stat .n { font-size: 1.4rem; font-weight: 700; display: block; }
  .stat .label { font-size: 12px; color: #52606d; }
  .diagram-frame {
    height: 420px; border: 1px solid #ddd; margin: 1rem 0; overflow: hidden; background: #fff;
    display: flex; align-items: flex-start; justify-content: center;
  }
  object.diagram { width: auto; height: 100%; max-width: 100%; }
  .full-diagram-link { margin: 0 0 1rem; font-size: 13px; }
  .doc { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #ddd; }
  .doc h1 { font-size: 1.3rem; }
  .doc h2 { font-size: 1.05rem; }
  .no-doc { color: #7b8794; font-style: italic; }
  .permalink { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #52606d; }
  .permalink a { color: inherit; }
  code { background: #eee; padding: .05rem .3rem; border-radius: 3px; }
  footer { max-width: 1000px; margin: 0 auto; padding: 0 1.25rem 2rem; font-size: 12px; color: #7b8794; }
  .first-read-cta { display: inline-block; margin: .5rem 0 1rem; padding: .5rem 1rem; border-radius: 6px; background: #1f2933; color: #fff; text-decoration: none; font-weight: 600; }
  /* em's section-aware doc render (GH #402: .scenario-card/.inv-chip/.field-table
     markup comes from em itself, --doc-json --include-html) + the portal's own
     component sections (components.ts). Styled here; never re-generated here. */
  .scenario-card { border: 1px solid #ddd; border-left: 4px solid #1f2933; border-radius: 6px; background: #fff; padding: .75rem 1rem; margin: 1rem 0; }
  .scenario-card-title { margin: 0 0 .5rem; font-size: 1rem; }
  .scenario-step { display: flex; gap: .6rem; margin: .25rem 0; }
  .scenario-step-label { flex: 0 0 3.2rem; font-weight: 700; font-size: 12px; text-transform: uppercase; color: #52606d; padding-top: .15rem; }
  .scenario-step--given .scenario-step-label { color: #10633c; }
  .scenario-step--when .scenario-step-label { color: #8a5a00; }
  .scenario-step--then .scenario-step-label { color: #2b6cb0; }
  .scenario-step-body > p:first-child { margin-top: 0; }
  .scenario-step-body > p:last-child { margin-bottom: 0; }
  .inv-chip { display: inline-block; padding: .05rem .45rem; border-radius: 999px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #e0ecff; color: #1d4e89; text-decoration: none; }
  a.inv-chip:hover { text-decoration: underline; }
  .inv-chip--external { background: #eee; color: #52606d; }
  .invariant-list { list-style: none; padding-left: 0; }
  .invariant-list li { margin: .35rem 0; }
  table.field-table .col-type { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  table.field-table .col-notes, table.field-table .col-flag { color: #52606d; font-size: 13px; }
  /* Client-side search (GH #3 item 3): header box + dropdown, styled here;
     behavior lives in search.js at the site root. */
  .search { position: relative; margin-left: auto; min-width: 220px; }
  .search input { width: 100%; padding: .3rem .6rem; border-radius: 6px; border: 1px solid #52606d; background: #323f4b; color: #fff; font-size: 13px; }
  .search input::placeholder { color: #9aa5b1; }
  #portal-search-results { position: absolute; right: 0; top: calc(100% + 4px); width: min(480px, 90vw); max-height: 60vh; overflow-y: auto; background: #fff; color: #1f2933; border: 1px solid #cbd2d9; border-radius: 8px; box-shadow: 0 8px 24px rgba(31, 41, 51, .18); z-index: 10; }
  .search-hit { display: flex; align-items: baseline; gap: .5rem; padding: .45rem .7rem; text-decoration: none; color: inherit; border-bottom: 1px solid #f0f2f5; }
  .search-hit:last-child { border-bottom: none; }
  .search-hit:hover, .search-hit.active { background: #f0f4ff; }
  .search-hit-type { flex: 0 0 4.6rem; font-size: 11px; text-transform: uppercase; color: #7b8794; }
  .search-hit-main { flex: 1 1 auto; min-width: 0; }
  .search-hit-main strong { font-weight: 600; }
  .search-hit-detail { display: block; font-size: 12px; color: #52606d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-hit-model { flex: 0 0 auto; font-size: 11px; color: #7b8794; }
  .search-note { padding: .6rem .8rem; font-size: 13px; color: #52606d; }
`;

export interface Crumb {
  label: string;
  href: string;
}

/** `homeHref` is always relative to the page being built so the whole site
 *  works opened straight off disk via `file://` or served from any subpath —
 *  no absolute `href="/"` anywhere (that would jump to the filesystem/host
 *  root instead of the site root when the portal is published under a
 *  subpath, e.g. GitHub Pages project sites). */
export function layout(title: string, bodyHtml: string, homeHref: string, crumbs: Crumb[] = []): string {
  const crumbHtml = crumbs.length
    ? `<span class="crumbs">${crumbs.map((c) => `&rsaquo; <a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`).join(" ")}</span>`
    : "";
  // The site-root prefix for root-level assets (search.js, the index it
  // fetches), derived from homeHref — which every page already passes as
  // its own relative path back to the root index ("index.html",
  // "../index.html", ...). Same no-absolute-paths rule as homeHref itself.
  const rootPrefix = homeHref.endsWith("index.html") ? homeHref.slice(0, -"index.html".length) : "";
  const searchHtml = `<div class="search"><input id="portal-search" type="search" placeholder="Search slices, events, invariants&hellip;" autocomplete="off" /><div id="portal-search-results" hidden></div></div>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <header><a href="${escapeHtml(homeHref)}">em portal</a>${crumbHtml}${searchHtml}</header>
  <script src="${escapeHtml(rootPrefix)}search.js" defer></script>
  <main>
${bodyHtml}
  </main>
  <footer>Generated by em-portal — a static, read-only view over <code>em export</code>/<code>em status</code>. No server, no storage of its own; git is the source of truth.</footer>
</body>
</html>
`;
}
