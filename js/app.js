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

  var tbody = '';
  if (ds) tbody+='<tr><td>Diameter (cm)</td><td>'+ds.n+'</td><td>'+ds.min+'</td><td>'+ds.max+'</td><td>'+ds.mean.toFixed(1)+'</td><td>'+ds.median.toFixed(1)+'</td></tr>';
  if (hs) tbody+='<tr><td>Height (m)</td><td>'+hs.n+'</td><td>'+hs.min+'</td><td>'+hs.max+'</td><td>'+hs.mean.toFixed(1)+'</td><td>'+hs.median.toFixed(1)+'</td></tr>';
  if (boles.length){var bs=numStats(boles);tbody+='<tr><td>Bole height (m)</td><td>'+bs.n+'</td><td>'+bs.min+'</td><td>'+bs.max+'</td><td>'+bs.mean.toFixed(1)+'</td><td>'+bs.median.toFixed(1)+'</td></tr>';}
  document.getElementById('dims-stats').innerHTML = tbody
    ? '<table class="summary"><thead><tr><th>Metric</th><th>n</th><th>Min</th><th>Max</th><th>Mean</th><th>Median</th></tr></thead><tbody>'+tbody+'</tbody></table>'
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

  el.innerHTML =
    '<div class="section-title" style="margin-top:1.5rem;">Estimated trees per hectare by diameter class</div>'
    + '<table class="summary"><thead><tr>'
    + '<th>Diameter class</th><th>Avg trees\u2009/\u2009plot</th><th>Trees\u2009/\u2009ha</th>'
    + '</tr></thead><tbody>'
    + dc.classes.map(function(c) {
        return '<tr><td>' + c.lo + ' \u2013 ' + c.hi + ' cm</td><td>' + c.avgRaw.toFixed(3)
          + '</td><td><strong>' + c.treesHa + '</strong></td></tr>';
      }).join('')
    + '<tr class="total-row"><td><strong>TOTAL</strong></td><td></td>'
    + '<td><strong>' + dc.totalTreesHa + '</strong></td></tr>'
    + '</tbody></table>'
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
    +'<div class="section-title">Volume per hectare by plot</div>'
    +'<table class="summary"><thead><tr><th>Plot</th><th>Trees</th><th>Basal area (m\u00B2)</th><th>Volume (m\u00B3)</th><th>Vol/ha (m\u00B3/ha)</th><th>Est. heights</th></tr></thead><tbody>'
    +plotIds.map(function(p){
      var d = plots[p] || zero;
      var label = escapeHtml(p) + (inSurvey[p] ? '' : ' *');
      return '<tr'+(plots[p]?'':' style="color:var(--text-muted)"')+'><td>'+label+'</td><td>'+d.trees+'</td><td>'+d.totalBA.toFixed(4)+'</td><td>'+d.totalVol.toFixed(3)+'</td><td><strong>'+fmtN(d.totalVolHa,2)+'</strong></td><td>'+(d.estHeights?'<em>'+d.estHeights+'</em>':'0')+'</td></tr>';
    }).join('')
    +'</tbody></table>'
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
  function row(x, cls) {
    return '<tr'+(cls ? ' class="'+cls+'"' : '')+'><td>'+escapeHtml(x.name)+'</td><td>'+x.n+'</td><td>'+fmtN(x.treesHa,1)
      +'</td><td>'+fmtN(x.baHa,2)+'</td><td>'+fmtN(x.vol,3)+'</td><td><strong>'+fmtN(x.volHa,2)+'</strong></td><td>'
      +fmtN(100*x.volShare,1)+' %</td>'+(minX != null ? '<td>'+fmtN(x.volHaExpl,2)+'</td>' : '')+'</tr>';
  }
  return '<div class="section-title">Volume, stems and basal area per species</div>'
    +'<div class="zone-table-wrap"><table class="summary"><thead><tr><th>Species</th><th>Trees (sample)</th><th>Trees/ha</th>'
    +'<th>Basal area (m²/ha)</th><th>Volume in sample (m³)</th><th>Vol/ha (m³/ha)</th><th>Share of vol/ha</th>'
    +(minX != null ? '<th>Vol/ha ≥ '+minX+' cm</th>' : '')+'</tr></thead><tbody>'
    +sa.species.map(function(s){ return row(s); }).join('') + row(sa.total, 'total-row')
    +'</tbody></table></div>'
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
 * Per-cell output goes through classCell() (class rows) and sumCell() (subtotal
 * and total rows) — the places to add extras such as confidence intervals.
 */
function speciesVolClassTableHtml(sa) {
  var minX = CONFIG.minExploitableDiameter_cm, cols = sa.species.concat([sa.total]);
  var ncol = cols.length + 1;
  // x: one species (or sa.total); i: class index; from..to-1: class range
  function classCell(x, i) {
    var v = x.classVolHa[i];
    return Math.abs(v) < 1e-12 ? ZERO_CELL : fmtN(v, 2);
  }
  function sumCell(x, from, to) {
    var s = 0;
    for (var i = from; i < to; i++) s += x.classVolHa[i];
    return fmtN(s, 2);
  }
  function classRow(i, cls) {
    return '<tr'+(cls ? ' class="'+cls+'"' : '')+'><td>'+sa.classes[i].lo+' – '+sa.classes[i].hi+' cm</td>'
      +cols.map(function(x, j){ var v = classCell(x, i); return '<td>'+(j === cols.length-1 ? '<strong>'+v+'</strong>' : v)+'</td>'; }).join('')+'</tr>';
  }
  function sumRow(label, from, to, cls) {
    return '<tr class="'+cls+'"><td>'+label+'</td>'+cols.map(function(x){ return '<td>'+sumCell(x, from, to)+'</td>'; }).join('')+'</tr>';
  }
  function head(label, cls) { return '<tr class="group-head '+cls+'"><td colspan="'+ncol+'">'+label+'</td></tr>'; }
  var n = sa.classes.length, k = sa.splitIndex, body = '', i;
  if (minX === null || minX === undefined) {
    for (i = 0; i < n; i++) body += classRow(i);
  } else {
    body += head('Below '+minX+' cm — regeneration potential', '');
    for (i = 0; i < k; i++) body += classRow(i);
    body += sumRow('Subtotal &lt; '+minX+' cm', 0, k, 'subtotal');
    body += head('≥ '+minX+' cm — exploitable', 'expl-head');
    for (i = k; i < n; i++) body += classRow(i, 'expl');
    body += sumRow('Subtotal ≥ '+minX+' cm', k, n, 'subtotal expl');
  }
  body += sumRow('<strong>TOTAL</strong>', 0, n, 'total-row');
  return '<div class="section-title" style="margin-top:1.5rem;">Volume per hectare (m³/ha) by species and diameter class</div>'
    +'<div class="zone-table-wrap"><table class="summary"><thead><tr><th>Diameter class</th>'
    +sa.species.map(function(s){ return '<th>'+escapeHtml(s.name)+'</th>'; }).join('')+'<th>Total</th></tr></thead><tbody>'
    +body+'</tbody></table></div>';
}

function speciesZonesHtml(sa) {
  if (!state.plots || !state.zones) {
    return '<div class="section-title" style="margin-top:1.5rem;">Volume per species and zone</div>'
      +'<p class="empty-msg">Load the Plots CSV and Zones CSV in the Zones tab to see total volume per species and zone.</p>';
  }
  var zv = speciesZoneVolumes(sa, state.plots, state.zones);
  if (zv.error) return '<p class="empty-msg" style="color:#D85A30;">'+zv.error+'</p>';
  var minX = CONFIG.minExploitableDiameter_cm;
  function table(key, title) {
    function row(x, cls) {
      var sum = x[key].reduce(function(a, b){ return a + b; }, 0);
      return '<tr'+(cls ? ' class="'+cls+'"' : '')+'><td>'+escapeHtml(x.name)+'</td>'
        +x[key].map(function(v){ return '<td>'+fmtN(v,0)+'</td>'; }).join('')+'<td><strong>'+fmtN(sum,0)+'</strong></td></tr>';
    }
    return '<div class="section-title" style="margin-top:1.5rem;">'+title+'</div>'
      +'<div class="zone-table-wrap"><table class="summary"><thead><tr><th>Species</th>'
      +zv.zones.map(function(z){ return '<th>'+escapeHtml(z)+'</th>'; }).join('')+'<th>Total</th></tr></thead><tbody>'
      +zv.species.map(function(s){ return row(s); }).join('') + row(zv.total, 'total-row')
      +'</tbody></table></div>';
  }
  return table('all', 'Total volume per species and zone (m³) — all trees')
    +(minX != null ? table('expl', 'Total volume per species and zone (m³) — trees ≥ '+minX+' cm') : '')
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
    + speciesVolClassTableHtml(sa)
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
  var classHtml = '<div class="section-title">Average volume per hectare by class</div>'
    +'<table class="summary"><thead><tr><th>Class</th><th>Plots (total)</th><th>Empty plots (0 m\u00B3/ha)</th><th>Avg vol/ha (m\u00B3/ha)</th><th>Note</th></tr></thead><tbody>'
    +classNames.map(function(cls){
      var a   = classAccum[cls] || { count: 0, zeros: 0 };
      var eff = classAvgEff[cls];
      var note = eff.missing ? '<span style="color:#D85A30">no plots, no fallback</span>'
               : eff.source  ? '<span style="color:#BA7517">fallback from class '+escapeHtml(eff.source)+'</span>'
               : '';
      return '<tr><td>'+escapeHtml(cls)+'</td><td>'+a.count+'</td><td>'+a.zeros+'</td><td>'+(eff.missing?'\u2014':fmtN(eff.avg,2))+'</td><td>'+note+'</td></tr>';
    }).join('')
    +'</tbody></table>';

  // Zone x class table
  var grandTotal = 0;
  var colTotals  = {};
  classNames.forEach(function(c){colTotals[c]=0;});

  var zoneRows = zones.rows;

  var thead = '<tr><th>Zone</th>';
  classNames.forEach(function(cls){ thead += '<th>'+escapeHtml(cls)+' area (ha)</th><th>'+escapeHtml(cls)+' vol (m\u00B3)</th>'; });
  thead += '<th>Total vol (m\u00B3)</th></tr>';

  var tbody = zoneRows.map(function(zrow){
    var zoneName = (zrow[zoneNameCol]||'').trim();
    var zoneTotal = 0;
    var cells = '<td><strong>'+escapeHtml(zoneName)+'</strong></td>';
    classNames.forEach(function(cls){
      var ha  = parseNum(zrow[cls]||'0');
      var eff = classAvgEff[cls];
      var avg = eff ? eff.avg : 0;
      var vol = (isNaN(ha)?0:ha) * avg;
      zoneTotal += vol;
      colTotals[cls] += vol;
      cells += '<td>'+fmtN(ha,1)+'</td><td>'+fmtN(vol,0)+'</td>';
    });
    grandTotal += zoneTotal;
    return '<tr>'+cells+'<td><strong>'+fmtN(zoneTotal,0)+'</strong></td></tr>';
  }).join('');

  // Totals row
  var totalsRow = '<tr class="total-row"><td>TOTAL</td>';
  classNames.forEach(function(cls){ totalsRow += '<td></td><td>'+fmtN(colTotals[cls],0)+'</td>'; });
  totalsRow += '<td>'+fmtN(grandTotal,0)+'</td></tr>';

  var zoneHtml = '<div class="section-title" style="margin-top:2rem;">Total volume by zone and class (m\u00B3)</div>'
    +'<div class="zone-table-wrap"><table class="summary"><thead>'+thead+'</thead><tbody>'+tbody+totalsRow+'</tbody></table></div>';

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