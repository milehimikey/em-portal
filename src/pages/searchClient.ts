// SPDX-License-Identifier: MIT
// The search client (GH #3 item 3), shipped as `search.js` at the site
// root: plain hand-written vanilla JS in a template string — no bundler, no
// search library, keeping the output fully static and dependency-free. Two
// halves on purpose:
//   SEARCH_CORE_JS — the pure matching functions, exported onto
//     `window.__emPortalSearch` so tests can evaluate exactly the shipped
//     code against a bare object (test/searchClient.test.ts).
//   SEARCH_JS — core + the DOM layer (input wiring, lazy index fetch,
//     dropdown, keyboard nav).
//
// The index is fetched LAZILY on first focus/input, never at page load —
// browsing costs nothing until someone actually searches. fetch of a
// sibling file fails over `file://` (browsers treat file origins as
// opaque), which is the documented caveat on GH #3: search needs any
// static host; every other page keeps working straight off disk. The
// client degrades to an explanatory note instead of a broken box.

export const SEARCH_CORE_JS = `(function (window) {
  function tokenize(query) {
    return query.toLowerCase().split(/\\s+/).filter(function (t) { return t.length > 0; });
  }

  // Every token must land somewhere (AND semantics); where it lands sets
  // its weight: exact title > title prefix > title substring > detail >
  // hidden text. A token that matches nothing zeroes the entry out.
  function scoreEntry(entry, tokens) {
    var title = entry.title.toLowerCase();
    var detail = (entry.detail || "").toLowerCase();
    var text = (entry.text || "").toLowerCase();
    var model = (entry.model || "").toLowerCase();
    var score = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (title === t) score += 100;
      else if (title.indexOf(t) === 0) score += 50;
      else if (title.indexOf(t) !== -1) score += 25;
      else if (detail.indexOf(t) !== -1) score += 10;
      else if (text.indexOf(t) !== -1) score += 5;
      else if (model.indexOf(t) !== -1) score += 2;
      else return 0;
    }
    return score;
  }

  function search(entries, query, limit) {
    var tokens = tokenize(query);
    if (tokens.length === 0) return [];
    var hits = [];
    for (var i = 0; i < entries.length; i++) {
      var s = scoreEntry(entries[i], tokens);
      if (s > 0) hits.push({ entry: entries[i], score: s });
    }
    hits.sort(function (a, b) { return b.score - a.score || a.entry.title.localeCompare(b.entry.title); });
    return hits.slice(0, limit).map(function (h) { return h.entry; });
  }

  window.__emPortalSearch = { tokenize: tokenize, scoreEntry: scoreEntry, search: search };
})(typeof window !== "undefined" ? window : this);
`;

const SEARCH_UI_JS = `(function () {
  if (typeof document === "undefined") return;
  var input = document.getElementById("portal-search");
  var box = document.getElementById("portal-search-results");
  if (!input || !box) return;

  var scriptEl = document.querySelector('script[src$="search.js"]');
  var root = scriptEl && scriptEl.src ? scriptEl.src.slice(0, -"search.js".length) : "";

  var entries = null;
  var loadFailed = false;
  var active = -1;

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function loadIndex() {
    if (entries !== null || loadFailed) return Promise.resolve();
    return fetch(root + "search-index.json")
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (data) { entries = data.entries || []; })
      .catch(function () { loadFailed = true; });
  }

  function hide() { box.hidden = true; active = -1; }

  function render() {
    if (loadFailed) {
      box.innerHTML = '<div class="search-note">Search needs a static host \\u2014 the index can\\u2019t be fetched over file:// (every other page still works straight off disk).</div>';
      box.hidden = false;
      return;
    }
    var q = input.value.trim();
    if (!q || entries === null) { hide(); return; }
    var hits = window.__emPortalSearch.search(entries, q, 20);
    if (hits.length === 0) {
      box.innerHTML = '<div class="search-note">No matches.</div>';
    } else {
      box.innerHTML = hits.map(function (h, i) {
        return '<a class="search-hit" data-i="' + i + '" href="' + root + escapeHtml(h.href) + '">' +
          '<span class="search-hit-type">' + escapeHtml(h.type) + '</span>' +
          '<span class="search-hit-main"><strong>' + escapeHtml(h.title) + '</strong>' +
          '<span class="search-hit-detail">' + escapeHtml(h.detail || "") + '</span></span>' +
          '<span class="search-hit-model">' + escapeHtml(h.model) + '</span></a>';
      }).join("");
    }
    active = -1;
    box.hidden = false;
  }

  function setActive(next) {
    var hits = box.querySelectorAll(".search-hit");
    if (hits.length === 0) return;
    active = (next + hits.length) % hits.length;
    for (var i = 0; i < hits.length; i++) hits[i].classList.toggle("active", i === active);
    hits[active].scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("focus", function () { loadIndex(); });
  input.addEventListener("input", function () { loadIndex().then(render); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
      var target = box.querySelector(".search-hit.active") || box.querySelector(".search-hit");
      if (target) window.location.href = target.href;
    } else if (e.key === "Escape") { hide(); input.blur(); }
  });
  document.addEventListener("click", function (e) {
    if (e.target !== input && !box.contains(e.target)) hide();
  });
})();
`;

export const SEARCH_JS = SEARCH_CORE_JS + SEARCH_UI_JS;
