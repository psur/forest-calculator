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
  assert.equal(t.headers.length, 12);
  assert.equal(t.rows.length, 20);
  assert.equal(t.rows[0]['Species:'], 'Fagus sylvatica');   // quotes stripped
  assert.equal(t.rows[0]['Diameter [cm]:'], '35,5');
  assert.equal(t.rows[4]['Species:'], '7');                 // numeric species value
  assert.equal(t.rows[17]['Height [m]:'], '');              // tree with no height
  assert.equal(t.rows[17]['_parent_index'], '5');
});

test('parseCSVText: comma delimiter, BOM, CRLF and blank lines', () => {
  const t = parseCSVText('﻿a,b\r\n1,2\r\n\r\n3,4\r\n');
  assert.deepEqual(t.headers, ['a', 'b']);
  assert.equal(t.delim, ',');
  assert.deepEqual(t.rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
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
