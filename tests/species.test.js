'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, loadFixture, loadAllFixtures, withConfig, readTables, readStatCards, fmtNum, el } = require('./helpers');
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
 */

const EXPECTED = {
  // n, trees/ha, BA/ha, sample vol, vol/ha, share, vol/ha ≥30
  'Abies alba':          [3, 10.2950, 0.67212, 3.870824, 8.20720, 0.2744, 7.33686],
  'Picea abies':         [5, 56.4218, 0.94252, 2.799944, 7.65264, 0.2558, 3.78149],
  'Fagus sylvatica':     [6, 53.9861, 0.68925, 3.414168, 7.03763, 0.2353, 5.36173],
  'Acer pseudoplatanus': [3, 43.6911, 0.66482, 2.889576, 6.37031, 0.2130, 5.64151],
  '7':                   [1,  6.3654, 0.11249, 0.101310, 0.64488, 0.0216, 0],
  'Total':               [18, 170.7595, 3.08119, 13.075823, 29.91267, 1, 22.12159]
};

function withPlots() {
  loadAllFixtures();
  return speciesAnalysis(state.trees.rows, state.cols, state.heightModel, state.plots);
}

test('speciesAnalysis: per-species stems, basal area and volume (with plots.csv)', () => {
  const sa = withPlots();
  assert.equal(sa.nPlots, 5);
  assert.equal(sa.source, 'plots');
  assert.equal(sa.outside, 2);          // trees 19, 20 in plot 6
  assert.equal(sa.noVolume, 0);         // tree 18 has an estimated height
  // sorted by vol/ha, descending
  assert.deepEqual(sa.species.map(s => s.name), ['Abies alba', 'Picea abies', 'Fagus sylvatica', 'Acer pseudoplatanus', '7']);
  for (const x of sa.species.concat([sa.total])) {
    const [n, tHa, baHa, vol, volHa, share, volX] = EXPECTED[x.name];
    const m = x.name + ' ';
    assert.equal(x.n, n, m + 'n');
    close(x.treesHa, tHa, 5e-4, m + 'trees/ha');
    close(x.baHa, baHa, 5e-5, m + 'BA/ha');
    close(x.vol, vol, 5e-6, m + 'sample volume');
    close(x.volHa, volHa, 5e-5, m + 'vol/ha');
    close(x.volShare, share, 5e-5, m + 'share');
    close(x.volHaExpl, volX, 5e-5, m + 'vol/ha ≥30');
  }
});

/*
 * Diameter classes: 5–10 … 50–55 (smallest d = 5.0, largest 50.0), split before
 * 30–35 (index 5). Vol/ha per class = Σv/IZ of the class's trees ÷ 5, e.g.
 *   5–10:  Picea #6 5.3991/5 = 1.0798, Fagus #15 0.9468/5 = 0.1894, Acer #4 3.6440/5 = 0.7288
 *   30–35: Abies #8 8.6120/5 = 1.7224, Acer #14 (d = 30.0 exactly) 7.6561/5 = 1.5312
 *   40–45: Picea #7 18.9074/5 = 3.7815, Acer #17 20.5515/5 = 4.1103
 *
 *  vol/ha    Abies   Picea   Fagus   Acer    "7"     total
 *   5–10     0       1.0798  0.1894  0.7288  0       1.9980
 *  10–15     0       0.3669  0.2161  0       0       0.5830
 *  15–20     0.8703  1.2601  0       0       0.6449  2.7753
 *  20–25     0       0       1.2705  0       0       1.2705
 *  25–30     0       1.1644  0       0       0       1.1644
 *  < 30      0.8703  3.8712  1.6759  0.7288  0.6449  7.7911
 *  30–35     1.7224  0       0       1.5312  0       3.2536
 *  35–40     0       0       5.3617  0       0       5.3617
 *  40–45     0       3.7815  0       4.1103  0       7.8918
 *  45–50     0       0       0       0       0       0
 *  50–55     5.6145  0       0       0       0       5.6145
 *  ≥ 30      7.3369  3.7815  5.3617  5.6415  0      22.1216
 */

test('speciesAnalysis: vol/ha by diameter class, split at 30 cm', () => {
  const sa = withPlots();
  assert.deepEqual(sa.classes.map(c => c.lo), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  assert.equal(sa.splitIndex, 5);
  const s = byName(sa);
  const r4 = a => a.map(v => Math.round(v * 1e4) / 1e4);
  assert.deepEqual(r4(s['Picea abies'].classVolHa), [1.0798, 0.3669, 1.2601, 0, 1.1644, 0, 0, 3.7815, 0, 0]);
  assert.deepEqual(r4(s['Acer pseudoplatanus'].classVolHa), [0.7288, 0, 0, 0, 0, 1.5312, 0, 4.1103, 0, 0]);
  assert.deepEqual(r4(sa.total.classVolHa),
    [1.998, 0.583, 2.7753, 1.2705, 1.1644, 3.2536, 5.3617, 7.8918, 0, 5.6145]);

  // Subtotals below / at-or-above 30 cm
  const below = x => sum(x.classVolHa.slice(0, 5)), above = x => sum(x.classVolHa.slice(5));
  close(below(sa.total), 7.7911, 5e-4);
  close(above(sa.total), 22.1216, 5e-4);
  // ≥30 class sums equal the per-species ≥30 figures (tree 14 at exactly 30.0 counts as exploitable)
  for (const x of sa.species.concat([sa.total])) close(above(x), x.volHaExpl, 1e-9, x.name);
  close(s['Acer pseudoplatanus'].volHaExpl, 5.6415, 5e-4);
});

// ── Species add up to the existing totals ───────────────────────────────────

test('totals: species sums equal Volume tab mean and Dimensions trees/ha (with plots.csv)', () => {
  const sa = withPlots();
  close(sum(sa.species.map(s => s.volHa)), sa.total.volHa, 1e-9);
  close(sum(sa.species.map(s => s.treesHa)), sa.total.treesHa, 1e-9);
  close(sum(sa.species.map(s => s.baHa)), sa.total.baHa, 1e-9);
  // every class column adds up to the class total
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
  app.renderSpeciesAnalysis();
  const html = el('species-analysis').innerHTML;
  const [summary, volClass, zonesAll, zonesExpl] = readTables(html);
  return { summary, volClass, zonesAll, zonesExpl, html };
}

test('species analysis: summary, vol/ha class table and zone tables only', () => {
  const { html } = renderedTables();
  const titles = (html.match(/<div class="section-title"[^>]*>[\s\S]*?<\/div>/g) || []).map(t => t.replace(/<[^>]*>/g, ''));
  assert.deepEqual(titles, [
    'Volume, stems and basal area per species',
    'Volume per hectare (m³/ha) by species and diameter class',
    'Total volume per species and zone (m³) — all trees',
    'Total volume per species and zone (m³) — trees ≥ 30 cm']);
  assert.doesNotMatch(html, /Diameter per species|QMD|Trees per hectare by|<canvas/);
});

test('species analysis: summary table', () => {
  const { summary } = renderedTables();
  assert.deepEqual(summary[0], ['Species', 'Trees (sample)', 'Trees/ha', 'Basal area (m²/ha)',
    'Volume in sample (m³)', 'Vol/ha (m³/ha)', 'Share of vol/ha (%)', 'Vol/ha ≥ 30 cm (m³/ha)']);
  assert.deepEqual(summary[1], ['Abies alba', '3', '10,3', '0,67', '3,871', '8,21', '27,4 %', '7,34']);
  assert.deepEqual(summary[6], ['Total', '18', '170,8', '3,08', '13,076', '29,91', '100,0 %', '22,12']);
});

test('species analysis: vol/ha class table grouped below / at-or-above 30 cm with subtotals', () => {
  const { volClass, html } = renderedTables();
  assert.deepEqual(volClass.map(r => r[0]), [
    'Diameter class', 'Below 30 cm — regeneration potential',
    '5 – 10 cm', '10 – 15 cm', '15 – 20 cm', '20 – 25 cm', '25 – 30 cm', 'Subtotal &lt; 30 cm',
    '≥ 30 cm — exploitable',
    '30 – 35 cm', '35 – 40 cm', '40 – 45 cm', '45 – 50 cm', '50 – 55 cm', 'Subtotal ≥ 30 cm', 'TOTAL']);
  assert.deepEqual(volClass[0], ['Diameter class', 'Abies alba', 'Picea abies', 'Fagus sylvatica', 'Acer pseudoplatanus', '7', 'Total']);
  const row = l => volClass.find(r => r[0] === l).slice(1).map(fmtNum);
  assert.deepEqual(row('5 – 10 cm').slice(1, 4), [1.08, 0.19, 0.73]);
  assert.deepEqual(row('Subtotal &lt; 30 cm'), [0.87, 3.87, 1.68, 0.73, 0.64, 7.79]);
  assert.deepEqual(row('Subtotal ≥ 30 cm'), [7.34, 3.78, 5.36, 5.64, 0, 22.12]);
  assert.deepEqual(row('TOTAL'), [8.21, 7.65, 7.04, 6.37, 0.64, 29.91]);
  // exploitable rows are marked for styling; empty cells shown as "·"
  assert.equal((html.match(/<tr class="expl">/g) || []).length, 5);
  assert.deepEqual(volClass.find(r => r[0] === '45 – 50 cm').slice(1), ['·', '·', '·', '·', '·', '·']);
});

test('species analysis: zone tables (all trees, ≥ 30 cm)', () => {
  const { zonesAll, zonesExpl } = renderedTables();
  assert.deepEqual(zonesAll[0], ['Species', 'North', 'South', 'Total']);
  assert.deepEqual(zonesAll[2], ['Picea abies', '200', '79', '279']);
  assert.deepEqual(zonesAll[6], ['Total', '516', '458', '974']);
  assert.deepEqual(zonesExpl[6], ['Total', '332', '366', '698']);
});

test('species analysis: without zones CSV shows a hint instead of zone tables', () => {
  loadAllFixtures();
  state.zones = null;
  app.renderSpeciesAnalysis();
  const html = el('species-analysis').innerHTML;
  assert.match(html, /Load the Plots CSV and Zones CSV/);
  assert.equal(readTables(html).length, 2);   // summary + vol/ha class table
});

test('species analysis: species and zone names are escaped', () => {
  loadAllFixtures();
  state.trees.rows[0]['Species:'] = '<img src=x onerror=alert(1)>';
  state.zones = app.parseCSVText('Zone;21;22\n"<b>N</b>";1;1\n');
  app.renderSpeciesAnalysis();
  const html = el('species-analysis').innerHTML;
  assert.doesNotMatch(html, /<img|<b>N/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;N&lt;\/b&gt;/);
});

test('species analysis: lives in the Species tab, which draws no charts', () => {
  app.resetApp();
  app.switchTab('species');
  const parsed = loadFixture('trees.csv');
  app.prepareTrees(parsed);
  app.renderDashboard(parsed, 'trees.csv');
  assert.match(el('species-breakdown').innerHTML, /Species breakdown/);
  assert.match(el('species-analysis').innerHTML, /Volume, stems and basal area per species/);
  assert.equal(app.charts.species, undefined);
  app.resetApp();
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
  const tab = el('species-breakdown').innerHTML;
  const bars = readBars(tab);
  assert.deepEqual(bars, [['Fagus sylvatica', 7, 35], ['Picea abies', 6, 30], ['Acer pseudoplatanus', 3, 15],
                          ['Abies alba', 3, 15], ['7', 1, 5]]);
  assert.equal(sum(bars.map(b => b[1])), 20);
  assert.equal(sum(bars.map(b => b[2])), 100);
  assert.match(tab, /Numeric species value: "7" \(1 tree\)\. These are probably KoBoToolbox choice codes/);
  assert.match(tab, /20 tree record\(s\), 5 species\./);
  // the species analysis below has the "7" row; the warning is shown once, above the breakdown
  assert.doesNotMatch(el('species-analysis').innerHTML, /Numeric species value/);
  assert.deepEqual(readTables(el('species-analysis').innerHTML)[0].map(r => r[0]).slice(1),
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
  const bars = readBars(el('species-breakdown').innerHTML);
  assert.deepEqual(bars, [['Picea abies', 3, 60], ['(not recorded)', 1, 20], ['3', 1, 20]]);
  assert.match(el('species-breakdown').innerHTML, /5 tree record\(s\), 2 species plus trees with species \(not recorded\)/);
  assert.match(el('species-breakdown').innerHTML, /Numeric species value: "3" \(1 tree\)/);
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
  assert.match(el('species-analysis').innerHTML, /1 tree record\(s\) without diameter or inclusion zone not included/);
  app.resetApp();
});
