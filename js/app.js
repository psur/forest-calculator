/**
 * app.js - Forest Calculator v1.1
 */

// cols: detected tree-CSV columns; heightModel: fitted by prepareTrees()
var state = { trees: null, plots: null, zones: null, cols: {}, heightModel: null };

var COLORS = ['#3266ad','#1D9E75','#D85A30','#BA7517','#993556','#534AB7','#639922','#E24B4A','#888780','#185FA5'];

// \u2500\u2500 Charts: drawn when their tab is visible \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// A chart on a hidden (display:none) canvas gets no size, so each tab registers
// a builder; it runs when the tab is opened, or immediately if already visible.

var charts = {};        // tab name \u2192 [Chart] currently drawn
var chartBuilders = {}; // tab name \u2192 function returning [Chart]

function destroyTabCharts(tab) {
  (charts[tab] || []).forEach(function(c) { c.destroy(); });
  delete charts[tab];
}

function destroyAllCharts() {
  Object.keys(charts).forEach(destroyTabCharts);
  chartBuilders = {};
}

function isTabVisible(tab) {
  var panel = document.getElementById('tab-' + tab);
  return !!panel && panel.classList.contains('active');
}

function drawTabCharts(tab) {
  if (charts[tab] || !chartBuilders[tab]) return;
  charts[tab] = chartBuilders[tab]();
}

/** Replace a tab's charts: old ones are destroyed, new ones drawn now or on tab open. */
function setTabCharts(tab, build) {
  destroyTabCharts(tab);
  chartBuilders[tab] = build;
  if (isTabVisible(tab)) drawTabCharts(tab);
}

// \u2500\u2500 Text helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** Escape text for insertion into innerHTML (element content and quoted attributes). */
function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/**
 * Parse CSV text with PapaParse (quoted fields may contain delimiters, "" and
 * line breaks). Delimiter: ";" if the header line has more semicolons than
 * commas, else ",". Cells are trimmed; decimal commas are handled by parseNum.
 * @returns {{headers, rows, delim, errors}|null} null if there are no data rows
 */
function parseCSVText(text) {
  text = text.replace(/^\uFEFF/, '');
  var m = text.match(/^.*\S.*$/m);          // first non-blank line = header
  var h0 = m ? m[0] : '';
  var delim = (h0.split(';').length > h0.split(',').length) ? ';' : ',';
  var res = Papa.parse(text, { delimiter: delim, skipEmptyLines: 'greedy' });
  if (res.data.length < 2) return null;
  var headers = res.data[0].map(function(h) { return String(h).trim(); });
  var rows = res.data.slice(1).map(function(cells) {
    var obj = {};
    headers.forEach(function(h, j) { obj[h] = cells[j] !== undefined ? String(cells[j]).trim() : ''; });
    return obj;
  });
  return { headers: headers, rows: rows, delim: delim, errors: res.errors };
}

function parseNum(val) {
  if (!val || val.trim() === '') return NaN;
  var s = val.trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    s = lc > ld ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}

function findCol(headers, exact, startsWith, contains) {
  return headers.find(function(h) { return h === exact; })
      || (startsWith ? headers.find(function(h) { return h.startsWith(startsWith) && !h.includes('/'); }) : null)
      || (contains   ? headers.find(function(h) { return h.toLowerCase().includes(contains.toLowerCase()) && !h.includes('/'); }) : null)
      || null;
}

function resetApp() {
  state.trees = state.plots = state.zones = state.heightModel = null;
  state.cols = {};
  destroyAllCharts();
  Object.keys(exportTables).forEach(function(id){ delete exportTables[id]; });
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('upload-section').style.display = '';
  document.getElementById('file-input').value = '';
  document.getElementById('input-plots').value = '';
  document.getElementById('input-zones').value = '';
  document.getElementById('name-plots').textContent = 'not loaded';
  document.getElementById('name-zones').textContent = 'not loaded';
  document.getElementById('btn-plots').classList.remove('loaded');
  document.getElementById('btn-zones').classList.remove('loaded');
  document.getElementById('zones-result').innerHTML = '';
  document.getElementById('species-analysis').innerHTML = '';
  updateZoneUploadStatus();
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  drawTabCharts(name);
}

var NOT_RECORDED = '(not recorded)';

// Health / Origin / Quality breakdowns: numeric values are hidden here
function countBy(rows, col) {
  var counts = {};
  rows.forEach(function(r) {
    var v = (r[col] || '').trim() || NOT_RECORDED;
    counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts)
    .filter(function(e) { return !/^\(?\d+(\.\d+)?\)?$/.test(e[0]); })
    .sort(function(a, b) { return b[1] - a[1]; });
}

// ── Species values ───────────────────────────────────────────────────────────
// Every species value is used as-is everywhere (Species/Genus tabs, summary
// card, Species analysis), including numeric values; blank → NOT_RECORDED.

/** Species of a tree row: trimmed value, or NOT_RECORDED when blank / no column. */
function speciesOf(r, col) {
  return (col ? (r[col]||'').trim() : '') || NOT_RECORDED;
}

/** Numeric value such as "7" — usually a KoBo choice code exported instead of its label. */
function isNumericCode(v) {
  return /^\d+(?:[.,]\d+)?$/.test(v);
}

/**
 * [value, count] per distinct key(row), most frequent first; ties keep the order
 * of first appearance. (A Map, not an object: object keys like "7" would
 * always be enumerated first.)
 */
function countValues(rows, key) {
  var counts = new Map();
  rows.forEach(function(r) {
    var v = key(r);
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  return Array.from(counts.entries()).sort(function(a, b) { return b[1] - a[1]; });
}

/** [species, tree count] for every species value incl. NOT_RECORDED. */
function speciesCounts(rows, col) {
  return countValues(rows, function(r) { return speciesOf(r, col); });
}

/** Number of species, not counting NOT_RECORDED. */
function speciesNumber(entries) {
  return entries.filter(function(e) { return e[0] !== NOT_RECORDED; }).length;
}

/** Warning listing numeric species values and their tree counts ('' if none). */
function numericSpeciesWarningHtml(entries) {
  var num = entries.filter(function(e) { return isNumericCode(e[0]); });
  if (!num.length) return '';
  return '<p class="species-warning" style="font-size:12px;color:#BA7517;margin-bottom:0.75rem;">&#9888; Numeric species value'
    + (num.length > 1 ? 's' : '') + ': '
    + num.map(function(e) { return '"' + escapeHtml(e[0]) + '" (' + e[1] + ' tree' + (e[1] === 1 ? '' : 's') + ')'; }).join(', ')
    + '. These are probably KoBoToolbox choice codes exported instead of labels; export the data with labels '
    + '(or map the codes to names) to get species names. They are counted as separate species everywhere.</p>';
}

function numStats(vals) {
  if (!vals.length) return null;
  var sorted = vals.slice().sort(function(a,b){return a-b;});
  var mean = vals.reduce(function(s,v){return s+v;},0) / vals.length;
  var mid = Math.floor(sorted.length/2);
  var median = sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  return { min: sorted[0], max: sorted[sorted.length-1], mean: mean, median: median, n: vals.length };
}

/** @param {number} [limit=20] - max bars shown (Infinity for all) */
function barChart(entries, total, limit) {
  if (!entries.length) return '<p class="empty-msg">No data found.</p>';
  var max = entries[0][1] || 1;
  return entries.slice(0, limit === undefined ? 20 : limit).map(function(e,i) {
    return '<div class="bar-row">'
      + '<span class="bar-label" title="'+escapeHtml(e[0])+'">'+escapeHtml(e[0])+'</span>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+(e[1]/max*100).toFixed(1)+'%;background:'+COLORS[i%COLORS.length]+';"></div></div>'
      + '<span class="bar-count">'+e[1]+' <span style="opacity:.6;">('+( e[1]/total*100).toFixed(0)+'%)</span></span>'
      + '</div>';
  }).join('');
}

// Space thousands separator, comma decimal
function fmtN(n, dec) {
  if (n === null || n === undefined || isNaN(n)) return '\u2014';
  var d = dec !== undefined ? dec : 0;
  var fixed = n.toFixed(d);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return (d > 0) ? parts[0] + ',' + parts[1] : parts[0];
}

// ── Result tables: one model for page, CSV download and copy ─────────────────
//
// Every result table is built as a model and rendered with tableHtml(), which
// adds "Download CSV" / "Copy" buttons; export reads the model, never the HTML.
//
//   { id, title, fileBase, scroll?, marginTop?,
//     columns: [{ label, unit?, unitExportOnly?, dec?, fmt? }],
//     rows:    [{ kind: 'data'|'subtotal'|'total'|'group', cls?, style?, label? (group), cells: [...] }] }
//
// column: header = "label (unit)" (unitExportOnly: unit only in exports);
//   dec = decimals for numbers; fmt: 'fmtN' (default, page style "1 234,5"),
//   'fixed' (toFixed, as some older tables show), 'raw' (number as is).
// cell: a number or string, or { v, dec?, html?, strong?, em?, text? }:
//   v is the exported value (numbers rounded to dec, plain); html overrides only
//   the page display (e.g. "·" for 0, "27,4 %"); text overrides a string export.
// Group rows are visual headings (not exported); subtotal/total rows are.

var exportTables = {};   // table id → model of the table currently on the page

function cellObj(cell) {
  return (cell !== null && typeof cell === 'object') ? cell : { v: cell };
}

function colHeader(col, forExport) {
  return col.unit && (forExport || !col.unitExportOnly) ? col.label + ' (' + col.unit + ')' : col.label;
}

function cellDisplayHtml(cell, col) {
  var o = cellObj(cell), dec = o.dec !== undefined ? o.dec : col.dec, s;
  if (o.html !== undefined) s = o.html;
  else if (typeof o.v === 'number') {
    s = col.fmt === 'fixed' ? o.v.toFixed(dec)
      : (col.fmt === 'raw' || dec === undefined) ? String(o.v)
      : fmtN(o.v, dec);
  }
  else s = escapeHtml(o.v === null || o.v === undefined ? '' : o.v);
  if (o.em) s = '<em>' + s + '</em>';
  if (o.strong) s = '<strong>' + s + '</strong>';
  return s;
}

/** Export text of one cell: plain number rounded like the page, or text. */
function cellExportValue(cell, col, decSep) {
  var o = cellObj(cell), dec = o.dec !== undefined ? o.dec : col.dec;
  if (typeof o.v === 'number') {
    if (!isFinite(o.v)) return '';
    var s = (col.fmt === 'raw' || dec === undefined) ? String(o.v) : o.v.toFixed(dec);
    if (Number(s) === 0) s = s.replace('-', '');          // "-0.00" → "0.00"
    return decSep === '.' ? s : s.replace('.', decSep);
  }
  var t = o.text !== undefined ? o.text : o.v;
  return t === null || t === undefined ? '' : String(t);
}

/** Header row + exported rows (data, subtotal, total) as arrays of strings. */
function tableExportRows(t, decSep) {
  var out = [t.columns.map(function(c){ return colHeader(c, true); })];
  t.rows.forEach(function(r) {
    if (r.kind === 'group') return;
    out.push(t.columns.map(function(c, i){ return cellExportValue(r.cells[i], c, decSep); }));
  });
  return out;
}

/** Text that a spreadsheet would run as a formula gets a leading apostrophe. */
function guardFormula(s) {
  return /^[=+\-@\t\r]/.test(s) && isNaN(Number(s)) ? "'" + s : s;
}

/**
 * CSV per CONFIG.exportDelimiter / exportDecimalSeparator: UTF-8 BOM (so Excel
 * reads ≥ and ³), CRLF line ends, fields quoted when they contain the
 * delimiter, quotes, line breaks or leading/trailing spaces.
 */
function tableToCSV(t) {
  var delim = CONFIG.exportDelimiter;
  function field(s) {
    s = guardFormula(s);
    return (s.indexOf(delim) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  return String.fromCharCode(0xFEFF)
    + tableExportRows(t, CONFIG.exportDecimalSeparator).map(function(r){ return r.map(field).join(delim); }).join('\r\n') + '\r\n';
}

/** Tab-separated text for pasting into Excel / Word (tabs and line breaks inside cells become spaces). */
function tableToTSV(t) {
  return tableExportRows(t, CONFIG.exportDecimalSeparator).map(function(r) {
    return r.map(function(s){ return guardFormula(s).replace(/[\t\r\n]+/g, ' '); }).join('\t');
  }).join('\n') + '\n';
}

/** "YYYY-MM-DD" in local time. */
function dateStamp(d) {
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function exportFileName(t, date) {
  return t.fileBase + '_' + dateStamp(date || new Date()) + '.csv';
}

/** Section title with Download CSV / Copy buttons, then the table. Registers the model for export. */
function tableHtml(t) {
  exportTables[t.id] = t;
  var ncol = t.columns.length, id = escapeHtml(t.id);
  var head = '<div class="table-head"' + (t.marginTop ? ' style="margin-top:' + t.marginTop + '"' : '') + '>'
    + '<div class="section-title">' + escapeHtml(t.title) + '</div>'
    + '<div class="table-actions">'
    + '<button type="button" class="tbl-btn" onclick="downloadTable(\'' + id + '\')">Download CSV</button>'
    + '<button type="button" class="tbl-btn" onclick="copyTable(\'' + id + '\', this)">Copy</button>'
    + '</div></div>';
  var body = t.rows.map(function(r) {
    if (r.kind === 'group') {
      return '<tr class="group-head' + (r.cls ? ' ' + r.cls : '') + '"><td colspan="' + ncol + '">' + escapeHtml(r.label) + '</td></tr>';
    }
    return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + (r.style ? ' style="' + r.style + '"' : '') + '>'
      + t.columns.map(function(c, i){ return '<td>' + cellDisplayHtml(r.cells[i], c) + '</td>'; }).join('') + '</tr>';
  }).join('');
  var table = '<table class="summary"><thead><tr>'
    + t.columns.map(function(c){ return '<th>' + escapeHtml(colHeader(c, false)) + '</th>'; }).join('')
    + '</tr></thead><tbody>' + body + '</tbody></table>';
  return head + (t.scroll ? '<div class="zone-table-wrap">' + table + '</div>' : table);
}

function downloadTable(id) {
  var t = exportTables[id]; if (!t) return;
  var url = URL.createObjectURL(new Blob([tableToCSV(t)], { type: 'text/csv;charset=utf-8' }));
  var a = document.createElement('a');
  a.href = url; a.download = exportFileName(t);
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

/**
 * Copy a table as tab-separated text. The synchronous copy runs first (works
 * within the click, no permission prompt); the async Clipboard API is the
 * fallback, with a timeout so the button always gives feedback.
 */
function copyTable(id, btn) {
  var t = exportTables[id]; if (!t) return;
  var text = tableToTSV(t);
  function done(ok) {
    if (!btn) return;
    btn.textContent = ok ? 'Copied' : 'Copy failed';
    btn.disabled = true;
    setTimeout(function(){ btn.textContent = 'Copy'; btn.disabled = false; }, 1500);
  }
  function execCopy() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  if (execCopy()) { done(true); return; }
  if (navigator.clipboard && window.isSecureContext) {
    var settled = false;
    var settle = function(ok) { if (!settled) { settled = true; done(ok); } };
    navigator.clipboard.writeText(text).then(function(){ settle(true); }, function(){ settle(false); });
    setTimeout(function(){ settle(false); }, 2000);   // e.g. permission prompt left open
  } else {
    done(false);
  }
}

// ── Tree columns ─────────────────────────────────────────────────────────────

function detectTreeColumns(headers) {
  return {
    diagCol:    findCol(headers,'Diameter [cm]:','Diameter','diameter'),
    htCol:      headers.find(function(h){return /^Height \[m\]/i.test(h)&&!/bole|diameter/i.test(h);})||findCol(headers,'Height [m]:',null,'Height [m]'),
    boleCol:    findCol(headers,'Bole Height [m]:','Bole','bole'),
    speciesCol: findCol(headers,'Species:','Species',null),
    healthCol:  findCol(headers,'Health:','Health:',null),
    originCol:  findCol(headers,'Origin:','Origin:',null),
    qualityCol: findCol(headers,'Quality:','Quality:',null),
    izCol:      findCol(headers,'InclusionZone_ha',null,'inclusionzone'),
    plotCol:    findCol(headers,CONFIG.treePlotIdColumn,null,CONFIG.treePlotIdColumn)
  };
}

/** Detect tree columns and fit the height model for a loaded tree CSV. */
function prepareTrees(parsed) {
  state.trees = parsed;
  state.cols = detectTreeColumns(parsed.headers);
  state.heightModel = CONFIG.heightModel.enabled
    ? fitHeightModel(parsed.rows, state.cols, CONFIG.heightModel.minTreesPerSpecies)
    : null;
}

// ── Tree metrics ─────────────────────────────────────────────────────────────

/** Basal area of one tree, m² (d in cm). */
function basalArea_m2(diamCm) {
  return (Math.PI/40000)*diamCm*diamCm;
}

/** Tree volume, m³: g · h · form factor. */
function treeVolume_m3(diamCm, heightM) {
  return basalArea_m2(diamCm)*heightM*CONFIG.formFactor;
}

// ── Height–diameter model (Näslund) ──────────────────────────────────────────
//   h = 1.3 + d² / (a + b·d)²
// fitted by least squares on its linear form  d / √(h − 1.3) = a + b·d.

/**
 * @param {Array<{d:number,h:number}>} pairs - measured trees, h > 1.3
 * @returns {{a:number,b:number,n:number}|null} null if the fit is unusable
 */
function fitNaslund(pairs) {
  var n = pairs.length;
  if (n < 3) return null;
  var sx = 0, sy = 0, sxx = 0, sxy = 0;
  pairs.forEach(function(p) {
    var y = p.d / Math.sqrt(p.h - 1.3);
    sx += p.d; sy += y; sxx += p.d*p.d; sxy += p.d*y;
  });
  var den = n*sxx - sx*sx;
  if (!(den > 0)) return null;             // all diameters equal
  var b = (n*sxy - sx*sy) / den;
  var a = (sy - b*sx) / n;
  // a, b > 0 keeps the curve rising towards its asymptote 1.3 + 1/b²
  if (!(a > 0 && b > 0)) return null;
  return { a: a, b: b, n: n };
}

function naslundHeight(params, diamCm) {
  var t = diamCm / (params.a + params.b*diamCm);
  return 1.3 + t*t;
}

/**
 * Fit a curve per species with ≥ minTrees measured trees, plus an all-species
 * curve (also needing ≥ minTrees). Measured = diameter > 0 and height > 1.3 m.
 */
function fitHeightModel(rows, cols, minTrees) {
  var bySp = {}, all = [];
  rows.forEach(function(r) {
    var d = parseNum(r[cols.diagCol]), h = parseNum(r[cols.htCol]);
    if (!(d > 0 && h > 1.3)) return;
    var sp = cols.speciesCol ? (r[cols.speciesCol]||'').trim() : '';
    all.push({ d: d, h: h });
    if (sp) (bySp[sp] = bySp[sp] || []).push({ d: d, h: h });
  });
  var model = { bySpecies: {}, measured: {}, nAll: all.length, minTrees: minTrees,
                all: all.length >= minTrees ? fitNaslund(all) : null };
  Object.keys(bySp).forEach(function(sp) {
    model.measured[sp] = bySp[sp].length;
    var p = bySp[sp].length >= minTrees ? fitNaslund(bySp[sp]) : null;
    if (p) model.bySpecies[sp] = p;
  });
  return model;
}

/** @returns {{h:number, source:'species'|'all'}|null} */
function estimateHeight(model, species, diamCm) {
  if (!model || !(diamCm > 0)) return null;
  var p = model.bySpecies[species];
  if (p) return { h: naslundHeight(p, diamCm), source: 'species' };
  if (model.all) return { h: naslundHeight(model.all, diamCm), source: 'all' };
  return null;
}

/**
 * Per-tree metrics. Trees need a diameter and inclusion zone; a missing height
 * is estimated from heightModel when given, otherwise the tree is dropped.
 * @param {object} cols - {diagCol, htCol, izCol, plotCol, speciesCol}
 * @param {object} [heightModel] - from fitHeightModel()
 */
function calcTrees(rows, cols, heightModel) {
  return rows.map(function(r) {
    var diam = parseNum(r[cols.diagCol]), ht = parseNum(r[cols.htCol]), iz = parseNum(r[cols.izCol]);
    var plot = (cols.plotCol ? r[cols.plotCol] : '') || 'unknown';
    var species = speciesOf(r, cols.speciesCol);
    if (isNaN(diam)||isNaN(iz)||diam<=0||iz<=0) return null;
    var est = null;
    if (isNaN(ht)||ht<=0) {
      est = estimateHeight(heightModel, species, diam);
      if (!est) return null;
      ht = est.h;
    }
    var vol = treeVolume_m3(diam, ht);
    return { plot: String(plot).trim(), species: species, diam: diam, height: ht,
             heightEstimated: !!est, heightSource: est ? est.source : null,
             ba: basalArea_m2(diam), vol: vol, volHa: vol/iz };
  }).filter(function(t){return t!==null;});
}

function buildPlotSummary(trees) {
  var plots = {};
  trees.forEach(function(t) {
    if (!plots[t.plot]) plots[t.plot] = { trees:0, estHeights:0, totalBA:0, totalVol:0, totalVolHa:0 };
    plots[t.plot].trees++;
    if (t.heightEstimated) plots[t.plot].estHeights++;
    plots[t.plot].totalBA    += t.ba;
    plots[t.plot].totalVol   += t.vol;
    plots[t.plot].totalVolHa += t.volHa;
  });
  return plots;
}

// ── Diameter classes ─────────────────────────────────────────────────────────
// Class edges are laid on a grid through CONFIG.minExploitableDiameter_cm, so the
// exploitable threshold is always a class boundary (with 5 cm classes and 30 cm
// this is the usual 0, 5, 10, … grid). Classes are lo ≤ d < hi.

function dClassIndex(d, width) {
  return Math.floor((d - (CONFIG.minExploitableDiameter_cm || 0)) / width);
}

/** Classes from the one holding minD to the one holding maxD. */
function dClassRange(minD, maxD, width) {
  var anchor = CONFIG.minExploitableDiameter_cm || 0, out = [];
  var first = dClassIndex(minD, width), last = dClassIndex(maxD, width);
  for (var i = first; i <= last; i++) out.push({ lo: anchor + i*width, hi: anchor + (i+1)*width, index: i });
  return out;
}

/**
 * Trees per hectare by diameter class. Each tree stands for 1 / InclusionZone_ha
 * trees/ha; class sums are averaged over plotIds (the surveyed plots, see
 * surveyedPlots) — or, without plotIds, over all plots present in the tree data.
 * Trees in plots outside plotIds are left out (counted in `outside`).
 */
function diameterClassTable(rows, cols, width, plotIds) {
  var plots = {}, trees = [], noIz = 0, outside = 0;
  if (plotIds) plotIds.forEach(function(p){ plots[p] = true; });
  rows.forEach(function(r) {
    var p = String(r[cols.plotCol]||'').trim();
    if (!p) return;
    if (plotIds && !plots[p]) { if (parseNum(r[cols.diagCol]) > 0) outside++; return; }
    plots[p] = true;
    var d = parseNum(r[cols.diagCol]);
    if (isNaN(d)||d<=0) return;
    var iz = parseNum(r[cols.izCol]);
    if (isNaN(iz)||iz<=0) { noIz++; return; }
    trees.push({ d: d, perHa: 1/iz });
  });
  var nPlots = Object.keys(plots).length;
  var result = { classes: [], nPlots: nPlots, noIz: noIz, outside: outside, totalTreesHa: 0, sumTreesHa: 0 };
  if (!nPlots || !trees.length) return result;

  var ds = trees.map(function(t){return t.d;});
  result.classes = dClassRange(Math.min.apply(null, ds), Math.max.apply(null, ds), width)
    .map(function(c){ return { lo: c.lo, hi: c.hi, count: 0, sumPerHa: 0 }; });
  var first = dClassIndex(Math.min.apply(null, ds), width);
  trees.forEach(function(t) {
    var c = result.classes[dClassIndex(t.d, width) - first];
    c.count++; c.sumPerHa += t.perHa;
  });
  result.classes.forEach(function(c) {
    c.avgRaw  = c.count / nPlots;
    c.treesHa = Math.round(c.sumPerHa / nPlots);
    result.totalTreesHa += c.treesHa;           // sum of rounded values, as displayed
    result.sumTreesHa   += c.sumPerHa / nPlots; // unrounded
  });
  return result;
}

function renderDashboard(parsed, fileName) {
  var rows = parsed.rows, headers = parsed.headers, delim = parsed.delim;

  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('file-name').textContent = fileName;
  document.getElementById('row-count').textContent = rows.length + ' records';

  var cols = state.cols;
  var diagCol = cols.diagCol, htCol = cols.htCol, boleCol = cols.boleCol, speciesCol = cols.speciesCol;
  var healthCol = cols.healthCol, originCol = cols.originCol, qualityCol = cols.qualityCol;
  var izCol = cols.izCol, plotCol = cols.plotCol;

  var errs = parsed.errors || [];
  document.getElementById('debug-info').innerHTML =
    '<strong>Delim:</strong> "'+escapeHtml(delim)+'" &nbsp;|&nbsp; '
    +'Species: <em>'+escapeHtml(speciesCol||'--')+'</em> &nbsp; '
    +'Diameter: <em>'+escapeHtml(diagCol||'--')+'</em> &nbsp; '
    +'Height: <em>'+escapeHtml(htCol||'--')+'</em> &nbsp; '
    +'IZ: <em>'+escapeHtml(izCol||'--')+'</em> &nbsp; '
    +'Plot: <em>'+escapeHtml(plotCol||'--')+'</em>'
    +(errs.length ? ' &nbsp;|&nbsp; <strong style="color:#D85A30;">'+errs.length+' CSV parse warning(s)</strong>: '
      +escapeHtml(errs[0].message)+(errs[0].row !== undefined ? ' (data row '+(errs[0].row)+')' : '') : '');

  var diams = diagCol ? rows.map(function(r){return parseNum(r[diagCol]);}).filter(function(v){return !isNaN(v)&&v>0;}) : [];
  var hts   = htCol   ? rows.map(function(r){return parseNum(r[htCol]);  }).filter(function(v){return !isNaN(v)&&v>0;}) : [];
  var boles = boleCol ? rows.map(function(r){return parseNum(r[boleCol]);}).filter(function(v){return !isNaN(v)&&v>0;}) : [];
  var ds = numStats(diams), hs = numStats(hts);
  var speciesEntries = speciesCol ? speciesCounts(rows, speciesCol) : [];

  document.getElementById('top-stats').innerHTML =
    '<div class="stat-card"><div class="label">Total trees</div><div class="value">'+rows.length+'</div></div>'
    +'<div class="stat-card"><div class="label">Species</div><div class="value">'+speciesNumber(speciesEntries)+'</div></div>'
    +(ds?'<div class="stat-card"><div class="label">Avg diameter</div><div class="value">'+ds.mean.toFixed(1)+'<span> cm</span></div></div>':'')
    +(hs?'<div class="stat-card"><div class="label">Avg height</div><div class="value">'+hs.mean.toFixed(1)+'<span> m</span></div></div>':'')
    +(ds?'<div class="stat-card"><div class="label">Max diameter</div><div class="value">'+ds.max+'<span> cm</span></div></div>':'')
    +(hs?'<div class="stat-card"><div class="label">Max height</div><div class="value">'+hs.max+'<span> m</span></div></div>':'');

  // Species tab: every value, all bars; percentages of all tree records add up to 100 %
  document.getElementById('species-breakdown').innerHTML = speciesCol
    ? numericSpeciesWarningHtml(speciesEntries)
      + '<div class="section-title">Species breakdown</div>' + barChart(speciesEntries, rows.length, Infinity)
      + '<p class="table-note">' + rows.length + ' tree record(s), ' + speciesNumber(speciesEntries) + ' species'
      + (speciesEntries.some(function(e){ return e[0] === NOT_RECORDED; }) ? ' plus trees with species ' + NOT_RECORDED : '')
      + '. Percentages are of all tree records.</p>'
    : '<p class="empty-msg">Column not found.</p>';

  [{id:'health', col:healthCol, label:'Health status'},
   {id:'origin', col:originCol, label:'Origin'},
   {id:'quality',col:qualityCol,label:'Quality'}
  ].forEach(function(t) {
    document.getElementById('tab-'+t.id).innerHTML = t.col
      ? '<div class="section-title">'+t.label+'</div>'+barChart(countBy(rows,t.col),rows.length)
      : '<p class="empty-msg">Column not found.</p>';
  });

  // Genus tab
  if (speciesCol) {
    var genusEntries = countValues(rows, function(r) {
      var sp = speciesOf(r, speciesCol);
      return sp === NOT_RECORDED ? NOT_RECORDED : sp.split(' ')[0];
    });
    document.getElementById('tab-genus').innerHTML =
      '<div class="section-title">Genus breakdown</div>'
      + barChart(genusEntries, rows.length, Infinity);
  } else {
    document.getElementById('tab-genus').innerHTML = '<p class="empty-msg">Species column not found.</p>';
  }

  var statRows = [];
  function statRow(label, st) {
    statRows.push({ kind: 'data', cells: [label, st.n, st.min, st.max, st.mean, st.median] });
  }
  if (ds) statRow('Diameter (cm)', ds);
  if (hs) statRow('Height (m)', hs);
  if (boles.length) statRow('Bole height (m)', numStats(boles));
  document.getElementById('dims-stats').innerHTML = statRows.length
    ? tableHtml({
        id: 'dimension-stats', title: 'Diameter and height statistics', fileBase: 'diameter-height-statistics',
        columns: [{ label: 'Metric' }, { label: 'n', dec: 0 }, { label: 'Min', fmt: 'raw' }, { label: 'Max', fmt: 'raw' },
                  { label: 'Mean', dec: 1, fmt: 'fixed' }, { label: 'Median', dec: 1, fmt: 'fixed' }],
        rows: statRows
      })
    : '<p class="empty-msg">No numeric dimension data found.</p>';

  renderVolumeTab(rows, cols, state.heightModel, state.plots);

  function makeHist(vals, bins) {
    var mn=Math.floor(Math.min.apply(null,vals)), mx=Math.ceil(Math.max.apply(null,vals));
    var step=Math.max((mx-mn)/bins,0.001), labels=[], counts=[];
    for(var i=0;i<bins;i++){
      var lo=mn+i*step,hi=lo+step;
      labels.push(lo.toFixed(1)+'\u2013'+hi.toFixed(1));
      counts.push(vals.filter(function(v){return v>=lo&&v<hi;}).length);
    }
    return {labels:labels,counts:counts};
  }
  function makeHistFixed(vals, step) {
    var mn=Math.floor(Math.min.apply(null,vals)/step)*step;
    var mx=Math.ceil(Math.max.apply(null,vals)/step)*step;
    var labels=[], counts=[];
    for(var lo=mn; lo<mx; lo+=step){
      var hi=lo+step;
      labels.push(lo+'\u2013'+hi);
      counts.push(vals.filter(function(v){return v>=lo&&v<hi;}).length);
    }
    return {labels:labels,counts:counts};
  }
  setTabCharts('dims', function(){
    var w=CONFIG.diameterClassWidth_cm, drawn=[];
    if(diams.length){var dh=makeHistFixed(diams,w);drawn.push(new Chart(document.getElementById('diam-chart'),{type:'bar',data:{labels:dh.labels,datasets:[{label:'Trees',data:dh.counts,backgroundColor:'#3266ad',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Diameter distribution (cm) \u2014 '+w+' cm classes'}},scales:{x:{ticks:{autoSkip:true,maxRotation:45}},y:{beginAtZero:true}}}}));}
    if(hts.length){var hh=makeHist(hts,12);drawn.push(new Chart(document.getElementById('ht-chart'),{type:'bar',data:{labels:hh.labels,datasets:[{label:'Trees',data:hh.counts,backgroundColor:'#1D9E75',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Height distribution (m)'}},scales:{x:{ticks:{autoSkip:true,maxRotation:45}},y:{beginAtZero:true}}}}));}
    return drawn;
  });

  renderDiameterClassTable(rows, cols, state.plots);
  renderSpeciesAnalysis();
}

/** Trees/ha by diameter class — bottom of the Dimensions tab. Re-rendered when the Plots CSV loads. */
function renderDiameterClassTable(rows, cols, plotsParsed) {
  // Always remove and recreate to avoid duplicates on re-upload
  var el = document.getElementById('dims-dclass');
  if (el) el.parentNode.removeChild(el);
  el = document.createElement('div');
  el.id = 'dims-dclass';
  // Use dims-stats parent — guaranteed correct container regardless of tab ID
  var anchor = document.getElementById('dims-stats');
  if (!anchor) return;
  anchor.parentNode.appendChild(el);
  if (!cols.diagCol || !cols.plotCol || !cols.izCol) {
    el.innerHTML = '<p class="empty-msg">Need Diameter, InclusionZone_ha and Plot columns for diameter class table.</p>'; return;
  }

  var survey = surveyedPlots(rows, cols, plotsParsed);
  var dc = diameterClassTable(rows, cols, CONFIG.diameterClassWidth_cm, survey.ids);
  if (!dc.classes.length) { el.innerHTML = '<p class="empty-msg">No plot data found.</p>'; return; }

  var thin = String.fromCharCode(0x2009), dash = String.fromCharCode(0x2013);
  el.innerHTML = tableHtml({
      id: 'trees-per-ha-by-diameter-class', title: 'Estimated trees per hectare by diameter class',
      fileBase: 'trees-per-ha-by-diameter-class',
      columns: [{ label: 'Diameter class' }, { label: 'Avg trees' + thin + '/' + thin + 'plot', dec: 3, fmt: 'fixed' },
                { label: 'Trees' + thin + '/' + thin + 'ha', dec: 0 }],
      rows: dc.classes.map(function(c) {
          return { kind: 'data', cells: [c.lo + ' ' + dash + ' ' + c.hi + ' cm', c.avgRaw, { v: c.treesHa, strong: true }] };
        }).concat([{ kind: 'total', cls: 'total-row',
          cells: [{ v: 'TOTAL', strong: true }, null, { v: dc.totalTreesHa, strong: true }] }])
    })
    + '<p style="font-size:11px;color:#888;margin-top:4px;">Based on ' + dc.nPlots
    + ' plot(s)' + (survey.source === 'plots' ? ' in the Plots CSV' : '')
    + '. Each tree counts as 1\u2009/\u2009InclusionZone_ha trees/ha; plots with no trees in a class contribute 0 to the average.'
    + (dc.noIz ? ' ' + dc.noIz + ' tree(s) without inclusion zone excluded.' : '')
    + (dc.outside ? ' ' + dc.outside + ' tree(s) in plots not in the Plots CSV excluded.' : '') + '</p>';
}

/** Trees with diameter and inclusion zone that got an estimated height / were dropped for lack of one. */
function heightCounts(rows, cols, trees) {
  var usable = rows.filter(function(r){ return parseNum(r[cols.diagCol])>0 && parseNum(r[cols.izCol])>0; }).length;
  return {
    estimated: trees.filter(function(t){return t.heightEstimated;}).length,
    excluded: usable - trees.length
  };
}

function heightNoteHtml(counts, heightModel) {
  var parts = [];
  if (counts.estimated) parts.push('Heights estimated for '+counts.estimated+' tree(s) without a measured height');
  if (counts.excluded) parts.push(counts.excluded+' tree(s) without height excluded'
    +(heightModel ? ' (no usable height curve)' : ' (height estimation is off)'));
  return parts.length ? '<p style="font-size:12px;color:#BA7517;margin-top:0.75rem;">&#9888; '+parts.join('; ')+'.</p>' : '';
}

/**
 * Plots to average over: every plot in the Plots CSV when loaded, otherwise
 * every plot with a row in the tree data. Plots without volume count as 0.
 * @returns {{ids: string[], source: 'plots'|'trees'}}
 */
function surveyedPlots(treeRows, cols, plotsParsed) {
  var seen = {}, ids = [];
  function add(id) { id = String(id||'').trim(); if (id && !seen[id]) { seen[id] = true; ids.push(id); } }
  if (plotsParsed) {
    var idCol = CONFIG.plotsPlotIdColumn || plotsParsed.headers[0];
    if (plotsParsed.headers.indexOf(idCol) !== -1) {
      plotsParsed.rows.forEach(function(r){ add(r[idCol]); });
      if (ids.length) return { ids: ids, source: 'plots' };
    }
  }
  if (cols.plotCol) treeRows.forEach(function(r){ add(r[cols.plotCol]); });
  return { ids: ids, source: 'trees' };
}

/** @param {object} [plotsParsed] - Plots CSV, if loaded; defines which plots the mean covers */
function renderVolumeTab(rows, cols, heightModel, plotsParsed) {
  var el = document.getElementById('volume-stats');
  setTabCharts('volume', null);   // drop any chart from a previous render
  if (!cols.diagCol||!cols.htCol||!cols.izCol) { el.innerHTML='<p class="empty-msg">Need Diameter, Height and InclusionZone_ha columns.</p>'; return; }
  var trees = calcTrees(rows, cols, heightModel);
  if (!trees.length) { el.innerHTML='<p class="empty-msg">No valid rows for volume calculation.</p>'; return; }
  var hc = heightCounts(rows, cols, trees);
  var plots = buildPlotSummary(trees);

  // Mean over surveyed plots; plots without volume count as 0
  var survey = surveyedPlots(rows, cols, plotsParsed);
  if (!survey.ids.length) survey.ids = Object.keys(plots);   // no plot column: single 'unknown' plot
  var inSurvey = {};
  survey.ids.forEach(function(p){ inSurvey[p] = true; });
  var emptyPlots = survey.ids.filter(function(p){ return !plots[p]; });
  var outside = Object.keys(plots).filter(function(p){ return !inSurvey[p]; });
  var totalVolHa = survey.ids.reduce(function(s,p){ return s + (plots[p] ? plots[p].totalVolHa : 0); }, 0);
  var meanVolHa  = totalVolHa/survey.ids.length;

  var byNum = function(a,b){ return (Number(a)-Number(b)) || (a < b ? -1 : a > b ? 1 : 0); };
  var plotIds = survey.ids.concat(outside).sort(byNum);
  var zero = { trees:0, estHeights:0, totalBA:0, totalVol:0, totalVolHa:0 };

  var meanNote = (survey.source === 'plots'
      ? 'Mean over the '+survey.ids.length+' plot(s) in the Plots CSV'
      : 'Mean over the '+survey.ids.length+' plot(s) in the tree data (load the Plots CSV in the Zones tab to include plots without tree rows)')
    + (emptyPlots.length ? '; '+emptyPlots.length+' plot(s) without volume count as 0 m\u00B3/ha' : '') + '.'
    + (outside.length ? ' * Not in the Plots CSV, excluded from the mean: '+escapeHtml(outside.join(', '))+'.' : '');

  el.innerHTML =
    '<div class="stat-grid" style="margin-bottom:1.25rem;">'
    +'<div class="stat-card"><div class="label">Trees calculated</div><div class="value">'+trees.length+'</div></div>'
    +'<div class="stat-card"><div class="label">Plots</div><div class="value">'+survey.ids.length+'</div></div>'
    +'<div class="stat-card"><div class="label">Mean vol/ha</div><div class="value">'+fmtN(meanVolHa,1)+'<span> m\u00B3/ha</span></div></div>'
    +'<div class="stat-card"><div class="label">Heights estimated</div><div class="value">'+hc.estimated+'</div></div>'
    +(hc.excluded ? '<div class="stat-card"><div class="label">Excluded (no height)</div><div class="value">'+hc.excluded+'</div></div>' : '')
    +'</div>'
    +tableHtml({
      id: 'volume-by-plot', title: 'Volume per hectare by plot', fileBase: 'volume-by-plot',
      columns: [{ label: 'Plot' }, { label: 'Trees', dec: 0 },
                { label: 'Basal area', unit: 'm\u00B2', dec: 4, fmt: 'fixed' }, { label: 'Volume', unit: 'm\u00B3', dec: 3, fmt: 'fixed' },
                { label: 'Vol/ha', unit: 'm\u00B3/ha', dec: 2 }, { label: 'Est. heights', dec: 0 }],
      rows: plotIds.map(function(p) {
        var d = plots[p] || zero;
        return { kind: 'data', style: plots[p] ? '' : 'color:var(--text-muted)',
                 cells: [p + (inSurvey[p] ? '' : ' *'), d.trees, d.totalBA, d.totalVol, { v: d.totalVolHa, strong: true },
                         d.estHeights ? { v: d.estHeights, em: true } : 0] };
      })
    })
    +'<p style="font-size:11px;color:var(--text-muted);margin-top:4px;">'+meanNote+'</p>'
    +heightNoteHtml(hc, heightModel);

  setTabCharts('volume', function(){
    var canvas=document.getElementById('volume-chart'); if(!canvas)return [];
    return [new Chart(canvas,{type:'bar',data:{labels:plotIds,datasets:[{label:'Vol/ha',data:plotIds.map(function(p){return plots[p] ? parseFloat(plots[p].totalVolHa.toFixed(2)) : 0;}),backgroundColor:'#3266ad',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Volume per hectare by plot (m\u00B3/ha)'}},scales:{x:{ticks:{autoSkip:false,maxRotation:45,font:{size:10}}},y:{beginAtZero:true}}}})];
  });
}

// ── Species analysis ─────────────────────────────────────────────────────────

/**
 * Per-species stand figures over the surveyed plots (see surveyedPlots; trees
 * in other plots are left out). Trees with a diameter and inclusion zone count
 * for trees/ha, basal area/ha and diameter statistics; volume uses calcTrees
 * (measured or estimated height; trees without either add 0 volume).
 * Per hectare = Σ(value / InclusionZone_ha) / number of plots.
 * Diameter classes: CONFIG.diameterClassWidth_cm wide, from the class holding the
 * smallest diameter, split at CONFIG.minExploitableDiameter_cm (splitIndex =
 * index of the first class with lo ≥ that diameter).
 */
function speciesAnalysis(rows, cols, heightModel, plotsParsed) {
  var width = CONFIG.diameterClassWidth_cm, minX = CONFIG.minExploitableDiameter_cm;
  var survey = surveyedPlots(rows, cols, plotsParsed);
  var ids = cols.plotCol ? survey.ids : ['unknown'];
  var inSurvey = {};
  ids.forEach(function(p){ inSurvey[p] = true; });
  var nPlots = ids.length;

  var trees = [], outside = 0, noDiamIz = 0;
  rows.forEach(function(r) {
    var d = parseNum(r[cols.diagCol]), iz = parseNum(r[cols.izCol]);
    if (!(d > 0 && iz > 0)) { noDiamIz++; return; }
    var plot = cols.plotCol ? String(r[cols.plotCol]||'').trim() : 'unknown';
    if (!inSurvey[plot]) { outside++; return; }
    var t = calcTrees([r], cols, heightModel)[0];
    trees.push({
      species: speciesOf(r, cols.speciesCol),
      plot: plot, d: d, perHa: 1/iz, baHa: basalArea_m2(d)/iz,
      vol: t ? t.vol : 0, volHa: t ? t.volHa : 0, hasVol: !!t
    });
  });

  // Tree records = trees analysed + outside (plot not surveyed) + noDiamIz (no diameter / inclusion zone)
  var result = { nPlots: nPlots, source: cols.plotCol ? survey.source : 'trees', outside: outside, noDiamIz: noDiamIz,
                 noVolume: trees.filter(function(t){ return !t.hasVol; }).length,
                 classes: [], splitIndex: 0, species: [], total: null };
  if (!trees.length || !nPlots) return result;

  var ds = trees.map(function(t){ return t.d; });
  var minD = Math.min.apply(null, ds), first = dClassIndex(minD, width);
  result.classes = dClassRange(minD, Math.max.apply(null, ds), width).map(function(c){ return { lo: c.lo, hi: c.hi }; });
  var nCls = result.classes.length;
  result.splitIndex = (minX === null || minX === undefined) ? nCls
    : Math.min(nCls, Math.max(0, dClassIndex(minX, width) - first));

  function zeros() { var a = []; for (var i = 0; i < nCls; i++) a.push(0); return a; }
  function newAcc(name) {
    return { name: name, n: 0, treesHa: 0, baHa: 0, vol: 0, volHa: 0, volHaExpl: 0, classVolHa: zeros(),
             volHaByPlot: {}, volHaExplByPlot: {} };
  }
  var bySp = {}, total = newAcc('Total');
  trees.forEach(function(t) {
    var a = bySp[t.species] || (bySp[t.species] = newAcc(t.species));
    var ci = dClassIndex(t.d, width) - first;
    var expl = ci >= result.splitIndex;
    [a, total].forEach(function(x) {
      x.n++; x.treesHa += t.perHa; x.baHa += t.baHa; x.vol += t.vol; x.volHa += t.volHa;
      x.classVolHa[ci] += t.volHa;
      x.volHaByPlot[t.plot] = (x.volHaByPlot[t.plot] || 0) + t.volHa;
      if (expl) {
        x.volHaExpl += t.volHa;
        x.volHaExplByPlot[t.plot] = (x.volHaExplByPlot[t.plot] || 0) + t.volHa;
      }
    });
  });

  function finish(x) {
    ['treesHa', 'baHa', 'volHa', 'volHaExpl'].forEach(function(k){ x[k] /= nPlots; });
    x.classVolHa = x.classVolHa.map(function(v){ return v / nPlots; });
    return x;
  }
  result.total = finish(total);
  result.species = Object.keys(bySp).map(function(k){ return finish(bySp[k]); })
    .sort(function(a, b){ return (b.volHa - a.volHa) || (a.name < b.name ? -1 : 1); });
  result.species.concat([result.total]).forEach(function(x) {
    x.volShare = result.total.volHa > 0 ? x.volHa / result.total.volHa : NaN;
  });
  return result;
}

/**
 * Total volume per species and zone: Σ over classes of zone ha × species vol/ha
 * of the class (class averages as in the Zones tab, incl. fallbacks), for all
 * trees and for trees ≥ CONFIG.minExploitableDiameter_cm.
 */
function speciesZoneVolumes(sa, plotsParsed, zonesParsed) {
  var pc = readPlotClasses(plotsParsed);
  if (pc.error) return { error: pc.error };
  var z = readZones(zonesParsed);
  function volumes(byPlot) {
    var ca = classAverages(pc.map, z.classNames, byPlot);
    return z.rows.map(function(zr) {
      return z.classNames.reduce(function(sum, cls) {
        var ha = parseNum(zr[cls]||'0');
        return sum + (isNaN(ha) ? 0 : ha) * ca.eff[cls].avg;
      }, 0);
    });
  }
  function both(x) { return { name: x.name, all: volumes(x.volHaByPlot), expl: volumes(x.volHaExplByPlot) }; }
  return {
    zones: z.rows.map(function(zr){ return zr[z.nameCol].trim(); }),
    species: sa.species.map(both),
    total: both(sa.total)
  };
}

var ZERO_CELL = '<span style="opacity:.35">·</span>';

function speciesSummaryHtml(sa) {
  var minX = CONFIG.minExploitableDiameter_cm;
  var nbsp = String.fromCharCode(0xA0);
  var columns = [{ label: 'Species' }, { label: 'Trees (sample)', dec: 0 }, { label: 'Trees/ha', dec: 1 },
                 { label: 'Basal area', unit: 'm²/ha', dec: 2 }, { label: 'Volume in sample', unit: 'm³', dec: 3 },
                 { label: 'Vol/ha', unit: 'm³/ha', dec: 2 }, { label: 'Share of vol/ha', unit: '%', dec: 1 }];
  if (minX != null) columns.push({ label: 'Vol/ha ≥ ' + minX + ' cm', unit: 'm³/ha', dec: 2 });
  function row(x, kind) {
    var share = 100 * x.volShare;
    var cells = [x.name, x.n, x.treesHa, x.baHa, x.vol, { v: x.volHa, strong: true },
                 { v: share, html: fmtN(share, 1) + nbsp + '%' }];
    if (minX != null) cells.push(x.volHaExpl);
    return { kind: kind, cls: kind === 'total' ? 'total-row' : '', cells: cells };
  }
  return tableHtml({
      id: 'species-summary', title: 'Volume, stems and basal area per species', fileBase: 'species-summary', scroll: true,
      columns: columns,
      rows: sa.species.map(function(s){ return row(s, 'data'); }).concat([row(sa.total, 'total')])
    })
    +'<p class="table-note">Mean over the '+sa.nPlots+' plot(s) '
    +(sa.source === 'plots' ? 'in the Plots CSV' : 'in the tree data (load the Plots CSV in the Zones tab to include plots without tree rows)')
    +'; per hectare = Σ(value ÷ InclusionZone_ha) ÷ plots. Share is of the total vol/ha.'
    +(sa.noVolume ? ' '+sa.noVolume+' tree(s) without height count for trees/ha and basal area only.' : '')
    +(sa.outside ? ' '+sa.outside+' tree(s) in plots not in the Plots CSV excluded.' : '')
    +(sa.noDiamIz ? ' '+sa.noDiamIz+' tree record(s) without diameter or inclusion zone not included.' : '')
    +' Trees (sample) differ from the species breakdown counts only by these exclusions.</p>';
}

/**
 * Volume per hectare by species and diameter class: classes as rows, species
 * (+ Total) as columns, grouped below / at-or-above the minimum exploitable
 * diameter with subtotals.
 * Per-cell values come from classCell() (class rows) and sumCell() (subtotal and
 * total rows) — the places to add extras such as confidence intervals (add a
 * column per species, or richer cell objects; export picks them up from the model).
 */
function speciesVolClassTable(sa) {
  var minX = CONFIG.minExploitableDiameter_cm, cols = sa.species.concat([sa.total]);
  // x: one species (or sa.total); i: class index; from..to-1: class range
  function classCell(x, i) {
    var v = x.classVolHa[i];
    return Math.abs(v) < 1e-12 ? { v: 0, html: ZERO_CELL } : { v: v };
  }
  function sumCell(x, from, to) {
    var s = 0;
    for (var i = from; i < to; i++) s += x.classVolHa[i];
    return s;
  }
  function classRow(i, cls) {
    return { kind: 'data', cls: cls, cells: [sa.classes[i].lo + ' – ' + sa.classes[i].hi + ' cm'].concat(
      cols.map(function(x, j){ var c = classCell(x, i); c.strong = j === cols.length - 1; return c; })) };
  }
  function sumRow(kind, label, from, to, cls) {
    return { kind: kind, cls: cls, cells: [label].concat(cols.map(function(x){ return sumCell(x, from, to); })) };
  }
  var n = sa.classes.length, k = sa.splitIndex, rows = [], i;
  if (minX === null || minX === undefined) {
    for (i = 0; i < n; i++) rows.push(classRow(i));
  } else {
    rows.push({ kind: 'group', label: 'Below ' + minX + ' cm — regeneration potential' });
    for (i = 0; i < k; i++) rows.push(classRow(i));
    rows.push(sumRow('subtotal', 'Subtotal < ' + minX + ' cm', 0, k, 'subtotal'));
    rows.push({ kind: 'group', cls: 'expl-head', label: '≥ ' + minX + ' cm — exploitable' });
    for (i = k; i < n; i++) rows.push(classRow(i, 'expl'));
    rows.push(sumRow('subtotal', 'Subtotal ≥ ' + minX + ' cm', k, n, 'subtotal expl'));
  }
  var total = sumRow('total', '', 0, n, 'total-row');
  total.cells[0] = { v: 'TOTAL', strong: true };
  rows.push(total);
  return {
    id: 'volume-by-species-diameter-class', title: 'Volume per hectare (m³/ha) by species and diameter class',
    fileBase: 'volume-by-species-diameter-class', scroll: true,
    columns: [{ label: 'Diameter class' }].concat(cols.map(function(x) {
      return { label: x === sa.total ? 'Total' : x.name, unit: 'm³/ha', unitExportOnly: true, dec: 2 };
    })),
    rows: rows
  };
}

function speciesZonesHtml(sa) {
  if (!state.plots || !state.zones) {
    return '<div class="section-title" style="margin-top:1.5rem;">Volume per species and zone</div>'
      +'<p class="empty-msg">Load the Plots CSV and Zones CSV in the Zones tab to see total volume per species and zone.</p>';
  }
  var zv = speciesZoneVolumes(sa, state.plots, state.zones);
  if (zv.error) return '<p class="empty-msg" style="color:#D85A30;">'+zv.error+'</p>';
  var minX = CONFIG.minExploitableDiameter_cm;
  function table(key, id, title, fileBase) {
    function row(x, kind) {
      var sum = x[key].reduce(function(a, b){ return a + b; }, 0);
      return { kind: kind, cls: kind === 'total' ? 'total-row' : '',
               cells: [x.name].concat(x[key], [{ v: sum, strong: true }]) };
    }
    return tableHtml({
      id: id, title: title, fileBase: fileBase, scroll: true,
      columns: [{ label: 'Species' }].concat(zv.zones.map(function(z) {
        return { label: z, unit: 'm³', unitExportOnly: true, dec: 0 };
      }), [{ label: 'Total', unit: 'm³', unitExportOnly: true, dec: 0 }]),
      rows: zv.species.map(function(s){ return row(s, 'data'); }).concat([row(zv.total, 'total')])
    });
  }
  return table('all', 'volume-by-species-and-zone', 'Total volume per species and zone (m³) — all trees',
               'volume-by-species-and-zone')
    +(minX != null ? table('expl', 'volume-by-species-and-zone-exploitable',
                           'Total volume per species and zone (m³) — trees ≥ ' + minX + ' cm',
                           'volume-by-species-and-zone-from-' + minX + 'cm') : '')
    +'<p class="table-note">Zone volume = Σ over classes of class area (ha) × species vol/ha of the class, '
    +'averaged over all plots of the class in the Plots CSV (classes without plots use the same fallbacks as the Zones tab).</p>';
}

/** Species analysis, below the species breakdown in the Species tab. Re-rendered on tree, Plots CSV and Zones CSV load. */
function renderSpeciesAnalysis() {
  var el = document.getElementById('species-analysis');
  el.innerHTML = '';
  if (!state.trees) return;
  var cols = state.cols;
  if (!cols.diagCol || !cols.izCol) { el.innerHTML = '<p class="empty-msg">Species analysis needs Diameter and InclusionZone_ha columns.</p>'; return; }
  var sa = speciesAnalysis(state.trees.rows, cols, state.heightModel, state.plots);
  if (!sa.species.length) { el.innerHTML = '<p class="empty-msg">No trees with diameter and inclusion zone.</p>'; return; }
  el.innerHTML = '<div style="margin-top:2rem;">' + speciesSummaryHtml(sa) + '</div>'
    + tableHtml(speciesVolClassTable(sa))
    + speciesZonesHtml(sa);
}

function updateZoneUploadStatus() {
  var hasPlots = !!state.plots;
  var hasZones = !!state.zones;
  document.getElementById('upload-status').innerHTML =
    '<span class="'+(hasPlots?'ok':'missing')+'">\u25CF Plots CSV'+(hasPlots?' \u2713':' - not loaded')+'</span> &nbsp; '
    +'<span class="'+(hasZones?'ok':'missing')+'">\u25CF Zones CSV'+(hasZones?' \u2713':' - not loaded')+'</span>';
  document.getElementById('calc-zones-btn').disabled = !(hasPlots && hasZones && state.trees);
}

/**
 * Plot → class map from the Plots CSV (CONFIG.plotsPlotIdColumn, CONFIG.classColumn).
 * @returns {{map: Object}|{error: string}} error is ready-to-insert (escaped) HTML text
 */
function readPlotClasses(plotsParsed) {
  var hdrs  = plotsParsed.headers;
  var idCol = CONFIG.plotsPlotIdColumn || hdrs[0];
  var classCol = CONFIG.classColumn;
  var missing = [idCol, classCol].filter(function(c){ return hdrs.indexOf(c) === -1; });
  if (missing.length) {
    return { error: '&#9888; Plots CSV has no column '
      + missing.map(function(c){ return '"'+escapeHtml(c)+'"'; }).join(' or ')
      + ' (see CONFIG in js/config.js). Columns found: ' + escapeHtml(hdrs.join(', ')) };
  }
  var map = {};
  plotsParsed.rows.forEach(function(r) {
    var code = (r[idCol]||'').trim();
    var cls  = (r[classCol]||'').trim();
    if (code && cls) map[code] = cls;
  });
  return { map: map };
}

/**
 * Per-class average of a per-hectare plot value over ALL plots of the class in
 * the Plots CSV (plots missing from valueByPlot count as 0). Classes in
 * classNames without plots borrow via CONFIG.classFallbacks.
 * @param {Object} valueByPlot - plot ID → value (e.g. vol/ha)
 * @returns {{accum: Object, eff: Object}} accum: every class with plots
 *   {sum, count, zeros, avg}; eff: every class in classNames {avg, source, missing}
 */
function classAverages(plotClassMap, classNames, valueByPlot) {
  var accum = {};
  Object.keys(plotClassMap).forEach(function(plotId) {
    var cls = plotClassMap[plotId];
    if (!accum[cls]) accum[cls] = { sum: 0, count: 0, zeros: 0 };
    var has = Object.prototype.hasOwnProperty.call(valueByPlot, plotId);
    accum[cls].sum   += has ? valueByPlot[plotId] : 0;
    accum[cls].count += 1;
    if (!has) accum[cls].zeros += 1;
  });
  Object.keys(accum).forEach(function(cls) { accum[cls].avg = accum[cls].sum / accum[cls].count; });

  var eff = {};
  classNames.forEach(function(cls) {
    if (accum[cls]) { eff[cls] = { avg: accum[cls].avg, source: null }; return; }
    var fb = (CONFIG.classFallbacks[cls] || []).find(function(c){ return !!accum[c]; });
    eff[cls] = fb ? { avg: accum[fb].avg, source: fb } : { avg: 0, source: null, missing: true };
  });
  return { accum: accum, eff: eff };
}

/** Zone names and class columns of the Zones CSV (first column = zone name). */
function readZones(zonesParsed) {
  var hdrs = zonesParsed.headers, nameCol = hdrs[0];
  return {
    nameCol: nameCol,
    classNames: hdrs.slice(1).filter(function(h){ return h.trim() !== ''; }),
    rows: zonesParsed.rows.filter(function(r){ return (r[nameCol]||'').trim(); })
  };
}

function runZoneCalculation() {
  var el = document.getElementById('zones-result');
  if (!state.trees || !state.plots || !state.zones) {
    el.innerHTML = '<p class="empty-msg">Please load all three files first.</p>'; return;
  }

  var rows = state.trees.rows;
  var cols = state.cols;

  if (!cols.diagCol||!cols.htCol||!cols.izCol||!cols.plotCol) {
    el.innerHTML = '<p class="empty-msg">Could not find required columns in tree data.</p>'; return;
  }

  // Build plot -> class map
  var pc = readPlotClasses(state.plots);
  if (pc.error) { el.innerHTML = '<p class="empty-msg" style="color:#D85A30;">' + pc.error + '</p>'; return; }
  var plotClassMap = pc.map;

  // Zone x class hectares
  var zones       = readZones(state.zones);
  var zoneNameCol = zones.nameCol;
  var classNames  = zones.classNames;

  // Per-tree volumes
  var trees = calcTrees(rows, cols, state.heightModel);
  if (!trees.length) { el.innerHTML='<p class="empty-msg">No valid tree rows.</p>'; return; }

  // Per-plot vol/ha
  var plotSummary = buildPlotSummary(trees);

  // Per-class avg vol/ha — ALL plots in the plots CSV contribute;
  // plots with no trees count as 0 vol/ha; classes without plots use fallbacks
  var volHaByPlot = {};
  Object.keys(plotSummary).forEach(function(p){ volHaByPlot[p] = plotSummary[p].totalVolHa; });
  var ca = classAverages(plotClassMap, classNames, volHaByPlot);
  var classAccum  = ca.accum;
  var classAvgEff = ca.eff;

  // Class codes not listed in CONFIG.classCodes (typos, new strata)
  var unknownClasses = classNames.concat(Object.keys(classAccum)).filter(function(c, i, arr) {
    return CONFIG.classCodes.indexOf(c) === -1 && arr.indexOf(c) === i;
  });

  // Class summary table
  var classHtml = tableHtml({
    id: 'volume-by-class', title: 'Average volume per hectare by class', fileBase: 'volume-by-class',
    columns: [{ label: 'Class' }, { label: 'Plots (total)', dec: 0 }, { label: 'Empty plots (0 m\u00B3/ha)', dec: 0 },
              { label: 'Avg vol/ha', unit: 'm\u00B3/ha', dec: 2 }, { label: 'Note' }],
    rows: classNames.map(function(cls) {
      var a   = classAccum[cls] || { count: 0, zeros: 0 };
      var eff = classAvgEff[cls];
      var note = eff.missing ? { v: 'no plots, no fallback', html: '<span style="color:#D85A30">no plots, no fallback</span>' }
               : eff.source  ? { v: 'fallback from class ' + eff.source,
                                 html: '<span style="color:#BA7517">fallback from class ' + escapeHtml(eff.source) + '</span>' }
               : '';
      return { kind: 'data', cells: [cls, a.count, a.zeros, eff.missing ? { v: null, html: '\u2014' } : eff.avg, note] };
    })
  });

  // Zone x class table
  var grandTotal = 0;
  var colTotals  = {};
  classNames.forEach(function(c){colTotals[c]=0;});

  var zoneRows = zones.rows;

  var zoneColumns = [{ label: 'Zone' }];
  classNames.forEach(function(cls) {
    zoneColumns.push({ label: cls + ' area', unit: 'ha', dec: 1 }, { label: cls + ' vol', unit: 'm\u00B3', dec: 0 });
  });
  zoneColumns.push({ label: 'Total vol', unit: 'm\u00B3', dec: 0 });

  var zoneTableRows = zoneRows.map(function(zrow) {
    var zoneName = (zrow[zoneNameCol]||'').trim();
    var zoneTotal = 0;
    var cells = [{ v: zoneName, strong: true }];
    classNames.forEach(function(cls) {
      var ha  = parseNum(zrow[cls]||'0');
      var eff = classAvgEff[cls];
      var avg = eff ? eff.avg : 0;
      var vol = (isNaN(ha)?0:ha) * avg;
      zoneTotal += vol;
      colTotals[cls] += vol;
      cells.push(ha, vol);
    });
    grandTotal += zoneTotal;
    cells.push({ v: zoneTotal, strong: true });
    return { kind: 'data', cells: cells };
  });

  // Totals row
  var totalCells = ['TOTAL'];
  classNames.forEach(function(cls){ totalCells.push(null, colTotals[cls]); });
  totalCells.push(grandTotal);
  zoneTableRows.push({ kind: 'total', cls: 'total-row', cells: totalCells });

  var zoneHtml = tableHtml({
    id: 'volume-by-zone-and-class', title: 'Total volume by zone and class (m\u00B3)', fileBase: 'volume-by-zone-and-class',
    scroll: true, marginTop: '2rem', columns: zoneColumns, rows: zoneTableRows
  });

  // Plots in tree data not found in plots CSV (unmatched)
  var unmatchedPlots = Object.keys(plotSummary).filter(function(p){return !plotClassMap[p];});
  var warningHtml = '';
  if (unmatchedPlots.length) {
    warningHtml = '<p style="font-size:12px;color:#D85A30;margin-top:1rem;">&#9888; '+unmatchedPlots.length+' plot(s) not found in Plots CSV and excluded: '+escapeHtml(unmatchedPlots.join(', '))+'</p>';
  }
  if (unknownClasses.length) {
    warningHtml += '<p style="font-size:12px;color:#D85A30;margin-top:0.5rem;">&#9888; Class code(s) not in CONFIG.classCodes: '+escapeHtml(unknownClasses.join(', '))+'</p>';
  }
  warningHtml += heightNoteHtml(heightCounts(rows, cols, trees), state.heightModel);

  el.innerHTML =
    '<div class="stat-grid" style="margin-bottom:1.5rem;margin-top:0.5rem;">'
    +'<div class="stat-card"><div class="label">Grand total volume</div><div class="value">'+fmtN(grandTotal,0)+'<span> m\u00B3</span></div></div>'
    +'<div class="stat-card"><div class="label">Zones</div><div class="value">'+zoneRows.length+'</div></div>'
    +'<div class="stat-card"><div class="label">Classes used</div><div class="value">'+Object.keys(classAvgEff).length+'</div></div>'
    +'</div>'
    + classHtml
    + zoneHtml
    + warningHtml;
}

document.addEventListener('DOMContentLoaded', function() {
  var dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', function(e){e.preventDefault();dz.classList.add('over');});
  dz.addEventListener('dragleave', function(){dz.classList.remove('over');});
  dz.addEventListener('drop', function(e){e.preventDefault();dz.classList.remove('over');loadTreeFile(e.dataTransfer.files[0]);});
  document.getElementById('file-input').addEventListener('change', function(e){loadTreeFile(e.target.files[0]);});

  document.getElementById('input-plots').addEventListener('change', function(e) {
    var file = e.target.files[0]; if(!file) return;
    readFile(file, function(parsed) {
      state.plots = parsed;
      // Volume, diameter-class and species figures average over the plots in the Plots CSV
      if (state.trees) {
        renderVolumeTab(state.trees.rows, state.cols, state.heightModel, state.plots);
        renderDiameterClassTable(state.trees.rows, state.cols, state.plots);
        renderSpeciesAnalysis();
      }
      document.getElementById('name-plots').textContent = file.name;
      document.getElementById('btn-plots').classList.add('loaded');
      updateZoneUploadStatus();
    });
  });

  document.getElementById('input-zones').addEventListener('change', function(e) {
    var file = e.target.files[0]; if(!file) return;
    readFile(file, function(parsed) {
      state.zones = parsed;
      renderSpeciesAnalysis();   // volume per species and zone
      document.getElementById('name-zones').textContent = file.name;
      document.getElementById('btn-zones').classList.add('loaded');
      updateZoneUploadStatus();
    });
  });
});

function loadTreeFile(file) {
  if (!file) return;
  readFile(file, function(parsed) {
    prepareTrees(parsed);
    renderDashboard(parsed, file.name);
    updateZoneUploadStatus();
  });
}

function readFile(file, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var parsed = parseCSVText(e.target.result);
    if (!parsed) { alert('Could not parse ' + file.name); return; }
    if (parsed.errors.length) console.warn('CSV parse warnings in ' + file.name, parsed.errors);
    callback(parsed);
  };
  reader.readAsText(file);
}

// Node (tests) only — `module` is undefined in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseCSVText: parseCSVText, parseNum: parseNum, findCol: findCol, countBy: countBy,
    NOT_RECORDED: NOT_RECORDED, speciesOf: speciesOf, isNumericCode: isNumericCode,
    speciesCounts: speciesCounts, speciesNumber: speciesNumber,
    numStats: numStats, fmtN: fmtN, escapeHtml: escapeHtml, barChart: barChart,
    exportTables: exportTables, tableHtml: tableHtml, tableToCSV: tableToCSV, tableToTSV: tableToTSV,
    tableExportRows: tableExportRows, exportFileName: exportFileName, speciesVolClassTable: speciesVolClassTable,
    copyTable: copyTable,
    charts: charts, switchTab: switchTab, renderDashboard: renderDashboard, resetApp: resetApp,
    detectTreeColumns: detectTreeColumns, prepareTrees: prepareTrees,
    basalArea_m2: basalArea_m2, treeVolume_m3: treeVolume_m3,
    fitNaslund: fitNaslund, naslundHeight: naslundHeight,
    fitHeightModel: fitHeightModel, estimateHeight: estimateHeight,
    calcTrees: calcTrees, buildPlotSummary: buildPlotSummary, diameterClassTable: diameterClassTable,
    surveyedPlots: surveyedPlots, renderVolumeTab: renderVolumeTab, runZoneCalculation: runZoneCalculation,
    readPlotClasses: readPlotClasses, classAverages: classAverages, readZones: readZones,
    dClassIndex: dClassIndex, dClassRange: dClassRange, renderDiameterClassTable: renderDiameterClassTable,
    speciesAnalysis: speciesAnalysis, speciesZoneVolumes: speciesZoneVolumes,
    renderSpeciesAnalysis: renderSpeciesAnalysis,
    state: state
  };
}