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

const TABS = ['species', 'genus', 'health', 'origin', 'quality', 'dims', 'volume', 'zones'];

function makeElement(id) {
  const classes = new Set();
  return {
    id: id, innerHTML: '', textContent: '', value: '', disabled: false, style: {},
    classList: {
      add(c) { classes.add(c); }, remove(c) { classes.delete(c); }, contains(c) { return classes.has(c); },
      toggle(c, on) { (on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c); }
    },
    parentNode: { appendChild() {}, removeChild() {} },
    addEventListener() {}, getAttribute() { return null; }
  };
}

/** Records every chart created; `destroyed` is set by destroy(). */
class ChartStub {
  constructor(canvas, config) {
    this.canvasId = canvas && canvas.id;
    this.config = config;
    this.destroyed = false;
    ChartStub.instances.push(this);
  }
  destroy() {
    if (this.destroyed) throw new Error('chart destroyed twice');
    this.destroyed = true;
  }
}
ChartStub.instances = [];

function installDomStub() {
  const elements = {};
  const byId = id => elements[id] || (elements[id] = makeElement(id));
  globalThis.document = {
    getElementById: byId,
    createElement() { return makeElement(null); },
    querySelectorAll(sel) { return sel === '.tab-panel' ? TABS.map(t => byId('tab-' + t)) : []; },
    addEventListener() {}
  };
  byId('tab-species').classList.add('active');   // as in index.html
  globalThis.Chart = ChartStub;
}

installDomStub();
// In the browser these are globals set by <script> tags before app.js runs; mirror that.
// tests/vendor/ holds the exact PapaParse file index.html loads from cdnjs (same SRI hash).
globalThis.Papa = require('./vendor/papaparse-5.6.1.min.js');
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
  app, ChartStub, loadFixture, loadAllFixtures, withConfig, readTables, readStatCards, fmtNum,
  el: function(id) { return document.getElementById(id); }
};
