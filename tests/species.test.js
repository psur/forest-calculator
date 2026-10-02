'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, ChartStub, loadFixture, loadAllFixtures, withConfig, readTables, readStatCards, fmtNum, el } = require('./helpers');
const { speciesAnalysis, speciesZoneVolumes, diameterClassTable, surveyedPlots, state } = app;

function close(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    (msg ? msg + ': ' : '') + 'expected ' + expected + ' ± ' + tol + ', got ' + actual);
}
const sum = a => a.reduce((s, v) => s + v, 0);
const byName = sa => Object.fromEntries(sa.species.map(s => [s.name, s]));

/*
 * Hand calculation — species analysis with plots.csv (+ zones.csv) loaded,
 * default settings (height model on, 5 cm classes, min. exploitable 30 cm).
 *
 * Surveyed plots = plots.csv: 1, 2, 3, 4, 5 → N = 5. Plot 4 has no trees;
 * plot 6 (trees 19, 20) is not in plots.csv → excluded. 18 trees remain.
 * Per hectare = Σ(value / InclusionZone_ha) / 5. v/ha per tree: volume.test.js.
 * 1/IZ: 0.00503 → 198.8072, 0.03142 → 31.8269, 0.10179 → 9.8241.
 *
 *   #  species plot  d     class   1/IZ      g/IZ (m²)  v/IZ (m³)
 *   1  Fagus    1   35.5  35–40*   9.8241   0.97239   12.0071
 *   2  Fagus    1   20.0  20–25    9.8241   0.30863    2.9263
 *   3  Picea    1   12.3  10–15   31.8269   0.37818    1.8345
 *   4  Acer     1    8.4   5–10  198.8072   1.10174    3.6440
 *   5  "7"      1   15.0  15–20   31.8269   0.56243    3.2244
 *   6  Picea    1    9.9   5–10  198.8072   1.53036    5.3991
 *   7  Picea    2   42.0  40–45*   9.8241   1.36108   18.9074
 *   8  Abies    2   31.2  30–35*   9.8241   0.75109    8.6120
 *   9  Fagus    2   10.0  10–15   31.8269   0.24997    1.0803
 *  10  Picea    2   26.7  25–30    9.8241   0.55006    5.8218
 *  11  Abies    2   16.5  15–20   31.8269   0.68054    4.3517
 *  12  Abies    3   50.0  50–55*   9.8241   1.92897   28.0723
 *  13  Fagus    3   38.4  35–40*   9.8241   1.13775   14.8016
 *  14  Acer     3   30.0  30–35*   9.8241   0.69443    7.6561   (exactly 30 → exploitable)
 *  15  Fagus    3    5.0   5–10  198.8072   0.39036    0.9468
 *  16  Picea    3   18.9  15–20   31.8269   0.89291    6.3004
 *  17  Acer     3   44.5  40–45*   9.8241   1.52793   20.5515
 *  18  Fagus    5   22.4  20–25    9.8241   0.38715    3.4260   (estimated height 20.07 m)
 *  (* = ≥ 30 cm)
 *
 * Per species (sums of the rows above, then ÷ 5):
 *   Abies (8, 11, 12):  Σ1/IZ = 9.8241+31.8269+9.8241 = 51.4752        → 10.2950 trees/ha
 *                       Σg/IZ = 0.75109+0.68054+1.92897 = 3.36060      →  0.67212 m²/ha
 *                       Σv/IZ = 8.6120+4.3517+28.0723 = 41.0360        →  8.2072 m³/ha
 *                       ≥30: 8.6120+28.0723 = 36.6843                  →  7.3369 m³/ha
 *   Picea (3,6,7,10,16): Σ1/IZ = 31.8269+198.8072+9.8241+9.8241+31.8269 = 282.1092 → 56.4218
 *                       Σg/IZ = 4.71258 → 0.94252;  Σv/IZ = 38.2632 → 7.6526;  ≥30: 18.9074 → 3.7815
 *   Fagus (1,2,9,13,15,18): Σ1/IZ = 4×9.8241+31.8269+198.8072 = 269.9306 → 53.9861
 *                       Σg/IZ = 3.44625 → 0.68925;  Σv/IZ = 35.1882 → 7.0376;  ≥30: 26.8087 → 5.3617
 *   Acer (4, 14, 17):   Σ1/IZ = 198.8072+2×9.8241 = 218.4555 → 43.6911
 *                       Σg/IZ = 3.32411 → 0.66482;  Σv/IZ = 31.8516 → 6.3703;  ≥30: 28.2076 → 5.6415
 *   "7" (5):            31.8269 → 6.3654;  0.56243 → 0.11249;  3.2244 → 0.6449;  ≥30: 0
 *   TOTAL:              853.7973 → 170.7595;  15.40596 → 3.08119;  149.5633 → 29.9127;  ≥30: 22.1216
 *
 * Share of vol/ha: Abies 8.2072/29.9127 = 27.44 %, Picea 25.58 %, Fagus 23.53 %, Acer 21.30 %, "7" 2.16 %.
 * Sample volume Σv (m³): Abies 0.876619+0.136730+2.857475 = 3.870824; Picea 2.799944;
 *   Fagus 3.414168; Acer 2.889576; "7" 0.101310; total 13.075823.
 * Diameter (sample): Abies n 3, mean (31.2+16.5+50)/3 = 32.567, min 16.5, max 50
 *   Fagus n 6, mean 131.3/6 = 21.883, min 5, max 38.4;  total n 18, mean 436.7/18 = 24.261
 * QMD = √(BA/ha ÷ trees/ha × 40000/π):
 *   Abies √(0.67212/10.2950 × 12732.395) = √831.25 = 28.831 cm
 *   Fagus √(0.68925/53.9861 × 12732.395) = √162.56 = 12.750 cm
 *   total √(3.08119/170.7595 × 12732.395) = √229.74 = 15.157 cm
 */

const EXPECTED = {
  // n, trees/ha, BA/ha, sample vol, vol/ha, share, vol/ha ≥30, mean d, min, max, QMD
  'Abies alba':          [3, 10.2950, 0.67212, 3.870824, 8.20720, 0.2744, 7.33686, 32.5667, 16.5, 50,   28.8313],
  'Picea abies':         [5, 56.4218, 0.94252, 2.799944, 7.65264, 0.2558, 3.78149, 21.9600,  9.9, 42,   14.5840],
  'Fagus sylvatica':     [6, 53.9861, 0.68925, 3.414168, 7.03763, 0.2353, 5.36173, 21.8833,  5,   38.4, 12.7498],
  'Acer pseudoplatanus': [3, 43.6911, 0.66482, 2.889576, 6.37031, 0.2130, 5.64151, 27.6333,  8.4, 44.5, 13.9191],
  '7':                   [1,  6.3654, 0.11249, 0.101310, 0.64488, 0.0216, 0,       15,      15,   15,   15],
  'Total':               [18, 170.7595, 3.08119, 13.075823, 29.91267, 1, 22.12159, 24.2611, 5, 50, 15.1573]
};

function withPlots() {
  loadAllFixtures();
  return speciesAnalysis(state.trees.rows, state.cols, state.heightModel, state.plots);
}

test('speciesAnalysis: per-species stems, basal area, volume and diameters (with plots.csv)', () => {
  const sa = withPlots();
  assert.equal(sa.nPlots, 5);
  assert.equal(sa.source, 'plots');
  assert.equal(sa.outside, 2);          // trees 19, 20 in plot 6
  assert.equal(sa.noVolume, 0);         // tree 18 has an estimated height
  // sorted by vol/ha, descending
  assert.deepEqual(sa.species.map(s => s.name), ['Abies alba', 'Picea abies', 'Fagus sylvatica', 'Acer pseudoplatanus', '7']);
  for (const x of sa.species.concat([sa.total])) {
    const [n, tHa, baHa, vol, volHa, share, volX, dMean, dMin, dMax, qmd] = EXPECTED[x.name];
    const m = x.name + ' ';
    assert.equal(x.n, n, m + 'n');
    close(x.treesHa, tHa, 5e-4, m + 'trees/ha');
    close(x.baHa, baHa, 5e-5, m + 'BA/ha');
    close(x.vol, vol, 5e-6, m + 'sample volume');
    close(x.volHa, volHa, 5e-5, m + 'vol/ha');
    close(x.volShare, share, 5e-5, m + 'share');
    close(x.volHaExpl, volX, 5e-5, m + 'vol/ha ≥30');
    close(x.dMean, dMean, 5e-4, m + 'mean d');
    assert.equal(x.dMin, dMin, m + 'min d');
    assert.equal(x.dMax, dMax, m + 'max d');
    close(x.qmd, qmd, 5e-4, m + 'QMD');
  }
});

/*
 * Diameter classes: 5–10 … 50–55 (smallest d = 5.0, largest 50.0), split before
 * 30–35 (index 5). Trees/ha per class = Σ1/IZ in class ÷ 5, e.g.
 *   5–10:  Picea #6, Fagus #15, Acer #4 → 198.8072/5 = 39.7614 each, total 119.2843
 *   30–35: Abies #8, Acer #14 → 9.8241/5 = 1.9648 each
 * Vol/ha per class = Σv/IZ in class ÷ 5, e.g. 40–45: Picea 18.9074/5 = 3.7815, Acer 20.5515/5 = 4.1103
 *
 *  trees/ha  Abies   Picea   Fagus   Acer    "7"     total
 *   5–10     0       39.7614 39.7614 39.7614 0       119.2843
 *  10–15     0        6.3654  6.3654 0       0        12.7307
 *  15–20     6.3654   6.3654 0       0       6.3654   19.0961
 *  20–25     0       0        3.9297 0       0         3.9297
 *  25–30     0        1.9648 0       0       0         1.9648
 *  < 30      6.3654  54.4570 50.0565 39.7614 6.3654  157.0056
 *  30–35     1.9648  0       0        1.9648 0         3.9297
 *  35–40     0       0        3.9297 0       0         3.9297
 *  40–45     0        1.9648 0        1.9648 0         3.9297
 *  45–50     0       0       0       0       0         0
 *  50–55     1.9648  0       0       0       0         1.9648
 *  ≥ 30      3.9297   1.9648  3.9297  3.9297 0        13.7538
 *
 *  vol/ha    Abies   Picea   Fagus   Acer    "7"     total
 *  < 30      0.8703  3.8712  1.6759  0.7288  0.6449   7.7911
 *  ≥ 30      7.3369  3.7815  5.3617  5.6415  0       22.1216
 */

test('speciesAnalysis: diameter classes, split at 30 cm', () => {
  const sa = withPlots();
  assert.deepEqual(sa.classes.map(c => c.lo), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  assert.equal(sa.splitIndex, 5);
  const s = byName(sa);
  const r4 = a => a.map(v => Math.round(v * 1e4) / 1e4);
  assert.deepEqual(r4(s['Picea abies'].classTreesHa), [39.7614, 6.3654, 6.3654, 0, 1.9648, 0, 0, 1.9648, 0, 0]);
  assert.deepEqual(r4(s['Acer pseudoplatanus'].classTreesHa), [39.7614, 0, 0, 0, 0, 1.9648, 0, 1.9648, 0, 0]);
  assert.deepEqual(r4(sa.total.classTreesHa),
    [119.2843, 12.7307, 19.0961, 3.9297, 1.9648, 3.9297, 3.9297, 3.9297, 0, 1.9648]);
  close(s['Picea abies'].classVolHa[7], 3.7815, 5e-5);
  close(s['Acer pseudoplatanus'].classVolHa[7], 4.1103, 5e-5);

  // Subtotals below / at-or-above 30 cm
  const below = (x, k) => sum(x[k].slice(0, 5)), above = (x, k) => sum(x[k].slice(5));
  close(below(sa.total, 'classTreesHa'), 157.0056, 5e-4);
  close(above(sa.total, 'classTreesHa'), 13.7538, 5e-4);
  close(below(sa.total, 'classVolHa'), 7.7911, 5e-4);
  close(above(sa.total, 'classVolHa'), 22.1216, 5e-4);
  // ≥30 class sums equal the per-species ≥30 figures (tree 14 at exactly 30.0 counts as exploitable)
  for (const x of sa.species.concat([sa.total])) {
    close(above(x, 'classVolHa'), x.volHaExpl, 1e-9, x.name);
    close(above(x, 'classTreesHa'), x.treesHaExpl, 1e-9, x.name);
  }
  close(s['Acer pseudoplatanus'].treesHaExpl, 3.9297, 5e-4);
});

// ── Species add up to the existing totals ───────────────────────────────────

test('totals: species sums equal Volume tab mean and Dimensions trees/ha (with plots.csv)', () => {
  const sa = withPlots();
  close(sum(sa.species.map(s => s.volHa)), sa.total.volHa, 1e-9);
  close(sum(sa.species.map(s => s.treesHa)), sa.total.treesHa, 1e-9);
  close(sum(sa.species.map(s => s.baHa)), sa.total.baHa, 1e-9);
  // every class column adds up to the class total
  sa.total.classTreesHa.forEach((v, i) => close(sum(sa.species.map(s => s.classTreesHa[i])), v, 1e-9));
  sa.total.classVolHa.forEach((v, i) => close(sum(sa.species.map(s => s.classVolHa[i])), v, 1e-9));

  // Volume tab mean with plots.csv: 149.5634 / 5 = 29.9127 (volume.test.js) → "29,9"
  close(sa.total.volHa, 29.9127, 5e-4);
  app.renderVolumeTab(state.trees.rows, state.cols, state.heightModel, state.plots);
  assert.equal(fmtNum(readStatCards(el('volume-stats').innerHTML)['Mean vol/ha']), 29.9);
  // Dimensions table over the same plots
  const dc = diameterClassTable(state.trees.rows, state.cols, 5, surveyedPlots(state.trees.rows, state.cols, state.plots).ids);
  close(sa.total.treesHa, dc.sumTreesHa, 1e-9);
});

test('totals: without plots.csv species match the Dimensions table and Volume tab', () => {
  // Tree-data plots 1, 2, 3, 5, 6 (N = 5), all 20 trees:
  //   trees/ha 895.4483 / 5 = 179.0897;  vol/ha 162.3468 / 5 = 32.4694 (volume.test.js)
  const parsed = loadFixture('trees.csv');
  app.prepareTrees(parsed);
  const sa = speciesAnalysis(parsed.rows, state.cols, state.heightModel, null);
  assert.equal(sa.source, 'trees');
  assert.equal(sa.total.n, 20);
  close(sa.total.treesHa, 179.0897, 5e-4);
  close(sa.total.volHa, 32.4694, 5e-4);
  close(sum(sa.species.map(s => s.treesHa)), 179.0897, 5e-4);
  const dc = diameterClassTable(parsed.rows, state.cols, 5);
  close(dc.sumTreesHa, 179.0897, 5e-4);
  assert.equal(dc.totalTreesHa, 179);   // Dimensions table (sum of rounded classes)
});

/*
 * Volume per species and zone = Σ class ha × species class average (plots.csv):
 *   class 21 = plots 1, 2;  class 22 = plots 3, 4, 5;  class 12 → fallback 21.
 *   Picea: a21 = (1.8345+5.3991 + 18.9074+5.8218)/2 = (7.2336+24.7292)/2 = 15.9814
 *          a22 = (6.3004 + 0 + 0)/3 = 2.1001
 *          North = (1.5+10.5)·15.9814 + 4·2.1001 = 191.777 + 8.401 = 200.178
 *          South = 3.25·15.9814 + 12.75·2.1001 = 51.940 + 26.777 = 78.716
 *   Fagus: a21 = (14.9334 + 1.0803)/2 = 8.0069;  a22 = (15.7484 + 0 + 3.4260)/3 = 6.3915
 *          North = 12·8.0069 + 4·6.3915 = 121.648;  South = 3.25·8.0069 + 12.75·6.3915 = 107.514
 *
 *   all trees   North     South     total        ≥ 30 cm   North     South     total
 *   Abies      115.212   140.373   255.585                  89.102   133.302   222.404
 *   Picea      200.178    78.716   278.894                 113.445    30.725   144.169
 *   Fagus      121.648   107.514   229.162                  91.778    82.418   174.196
 *   Acer        59.474   125.804   185.278                  37.610   119.882   157.492
 *   "7"         19.346     5.240    24.586                   0         0         0
 *   TOTAL      515.858   457.646   973.505                 331.935   366.327   698.261
 *   = Zones tab: 515.859 / 457.647 / 973.506 (zones.test.js) → "516" / "458" / "974"
 */

test('speciesZoneVolumes: per species and zone, all trees and ≥ 30 cm', () => {
  const sa = withPlots();
  const zv = speciesZoneVolumes(sa, state.plots, state.zones);
  assert.deepEqual(zv.zones, ['North', 'South']);
  const z = Object.fromEntries(zv.species.map(s => [s.name, s]));
  const exp = {
    'Abies alba': [[115.212, 140.373], [89.102, 133.302]],
    'Picea abies': [[200.178, 78.716], [113.445, 30.725]],
    'Fagus sylvatica': [[121.648, 107.514], [91.778, 82.418]],
    'Acer pseudoplatanus': [[59.474, 125.804], [37.610, 119.882]],
    '7': [[19.346, 5.240], [0, 0]]
  };
  for (const [name, [all, expl]] of Object.entries(exp)) {
    all.forEach((v, i) => close(z[name].all[i], v, 2e-3, name + ' all ' + zv.zones[i]));
    expl.forEach((v, i) => close(z[name].expl[i], v, 2e-3, name + ' ≥30 ' + zv.zones[i]));
  }
  close(zv.total.expl[0], 331.935, 2e-3);
  close(zv.total.expl[1], 366.327, 2e-3);
});

test('totals: species zone volumes add up to the Zones tab', () => {
  const sa = withPlots();
  const zv = speciesZoneVolumes(sa, state.plots, state.zones);
  [0, 1].forEach(i => {
    close(sum(zv.species.map(s => s.all[i])), zv.total.all[i], 1e-9);
    close(sum(zv.species.map(s => s.expl[i])), zv.total.expl[i], 1e-9);
  });
  // Hand values of the Zones tab (zones.test.js): North 515.859, South 457.647
  close(zv.total.all[0], 515.859, 2e-3);
  close(zv.total.all[1], 457.647, 2e-3);
  // and the rendered Zones tab
  app.runZoneCalculation();
  const zoneTable = readTables(el('zones-result').innerHTML)[1];
  assert.deepEqual([zoneTable[1][7], zoneTable[2][7], zoneTable[3][7]].map(fmtNum),
    [Math.round(zv.total.all[0]), Math.round(zv.total.all[1]), Math.round(sum(zv.total.all))]);
});

// ── Rendering ───────────────────────────────────────────────────────────────

function renderedTables() {
  loadAllFixtures();
  app.renderSpeciesTab();
  return {
    result: readTables(el('spp-result').innerHTML),
    dclass: readTables(el('spp-dclass').innerHTML),
    zones: readTables(el('spp-zones').innerHTML),
    html: el('spp-result').innerHTML + el('spp-dclass').innerHTML + el('spp-zones').innerHTML
  };
}

test('species tab: summary and diameter tables', () => {
  const { result } = renderedTables();
  const [summary, diam] = result;
  assert.deepEqual(summary[0], ['Species', 'Trees (sample)', 'Trees/ha', 'Basal area (m²/ha)',
    'Volume in sample (m³)', 'Vol/ha (m³/ha)', 'Share of vol/ha', 'Vol/ha ≥ 30 cm']);
  assert.deepEqual(summary[1], ['Abies alba', '3', '10,3', '0,67', '3,871', '8,21', '27,4 %', '7,34']);
  assert.deepEqual(summary[6], ['Total', '18', '170,8', '3,08', '13,076', '29,91', '100,0 %', '22,12']);
  assert.deepEqual(diam[3], ['Fagus sylvatica', '6', '21,9', '5,0', '38,4', '12,7']);
  assert.deepEqual(diam[6], ['Total', '18', '24,3', '5,0', '50,0', '15,2']);
});

test('species tab: class table grouped below / at-or-above 30 cm with subtotals', () => {
  const { dclass, html } = renderedTables();
  const trees = dclass[0];
  const labels = trees.map(r => r[0]);
  assert.deepEqual(labels, [
    'Diameter class', 'Below 30 cm — regeneration potential',
    '5 – 10 cm', '10 – 15 cm', '15 – 20 cm', '20 – 25 cm', '25 – 30 cm', 'Subtotal &lt; 30 cm',
    '≥ 30 cm — exploitable',
    '30 – 35 cm', '35 – 40 cm', '40 – 45 cm', '45 – 50 cm', '50 – 55 cm', 'Subtotal ≥ 30 cm', 'TOTAL']);
  const row = l => trees.find(r => r[0] === l).slice(1).map(fmtNum);
  assert.deepEqual(row('Subtotal &lt; 30 cm'), [6.4, 54.5, 50.1, 39.8, 6.4, 157.0]);
  assert.deepEqual(row('Subtotal ≥ 30 cm'), [3.9, 2.0, 3.9, 3.9, 0, 13.8]);
  assert.deepEqual(row('TOTAL'), [10.3, 56.4, 54.0, 43.7, 6.4, 170.8]);
  const vol = dclass[1];
  assert.deepEqual(vol.find(r => r[0] === 'Subtotal ≥ 30 cm').slice(1).map(fmtNum), [7.34, 3.78, 5.36, 5.64, 0, 22.12]);
  // exploitable rows are marked for styling; empty cells shown as "·"
  assert.equal((html.match(/<tr class="expl">/g) || []).length, 2 * 5);
  assert.deepEqual(trees.find(r => r[0] === '45 – 50 cm').slice(1), ['·', '·', '·', '·', '·', '·']);
});

test('species tab: zone tables (all trees, ≥ 30 cm)', () => {
  const { zones } = renderedTables();
  const [all, expl] = zones;
  assert.deepEqual(all[0], ['Species', 'North', 'South', 'Total']);
  assert.deepEqual(all[2], ['Picea abies', '200', '79', '279']);
  assert.deepEqual(all[6], ['Total', '516', '458', '974']);
  assert.deepEqual(expl[6], ['Total', '332', '366', '698']);
});

test('species tab: without zones CSV shows a hint instead of zone tables', () => {
  loadAllFixtures();
  state.zones = null;
  app.renderSpeciesTab();
  assert.match(el('spp-zones').innerHTML, /Load the Plots CSV and Zones CSV/);
  assert.equal(readTables(el('spp-zones').innerHTML).length, 0);
});

test('species tab: species and zone names are escaped', () => {
  loadAllFixtures();
  state.trees.rows[0]['Species:'] = '<img src=x onerror=alert(1)>';
  state.zones = app.parseCSVText('Zone;21;22\n"<b>N</b>";1;1\n');
  app.renderSpeciesTab();
  const html = el('spp-result').innerHTML + el('spp-dclass').innerHTML + el('spp-zones').innerHTML;
  assert.doesNotMatch(html, /<img|<b>N/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;N&lt;\/b&gt;/);
});

// ── Chart ───────────────────────────────────────────────────────────────────

test('species chart: stacked trees/ha by class and species, drawn when the tab opens', () => {
  app.switchTab('species');
  loadAllFixtures();
  app.renderSpeciesTab();
  const before = ChartStub.instances.length;
  assert.equal(ChartStub.instances.filter(c => c.canvasId === 'spp-dclass-chart' && !c.destroyed).length, 0);
  app.switchTab('spp');
  assert.equal(ChartStub.instances.length, before + 1);
  const c = ChartStub.instances[ChartStub.instances.length - 1];
  assert.equal(c.canvasId, 'spp-dclass-chart');
  assert.equal(c.config.options.scales.x.stacked, true);
  assert.equal(c.config.options.scales.y.stacked, true);
  assert.deepEqual(c.config.data.labels, ['5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–45', '45–50', '50–55']);
  assert.deepEqual(c.config.data.datasets.map(d => d.label), ['Abies alba', 'Picea abies', 'Fagus sylvatica', 'Acer pseudoplatanus', '7']);
  assert.deepEqual(c.config.data.datasets[1].data, [39.76, 6.37, 6.37, 0, 1.96, 0, 0, 1.96, 0, 0]);
  assert.equal(c.config.plugins.length, 1);
  assert.equal(c.config.plugins[0].id, 'thresholdLine');

  // Reloading the Zones CSV re-renders: old chart destroyed, new one drawn (tab visible)
  state.zones = loadFixture('zones.csv');
  app.renderSpeciesTab();
  assert.ok(c.destroyed);
  app.switchTab('species');
});

test('thresholdLinePlugin: dashed line between classes 25–30 and 30–35', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (...a) => calls.push([k, ...a]), set: (t, k, v) => (t[k] = v, true) });
  // category centres at 10, 30, 50, … (index · 20 + 10)
  const chart = { ctx, chartArea: { top: 5, bottom: 205 }, data: { labels: new Array(10).fill('') },
                  scales: { x: { getPixelForValue: i => i * 20 + 10 } } };
  app.thresholdLinePlugin(5, '30 cm').afterDatasetsDraw(chart);
  // between centres of index 4 (90) and 5 (110) → x = 100
  assert.deepEqual(calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo'), [['moveTo', 100, 5], ['lineTo', 100, 205]]);
  assert.deepEqual(calls.find(c => c[0] === 'fillText'), ['fillText', '30 cm', 104, 17]);

  // threshold outside the class range → nothing drawn
  calls.length = 0;
  app.thresholdLinePlugin(0, '30 cm').afterDatasetsDraw(chart);
  app.thresholdLinePlugin(10, '30 cm').afterDatasetsDraw(chart);
  assert.equal(calls.length, 0);
});

// ── Class grid and Dimensions table ─────────────────────────────────────────

test('diameter class grid: 30 cm is always a class edge', () => {
  // default: 5 cm classes through 30 → 0, 5, 10, …
  assert.deepEqual(app.dClassRange(5, 50, 5).map(c => c.lo), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  // 4 cm classes: edges …, 22, 26, 30, 34 (not 28, 32)
  withConfig({ diameterClassWidth_cm: 4 }, () => {
    assert.deepEqual(app.dClassRange(23, 35, 4).map(c => [c.lo, c.hi]), [[22, 26], [26, 30], [30, 34], [34, 38]]);
    loadAllFixtures();
    const sa = speciesAnalysis(state.trees.rows, state.cols, state.heightModel, state.plots);
    assert.equal(sa.classes[sa.splitIndex].lo, 30);
  });
});

test('Dimensions diameter-class table: uses the Plots CSV plots once loaded', () => {
  loadAllFixtures();
  app.renderDiameterClassTable(state.trees.rows, state.cols, state.plots);
  const html = el('dims-dclass').innerHTML;
  const t = readTables(html)[0];
  // 5 plots of plots.csv; plot 6 (trees 19, 20) excluded:
  // classes 119.28, 12.73, 19.10, 3.93, 1.96, 3.93, 3.93, 3.93, 0, 1.96 → rounded sum 171
  assert.equal(t[t.length - 1][2], '171');
  assert.match(html, /Based on 5 plot\(s\) in the Plots CSV/);
  assert.match(html, /2 tree\(s\) in plots not in the Plots CSV excluded/);
});

// ── Species values: one treatment everywhere ────────────────────────────────

/** Bars of a barChart() as [label, count, percent]. */
function readBars(html) {
  const re = /<span class="bar-label"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span class="bar-count">(\d+) <span[^>]*>\((\d+)%\)<\/span>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push([m[1], Number(m[2]), Number(m[3])]);
  return out;
}

test('species values: blank → (not recorded), numeric codes detected', () => {
  assert.equal(app.speciesOf({ s: '  Picea abies ' }, 's'), 'Picea abies');
  assert.equal(app.speciesOf({ s: '   ' }, 's'), app.NOT_RECORDED);
  assert.equal(app.speciesOf({ s: 'x' }, null), app.NOT_RECORDED);
  assert.ok(app.isNumericCode('7'));
  assert.ok(app.isNumericCode('12,0'));
  assert.ok(!app.isNumericCode('Picea 2'));
  assert.ok(!app.isNumericCode(app.NOT_RECORDED));
  const entries = app.speciesCounts([{ s: 'A' }, { s: '' }, { s: '7' }, { s: 'A' }], 's');
  assert.deepEqual(entries, [['A', 2], [app.NOT_RECORDED, 1], ['7', 1]]);
  assert.equal(app.speciesNumber(entries), 2);   // "(not recorded)" is not a species
});

test('fixture: numeric species "7" is shown everywhere, with a warning', () => {
  app.resetApp();   // no plots.csv / zones.csv from earlier tests
  const parsed = loadFixture('trees.csv');
  app.prepareTrees(parsed);
  app.renderDashboard(parsed, 'trees.csv');
  // summary card: Fagus, Picea, Acer, Abies, "7"
  assert.equal(readStatCards(el('top-stats').innerHTML)['Species'], '5');
  const tab = el('tab-species').innerHTML;
  const bars = readBars(tab);
  assert.deepEqual(bars, [['Fagus sylvatica', 7, 35], ['Picea abies', 6, 30], ['Acer pseudoplatanus', 3, 15],
                          ['Abies alba', 3, 15], ['7', 1, 5]]);
  assert.equal(sum(bars.map(b => b[1])), 20);
  assert.equal(sum(bars.map(b => b[2])), 100);
  assert.match(tab, /Numeric species value: "7" \(1 tree\)\. These are probably KoBoToolbox choice codes/);
  assert.match(tab, /20 tree record\(s\), 5 species\./);
  // the Species analysis tab carries the same warning and the "7" row
  assert.match(el('spp-result').innerHTML, /Numeric species value: "7" \(1 tree\)/);
  assert.deepEqual(readTables(el('spp-result').innerHTML)[0].map(r => r[0]).slice(1),
    ['Picea abies', 'Abies alba', 'Fagus sylvatica', 'Acer pseudoplatanus', '7', 'Total']);
  app.resetApp();
});

test('fixture: Species tab counts agree with the Species analysis tab', () => {
  const parsed = loadFixture('trees.csv');
  app.prepareTrees(parsed);
  const tabCounts = Object.fromEntries(app.speciesCounts(parsed.rows, state.cols.speciesCol));

  // Without plots.csv every tree record is analysed: identical counts per species
  let sa = speciesAnalysis(parsed.rows, state.cols, state.heightModel, null);
  assert.deepEqual(Object.fromEntries(sa.species.map(s => [s.name, s.n])), tabCounts);
  assert.equal(sa.total.n, 20);

  // With plots.csv, plot 6 (Picea #19, Fagus #20) is excluded:
  //   records 20 = analysed 18 + outside 2 + without diameter/IZ 0
  sa = speciesAnalysis(parsed.rows, state.cols, state.heightModel, loadFixture('plots.csv'));
  assert.equal(sa.total.n + sa.outside + sa.noDiamIz, 20);
  const n = Object.fromEntries(sa.species.map(s => [s.name, s.n]));
  assert.deepEqual(n, { ...tabCounts, 'Picea abies': tabCounts['Picea abies'] - 1, 'Fagus sylvatica': tabCounts['Fagus sylvatica'] - 1 });
});

test('"(not recorded)": shown as a row and in totals, not counted as a species', () => {
  app.resetApp();
  // 5 records: Picea ×2 (+1 without diameter), blank species ×1, code "3" ×1; IZ 0.1 ha → 10 trees/ha each
  const parsed = app.parseCSVText([
    '"Species:";"Diameter [cm]:";"Height [m]:";"InclusionZone_ha";"_parent_index"',
    '"Picea abies";"20";"18";"0,1";"1"',
    '"Picea abies";"22";"19";"0,1";"1"',
    '"";"25";"20";"0,1";"1"',
    '"3";"15";"14";"0,1";"2"',
    '"Picea abies";"";"";"0,1";"2"'
  ].join('\n'));
  app.prepareTrees(parsed);
  app.renderDashboard(parsed, 'x.csv');

  // Species tab: Picea 3 (60 %), (not recorded) 1 (20 %), "3" 1 (20 %) — all records, 100 %
  assert.equal(readStatCards(el('top-stats').innerHTML)['Species'], '2');
  const bars = readBars(el('tab-species').innerHTML);
  assert.deepEqual(bars, [['Picea abies', 3, 60], ['(not recorded)', 1, 20], ['3', 1, 20]]);
  assert.match(el('tab-species').innerHTML, /5 tree record\(s\), 2 species plus trees with species \(not recorded\)/);
  assert.match(el('tab-species').innerHTML, /Numeric species value: "3" \(1 tree\)/);
  // Genus tab uses the same label
  assert.deepEqual(readBars(el('tab-genus').innerHTML).map(b => b[0]), ['Picea', '(not recorded)', '3']);

  // Species analysis: 2 plots; trees/ha = 10 per tree ÷ 2 = 5 per tree
  const sa = speciesAnalysis(parsed.rows, state.cols, state.heightModel, null);
  const s = byName(sa);
  assert.deepEqual(Object.keys(s).sort(), ['(not recorded)', '3', 'Picea abies']);
  assert.equal(s['(not recorded)'].n, 1);
  close(s['(not recorded)'].treesHa, 5, 1e-9);
  close(s['Picea abies'].treesHa, 10, 1e-9);
  // totals include the (not recorded) tree; the record without diameter is reported
  assert.equal(sa.total.n, 4);
  close(sa.total.treesHa, 20, 1e-9);
  assert.equal(sa.noDiamIz, 1);
  assert.equal(sa.total.n + sa.noDiamIz, bars.reduce((a, b) => a + b[1], 0));
  assert.match(el('spp-result').innerHTML, /1 tree record\(s\) without diameter or inclusion zone not included/);
  app.resetApp();
});
