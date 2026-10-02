'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, loadAllFixtures, withConfig, readTables, readStatCards, fmtNum, el } = require('./helpers');

/*
 * Hand calculation for the zone aggregation with the fixtures.
 * Plot vol/ha values come from the table in volume.test.js.
 *
 * plots.csv (plot → class)      tree data
 *   1 → 21                        29.0355 m³/ha
 *   2 → 21                        38.7733 m³/ha
 *   3 → 22                        78.3286 m³/ha
 *   4 → 22                        no tree rows (empty plot)                  → 0
 *   5 → 22                        only tree has no height:
 *                                   height model on  (default) → 3.4260
 *                                   height model off           → 0
 *   (6 in tree data only)         not in plots.csv → excluded + warning
 *
 * Class averages over ALL plots of the class in plots.csv:
 *   21: (29.0355 + 38.7733) / 2 = 67.8088 / 2           = 33.9044  → "33,90"
 *   22 (model on):  (78.3286 + 0 + 3.4260) / 3 = 81.7546 / 3 = 27.2515  → "27,25"
 *   22 (model off): (78.3286 + 0 + 0) / 3                   = 26.1095  → "26,11"
 *   12: no plots → fallback to 21                        = 33.9044  → "33,90"
 *
 * zones.csv (ha per class), volume = ha × class avg.
 *
 * Height model on (default):
 *            12             21                22                   total
 *   North  1.5 → 50.857   10.5 → 355.996    4.0  → 109.006      515.859 → "516"
 *   South  0   →  0        3.25 → 110.189   12.75 → 347.457     457.647 → "458"
 *   TOTAL        50.857 → "51"   466.185 → "466"   456.463 → "456"   973.506 → "974"
 *
 * Height model off:
 *   North  1.5 → 50.857   10.5 → 355.996    4.0  → 104.438      511.290 → "511"
 *   South  0   →  0        3.25 → 110.189   12.75 → 332.896     443.086 → "443"
 *   TOTAL        50.857 → "51"   466.185 → "466"   437.334 → "437"   954.376 → "954"
 *
 * Hectares are displayed with 1 decimal: 3.25 → "3,3", 12.75 → "12,8".
 */

function runFixtureZones() {
  loadAllFixtures();
  app.runZoneCalculation();
  const html = el('zones-result').innerHTML;
  const [classTable, zoneTable] = readTables(html);
  const classRows = classTable ? Object.fromEntries(classTable.slice(1).map(r => [r[0], r])) : {};
  return { html, cards: readStatCards(html), classRows, zoneTable };
}

// ── Default settings (height model on) ──────────────────────────────────────

test('zones: class averages, empty plots and fallback', () => {
  const { classRows: rows } = runFixtureZones();
  // columns: Class | Plots (total) | Empty plots | Avg vol/ha | Note
  assert.deepEqual(rows['21'].slice(1, 3), ['2', '0']);
  assert.equal(fmtNum(rows['21'][3]), 33.90);

  // Only plot 4 is empty; plot 5 has volume from its estimated height.
  assert.deepEqual(rows['22'].slice(1, 3), ['3', '1']);
  assert.equal(fmtNum(rows['22'][3]), 27.25);

  assert.deepEqual(rows['12'].slice(1, 3), ['0', '0']);
  assert.equal(fmtNum(rows['12'][3]), 33.90);
  assert.match(rows['12'][4], /fallback from class 21/);
});

test('zones: volume by zone and class', () => {
  const { zoneTable } = runFixtureZones();
  // columns: Zone | 12 ha | 12 vol | 21 ha | 21 vol | 22 ha | 22 vol | Total
  const [, north, south, total] = zoneTable;
  assert.deepEqual(north.slice(1).map(fmtNum), [1.5, 51, 10.5, 356, 4.0, 109, 516]);
  assert.deepEqual(south.slice(1).map(fmtNum), [0, 0, 3.3, 110, 12.8, 347, 458]);
  assert.equal(total[0], 'TOTAL');
  assert.deepEqual([total[2], total[4], total[6], total[7]].map(fmtNum), [51, 466, 456, 974]);
});

test('zones: summary cards', () => {
  const { cards } = runFixtureZones();
  assert.equal(fmtNum(cards['Grand total volume']), 974);
  assert.equal(cards['Zones'], '2');
  assert.equal(cards['Classes used'], '3');
});

test('zones: warnings — unmatched plot and estimated heights', () => {
  const { html } = runFixtureZones();
  assert.match(html, /1 plot\(s\) not found in Plots CSV and excluded: 6/);
  assert.match(html, /Heights estimated for 1 tree\(s\) without a measured height/);
  assert.doesNotMatch(html, /not in CONFIG\.classCodes/);
});

// ── Height model off ────────────────────────────────────────────────────────

test('zones: height model off → plot 5 counts as 0', () => {
  withConfig({ heightModel: { enabled: false } }, () => {
    const { classRows: rows, zoneTable, cards, html } = runFixtureZones();
    // "Empty plots" = plots without volume: plot 4 (no rows) and plot 5 (no valid tree)
    assert.deepEqual(rows['22'].slice(1, 3), ['3', '2']);
    assert.equal(fmtNum(rows['22'][3]), 26.11);
    const [, north, south, total] = zoneTable;
    assert.deepEqual(north.slice(1).map(fmtNum), [1.5, 51, 10.5, 356, 4.0, 104, 511]);
    assert.deepEqual(south.slice(1).map(fmtNum), [0, 0, 3.3, 110, 12.8, 333, 443]);
    assert.deepEqual([total[2], total[4], total[6], total[7]].map(fmtNum), [51, 466, 437, 954]);
    assert.equal(fmtNum(cards['Grand total volume']), 954);
    assert.match(html, /1 tree\(s\) without height excluded \(height estimation is off\)/);
  });
});

// ── Fallbacks ───────────────────────────────────────────────────────────────

test('zones: second-level fallback 22 → 12 and missing class', () => {
  loadAllFixtures();
  // Only class 12 has plots; class 22 falls back 22 → 21 (none) → 12.
  // Class 99 has no plots and no fallback.
  app.state.plots = app.parseCSVText('_index;Zone SLIM\n1;12\n2;12\n');
  app.state.zones = app.parseCSVText('Zone;22;99\nA;2;5\n');
  app.runZoneCalculation();
  const html = el('zones-result').innerHTML;
  const [classTable, zoneTable] = readTables(html);
  const rows = Object.fromEntries(classTable.slice(1).map(r => [r[0], r]));

  // 12 avg = (29.0355 + 38.7733) / 2 = 33.9044
  assert.equal(fmtNum(rows['22'][3]), 33.90);
  assert.match(rows['22'][4], /fallback from class 12/);
  assert.equal(rows['99'][3], '—');
  assert.match(rows['99'][4], /no plots, no fallback/);

  // A: 2 ha × 33.9044 = 67.8088 → "68"; 5 ha × 0 = 0
  assert.deepEqual(zoneTable[1].slice(1).map(fmtNum), [2, 68, 5, 0, 68]);
  // 99 is not a configured class code
  assert.match(html, /Class code\(s\) not in CONFIG\.classCodes: 99/);
});
