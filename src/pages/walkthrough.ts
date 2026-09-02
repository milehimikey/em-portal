// SPDX-License-Identifier: MIT
// MIL-174: the "guided first read" page — a self-paced Next/Prev walkthrough
// that teaches the notation using the team's own model as every example (see
// docs/decisions/mil-162-teachable-navigator.md's "guided first read"
// property). Every step's copy is built here from the structured picks
// src/walkthroughSteps.ts already made; this file only turns that into
// escaped HTML + the small inline JS stepper — no element/slice selection
// logic lives here.
//
// Highlight mechanism (verified against a real `em render` SVG, not
// assumed): `em`'s own renderer tags every element's node group with
// `data-slice="<sliceIndex>"` and embeds an `<metadata id="em-slices">`
// block (src/render/sliceOverlay.ts in the em repo) — the exact mechanism
// `em watch --serve`'s own Review mode storyboard uses to spotlight one
// slice at a time. That's a real, intentional, documented integration
// point, so this page reuses it at SLICE granularity: the model's own
// diagram.svg is inlined (not <object>-embedded — a cross-document
// <object> isn't reliably script-reachable from file://, and em's own
// viewer inlines for the same reason) and a `.wt-dim` class dims every
// `[data-slice]` node not matching the active step's slice.
//
// There is no equivalent per-ELEMENT hook: `em`'s SVG node ids come from
// `makeId(name)` (model/model.ts in the em repo) — a model-wide, name-only
// slug, deduped independently of `em export`'s own `<sliceKey>/<kind>.<slug>`
// ref scheme, and never surfaced as a stable public contract. Depending on
// it would mean parsing an internal Graphviz-emitted <title> as if it were
// an API. So single-element steps (a specific event/command/view, a single
// marked-up element) degrade honestly, per this ticket's own guidance: a
// color-keyed callout card (kind + name + a same-page link to the real
// element), not a fragile in-SVG spotlight — built from the same
// ElementExport-shaped data every other page already renders, just styled
// to match the diagram's own kind colors (src/emit/theme.ts /
// src/render/drawNotes.ts in the em repo) so it reads as "the same
// notation," not a second visual language.

import { escapeHtml, layout } from "./html.js";
import {
  IntroStep,
  ElementStep,
  MarkerKind,
  MarkerStep,
  NextStep,
  PatternStep,
  StatusStep,
  SwimlanesStep,
  WalkthroughElementPick,
  WalkthroughStep,
} from "../walkthroughSteps.js";

const KIND_COLOR: Record<string, { fill: string; stroke: string }> = {
  ui: { fill: "#FFFFFF", stroke: "#9AA0A6" },
  command: { fill: "#B8D0F5", stroke: "#2B6CB0" },
  view: { fill: "#C6E7C6", stroke: "#2F855A" },
  event: { fill: "#F6B26B", stroke: "#B7791F" },
  automation: { fill: "#DBDBDB", stroke: "#5F6368" },
  processor: { fill: "#DBDBDB", stroke: "#5F6368" },
  saga: { fill: "#DBDBDB", stroke: "#5F6368" },
  translation: { fill: "#DBDBDB", stroke: "#5F6368" },
};
const DEFAULT_KIND_COLOR = { fill: "#EEEEEE", stroke: "#9AA0A6" };
function kindColor(kind: string): { fill: string; stroke: string } {
  return KIND_COLOR[kind] ?? DEFAULT_KIND_COLOR;
}

const MARKER_COLOR: Record<MarkerKind, { fill: string; stroke: string }> = {
  note: { fill: "#F4C430", stroke: "#7A5200" },
  issue: { fill: "#E53935", stroke: "#8B0000" },
  divergence: { fill: "#26A69A", stroke: "#00695C" },
};

const MARKER_LABEL: Record<MarkerKind, string> = {
  note: "note",
  issue: "issue",
  divergence: "accepted divergence",
};

const MARKER_DEFINITION: Record<MarkerKind, string> = {
  note: "An amber folded corner marks a <strong>note</strong> — a linked design doc with more detail than fits on the diagram itself.",
  issue: "A red folded corner marks an <strong>issue</strong> — an open question awaiting a ruling before this element's design is settled.",
  divergence: "A teal folded corner marks a <strong>divergence</strong> — a reasoned, ratified deviation between the model and its implementation: already decided, not still open.",
};

const PATTERN_DEFINITION: Record<string, string> = {
  "state-change": "A <strong>State Change</strong> slice is the classic write path: a UI issues a command, the system validates it, and — if accepted — records one or more events. <code>ui → command → event</code>.",
  "state-view": "A <strong>State View</strong> slice is the classic read path: one or more events are replayed into a read model, which a UI then displays. <code>event → view → ui</code>.",
  automation: "An <strong>Automation</strong> slice is the system reacting to its own events with no person in the loop — a processor watches a view (or events) and issues a command by itself.",
  translation: "A <strong>Translation</strong> slice crosses a system or context boundary — adapting something external into a command, or pushing internal state out to another system.",
};

/** Every dynamic string this page inserts goes through escapeHtml; ref/slug
 *  values used inside an href are also escaped (they're safe URL characters
 *  by construction, but this file makes no exception for that). */
function elementCallout(pick: WalkthroughElementPick, extra: string = ""): string {
  const c = kindColor(pick.kind);
  return `<div class="wt-callout" style="background:${c.fill};border-color:${c.stroke}">
        <div class="wt-callout-head"><span class="wt-callout-kind">${escapeHtml(pick.kind)}</span><span class="wt-callout-name">${escapeHtml(pick.name)}</span></div>
        <div class="wt-callout-slice">in <a href="slices/${escapeHtml(pick.sliceKey)}.html#${escapeHtml(pick.ref)}">${escapeHtml(pick.sliceName)}</a></div>
        ${extra}
      </div>`;
}

function flowChip(pick: WalkthroughElementPick): string {
  const c = kindColor(pick.kind);
  return `<span class="wt-chip" style="background:${c.fill};border-color:${c.stroke}"><span class="wt-chip-kind">${escapeHtml(pick.kind)}</span> ${escapeHtml(pick.name)}</span>`;
}

function renderIntro(step: IntroStep): string {
  const anchor = step.firstSlice
    ? `<p>Your model's story starts with the <strong>${escapeHtml(step.firstSlice.name)}</strong> slice, spotlighted below — everything to its right happened later.</p>`
    : `<p>This model doesn't have any slices yet — once it does, its story will read left to right here.</p>`;
  return `<p>Time runs left to right. This whole picture is <strong>${escapeHtml(step.modelName)}</strong>'s business process, told as a timeline: earlier things happened on the left, later things on the right.</p>
      ${anchor}`;
}

const ELEMENT_DEFINITION: Record<"event" | "command" | "view", string> = {
  event: "An <strong>event</strong> is a fact that already happened — always named in the past tense (“Order Placed,” not “Place Order”). Once recorded, an event is never deleted or edited; if something changes, a later event records that.",
  command: "A <strong>command</strong> is an intention — someone or something asking for a change. Unlike an event, a command can be <strong>rejected</strong>: the system might refuse it (bad data, a broken rule, no permission).",
  view: "A <strong>view</strong> (also called a read model) is what someone reads — a screen, a report, a dashboard. A view is always built by replaying events; it never stores a new fact of its own.",
};

function renderElement(step: ElementStep): string {
  const def = `<p>${ELEMENT_DEFINITION[step.kind]}</p>`;
  if (!step.element) {
    return `${def}<p>This model doesn't have a${step.kind === "event" ? "n" : ""} ${escapeHtml(step.kind)} yet.</p>`;
  }
  const fromLine =
    step.kind === "view" && step.fromNames && step.fromNames.length > 0
      ? `<div class="wt-callout-slice">Built from: ${step.fromNames.map((n) => `<code>${escapeHtml(n)}</code>`).join(", ")}</div>`
      : "";
  return `${def}${elementCallout(step.element, fromLine)}`;
}

function renderSwimlanes(step: SwimlanesStep): string {
  return `<p>Across the top of the diagram are <strong>persona</strong> rows — who acts: ${step.personas.map((p) => `<code>${escapeHtml(p)}</code>`).join(", ")}.</p>
      <p>Below those are rows for each part of the system that records something — ${step.contexts.map((c) => `<code>${escapeHtml(c)}</code>`).join(", ")}.</p>
      <p>Reading a diagram is reading down a column — what happened, all at once, across every row — as much as it's reading left to right.</p>`;
}

function renderPattern(step: PatternStep): string {
  const def = `<p>${PATTERN_DEFINITION[step.pattern]}</p>`;
  if (!step.found || !step.slice) {
    return `${def}<p>This model has no ${escapeHtml(step.patternLabel)} slice yet — you'll recognize the shape once one exists.</p>`;
  }
  const flow = step.elements.map(flowChip).join(' <span class="wt-arrow">→</span> ');
  return `${def}<p>A real example from your model: the <strong>${escapeHtml(step.slice.name)}</strong> slice.</p>
      <div class="wt-flow">${flow}</div>
      <p><a href="slices/${escapeHtml(step.slice.key)}.html">Open this slice &rarr;</a></p>`;
}

function renderMarker(step: MarkerStep): string {
  const def = `<p>${MARKER_DEFINITION[step.marker]}</p>`;
  if (!step.found || !step.element) {
    return `${def}<p>This model has no ${escapeHtml(MARKER_LABEL[step.marker])} yet.</p>`;
  }
  const c = MARKER_COLOR[step.marker];
  const textHtml = step.text
    ? `<div class="wt-callout-slice">${escapeHtml(step.text)}</div>`
    : "";
  const callout = `<div class="wt-callout" style="background:${c.fill};border-color:${c.stroke}">
        <div class="wt-callout-head"><span class="wt-callout-kind">${escapeHtml(step.element.kind)}</span><span class="wt-callout-name">${escapeHtml(step.element.name)}</span></div>
        <div class="wt-callout-slice">in <a href="slices/${escapeHtml(step.element.sliceKey)}.html#${escapeHtml(step.element.ref)}">${escapeHtml(step.element.sliceName)}</a></div>
        ${textHtml}
      </div>`;
  return `${def}${callout}`;
}

function statusBadgeClass(status: string): string {
  return status === "implemented" ? "ok" : "";
}

function renderStatus(step: StatusStep): string {
  const lifecycle = `<p>Every slice doc moves through a lifecycle: <strong>draft</strong> &rarr; <strong>reviewed</strong> &rarr; <strong>ready-to-implement</strong> &rarr; <strong>implemented</strong>.</p>`;
  const example = step.exampleStatus
    ? `<p>For example, your <strong>${escapeHtml(step.exampleStatus.sliceName)}</strong> slice is currently <span class="badge ${statusBadgeClass(step.exampleStatus.status)}">${escapeHtml(step.exampleStatus.status)}</span>.</p>`
    : `<p>This model's slices don't have a recorded status yet — routine for an early model, not a defect.</p>`;
  const ratify = `<p>A named human <strong>ratifies</strong> a slice doc — signs off that its current status is correct.</p>`;
  const ratifyExample = step.exampleRatified
    ? `<p><strong>${escapeHtml(step.exampleRatified.sliceName)}</strong> was ratified by <strong>${escapeHtml(step.exampleRatified.ratifiedBy)}</strong>${step.exampleRatified.ratifiedOn ? ` on ${escapeHtml(step.exampleRatified.ratifiedOn)}` : ""}.</p>`
    : `<p>None of this model's slices have been ratified yet — also routine early on.</p>`;
  const rollup = `<p>The landing page's status rollup is the “is this healthy” view across every model — <a href="../index.html">see it</a>.</p>`;
  return `${lifecycle}${example}${ratify}${ratifyExample}${rollup}`;
}

function renderNext(step: NextStep, modelName: string): string {
  const links = [`<a class="wt-cta" href="index.html">Browse the slice table &rarr;</a>`];
  if (step.firstSlice) {
    links.push(
      `<a class="wt-cta" href="slices/${escapeHtml(step.firstSlice.key)}.html">Read a real slice: ${escapeHtml(step.firstSlice.name)} &rarr;</a>`,
    );
  }
  links.push(`<a class="wt-cta" href="../index.html">Check system health &rarr;</a>`);
  return `<p>That's the whole notation — four kinds of box, three kinds of marker. Everything else on this site is the same vocabulary, applied to the rest of <strong>${escapeHtml(modelName)}</strong>'s real slices.</p>
      <div class="wt-next-links">${links.join("\n        ")}</div>`;
}

function renderStepBody(step: WalkthroughStep, modelName: string): string {
  switch (step.kind) {
    case "intro":
      return renderIntro(step);
    case "event":
    case "command":
    case "view":
      return renderElement(step);
    case "swimlanes":
      return renderSwimlanes(step);
    case "pattern":
      return renderPattern(step);
    case "marker":
      return renderMarker(step);
    case "status":
      return renderStatus(step);
    case "next":
      return renderNext(step, modelName);
  }
}

/** Strips the XML/DOCTYPE preamble and any comments graphviz puts before its
 *  `<svg ...>` root (verified against a real `em render` output: `<?xml ...?>`
 *  + a `<!DOCTYPE svg ...>` block, neither of which is legal inside an HTML
 *  document body), keeping the `<svg>...</svg>` element itself — the part
 *  that carries the `data-slice` attributes and `em-slices` metadata this
 *  page's spotlight needs. Falls back to the raw source if the expected
 *  `<svg`/`</svg>` markers aren't found, rather than throwing — a
 *  malformed-looking diagram beats a failed build. */
function extractInlineSvg(svgSource: string): string {
  const start = svgSource.indexOf("<svg");
  const end = svgSource.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return svgSource;
  return svgSource.slice(start, end + "</svg>".length).replace("<svg", '<svg id="wt-diagram"');
}

const WALKTHROUGH_STYLE = `
  .wt-nav { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; margin: 1rem 0; }
  .wt-nav button { font: inherit; padding: .5rem 1rem; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
  .wt-nav button:disabled { opacity: .4; cursor: default; }
  .wt-nav button.wt-primary { background: #1f2933; color: #fff; border-color: #1f2933; }
  .wt-nav a.wt-exit { margin-left: auto; font-size: 13px; }
  .wt-dots { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0 0 1rem; padding: 0; }
  .wt-dots button { width: 1.6rem; height: 1.6rem; border-radius: 50%; border: 1px solid #ccc; background: #fff; font-size: 11px; cursor: pointer; padding: 0; }
  .wt-dots button[aria-current="step"] { background: #1f2933; color: #fff; border-color: #1f2933; }
  .wt-diagram-frame { position: relative; overflow: auto; }
  .wt-diagram-frame svg [data-slice] { transition: opacity .15s ease; }
  .wt-diagram-frame svg [data-slice].wt-dim { opacity: .15; }
  @media (prefers-reduced-motion: reduce) {
    .wt-diagram-frame svg [data-slice] { transition: none; }
  }
  .wt-panels { margin-top: 1rem; }
  .wt-step h2 { margin-top: 0; }
  .wt-callout { border: 2px solid; border-radius: 8px; padding: .6rem .8rem; margin: .75rem 0; max-width: 28rem; }
  .wt-callout-head { display: flex; gap: .5rem; align-items: baseline; }
  .wt-callout-kind { text-transform: uppercase; font-size: 11px; letter-spacing: .03em; font-weight: 700; color: #3f3f3f; }
  .wt-callout-name { font-weight: 600; }
  .wt-callout-slice { font-size: 13px; margin-top: .25rem; }
  .wt-flow { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin: .75rem 0; }
  .wt-chip { border: 1px solid; border-radius: 999px; padding: .15rem .6rem; font-size: 13px; }
  .wt-chip-kind { font-size: 10px; text-transform: uppercase; color: #3f3f3f; }
  .wt-arrow { color: #7b8794; }
  .wt-next-links { display: flex; flex-direction: column; gap: .5rem; margin-top: 1rem; }
  .wt-cta { display: inline-block; padding: .6rem .9rem; border-radius: 6px; background: #1f2933; color: #fff; text-decoration: none; width: fit-content; }
`;

function stepperScript(exitHref: string): string {
  // Vanilla JS, inlined, no external assets — the whole page must work
  // opened straight off disk via file:// (no fetch of any other page). Reads
  // the JSON blob (#wt-data) for navigation-only metadata (id/title/
  // sliceIndex per step); every step's actual copy is already server-rendered
  // markup in .wt-step panels, so the JSON is deliberately small.
  return `(function () {
    var data = JSON.parse(document.getElementById('wt-data').textContent);
    var panels = Array.prototype.slice.call(document.querySelectorAll('.wt-step'));
    var svg = document.getElementById('wt-diagram');
    var progressEl = document.getElementById('wt-progress');
    var prevBtn = document.getElementById('wt-prev');
    var nextBtn = document.getElementById('wt-next');
    var dots = Array.prototype.slice.call(document.querySelectorAll('#wt-dots button'));
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var idx = 0;

    function applySpotlight(sliceIndex) {
      if (!svg) return;
      var nodes = svg.querySelectorAll('[data-slice]');
      for (var i = 0; i < nodes.length; i++) {
        var dim = sliceIndex !== null && nodes[i].getAttribute('data-slice') !== String(sliceIndex);
        nodes[i].classList.toggle('wt-dim', dim);
      }
      if (sliceIndex !== null) {
        var target = svg.querySelector('[data-slice="' + sliceIndex + '"]');
        if (target && target.scrollIntoView) {
          target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }

    function render() {
      for (var i = 0; i < panels.length; i++) panels[i].hidden = i !== idx;
      if (progressEl) progressEl.textContent = 'Step ' + (idx + 1) + ' of ' + data.length + ': ' + data[idx].title;
      if (prevBtn) prevBtn.disabled = idx === 0;
      if (nextBtn) nextBtn.textContent = idx === data.length - 1 ? 'Finish' : 'Next \\u2192';
      for (var d = 0; d < dots.length; d++) dots[d].setAttribute('aria-current', d === idx ? 'step' : 'false');
      applySpotlight(data[idx].sliceIndex);
    }

    function go(n) {
      idx = Math.max(0, Math.min(data.length - 1, n));
      render();
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { go(idx - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (idx === data.length - 1) { window.location.href = ${JSON.stringify(exitHref)}; }
      else { go(idx + 1); }
    });
    dots.forEach(function (btn, i) { btn.addEventListener('click', function () { go(i); }); });
    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === 'Escape') window.location.href = ${JSON.stringify(exitHref)};
    });

    render();
  })();`;
}

export interface WalkthroughPageArgs {
  modelKey: string;
  modelName: string;
  steps: WalkthroughStep[];
  /** The model's own full `em render` diagram.svg, as raw file content —
   *  inlined into the page (not <object>-embedded) so the client-side
   *  spotlight script can reach its `data-slice` nodes. */
  diagramSvgSource: string;
}

export function renderWalkthroughPage(args: WalkthroughPageArgs): string {
  const { modelName, steps } = args;
  const inlineSvg = extractInlineSvg(args.diagramSvgSource);

  const dotsHtml = steps
    .map((_, i) => `<button type="button" data-step-index="${i}" aria-current="${i === 0 ? "step" : "false"}">${i + 1}</button>`)
    .join("");

  const panelsHtml = steps
    .map(
      (s, i) => `      <section class="wt-step" id="wt-step-${escapeHtml(s.id)}" ${i === 0 ? "" : "hidden"}>
        <h2>${escapeHtml(s.title)}</h2>
${renderStepBody(s, modelName)}
      </section>`,
    )
    .join("\n");

  // Navigation-only metadata for the client script — title/sliceIndex per
  // step, nothing that duplicates the panel markup above.
  const navData = steps.map((s) => ({ id: s.id, title: s.title, sliceIndex: s.sliceIndex }));

  const body = `    <style>${WALKTHROUGH_STYLE}</style>
    <p class="pattern">Guided first read &middot; ${escapeHtml(modelName)}</p>
    <h1>First read: ${escapeHtml(modelName)}</h1>
    <p id="wt-progress" class="pattern" aria-live="polite">Step 1 of ${steps.length}: ${escapeHtml(steps[0]?.title ?? "")}</p>
    <div class="wt-nav">
      <button id="wt-prev" type="button" disabled>&larr; Prev</button>
      <button id="wt-next" type="button" class="wt-primary">Next &rarr;</button>
      <a class="wt-exit" href="index.html">Exit walkthrough</a>
    </div>
    <nav class="wt-dots" id="wt-dots" aria-label="Steps">${dotsHtml}</nav>
    <div class="diagram-frame wt-diagram-frame">${inlineSvg}</div>
    <div class="wt-panels">
${panelsHtml}
    </div>
    <script type="application/json" id="wt-data">${JSON.stringify(navData)}</script>
    <script>${stepperScript("index.html")}</script>`;

  return layout(`First read: ${modelName} — em portal`, body, "../index.html", [
    { label: modelName, href: "index.html" },
    { label: "First read", href: "." },
  ]);
}
