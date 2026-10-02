'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, loadFixture, withConfig } = require('./helpers');
const { fitNaslund, naslundHeight, fitHeightModel, estimateHeight, calcTrees, prepareTrees, state } = app;

function close(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    (msg ? msg + ': ' : '') + 'expected ' + expected + ' ± ' + tol + ', got ' + actual);
}

const COLS = {
  diagCol: 'Diameter [cm]:', htCol: 'Height [m]:', izCol: 'InclusionZone_ha',
  plotCol: '_parent_index', speciesCol: 'Species:'
};

/*
 * Näslund height curve   h = 1.3 + d² / (a + b·d)²
 * Linear form            y = d / √(h − 1.3) = a + b·d      → ordinary least squares
 *   b = (n·Σdy − Σd·Σy) / (n·Σd² − (Σd)²),   a = (Σy − b·Σd) / n
 *
 * The 19 fixture trees with measured height (tree 18 has none):
 *
 *   #  species               d     h      y = d/√(h−1.3)   d·y
 *   1  Fagus sylvatica      35.5  28.0   6.87025         243.8940
 *   2  Fagus sylvatica      20.0  21.5   4.44994          88.9988
 *   3  Picea abies          12.3  11.0   3.94929          48.5763
 *   4  Acer pseudoplatanus   8.4   7.5   3.37352          28.3376
 *   5  7                    15.0  13.0   4.38529          65.7794
 *   6  Picea abies           9.9   8.0   3.82470          37.8646
 *   7  Picea abies          42.0  31.5   7.64268         320.9927
 *   8  Abies alba           31.2  26.0   6.27778         195.8667
 *   9  Fagus sylvatica      10.0   9.8   3.42997          34.2997
 *  10  Picea abies          26.7  24.0   5.60400         149.6269
 *  11  Abies alba           16.5  14.5   4.54148          74.9343
 *  12  Abies alba           50.0  33.0   8.88056         444.0280
 *  13  Fagus sylvatica      38.4  29.5   7.23114         277.6757
 *  14  Acer pseudoplatanus  30.0  25.0   6.16236         184.8708
 *  15  Fagus sylvatica       5.0   5.5   2.43975          12.1988
 *  16  Picea abies          18.9  16.0   4.92950          93.1676
 *  17  Acer pseudoplatanus  44.5  30.5   8.23509         366.4617
 *  19  Picea abies          33.0  27.0   6.50950         214.8134
 *  20  Fagus sylvatica      14.2  12.5   4.24306          60.2515
 *
 * Measured trees per species: Fagus 6, Picea 6, Abies 3, Acer 3, "7" 1.
 * Default minimum is 10, so no species has its own curve → all-species curve.
 *
 * All species (n = 19): Σd = 461.5, Σy = 102.97988, Σd² = 14555.35, Σdy = 2942.63839
 *   b = (19·2942.63839 − 461.5·102.97988) / (19·14555.35 − 461.5²)
 *     = (55910.1294 − 47525.2146) / (276551.65 − 212982.25) = 8384.9148 / 63569.40 = 0.131902
 *   a = (102.97988 − 0.1319017·461.5) / 19 = (102.97988 − 60.87263) / 19 = 42.10725 / 19 = 2.216171
 *   tree 18, d = 22.4:  a + b·d = 2.216170 + 0.1319017·22.4 = 2.216170 + 2.954598 = 5.170768
 *                       h = 1.3 + (22.4 / 5.170774)² = 1.3 + 4.332044² = 1.3 + 18.76660 = 20.0666
 *
 * Fagus sylvatica only (n = 6, used when the minimum is ≤ 6):
 *   trees 1, 2, 9, 13, 15, 20: Σd = 123.1, Σy = 28.66412, Σd² = 3461.45, Σdy = 717.31846
 *   b = (6·717.31846 − 123.1·28.66412) / (6·3461.45 − 123.1²)
 *     = (4303.9108 − 3528.5532) / (20768.70 − 15153.61) = 775.3576 / 5615.09 = 0.138085
 *   a = (28.66412 − 0.1380846·123.1) / 6 = (28.66412 − 16.99821) / 6 = 11.66591 / 6 = 1.944318
 *   tree 18: a + b·d = 1.944318 + 0.1380846·22.4 = 1.944318 + 3.093095 = 5.037413
 *            h = 1.3 + (22.4 / 5.037412)² = 1.3 + 4.446728² = 21.0734
 */

test('fitNaslund: recovers known parameters from exact data', () => {
  const truth = { a: 1.5, b: 0.15 };
  const pairs = [5, 10, 15, 20, 30, 40, 50].map(d => ({ d, h: naslundHeight(truth, d) }));
  const p = fitNaslund(pairs);
  close(p.a, 1.5, 1e-9, 'a');
  close(p.b, 0.15, 1e-9, 'b');
  assert.equal(p.n, 7);
});

test('fitNaslund: rejects unusable data', () => {
  assert.equal(fitNaslund([{ d: 10, h: 12 }, { d: 20, h: 18 }]), null, 'fewer than 3 trees');
  assert.equal(fitNaslund([{ d: 20, h: 15 }, { d: 20, h: 17 }, { d: 20, h: 19 }]), null, 'all diameters equal');
  // Height falling with diameter: y = 1.867, 4.625, 10.171 → b = 0.415, a = −2.75 < 0.
  // a < 0 would put a pole at d = −a/b ≈ 6.6 cm → rejected.
  assert.equal(fitNaslund([{ d: 10, h: 30 }, { d: 20, h: 20 }, { d: 30, h: 10 }]), null, 'a < 0');
});

test('fitNaslund: constant heights give a flat curve', () => {
  // y = d/√18.7 is proportional to d → a ≈ 0, b = 1/√18.7 → h = 1.3 + 1/b² = 20 everywhere
  const p = fitNaslund([{ d: 10, h: 20 }, { d: 20, h: 20 }, { d: 30, h: 20 }]);
  close(p.b, 1 / Math.sqrt(18.7), 1e-9, 'b');
  close(naslundHeight(p, 15), 20, 1e-6);
  close(naslundHeight(p, 60), 20, 1e-6);
});

test('naslundHeight: 1.3 m at d → 0, asymptote 1.3 + 1/b²', () => {
  const p = { a: 2, b: 0.2 };                       // asymptote 1.3 + 25 = 26.3
  close(naslundHeight(p, 1e-9), 1.3, 1e-9);
  close(naslundHeight(p, 1e6), 26.3, 1e-3);
  // d = 20: 20 / (2 + 4) = 3.3333; 1.3 + 11.1111 = 12.4111
  close(naslundHeight(p, 20), 12.4111, 5e-5);
});

test('fitHeightModel: fixture, default minimum 10 → all-species curve only', () => {
  const m = fitHeightModel(loadFixture('trees.csv').rows, COLS, 10);
  assert.equal(m.nAll, 19);
  assert.deepEqual(m.measured, {
    'Fagus sylvatica': 6, 'Picea abies': 6, 'Acer pseudoplatanus': 3, '7': 1, 'Abies alba': 3
  });
  assert.deepEqual(m.bySpecies, {});
  close(m.all.a, 2.216170, 5e-6, 'a');
  close(m.all.b, 0.131902, 5e-6, 'b');
});

test('estimateHeight: all-species fallback for tree 18', () => {
  const m = fitHeightModel(loadFixture('trees.csv').rows, COLS, 10);
  const e = estimateHeight(m, 'Fagus sylvatica', 22.4);
  assert.equal(e.source, 'all');
  close(e.h, 20.0666, 5e-5);
  // Unknown or empty species also use the all-species curve
  assert.equal(estimateHeight(m, 'Quercus robur', 22.4).source, 'all');
  assert.equal(estimateHeight(m, '', 22.4).source, 'all');
  // Nothing to estimate from
  assert.equal(estimateHeight(null, 'Fagus sylvatica', 22.4), null);
  assert.equal(estimateHeight(m, 'Fagus sylvatica', 0), null);
});

test('fitHeightModel: species curve once the species has enough measured trees', () => {
  const m = fitHeightModel(loadFixture('trees.csv').rows, COLS, 5);
  assert.deepEqual(Object.keys(m.bySpecies).sort(), ['Fagus sylvatica', 'Picea abies']);
  const f = m.bySpecies['Fagus sylvatica'];
  close(f.a, 1.944317, 5e-6, 'Fagus a');
  close(f.b, 0.138085, 5e-6, 'Fagus b');
  const e = estimateHeight(m, 'Fagus sylvatica', 22.4);
  assert.equal(e.source, 'species');
  close(e.h, 21.0734, 5e-5);
  // Abies (3 measured) still falls back to all species
  assert.equal(estimateHeight(m, 'Abies alba', 22.4).source, 'all');
});

test('fitHeightModel: all-species curve also needs the minimum', () => {
  const rows = loadFixture('trees.csv').rows;
  const m = fitHeightModel(rows, COLS, 20);          // only 19 measured trees
  assert.equal(m.all, null);
  assert.equal(estimateHeight(m, 'Fagus sylvatica', 22.4), null);
  assert.equal(calcTrees(rows, COLS, m).length, 19); // tree 18 stays excluded
});

test('fitHeightModel: heights ≤ 1.3 m are not used for fitting', () => {
  const rows = [
    { d: '1', h: '1,3', sp: 'X' },   // excluded: h − 1.3 = 0
    { d: '2', h: '1,0', sp: 'X' },   // excluded
    { d: '10', h: '', sp: 'X' },     // excluded: no height
    { d: '10', h: '10', sp: 'X' }
  ];
  const m = fitHeightModel(rows, { diagCol: 'd', htCol: 'h', speciesCol: 'sp' }, 1);
  assert.equal(m.nAll, 1);
  assert.equal(m.measured.X, 1);
});

test('prepareTrees: follows CONFIG.heightModel', () => {
  prepareTrees(loadFixture('trees.csv'));
  assert.equal(state.heightModel.minTrees, 10);
  assert.deepEqual(state.heightModel.bySpecies, {});

  withConfig({ heightModel: { minTreesPerSpecies: 5 } }, () => {
    prepareTrees(loadFixture('trees.csv'));
    assert.deepEqual(Object.keys(state.heightModel.bySpecies).sort(), ['Fagus sylvatica', 'Picea abies']);
  });

  withConfig({ heightModel: { enabled: false } }, () => {
    prepareTrees(loadFixture('trees.csv'));
    assert.equal(state.heightModel, null);
  });
});
