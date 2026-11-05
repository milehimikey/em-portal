// SPDX-License-Identifier: MIT
// The portal's landing page: `em status`'s rollup up front (MIL-162 property
// #2, "state up front" — a reader's first question is "is this healthy," not
// a slice list), then the multi-model index (property #3) and any resolved
// cross-model links. Drill-down is model -> slice -> doc, in that order — this
// page never lists individual slices itself.

import { escapeHtml, layout } from "./html.js";
import { StatusDoc } from "../em/statusDoc.js";
import { SystemDoc } from "../em/systemDoc.js";
import { ModelSummary, PortalSummary } from "./types.js";
import { elementDeepLink } from "../refs.js";

function pct(numer: number, denom: number): string {
  if (denom === 0) return "n/a";
  return `${((numer / denom) * 100).toFixed(0)}%`;
}

function conformanceBadge(entry: StatusDoc["conformance"][number]): string {
  if (entry.error) return `<span class="badge warn">unverified</span>`;
  if (!entry.hasStateFile) return `<span class="badge">no conform history</span>`;
  const behind = (entry.commitsBehindHead ?? 0) + (entry.slicePRsBehindHead ?? 0);
  if (behind > 0) return `<span class="badge warn">${behind} behind HEAD</span>`;
  return `<span class="badge ok">up to date</span>`;
}

function renderStatusSection(status: StatusDoc): string {
  const total = status.slices.total;
  const s = status.slices.byStatus;
  const documented = total - s.noDoc;
  const d = status.driftSignal;
  const stats = [
    // `shipped` (status schema 1.9, MIL-283), not working-status `implemented`,
    // is the lifecycle headline since em 1.15: a slice whose next version is
    // open as a draft still has its earlier version shipped.
    { n: `${s.shipped}/${total}`, label: "shipped" },
    { n: `${documented}/${total}`, label: `documented (${pct(documented, total)})` },
    { n: `${status.issues.openIssues}`, label: "open issues" },
    {
      n: status.invariants ? `${status.invariants.cited}/${status.invariants.total}` : "n/a",
      label: "invariants covered",
    },
  ];

  const statHtml = stats
    .map((st) => `<div class="stat"><span class="n">${escapeHtml(st.n)}</span><span class="label">${escapeHtml(st.label)}</span></div>`)
    .join("\n");

  const conformanceRows = status.conformance
    .map(
      (c) => `<tr>
        <td><code>${escapeHtml(c.file)}</code></td>
        <td>${c.hasStateFile && c.lastConformance ? escapeHtml(`${c.lastConformance.revision} (${c.lastConformance.date})`) + (c.lastConformance.partial ? ` <span class="badge warn">partial</span>` : "") : "&mdash;"}</td>
        <td>${c.commitsBehindHead ?? "&mdash;"}</td>
        <td>${c.slicePRsBehindHead ?? "&mdash;"}</td>
        <td>${c.unruledFindings == null ? "&mdash;" : c.unruledFindings > 0 ? `<span class="badge warn">${c.unruledFindings}</span>` : "0"}</td>
        <td>${conformanceBadge(c)}</td>
      </tr>`,
    )
    .join("\n");

  return `    <h1>State of the system</h1>
    <div class="stat-row">
${statHtml}
    </div>
    <h2>Slices by status</h2>
    <p>
      <span class="badge ok">${s.shipped} shipped</span>
      <span class="badge">${s.draft} draft</span>
      <span class="badge">${s.reviewed} reviewed</span>
      <span class="badge">${s.readyToImplement} ready-to-implement</span>
      <span class="badge">${s.implemented} implemented</span>
      <span class="badge">${s.noDoc} no doc</span>
      ${s.frontmatterInvalid ? `<span class="badge bad">${s.frontmatterInvalid} frontmatter invalid</span>` : ""}
      ${s.unknown ? `<span class="badge">${s.unknown} unknown status</span>` : ""}
    </p>
    <h2>Drift signal</h2>
    <p>
      <span class="badge ok">${d.inSync} in-sync</span>
      <span class="badge warn">${d.neverImplemented} never-implemented</span>
      <span class="badge warn">${d.unpropagatedDelta} unpropagated-delta</span>
      <span class="badge warn">${d.uncertified} uncertified</span>
      <span class="badge bad">${d.implementedWithoutLink} implemented-without-link</span>
      <span class="badge">${d.notApplicable} n/a (no doc)</span>
    </p>
    <h2>Freshness (conformance)</h2>
    <table>
      <thead><tr><th>Model</th><th>Last conformed</th><th>Commits behind</th><th>Slice-PRs behind</th><th>Unruled findings</th><th></th></tr></thead>
      <tbody>
${conformanceRows}
      </tbody>
    </table>`;
}

/** The system map (GH #4 item 3): `em system --json`'s contextMap drawn as
 *  a small inline SVG — models as nodes, `consumes` seams as edges, each
 *  node linking to that model's storyline canvas when it has one (its model
 *  page otherwise). Inline SVG keeps the fully-static/`file://` constraint:
 *  no script, no external assets. Layout is a plain layered left-to-right
 *  placement (a node sits one column right of the producers feeding it) —
 *  context maps are a handful of nodes, not a graph-drawing problem. */
function systemMapSvg(map: NonNullable<SystemDoc["contextMap"]>, models: ModelSummary[]): string {
  const NODE_W = 200;
  const NODE_H = 64;
  const GAP_X = 130;
  const GAP_Y = 28;
  const PAD = 12;

  // Longest-path layering; the pass count is bounded so a (never valid,
  // but tolerated) cyclic map can't hang the build.
  const layerOf = new Map<string, number>(map.nodes.map((n) => [n.key, 0]));
  for (let pass = 0; pass < map.nodes.length; pass++) {
    let changed = false;
    for (const e of map.edges) {
      const from = layerOf.get(e.from);
      const to = layerOf.get(e.to);
      if (from === undefined || to === undefined) continue;
      if (from + 1 > to) {
        layerOf.set(e.to, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const rowsUsed = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  for (const node of map.nodes) {
    const layer = layerOf.get(node.key) ?? 0;
    const row = rowsUsed.get(layer) ?? 0;
    rowsUsed.set(layer, row + 1);
    pos.set(node.key, { x: PAD + layer * (NODE_W + GAP_X), y: PAD + row * (NODE_H + GAP_Y) });
  }

  const width = PAD * 2 + (Math.max(...[...layerOf.values()], 0) + 1) * (NODE_W + GAP_X) - GAP_X;
  const height = PAD * 2 + Math.max(...[...rowsUsed.values()], 1) * (NODE_H + GAP_Y) - GAP_Y;

  const edgeSvg = map.edges
    .map((e) => {
      const from = pos.get(e.from);
      const to = pos.get(e.to);
      if (!from || !to) return "";
      const x1 = from.x + NODE_W;
      const y1 = from.y + NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_H / 2;
      const label = `${e.seams} seam${e.seams === 1 ? "" : "s"}`;
      return `      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#52606d" stroke-width="1.5" marker-end="url(#seam-arrow)" />
      <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" font-size="11" fill="#52606d">${escapeHtml(label)}</text>`;
    })
    .join("\n");

  const nodeSvg = map.nodes
    .map((n) => {
      const p = pos.get(n.key)!;
      const built = models.find((m) => m.emKey === n.key);
      const owner = n.owner.length > 0 ? n.owner.join(", ") : "";
      const box = `<rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="#fff" stroke="${built ? "#1f2933" : "#cbd2d9"}" stroke-width="1.5" />
        <text x="${p.x + 14}" y="${p.y + 27}" font-size="14" font-weight="600" fill="#1f2933">${escapeHtml(n.name)}</text>
        <text x="${p.x + 14}" y="${p.y + 47}" font-size="11" fill="#52606d">${escapeHtml(owner)}</text>`;
      // A node outside this build (a manifest model the portal wasn't given)
      // is drawn but not linked — the map shows the declared topology.
      if (!built) return `      <g>${box}</g>`;
      const target = built.hasCanvas ? `${built.key}/storylines/map.html` : `${built.key}/index.html`;
      return `      <a href="${escapeHtml(target)}"><g>${box}</g></a>`;
    })
    .join("\n");

  return `    <svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width: ${width}px; display: block; margin: 1rem 0;" role="img" aria-label="System context map">
      <defs>
        <marker id="seam-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#52606d" />
        </marker>
      </defs>
${edgeSvg}
${nodeSvg}
    </svg>`;
}

function systemMapSection(summary: PortalSummary): string {
  if (!summary.systemMap || summary.systemMap.nodes.length === 0) return "";
  return `    <h2>System map</h2>
    <p>From <code>em system</code>'s context map: models are nodes, <code>consumes</code> seams are
    edges. A node links to that model's storyline canvas (or its model page); a model declared in
    the system manifest but not part of this portal build is drawn unlinked.</p>
${systemMapSvg(summary.systemMap, summary.models)}`;
}

export function renderIndexPage(status: StatusDoc, summary: PortalSummary): string {
  const modelRows = summary.models
    .map(
      (m) => `      <tr>
        <td><a href="${escapeHtml(m.key)}/index.html">${escapeHtml(m.name)}</a></td>
        <td>${m.sliceCount}</td>
        <td>${m.hasCanvas ? `<a href="${escapeHtml(m.key)}/storylines/map.html">canvas &rarr;</a>` : "&mdash;"}</td>
        <td><code>${escapeHtml(m.file)}</code></td>
      </tr>`,
    )
    .join("\n");

  const linkRows = summary.crossModelLinks
    .map((l) => {
      // MIL-173: both ends of a cross-model link resolve straight to the
      // specific publishing/referencing ELEMENT via the same deep-link
      // scheme a slice page's own permalinks use — not just the model's
      // landing page — since the whole point of surfacing this row is "here
      // is exactly which element on each side."
      const fromLink = elementDeepLink(l.fromModelKey, l.fromRef);
      const toLink = elementDeepLink(l.toModelKey, l.toElementRef);
      return `      <tr>
        <td><code>${escapeHtml(l.eventName)}</code></td>
        <td><a href="${escapeHtml(fromLink)}">${escapeHtml(l.fromModelKey)}</a></td>
        <td><a href="${escapeHtml(toLink)}">${escapeHtml(l.toModelKey)}</a></td>
      </tr>`;
    })
    .join("\n");

  const crossModelSection =
    summary.crossModelLinks.length > 0
      ? `    <h2>Cross-model links</h2>
    <p>Resolved by matching a <code>public</code> event's name against every other model's
    element names — a naming-convention join, not a compiler-verified reference (see
    the em-portal README's "Cross-model navigation" section). Each link goes straight to the
    specific element on either side, not just that model's landing page.</p>
    <table>
      <thead><tr><th>Public event</th><th>Published by</th><th>Referenced by</th></tr></thead>
      <tbody>
${linkRows}
      </tbody>
    </table>`
      : "";

  const firstReadHref = summary.models[0] ? `${escapeHtml(summary.models[0].key)}/walkthrough.html` : null;
  const firstReadBanner = firstReadHref
    ? `    <p><a class="first-read-cta" href="${firstReadHref}">First read: new here? Learn the notation on ${escapeHtml(summary.models[0].name)} &rarr;</a></p>`
    : "";

  const body = `${firstReadBanner}
${renderStatusSection(status)}
${systemMapSection(summary)}
    <h2>Models</h2>
    <table>
      <thead><tr><th>Model</th><th>Slices</th><th>Storylines</th><th>Source</th></tr></thead>
      <tbody>
${modelRows}
      </tbody>
    </table>
${crossModelSection}`;

  return layout(summary.title, body, "index.html");
}
