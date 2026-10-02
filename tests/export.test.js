'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, loadAllFixtures, withConfig, el } = require('./helpers');
const { tableToCSV, tableToTSV, exportFileName, exportTables, state } = app;

const BOM = String.fromCharCode(0xFEFF);

/** CSV text → lines (BOM and final CRLF checked and removed). */
function csvLines(csv) {
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'starts with UTF-8 BOM');
  assert.ok(csv.endsWith('\r\n'), 'CRLF line ends');
  return csv.slice(1, -2).split('\r\n');
}

// ── A small hand-made table: quoting, rounding, units, total row ────────────

const SIMPLE = {
  id: 'simple', title: 'Simple', fileBase: 'simple-table',
  columns: [{ label: 'Name' }, { label: 'Trees', dec: 0 }, { label: 'Vol/ha', unit: 'm³/ha', dec: 2 },
            { label: 'Share', unit: '%', unitExportOnly: true, dec: 1 }, { label: 'Raw', fmt: 'raw' }],
  rows: [
    { kind: 'data', cells: ['Picea abies', 1234, 1234.5678, { v: 27.44, html: '27,4 %' }, 16.5] },
    { kind: 'data', cells: ['Fagus, beech', 3, 0.005, 0.04, null] },        // comma → quoted; 0.005 → "0.01"
    { kind: 'data', cells: ['He said "hi"', 0, -0.001, NaN, 50] },          // quotes doubled; -0.001 → "0.00"; NaN → ""
    { kind: 'data', cells: ['line\nbreak', 1, 2, 3, 4] },                   // line break → quoted
    { kind: 'data', cells: ['=SUM(A1)', 1, 2, 3, 4] },                      // formula guard
    { kind: 'data', cells: [' padded ', 1, 2, 3, 4] },                      // leading/trailing space → quoted
    { kind: 'group', label: 'not exported', cells: [] },
    { kind: 'total', cells: [{ v: 'TOTAL', strong: true }, 1240, { v: 1234.5718, strong: true }, null, null] }
  ]
};

test('CSV: header units, plain rounded numbers, quoting, totals', () => {
  const lines = csvLines(tableToCSV(SIMPLE));
  assert.deepEqual(lines, [
    'Name,Trees,Vol/ha (m³/ha),Share (%),Raw',
    'Picea abies,1234,1234.57,27.4,16.5',     // no thousands separator, decimal point
    '"Fagus, beech",3,0.01,0.0,',
    '"He said ""hi""",0,0.00,,50',
    '"line\nbreak",1,2.00,3.0,4',
    "'=SUM(A1),1,2.00,3.0,4",
    '" padded ",1,2.00,3.0,4',
    'TOTAL,1240,1234.57,,'
  ]);
});

test('CSV: delimiter and decimal separator come from CONFIG', () => {
  withConfig({ exportDelimiter: ';', exportDecimalSeparator: ',' }, () => {
    const lines = csvLines(tableToCSV(SIMPLE));
    assert.equal(lines[1], 'Picea abies;1234;1234,57;27,4;16,5');
    assert.equal(lines[2], 'Fagus, beech;3;0,01;0,0;');          // comma no longer forces quotes
  });
  withConfig({ exportDelimiter: ',', exportDecimalSeparator: ',' }, () => {
    // decimal comma with comma delimiter: numbers get quoted so columns stay intact
    assert.equal(csvLines(tableToCSV(SIMPLE))[1], 'Picea abies,1234,"1234,57","27,4","16,5"');
  });
});

test('TSV (Copy): tabs, no BOM, no quoting, line breaks flattened', () => {
  const tsv = tableToTSV(SIMPLE);
  assert.notEqual(tsv.charCodeAt(0), 0xFEFF);
  const lines = tsv.trimEnd().split('\n');
  assert.equal(lines[0], 'Name\tTrees\tVol/ha (m³/ha)\tShare (%)\tRaw');
  assert.equal(lines[2], 'Fagus, beech\t3\t0.01\t0.0\t');
  assert.equal(lines[4], 'line break\t1\t2.00\t3.0\t4');
  assert.equal(lines.length, 8);   // header + 6 data + total (group row skipped)
});

test('file name: table name + local date', () => {
  assert.equal(exportFileName({ fileBase: 'volume-by-species-diameter-class' }, new Date(2026, 9, 2)),
               'volume-by-species-diameter-class_2026-10-02.csv');
  assert.equal(exportFileName({ fileBase: 'x' }, new Date(2026, 0, 5, 23, 59)), 'x_2026-01-05.csv');
});

// ── Fixture tables ──────────────────────────────────────────────────────────

test('CSV of a simple app table: Zones "Average volume per hectare by class"', () => {
  // class averages (zones.test.js): 21 = 33.9044, 22 = 27.2515, 12 → fallback from 21
  loadAllFixtures();
  app.runZoneCalculation();
  assert.deepEqual(csvLines(tableToCSV(exportTables['volume-by-class'])), [
    'Class,Plots (total),Empty plots (0 m³/ha),Avg vol/ha (m³/ha),Note',
    '12,0,0,33.90,fallback from class 21',
    '21,2,0,33.90,',
    '22,3,1,27.25,'
  ]);
});

/*
 * Vol/ha by species and diameter class (hand values in species.test.js, rounded
 * to 2 decimals as on the page). Group heading rows are not exported; subtotal
 * and total rows are, labelled in the first column; "·" on the page is 0.00.
 */
test('CSV of the diameter-class table with subtotals', () => {
  loadAllFixtures();
  app.renderSpeciesAnalysis();
  const t = exportTables['volume-by-species-diameter-class'];
  assert.equal(exportFileName(t, new Date(2026, 9, 2)), 'volume-by-species-diameter-class_2026-10-02.csv');
  assert.deepEqual(csvLines(tableToCSV(t)), [
    'Diameter class,Abies alba (m³/ha),Picea abies (m³/ha),Fagus sylvatica (m³/ha),Acer pseudoplatanus (m³/ha),7 (m³/ha),Total (m³/ha)',
    '5 – 10 cm,0.00,1.08,0.19,0.73,0.00,2.00',
    '10 – 15 cm,0.00,0.37,0.22,0.00,0.00,0.58',
    '15 – 20 cm,0.87,1.26,0.00,0.00,0.64,2.78',
    '20 – 25 cm,0.00,0.00,1.27,0.00,0.00,1.27',
    '25 – 30 cm,0.00,1.16,0.00,0.00,0.00,1.16',
    'Subtotal < 30 cm,0.87,3.87,1.68,0.73,0.64,7.79',
    '30 – 35 cm,1.72,0.00,0.00,1.53,0.00,3.25',
    '35 – 40 cm,0.00,0.00,5.36,0.00,0.00,5.36',
    '40 – 45 cm,0.00,3.78,0.00,4.11,0.00,7.89',
    '45 – 50 cm,0.00,0.00,0.00,0.00,0.00,0.00',
    '50 – 55 cm,5.61,0.00,0.00,0.00,0.00,5.61',
    'Subtotal ≥ 30 cm,7.34,3.78,5.36,5.64,0.00,22.12',
    'TOTAL,8.21,7.65,7.04,6.37,0.64,29.91'
  ]);
  // Copy gives the same cells, tab-separated
  assert.equal(tableToTSV(t).split('\n')[6], 'Subtotal < 30 cm\t0.87\t3.87\t1.68\t0.73\t0.64\t7.79');
});

test('every result table has Download CSV and Copy buttons and an export model', () => {
  app.resetApp();
  const parsed = app.parseCSVText(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'trees.csv'), 'utf8'));
  app.prepareTrees(parsed);
  app.renderDashboard(parsed, 'trees.csv');
  loadAllFixtures();   // plots + zones
  app.renderVolumeTab(state.trees.rows, state.cols, state.heightModel, state.plots);
  app.renderDiameterClassTable(state.trees.rows, state.cols, state.plots);
  app.renderSpeciesAnalysis();
  app.runZoneCalculation();
  const ids = ['dimension-stats', 'trees-per-ha-by-diameter-class', 'volume-by-plot', 'volume-by-class',
               'volume-by-zone-and-class', 'species-summary', 'volume-by-species-diameter-class',
               'volume-by-species-and-zone', 'volume-by-species-and-zone-exploitable'];
  assert.deepEqual(Object.keys(exportTables).sort(), ids.slice().sort());
  const html = ['dims-stats', 'dims-dclass', 'volume-stats', 'zones-result', 'species-analysis']
    .map(id => el(id).innerHTML).join('');
  for (const id of ids) {
    assert.ok(html.includes(`onclick="downloadTable('${id}')"`), id + ' download button');
    assert.ok(html.includes(`onclick="copyTable('${id}', this)"`), id + ' copy button');
  }
  // the number of tables on the page equals the number of export models
  assert.equal((html.match(/<table/g) || []).length, ids.length);
  // reset forgets them
  app.resetApp();
  assert.deepEqual(Object.keys(exportTables), []);
});

test('exported text is not HTML-escaped; page text is', () => {
  loadAllFixtures();
  state.zones = app.parseCSVText('Zone;21;22\n"<b>N</b>, east";1;1\n');
  app.renderSpeciesAnalysis();
  const csv = tableToCSV(exportTables['volume-by-species-and-zone']);
  assert.equal(csvLines(csv)[0], 'Species,"<b>N</b>, east (m³)",Total (m³)');
  assert.match(el('species-analysis').innerHTML, /<th>&lt;b&gt;N&lt;\/b&gt;, east<\/th>/);
});

// ── Copy button feedback ────────────────────────────────────────────────────

function withCopyEnv({ execResult, clipboard }, fn) {
  const saved = { body: document.body, ce: document.createElement, exec: document.execCommand,
                  nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), win: globalThis.window };
  let copied = null;
  document.body = { appendChild() {}, removeChild() {} };
  document.createElement = () => ({ value: '', style: {}, setAttribute() {}, select() {} });
  document.execCommand = () => execResult;
  Object.defineProperty(globalThis, 'navigator', { value: clipboard ? { clipboard: { writeText: t => { copied = t; return clipboard; } } } : {}, configurable: true });
  globalThis.window = { isSecureContext: true };
  try { return fn(() => copied); }
  finally {
    document.body = saved.body; document.createElement = saved.ce; document.execCommand = saved.exec;
    if (saved.nav) Object.defineProperty(globalThis, 'navigator', saved.nav); else delete globalThis.navigator;
    globalThis.window = saved.win;
  }
}

test('Copy: synchronous copy succeeds → "Copied", button disabled briefly', () => {
  exportTables.simple = SIMPLE;
  const btn = { textContent: 'Copy', disabled: false };
  withCopyEnv({ execResult: true }, () => app.copyTable('simple', btn));
  assert.equal(btn.textContent, 'Copied');
  assert.equal(btn.disabled, true);
  delete exportTables.simple;
});

test('Copy: falls back to the Clipboard API (TSV text), feedback after it resolves', async () => {
  exportTables.simple = SIMPLE;
  const btn = { textContent: 'Copy', disabled: false };
  let getCopied;
  await withCopyEnv({ execResult: false, clipboard: Promise.resolve() }, async get => {
    getCopied = get;
    app.copyTable('simple', btn);
    await new Promise(r => setImmediate(r));
    assert.equal(getCopied(), tableToTSV(SIMPLE));
  });
  assert.equal(btn.textContent, 'Copied');
  delete exportTables.simple;
});

test('Copy: nothing works → "Copy failed"', () => {
  exportTables.simple = SIMPLE;
  const btn = { textContent: 'Copy', disabled: false };
  withCopyEnv({ execResult: false }, () => app.copyTable('simple', btn));
  assert.equal(btn.textContent, 'Copy failed');
  delete exportTables.simple;
});
