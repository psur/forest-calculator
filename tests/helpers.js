/**
 * Test helpers: load js/app.js under Node with a minimal DOM stub, read the
 * fixture CSVs, and pull numbers back out of the HTML that app.js renders.
 *
 * The zone and volume-tab calculations currently live inside DOM-rendering
 * functions, so the tests call those functions and inspect the resulting
 * innerHTML. Once the math is split from the rendering, only this file
 * should need to change.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function makeElement(id) {
  return {
    id: id, innerHTML: '', textContent: '', value: '', disabled: false, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    parentNode: { appendChild() {}, removeChild() {} },
    addEventListener() {}
  };
}

function installDomStub() {
  const elements = {};
  globalThis.document = {
    getElementById(id) { return elements[id] || (elements[id] = makeElement(id)); },
    createElement() { return makeElement(null); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  // renderVolumeTab creates a chart in a setTimeout; make that a no-op.
  globalThis.Chart = class { destroy() {} };
}

installDomStub();
// In the browser config.js defines a global CONFIG before app.js runs; mirror that.
globalThis.CONFIG = require('../js/config.js');
const app = require('../js/app.js');
const DEFAULT_CONFIG = structuredClone(globalThis.CONFIG);

function loadFixture(name) {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  return app.parseCSVText(text);
}

/**
 * Load all three fixtures into app state, as the UI does after uploads
 * (prepareTrees detects columns and fits the height model per CONFIG).
 */
function loadAllFixtures() {
  const trees = loadFixture('trees.csv');
  app.prepareTrees(trees);
  app.state.plots = loadFixture('plots.csv');
  app.state.zones = loadFixture('zones.csv');
  return trees;
}

function deepAssign(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      deepAssign(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

/** Run fn with CONFIG temporarily patched (nested objects merged), then restore defaults. */
function withConfig(patch, fn) {
  deepAssign(globalThis.CONFIG, patch);
  try { return fn(); }
  finally {
    for (const k of Object.keys(globalThis.CONFIG)) delete globalThis.CONFIG[k];
    Object.assign(globalThis.CONFIG, structuredClone(DEFAULT_CONFIG));
  }
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** All <table>s in an HTML string as arrays of rows of cell text. */
function readTables(html) {
  return (html.match(/<table[\s\S]*?<\/table>/g) || []).map(function(table) {
    return (table.match(/<tr[\s\S]*?<\/tr>/g) || []).map(function(row) {
      return (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || []).map(stripTags);
    });
  });
}

/** Map of stat-card label -> value text. */
function readStatCards(html) {
  const cards = {};
  const re = /<div class="label">([\s\S]*?)<\/div><div class="value">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) cards[stripTags(m[1])] = stripTags(m[2]);
  return cards;
}

/** Parse a number formatted by fmtN ("1 234,56", NBSP thousands, decimal comma). */
function fmtNum(text) {
  const m = String(text).match(/^-?[\d\s ]+(,\d+)?/);
  if (!m) return NaN;
  return parseFloat(m[0].replace(/[\s ]/g, '').replace(',', '.'));
}

module.exports = {
  app, loadFixture, loadAllFixtures, withConfig, readTables, readStatCards, fmtNum,
  el: function(id) { return document.getElementById(id); }
};
