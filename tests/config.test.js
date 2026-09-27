'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, loadFixture, loadAllFixtures, withConfig, readTables, fmtNum, el } = require('./helpers');

const ROOT = path.join(__dirname, '..');

// ── The settings object ─────────────────────────────────────────────────────

test('config: default values', () => {
  assert.equal(CONFIG.formFactor, 0.441);
  assert.equal(CONFIG.treePlotIdColumn, '_parent_index');
  assert.equal(CONFIG.plotsPlotIdColumn, null);
  assert.equal(CONFIG.classColumn, 'Zone SLIM');
  assert.deepEqual(CONFIG.classCodes, ['12', '21', '22']);
  assert.deepEqual(CONFIG.classFallbacks, { '12': ['21'], '21': ['22'], '22': ['21', '12'] });
  assert.equal(CONFIG.diameterClassWidth_cm, 5);
  assert.equal(CONFIG.minExploitableDiameter_cm, 30);
  assert.deepEqual(CONFIG.heightModel, { enabled: true, minTreesPerSpecies: 10 });
});

test('config: fallbacks only point to other known class codes', () => {
  for (const [cls, chain] of Object.entries(CONFIG.classFallbacks)) {
    assert.ok(CONFIG.classCodes.includes(cls), cls + ' is a known code');
    for (const fb of chain) {
      assert.ok(CONFIG.classCodes.includes(fb), cls + ' → ' + fb + ' is a known code');
      assert.notEqual(fb, cls, cls + ' does not fall back to itself');
    }
  }
});

test('config: index.html loads config.js before app.js; calculations.js is gone', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cfg = html.indexOf('src="js/config.js"'), appJs = html.indexOf('src="js/app.js"');
  assert.ok(cfg !== -1 && appJs !== -1 && cfg < appJs);
  assert.ok(!html.includes('calculations.js'));
  assert.ok(!fs.existsSync(path.join(ROOT, 'js', 'calculations.js')));
});

// ── Columns ─────────────────────────────────────────────────────────────────

test('config: treePlotIdColumn picks the tree→plot column', () => {
  const headers = ['Diameter [cm]:', 'Height [m]:', 'plot_ref', '_parent_index'];
  assert.equal(app.detectTreeColumns(headers).plotCol, '_parent_index');
  withConfig({ treePlotIdColumn: 'plot_ref' }, () => {
    assert.equal(app.detectTreeColumns(headers).plotCol, 'plot_ref');
  });
});

test('config: missing class column shows an error instead of guessing', () => {
  loadAllFixtures();
  // Same plots, but the class column is named differently
  app.state.plots = app.parseCSVText('_index;Stratum\n1;21\n2;21\n3;22\n4;22\n5;22\n');
  app.runZoneCalculation();
  const html = el('zones-result').innerHTML;
  assert.match(html, /Plots CSV has no column "Zone SLIM"/);
  assert.match(html, /Columns found: _index, Stratum/);
  assert.equal(readTables(html).length, 0, 'no result tables');
});

test('config: classColumn setting is used', () => {
  withConfig({ classColumn: 'Stratum' }, () => {
    loadAllFixtures();
    app.state.plots = app.parseCSVText('_index;Stratum\n1;21\n2;21\n3;22\n4;22\n5;22\n');
    app.runZoneCalculation();
    const [classTable] = readTables(el('zones-result').innerHTML);
    // Same result as with the fixture plots.csv: class 21 avg 33.90 (see zones.test.js)
    assert.equal(fmtNum(classTable.find(r => r[0] === '21')[3]), 33.90);
  });
});

test('config: plotsPlotIdColumn selects the plot ID column; missing → error', () => {
  // ID column is not the first column here
  const plots = 'Zone SLIM;Plot code;_index\n21;P01;1\n21;P02;2\n22;P03;3\n22;P04;4\n22;P05;5\n';
  withConfig({ plotsPlotIdColumn: '_index' }, () => {
    loadAllFixtures();
    app.state.plots = app.parseCSVText(plots);
    app.runZoneCalculation();
    const [classTable] = readTables(el('zones-result').innerHTML);
    assert.equal(fmtNum(classTable.find(r => r[0] === '21')[3]), 33.90);
  });
  withConfig({ plotsPlotIdColumn: 'plot_id' }, () => {
    loadAllFixtures();
    app.runZoneCalculation();
    assert.match(el('zones-result').innerHTML, /Plots CSV has no column "plot_id"/);
  });
});

test('config: classFallbacks setting is used', () => {
  // Class 12 has no plots; point it at 22 instead of 21.
  // 22 avg (height model on) = (78.3286 + 0 + 3.4260) / 3 = 27.2515 → "27,25"
  withConfig({ classFallbacks: { '12': ['22'] } }, () => {
    loadAllFixtures();
    app.runZoneCalculation();
    const [classTable] = readTables(el('zones-result').innerHTML);
    const row12 = classTable.find(r => r[0] === '12');
    assert.equal(fmtNum(row12[3]), 27.25);
    assert.match(row12[4], /fallback from class 22/);
  });
});

// ── Diameter classes ────────────────────────────────────────────────────────

const COLS = { diagCol: 'Diameter [cm]:', izCol: 'InclusionZone_ha', plotCol: '_parent_index' };

/*
 * Trees/ha by diameter class = Σ(1 / InclusionZone_ha) in class / number of plots.
 * Plots in the tree data: 1, 2, 3, 5, 6 → 5. All 20 trees have an inclusion zone.
 * 1/0.00503 = 198.8072, 1/0.03142 = 31.8269, 1/0.10179 = 9.82415
 *
 * 5 cm classes (default):
 *   5–10   5.0, 8.4, 9.9          3 × 198.8072 = 596.4215 / 5 = 119.28 → 119
 *   10–15  10.0, 12.3, 14.2       3 × 31.8269  =  95.4806 / 5 =  19.10 →  19
 *   15–20  15.0, 16.5, 18.9       3 × 31.8269                          →  19
 *   20–25  20.0, 22.4             2 × 9.82415  =  19.6483 / 5 =   3.93 →   4
 *   25–30  26.7                   1 × 9.82415  /  5           =   1.96 →   2
 *   30–35  30.0, 31.2, 33.0       3 × 9.82415  =  29.4724 / 5 =   5.89 →   6
 *   35–40  35.5, 38.4                                                  →   4
 *   40–45  42.0, 44.5                                                  →   4
 *   45–50  —                                                           →   0
 *   50–55  50.0 (max, on a class edge → first class it opens)          →   2
 *   TOTAL (sum of rounded)                                                179
 *
 * 10 cm classes — same numbers the old hardcoded multipliers gave
 * (avg trees/plot × 198.9436 / 31.8309 / 9.8243):
 *   0–10: 0.6 → 119   10–20: 1.2 → 38   20–30: 0.6 → 6   30–40: 1.0 → 10
 *   40–50: 0.4 → 4    50–60: 0.2 → 2    TOTAL 179
 */

test('diameterClassTable: 5 cm classes from inclusion zones (default width)', () => {
  const r = app.diameterClassTable(loadFixture('trees.csv').rows, COLS, CONFIG.diameterClassWidth_cm);
  assert.equal(r.nPlots, 5);
  assert.equal(r.noIz, 0);
  assert.deepEqual(r.classes.map(c => [c.lo, c.hi, c.count, c.treesHa]), [
    [5, 10, 3, 119], [10, 15, 3, 19], [15, 20, 3, 19], [20, 25, 2, 4], [25, 30, 1, 2],
    [30, 35, 3, 6], [35, 40, 2, 4], [40, 45, 2, 4], [45, 50, 0, 0], [50, 55, 1, 2]
  ]);
  assert.equal(r.totalTreesHa, 179);
});

test('diameterClassTable: 10 cm classes match the old multiplier table', () => {
  const r = app.diameterClassTable(loadFixture('trees.csv').rows, COLS, 10);
  assert.deepEqual(r.classes.map(c => [c.lo, c.avgRaw, c.treesHa]), [
    [0, 0.6, 119], [10, 1.2, 38], [20, 0.6, 6], [30, 1.0, 10], [40, 0.4, 4], [50, 0.2, 2]
  ]);
  assert.equal(r.totalTreesHa, 179);
});

test('diameterClassTable: trees without inclusion zone are counted as excluded', () => {
  const rows = [
    { d: '12', iz: '0,03142', p: '1' },
    { d: '14', iz: '',        p: '1' },
    { d: '16', iz: '0,03142', p: '2' }
  ];
  const r = app.diameterClassTable(rows, { diagCol: 'd', izCol: 'iz', plotCol: 'p' }, 5);
  assert.equal(r.noIz, 1);
  // 10–15: 1/0.03142 / 2 plots = 15.91 → 16;  15–20: same → 16
  assert.deepEqual(r.classes.map(c => c.treesHa), [16, 16]);
});
