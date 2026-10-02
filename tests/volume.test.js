'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, loadFixture, withConfig, readTables, readStatCards, fmtNum, el } = require('./helpers');
const { calcTrees, buildPlotSummary, renderVolumeTab, prepareTrees, state } = app;

// Columns as detected from the fixture header
const COLS = {
  diagCol: 'Diameter [cm]:', htCol: 'Height [m]:', izCol: 'InclusionZone_ha',
  plotCol: '_parent_index', speciesCol: 'Species:'
};
// Minimal column set for inline test rows
const C = { diagCol: 'd', htCol: 'h', izCol: 'iz', plotCol: 'p' };

function close(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    (msg ? msg + ': ' : '') + 'expected ' + expected + ' ± ' + tol + ', got ' + actual);
}

/*
 * Hand calculation for every tree in tests/fixtures/trees.csv
 *
 *   g     = π/40000 · d²          basal area, m²   (d in cm)
 *   v     = g · h · 0.441         volume, m³       (FORM_FACTOR)
 *   v/ha  = v / InclusionZone_ha  m³/ha represented by that tree
 *
 * Inclusion zones (concentric plots): r=4 m → 0,00503 ha (d < 10),
 * r=10 m → 0,03142 ha (10 ≤ d < 20), r=18 m → 0,10179 ha (d ≥ 20).
 *
 *  #  plot  d     h     IZ       g         v         v/ha
 *  1   1   35.5  28.0  0.10179  0.098980  1.222203  12.0071
 *  2   1   20.0  21.5  0.10179  0.031416  0.297870   2.9263
 *  3   1   12.3  11.0  0.03142  0.011882  0.057641   1.8345
 *  4   1    8.4   7.5  0.00503  0.005542  0.018329   3.6440
 *  5   1   15.0  13.0  0.03142  0.017671  0.101310   3.2244
 *  6   1    9.9   8.0  0.00503  0.007698  0.027157   5.3991
 *  7   2   42.0  31.5  0.10179  0.138544  1.924587  18.9074
 *  8   2   31.2  26.0  0.10179  0.076454  0.876619   8.6120
 *  9   2   10.0   9.8  0.03142  0.007854  0.033943   1.0803
 * 10   2   26.7  24.0  0.10179  0.055990  0.592601   5.8218
 * 11   2   16.5  14.5  0.03142  0.021382  0.136730   4.3517
 * 12   3   50.0  33.0  0.10179  0.196350  2.857475  28.0723
 * 13   3   38.4  29.5  0.10179  0.115812  1.506652  14.8016
 * 14   3   30.0  25.0  0.10179  0.070686  0.779311   7.6561
 * 15   3    5.0   5.5  0.00503  0.001963  0.004762   0.9468
 * 16   3   18.9  16.0  0.03142  0.028055  0.197958   6.3004
 * 17   3   44.5  30.5  0.10179  0.155528  2.091936  20.5515
 * 18   5   22.4   —    0.10179  no height: dropped without a height model; with the default
 *                                 model h = 20.0666 (all-species curve, see height.test.js)
 *                                 g = 0.039408, v = 0.039408·20.0666·0.441 = 0.348737,
 *                                 v/ha = 0.348737 / 0.10179 = 3.4260
 * 19   6   33.0  27.0  0.10179  0.085530  1.018404  10.0050
 * 20   6   14.2  12.5  0.03142  0.015837  0.087300   2.7785
 *
 * Worked example, tree 1:
 *   g = π · 35.5² / 40000 = π · 1260.25 / 40000 = 0.098980 m²
 *   v = 0.098980 · 28.0 · 0.441 = 1.222203 m³
 *   v/ha = 1.222203 / 0.10179 = 12.0071 m³/ha
 *
 * Plot totals (sum of the rows above):
 *   plot  trees  ΣBA (m²)   ΣV (m³)    Σ v/ha (m³/ha)
 *    1      6    0.173189   1.724511   29.0355
 *    2      5    0.300225   3.564481   38.7733
 *    3      6    0.568394   7.438094   78.3286
 *    5      1    0.039408   0.348737    3.4260   (only with the height model; tree 18)
 *    6      2    0.101367   1.105704   12.7834
 */

const PLOTS = {
  '1': { trees: 6, ba: 0.173189, vol: 1.724511, volHa: 29.0355 },
  '2': { trees: 5, ba: 0.300225, vol: 3.564481, volHa: 38.7733 },
  '3': { trees: 6, ba: 0.568394, vol: 7.438094, volHa: 78.3286 },
  '6': { trees: 2, ba: 0.101367, vol: 1.105704, volHa: 12.7834 }
};

/** Fixture trees without a height model (tree 18 dropped). */
function fixtureTrees() {
  return calcTrees(loadFixture('trees.csv').rows, COLS);
}

/** Fixture trees with the default height model fitted, as the UI does. */
function fixtureTreesWithModel() {
  prepareTrees(loadFixture('trees.csv'));
  return calcTrees(state.trees.rows, state.cols, state.heightModel);
}

test('calcTrees: per-tree basal area, volume and vol/ha (tree 1)', () => {
  const t = fixtureTrees()[0];
  assert.equal(t.plot, '1');
  close(t.ba, 0.098980, 5e-7, 'ba');
  close(t.vol, 1.222203, 5e-7, 'vol');
  close(t.volHa, 12.0071, 5e-5, 'volHa');
});

test('calcTrees: bin-edge and small trees (trees 2, 9, 15)', () => {
  const trees = fixtureTrees();
  // for n < 18 (before the dropped tree), tree n is trees[n-1]
  close(trees[1].volHa, 2.9263, 5e-5, 'tree 2, d = 20.0');
  close(trees[8].volHa, 1.0803, 5e-5, 'tree 9, d = 10.0');
  close(trees[14].volHa, 0.9468, 5e-5, 'tree 15, d = 5.0');
});

test('calcTrees: drops rows with missing/zero/negative inputs', () => {
  const rows = [
    { d: '20', h: '10', iz: '0,1', p: 'A' },   // valid
    { d: '0',  h: '10', iz: '0,1', p: 'A' },   // zero diameter
    { d: '-5', h: '10', iz: '0,1', p: 'A' },   // negative diameter
    { d: '20', h: '',   iz: '0,1', p: 'A' },   // no height
    { d: '20', h: '10', iz: '',    p: 'A' },   // no inclusion zone
    { d: '20', h: '10', iz: '0',   p: 'A' }    // zero inclusion zone (would divide by 0)
  ];
  const trees = calcTrees(rows, C);   // no height model
  assert.equal(trees.length, 1);
  // d=20, h=10: g = π·400/40000 = 0.0314159; v = 0.0314159·10·0.441 = 0.138544; /0.1 = 1.38544
  close(trees[0].volHa, 1.38544, 5e-6);
});

test('calcTrees: plot is "unknown" when there is no plot column', () => {
  const trees = calcTrees([{ d: '20', h: '10', iz: '0,1' }], { diagCol: 'd', htCol: 'h', izCol: 'iz', plotCol: null });
  assert.equal(trees[0].plot, 'unknown');
});

test('calcTrees: form factor comes from CONFIG', () => {
  // d=20, h=10, iz=0.1 with f = 0.5: 0.0314159·10·0.5 / 0.1 = 1.570796
  withConfig({ formFactor: 0.5 }, () => {
    close(calcTrees([{ d: '20', h: '10', iz: '0,1' }], C)[0].volHa, 1.570796, 5e-6);
  });
});

test('calcTrees: without a height model the no-height tree 18 is dropped', () => {
  const trees = fixtureTrees();
  assert.equal(trees.length, 19);
  assert.ok(!trees.some(t => t.plot === '5'));
  assert.ok(!trees.some(t => t.heightEstimated));
});

test('calcTrees: with the height model every tree with a diameter contributes', () => {
  const trees = fixtureTreesWithModel();
  assert.equal(trees.length, 20);
  const est = trees.filter(t => t.heightEstimated);
  assert.equal(est.length, 1);
  const t18 = est[0];
  assert.equal(t18.plot, '5');
  assert.equal(t18.heightSource, 'all');   // Fagus has only 6 measured trees (< 10)
  close(t18.height, 20.0666, 5e-5, 'estimated height');
  close(t18.volHa, 3.4260, 5e-5, 'vol/ha');
  // Measured trees keep their measured height
  assert.equal(trees[0].height, 28);
  assert.equal(trees[0].heightEstimated, false);
});

test('buildPlotSummary: per-plot trees, basal area, volume and vol/ha', () => {
  const summary = buildPlotSummary(fixtureTrees());
  assert.deepEqual(Object.keys(summary).sort(), ['1', '2', '3', '6']);
  for (const [id, exp] of Object.entries(PLOTS)) {
    const s = summary[id];
    assert.equal(s.trees, exp.trees, 'plot ' + id + ' trees');
    close(s.totalBA, exp.ba, 5e-6, 'plot ' + id + ' BA');
    close(s.totalVol, exp.vol, 5e-6, 'plot ' + id + ' vol');
    close(s.totalVolHa, exp.volHa, 5e-4, 'plot ' + id + ' vol/ha');
  }
});

/*
 * Volume-tab mean: average over the surveyed plots, plots without volume = 0.
 * Surveyed plots = every plot in the Plots CSV if loaded, else every plot with a
 * row in the tree data. Same rule as the Zones tab's class averages.
 *
 *                                   plots          model on               model off (plot 5 = 0)
 *   tree data only (no Plots CSV)   1,2,3,5,6      162.3468 / 5 = 32.4694  158.9208 / 5 = 31.7842
 *   with plots.csv                  1,2,3,4,5      149.5634 / 5 = 29.9127  146.1374 / 5 = 29.2275
 *     (plot 4: no rows → 0; plot 6 not in plots.csv → shown as "6 *", excluded)
 *
 * Cross-check with the Zones tab (model on): plot-weighted mean of the class averages
 *   (2 · 33.9044 + 3 · 27.2515) / 5 = (67.8088 + 81.7546) / 5 = 29.9127 ✓
 */

/** Render the Volume tab the way the UI does (prepareTrees fits the model per CONFIG). */
function renderFixtureVolumeTab(withPlotsCsv) {
  prepareTrees(loadFixture('trees.csv'));
  renderVolumeTab(state.trees.rows, state.cols, state.heightModel,
                  withPlotsCsv ? loadFixture('plots.csv') : null);
  const html = el('volume-stats').innerHTML;
  const tables = readTables(html);
  return { html, cards: readStatCards(html), table: tables[0], tables };
}

test('renderVolumeTab: per-plot table with estimated heights (default)', () => {
  const { cards, table } = renderFixtureVolumeTab();
  assert.equal(cards['Trees calculated'], '20');
  assert.equal(cards['Plots'], '5');
  assert.equal(cards['Heights estimated'], '1');
  assert.equal(cards['Excluded (no height)'], undefined);
  // columns: Plot | Trees | BA | Volume | Vol/ha | Est. heights
  assert.deepEqual(table.slice(1).map(r => r[0]), ['1', '2', '3', '5', '6']);
  assert.deepEqual(table.slice(1).map(r => fmtNum(r[4])), [29.04, 38.77, 78.33, 3.43, 12.78]);
  assert.deepEqual(table.slice(1).map(r => r[5]), ['0', '0', '0', '1', '0']);
});

test('renderVolumeTab: mean vol/ha with estimated heights (5 plots)', () => {
  // (29.0355 + 38.7733 + 78.3286 + 3.4260 + 12.7834) / 5 = 162.3468 / 5 = 32.4694 → "32,5"
  const { cards } = renderFixtureVolumeTab();
  assert.equal(fmtNum(cards['Mean vol/ha']), 32.5);
});

test('renderVolumeTab: estimated heights reported in one line, no method details', () => {
  const { html, tables } = renderFixtureVolumeTab();
  assert.match(html, /Heights estimated for 1 tree\(s\) without a measured height\./);
  assert.doesNotMatch(html, /Height model|Näslund|<details/);
  assert.equal(tables.length, 1);   // only the per-plot table
});

test('renderVolumeTab: height model off → tree 18 excluded, plot 5 counts as 0', () => {
  withConfig({ heightModel: { enabled: false } }, () => {
    const { html, cards, table } = renderFixtureVolumeTab();
    assert.equal(cards['Trees calculated'], '19');
    assert.equal(cards['Plots'], '5');
    assert.equal(cards['Heights estimated'], '0');
    assert.equal(cards['Excluded (no height)'], '1');
    // Plot 5 was surveyed (it has a tree row) → listed with 0 volume
    assert.deepEqual(table.slice(1).map(r => r[0]), ['1', '2', '3', '5', '6']);
    assert.deepEqual(table.slice(1).map(r => fmtNum(r[4])), [29.04, 38.77, 78.33, 0, 12.78]);
    // (29.0355 + 38.7733 + 78.3286 + 0 + 12.7834) / 5 = 158.9208 / 5 = 31.7842 → "31,8"
    // (was 39.7 before the fix: plot 5 was left out of the denominator)
    assert.equal(fmtNum(cards['Mean vol/ha']), 31.8);
    assert.match(html, /1 plot\(s\) without volume count as 0/);
    assert.match(html, /1 tree\(s\) without height excluded \(height estimation is off\)/);
  });
});

test('renderVolumeTab: with Plots CSV, mean covers exactly its plots', () => {
  const { html, cards, table } = renderFixtureVolumeTab(true);
  assert.equal(cards['Plots'], '5');
  // Plot 4 (no tree rows) listed as 0; plot 6 (not in plots.csv) flagged and excluded
  assert.deepEqual(table.slice(1).map(r => r[0]), ['1', '2', '3', '4', '5', '6 *']);
  assert.deepEqual(table.slice(1).map(r => fmtNum(r[4])), [29.04, 38.77, 78.33, 0, 3.43, 12.78]);
  // 149.5634 / 5 = 29.9127 → "29,9" — matches the Zones tab class averages
  assert.equal(fmtNum(cards['Mean vol/ha']), 29.9);
  assert.match(html, /Mean over the 5 plot\(s\) in the Plots CSV; 1 plot\(s\) without volume count as 0/);
  assert.match(html, /Not in the Plots CSV, excluded from the mean: 6/);
});

test('renderVolumeTab: with Plots CSV and height model off', () => {
  withConfig({ heightModel: { enabled: false } }, () => {
    const { cards } = renderFixtureVolumeTab(true);
    // 146.1374 / 5 = 29.2275 → "29,2"
    assert.equal(fmtNum(cards['Mean vol/ha']), 29.2);
  });
});

test('surveyedPlots: Plots CSV if loaded, else plots in the tree data', () => {
  const trees = loadFixture('trees.csv').rows;
  const cols = { plotCol: '_parent_index' };
  assert.deepEqual(app.surveyedPlots(trees, cols, null), { ids: ['1', '2', '3', '5', '6'], source: 'trees' });
  assert.deepEqual(app.surveyedPlots(trees, cols, loadFixture('plots.csv')),
                   { ids: ['1', '2', '3', '4', '5'], source: 'plots' });
  // Plots CSV without the configured ID column → fall back to tree data
  withConfig({ plotsPlotIdColumn: 'nope' }, () => {
    assert.equal(app.surveyedPlots(trees, cols, loadFixture('plots.csv')).source, 'trees');
  });
});
