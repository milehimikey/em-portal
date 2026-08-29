// SPDX-License-Identifier: MIT
// The cross-model navigation join (MIL-162's "multi-model navigation"
// property #3). em has no DSL-level construct for "this element's trigger is
// another model file's public event" — each model compiles independently,
// and `from` only resolves within the model being compiled. So the only
// thing carried across independently-built `em export` documents today is a
// public event's exact NAME (docs/dsl.md "Integration surface"). This is
// exactly that heuristic join, ported from prototypes/portal-spike/spike.ts's
// buildCrossModelLinks in the em repo (the MIL-162 prototype that tested this
// approach at scale) — pure string matching over the independently-computed
// export JSON for each model, no access to em's internal model objects, no
// LLM, no fuzzy matching. It's honest about what it is: a naming-convention
// join with no compiler guarantee behind it (see the decision doc's "What
// the prototype found" section).

import { ExportDoc } from "./em/exportDoc.js";

export interface CompiledModel {
  modelKey: string;
  file: string;
  doc: ExportDoc;
}

export interface CrossModelLink {
  eventName: string;
  fromModelKey: string;
  fromRef: string;
  toModelKey: string;
  toElementRef: string;
}

export function buildCrossModelLinks(compiled: CompiledModel[]): CrossModelLink[] {
  const publicEventsByName = new Map<string, { modelKey: string; ref: string }>();
  for (const c of compiled) {
    for (const slice of c.doc.model.slices) {
      for (const el of slice.elements) {
        if (el.kind === "event" && el.public) {
          publicEventsByName.set(el.name, { modelKey: c.modelKey, ref: el.ref });
        }
      }
    }
  }

  const links: CrossModelLink[] = [];
  for (const c of compiled) {
    for (const slice of c.doc.model.slices) {
      for (const el of slice.elements) {
        for (const [eventName, source] of publicEventsByName) {
          // An element referencing its OWN model's public event isn't a cross-model link.
          if (source.modelKey === c.modelKey) continue;
          if (el.name.includes(eventName)) {
            links.push({
              eventName,
              fromModelKey: source.modelKey,
              fromRef: source.ref,
              toModelKey: c.modelKey,
              toElementRef: el.ref,
            });
          }
        }
      }
    }
  }
  return links;
}
