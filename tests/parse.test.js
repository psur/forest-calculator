'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, loadFixture } = require('./helpers');
const { parseNum, parseCSVText, findCol } = app;

test('parseNum: plain and decimal-comma numbers', () => {
  assert.equal(parseNum('12.5'), 12.5);
  assert.equal(parseNum('12,5'), 12.5);        // European decimal comma
  assert.equal(parseNum('-3,5'), -3.5);
  assert.equal(parseNum('0'), 0);
  assert.equal(parseNum(' 7 '), 7);            // surrounding whitespace
});

test('parseNum: thousands separators', () => {
  // Both separators present: the LAST one is the decimal separator.
  assert.equal(parseNum('1.234,5'), 1234.5);   // "." thousands, "," decimal
  assert.equal(parseNum('1,234.5'), 1234.5);   // "," thousands, "." decimal
  // Whitespace (incl. NBSP, as fmtN produces) is removed before parsing.
  assert.equal(parseNum('1 234,5'), 1234.5);
  assert.equal(parseNum('1 234,5'), 1234.5);
});

test('parseNum: a lone comma is always a decimal separator', () => {
  // Documents current behaviour: "1,234" is read as 1.234, not 1234.
  // Correct for decimal-comma locales, which is what KoBo exports use here.
  assert.equal(parseNum('1,234'), 1.234);
});

test('parseNum: empty / missing / non-numeric give NaN', () => {
  assert.ok(Number.isNaN(parseNum('')));
  assert.ok(Number.isNaN(parseNum('   ')));
  assert.ok(Number.isNaN(parseNum(undefined)));
  assert.ok(Number.isNaN(parseNum('abc')));
});

test('parseCSVText: fixture tree CSV (quoted, semicolon, decimal comma)', () => {
  const t = loadFixture('trees.csv');
  assert.equal(t.delim, ';');
  assert.equal(t.headers.length, 13);
  assert.equal(t.rows.length, 20);
  assert.deepEqual(t.errors, []);
  assert.equal(t.rows[0]['Species:'], 'Fagus sylvatica');   // quotes stripped
  assert.equal(t.rows[0]['Diameter [cm]:'], '35,5');
  assert.equal(t.rows[4]['Species:'], '7');                 // numeric species value
  assert.equal(t.rows[17]['Height [m]:'], '');              // tree with no height
  assert.equal(t.rows[17]['_parent_index'], '5');
});

test('parseCSVText: quoted multi-line notes field (fixture tree 18)', () => {
  const t = loadFixture('trees.csv');
  // The note spans two physical lines and contains ";" and escaped quotes (""),
  // yet it is one cell and the row keeps all its columns.
  const r = t.rows[17];
  assert.equal(r['Notes:'], 'Top broken off; stem snapped at ~6 m.\nHeight not measurable, marked "dead".');
  assert.equal(r['InclusionZone_ha'], '0,10179');
  assert.equal(r['_index'], '18');
  assert.equal(r['_parent_index'], '5');
  // The following row is not shifted
  assert.equal(t.rows[18]['_index'], '19');
  assert.equal(t.rows[18]['Diameter [cm]:'], '33,0');
  // A comma inside a quoted field stays in the cell
  assert.equal(t.rows[2]['Notes:'], 'Fork at 4 m, bark damage');
});

test('parseCSVText: CRLF line break inside a quoted field', () => {
  const t = parseCSVText('id;note\r\n1;"line one\r\nline two"\r\n2;x\r\n');
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].note, 'line one\r\nline two');
  assert.equal(t.rows[1].id, '2');
});

test('parseCSVText: delimiter detected from the first non-blank line', () => {
  const t = parseCSVText('\n\n  \nZone;12;21\nNorth;1,5;10,5\n');
  assert.equal(t.delim, ';');
  assert.deepEqual(t.headers, ['Zone', '12', '21']);
  assert.deepEqual(t.rows, [{ Zone: 'North', '12': '1,5', '21': '10,5' }]);
});

test('parseCSVText: unclosed quote is reported in errors', () => {
  const t = parseCSVText('a;b\n1;"oops\n2;3\n');
  assert.ok(t.errors.length > 0);
  assert.equal(t.errors[0].code, 'MissingQuotes');
});

test('parseCSVText: comma delimiter, BOM, CRLF and blank lines', () => {
  const t = parseCSVText('﻿a,b\r\n1,2\r\n\r\n3,4\r\n');
  assert.deepEqual(t.headers, ['a', 'b']);
  assert.equal(t.delim, ',');
  assert.deepEqual(t.rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('parseCSVText: short rows padded with "", cells trimmed', () => {
  const t = parseCSVText('a;b;c\n 1 ;" 2 "\n');
  assert.deepEqual(t.rows, [{ a: '1', b: '2', c: '' }]);
});

test('parseCSVText: header-only file returns null', () => {
  assert.equal(parseCSVText('a;b\n'), null);
});

test('findCol: detects KoBo columns in the fixture', () => {
  const h = loadFixture('trees.csv').headers;
  // Same calls as renderDashboard()
  assert.equal(findCol(h, 'Diameter [cm]:', 'Diameter', 'diameter'), 'Diameter [cm]:');
  assert.equal(findCol(h, 'Species:', 'Species', null), 'Species:');
  assert.equal(findCol(h, 'InclusionZone_ha', null, 'inclusionzone'), 'InclusionZone_ha');
  assert.equal(findCol(h, '_parent_index', null, 'parent_index'), '_parent_index');
  assert.equal(findCol(h, 'Bole Height [m]:', 'Bole', 'bole'), 'Bole Height [m]:');
});
