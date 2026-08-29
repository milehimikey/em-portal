// SPDX-License-Identifier: MIT
// The portal's landing page: `em status`'s rollup up front (MIL-162 property
// #2, "state up front" — a reader's first question is "is this healthy," not
// a slice list), then the multi-model index (property #3) and any resolved
// cross-model links. Drill-down is model -> slice -> doc, in that order — this
// page never lists individual slices itself.

import { escapeHtml, layout } from "./html.js";
import { StatusDoc } from "../em/statusDoc.js";
import { PortalSummary } from "./types.js";
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
    { n: `${s.implemented}/${total}`, label: "implemented" },
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
        <td>${c.hasStateFile && c.lastConformance ? escapeHtml(`${c.lastConformance.revision} (${c.lastConformance.date})`) : "&mdash;"}</td>
        <td>${c.commitsBehindHead ?? "&mdash;"}</td>
        <td>${c.slicePRsBehindHead ?? "&mdash;"}</td>
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
      <span class="badge">${s.draft} draft</span>
      <span class="badge">${s.reviewed} reviewed</span>
      <span class="badge">${s.readyToImplement} ready-to-implement</span>
      <span class="badge ok">${s.implemented} implemented</span>
      <span class="badge">${s.noDoc} no doc</span>
      ${s.frontmatterInvalid ? `<span class="badge bad">${s.frontmatterInvalid} frontmatter invalid</span>` : ""}
      ${s.unknown ? `<span class="badge">${s.unknown} unknown status</span>` : ""}
    </p>
    <h2>Drift signal</h2>
    <p>
      <span class="badge ok">${d.inSync} in-sync</span>
      <span class="badge warn">${d.neverImplemented} never-implemented</span>
      <span class="badge bad">${d.unpropagatedDelta} unpropagated-delta</span>
      <span class="badge bad">${d.implementedWithoutLink} implemented-without-link</span>
      <span class="badge">${d.notApplicable} n/a (no doc)</span>
    </p>
    <h2>Freshness (conformance)</h2>
    <table>
      <thead><tr><th>Model</th><th>Last conformed</th><th>Commits behind</th><th>Slice-PRs behind</th><th></th></tr></thead>
      <tbody>
${conformanceRows}
      </tbody>
    </table>`;
}

export function renderIndexPage(status: StatusDoc, summary: PortalSummary): string {
  const modelRows = summary.models
    .map(
      (m) => `      <tr>
        <td><a href="${escapeHtml(m.key)}/index.html">${escapeHtml(m.name)}</a></td>
        <td>${m.sliceCount}</td>
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

  const body = `${renderStatusSection(status)}
    <h2>Models</h2>
    <table>
      <thead><tr><th>Model</th><th>Slices</th><th>Source</th></tr></thead>
      <tbody>
${modelRows}
      </tbody>
    </table>
${crossModelSection}`;

  return layout(summary.title, body, "index.html");
}
