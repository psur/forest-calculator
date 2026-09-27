/**
 * app.js - Forest Calculator v1.1
 */

var charts = [];
// cols: detected tree-CSV columns; heightModel: fitted by prepareTrees()
var state = { trees: null, plots: null, zones: null, cols: {}, heightModel: null };

var COLORS = ['#3266ad','#1D9E75','#D85A30','#BA7517','#993556','#534AB7','#639922','#E24B4A','#888780','#185FA5'];

function parseCSVText(text) {
  text = text.replace(/^\uFEFF/, '');
  var lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  var h0 = lines[0];
  var delim = (h0.split(';').length > h0.split(',').length) ? ';' : ',';

  function splitLine(line) {
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  }

  var headers = splitLine(lines[0]).map(function(h) { return h.replace(/^"|"$/g,'').trim(); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var cells = splitLine(lines[i]).map(function(c) { return c.replace(/^"|"$/g,'').trim(); });
    var obj = {};
    headers.forEach(function(h, j) { obj[h] = cells[j] !== undefined ? cells[j] : ''; });
    rows.push(obj);
  }
  return { headers: headers, rows: rows, delim: delim };
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
  charts.forEach(function(c) { c.destroy(); });
  charts = [];
  volumeChart = null;
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
  updateZoneUploadStatus();
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
}

function countBy(rows, col) {
  var counts = {};
  rows.forEach(function(r) {
    var v = (r[col] || '').trim() || '(not recorded)';
    counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts)
    .filter(function(e) { return !/^\(?\d+(\.\d+)?\)?$/.test(e[0]); })
    .sort(function(a, b) { return b[1] - a[1]; });
}

function numStats(vals) {
  if (!vals.length) return null;
  var sorted = vals.slice().sort(function(a,b){return a-b;});
  var mean = vals.reduce(function(s,v){return s+v;},0) / vals.length;
  var mid = Math.floor(sorted.length/2);
  var median = sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  return { min: sorted[0], max: sorted[sorted.length-1], mean: mean, median: median, n: vals.length };
}

function barChart(entries, total) {
  if (!entries.length) return '<p class="empty-msg">No data found.</p>';
  var max = entries[0][1] || 1;
  return entries.slice(0,20).map(function(e,i) {
    return '<div class="bar-row">'
      + '<span class="bar-label" title="'+e[0]+'">'+e[0]+'</span>'
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
    var species = cols.speciesCol ? (r[cols.speciesCol]||'').trim() : '';
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

/**
 * Trees per hectare by diameter class. Each tree stands for 1 / InclusionZone_ha
 * trees/ha; class sums are averaged over all plots present in the tree data.
 * Classes run from the one holding the smallest diameter to the one holding
 * the largest (lo ≤ d < hi).
 */
function diameterClassTable(rows, cols, width) {
  var plots = {}, trees = [], noIz = 0;
  rows.forEach(function(r) {
    var p = String(r[cols.plotCol]||'').trim();
    if (!p) return;
    plots[p] = true;
    var d = parseNum(r[cols.diagCol]);
    if (isNaN(d)||d<=0) return;
    var iz = parseNum(r[cols.izCol]);
    if (isNaN(iz)||iz<=0) { noIz++; return; }
    trees.push({ d: d, perHa: 1/iz });
  });
  var nPlots = Object.keys(plots).length;
  var result = { classes: [], nPlots: nPlots, noIz: noIz, totalTreesHa: 0 };
  if (!nPlots || !trees.length) return result;

  var ds = trees.map(function(t){return t.d;});
  var first = Math.floor(Math.min.apply(null, ds)/width), last = Math.floor(Math.max.apply(null, ds)/width);
  for (var i = first; i <= last; i++) result.classes.push({ lo: i*width, hi: (i+1)*width, count: 0, sumPerHa: 0 });
  trees.forEach(function(t) {
    var c = result.classes[Math.floor(t.d/width) - first];
    c.count++; c.sumPerHa += t.perHa;
  });
  result.classes.forEach(function(c) {
    c.avgRaw  = c.count / nPlots;
    c.treesHa = Math.round(c.sumPerHa / nPlots);
    result.totalTreesHa += c.treesHa;   // sum of rounded values, as displayed
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

  document.getElementById('debug-info').innerHTML =
    '<strong>Delim:</strong> "'+delim+'" &nbsp;|&nbsp; '
    +'Species: <em>'+(speciesCol||'--')+'</em> &nbsp; '
    +'Diameter: <em>'+(diagCol||'--')+'</em> &nbsp; '
    +'Height: <em>'+(htCol||'--')+'</em> &nbsp; '
    +'IZ: <em>'+(izCol||'--')+'</em> &nbsp; '
    +'Plot: <em>'+(plotCol||'--')+'</em>';

  var diams = diagCol ? rows.map(function(r){return parseNum(r[diagCol]);}).filter(function(v){return !isNaN(v)&&v>0;}) : [];
  var hts   = htCol   ? rows.map(function(r){return parseNum(r[htCol]);  }).filter(function(v){return !isNaN(v)&&v>0;}) : [];
  var boles = boleCol ? rows.map(function(r){return parseNum(r[boleCol]);}).filter(function(v){return !isNaN(v)&&v>0;}) : [];
  var ds = numStats(diams), hs = numStats(hts);
  var speciesEntries = speciesCol ? countBy(rows,speciesCol) : [];

  document.getElementById('top-stats').innerHTML =
    '<div class="stat-card"><div class="label">Total trees</div><div class="value">'+rows.length+'</div></div>'
    +'<div class="stat-card"><div class="label">Species</div><div class="value">'+speciesEntries.length+'</div></div>'
    +(ds?'<div class="stat-card"><div class="label">Avg diameter</div><div class="value">'+ds.mean.toFixed(1)+'<span> cm</span></div></div>':'')
    +(hs?'<div class="stat-card"><div class="label">Avg height</div><div class="value">'+hs.mean.toFixed(1)+'<span> m</span></div></div>':'')
    +(ds?'<div class="stat-card"><div class="label">Max diameter</div><div class="value">'+ds.max+'<span> cm</span></div></div>':'')
    +(hs?'<div class="stat-card"><div class="label">Max height</div><div class="value">'+hs.max+'<span> m</span></div></div>':'');

  [{id:'species',col:speciesCol,label:'Species breakdown'},
   {id:'health', col:healthCol, label:'Health status'},
   {id:'origin', col:originCol, label:'Origin'},
   {id:'quality',col:qualityCol,label:'Quality'}
  ].forEach(function(t) {
    document.getElementById('tab-'+t.id).innerHTML = t.col
      ? '<div class="section-title">'+t.label+'</div>'+barChart(countBy(rows,t.col),rows.length)
      : '<p class="empty-msg">Column not found.</p>';
  });

  // Genus tab
// Genus tab
  if (speciesCol) {
    var genusCounts = {};
    rows.forEach(function(r) {
      var sp = (r[speciesCol] || '').trim();
      var genus = sp ? sp.split(' ')[0] : '(unknown)';
      genusCounts[genus] = (genusCounts[genus] || 0) + 1;
    });
    var genusEntries = Object.entries(genusCounts)
      .sort(function(a,b){ return b[1]-a[1]; });
    document.getElementById('tab-genus').innerHTML =
      '<div class="section-title">Genus breakdown</div>'
      + barChart(genusEntries, rows.length);
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
  charts.forEach(function(c){c.destroy();}); charts=[]; volumeChart=null;
  setTimeout(function(){
    var w=CONFIG.diameterClassWidth_cm;
    if(diams.length){var dh=makeHistFixed(diams,w);charts.push(new Chart(document.getElementById('diam-chart'),{type:'bar',data:{labels:dh.labels,datasets:[{label:'Trees',data:dh.counts,backgroundColor:'#3266ad',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Diameter distribution (cm) \u2014 '+w+' cm classes'}},scales:{x:{ticks:{autoSkip:true,maxRotation:45}},y:{beginAtZero:true}}}}));}
    if(hts.length){var hh=makeHist(hts,12);charts.push(new Chart(document.getElementById('ht-chart'),{type:'bar',data:{labels:hh.labels,datasets:[{label:'Trees',data:hh.counts,backgroundColor:'#1D9E75',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Height distribution (m)'}},scales:{x:{ticks:{autoSkip:true,maxRotation:45}},y:{beginAtZero:true}}}}));}
  },100);

  // ── Diameter class table (trees/ha) — bottom of Dimensions tab
  (function() {
    // Always remove and recreate to avoid duplicates on re-upload
    var el = document.getElementById('dims-dclass');
    if (el) el.parentNode.removeChild(el);
    el = document.createElement('div');
    el.id = 'dims-dclass';
    // Use dims-stats parent — guaranteed correct container regardless of tab ID
    var anchor = document.getElementById('dims-stats');
    if (!anchor) return;
    anchor.parentNode.appendChild(el);
    if (!diagCol || !plotCol || !izCol) {
      el.innerHTML = '<p class="empty-msg">Need Diameter, InclusionZone_ha and Plot columns for diameter class table.</p>'; return;
    }

    var dc = diameterClassTable(rows, cols, CONFIG.diameterClassWidth_cm);
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
      + ' plot(s). Each tree counts as 1\u2009/\u2009InclusionZone_ha trees/ha; plots with no trees in a class contribute 0 to the average.'
      + (dc.noIz ? ' ' + dc.noIz + ' tree(s) without inclusion zone excluded.' : '') + '</p>';
  })();
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
  if (counts.estimated) parts.push(counts.estimated+' height(s) estimated from the height\u2013diameter model');
  if (counts.excluded) parts.push(counts.excluded+' tree(s) without height excluded'
    +(heightModel ? ' (no usable height curve)' : ' (height estimation is off)'));
  return parts.length ? '<p style="font-size:12px;color:#BA7517;margin-top:0.75rem;">&#9888; '+parts.join('; ')+'.</p>' : '';
}

function heightModelHtml(model, trees) {
  if (!model) return '<div class="section-title">Height model</div><p class="empty-msg">Height estimation is off (CONFIG.heightModel.enabled).</p>';
  var fmtP = function(p){ return p ? p.a.toFixed(4)+'</td><td>'+p.b.toFixed(5) : '\u2014</td><td>\u2014'; };
  var rows = Object.keys(model.measured).sort().map(function(sp) {
    var own = model.bySpecies[sp];
    var used = own ? 'species' : model.all ? 'all species' : 'none';
    return '<tr><td>'+sp+'</td><td>'+model.measured[sp]+'</td><td>'+used+'</td><td>'+fmtP(own)+'</td></tr>';
  }).join('');
  var est = trees.filter(function(t){return t.heightEstimated;});
  return '<div class="section-title">Height model</div>'
    +'<p style="font-size:12px;color:var(--text-muted);margin-bottom:0.5rem;">N\u00E4slund: h = 1.3 + d\u00B2 / (a + b\u00B7d)\u00B2, fitted per species with \u2265 '+model.minTrees
    +' measured trees, otherwise the all-species curve.</p>'
    +'<table class="summary"><thead><tr><th>Species</th><th>Measured trees</th><th>Curve used</th><th>a</th><th>b</th></tr></thead><tbody>'
    +rows
    +'<tr class="total-row"><td>All species</td><td>'+model.nAll+'</td><td>'+(model.all?'':'too few / no fit')+'</td><td>'+fmtP(model.all)+'</td></tr>'
    +'</tbody></table>'
    +(est.length
      ? '<details style="margin-top:1rem;"><summary style="cursor:pointer;font-size:13px;">'+est.length+' tree(s) with estimated height</summary>'
        +'<table class="summary"><thead><tr><th>Plot</th><th>Species</th><th>Diameter (cm)</th><th>Est. height (m)</th><th>Curve</th></tr></thead><tbody>'
        +est.map(function(t){return '<tr><td>'+t.plot+'</td><td>'+(t.species||'(none)')+'</td><td>'+fmtN(t.diam,1)+'</td><td><em>'+fmtN(t.height,1)+'</em></td><td>'+(t.heightSource==='species'?'species':'all species')+'</td></tr>';}).join('')
        +'</tbody></table></details>'
      : '');
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

var volumeChart = null;

/** @param {object} [plotsParsed] - Plots CSV, if loaded; defines which plots the mean covers */
function renderVolumeTab(rows, cols, heightModel, plotsParsed) {
  var el = document.getElementById('volume-stats');
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
    + (outside.length ? ' * Not in the Plots CSV, excluded from the mean: '+outside.join(', ')+'.' : '');

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
      var label = inSurvey[p] ? p : p+' *';
      return '<tr'+(plots[p]?'':' style="color:var(--text-muted)"')+'><td>'+label+'</td><td>'+d.trees+'</td><td>'+d.totalBA.toFixed(4)+'</td><td>'+d.totalVol.toFixed(3)+'</td><td><strong>'+fmtN(d.totalVolHa,2)+'</strong></td><td>'+(d.estHeights?'<em>'+d.estHeights+'</em>':'0')+'</td></tr>';
    }).join('')
    +'</tbody></table>'
    +'<p style="font-size:11px;color:var(--text-muted);margin-top:4px;">'+meanNote+'</p>'
    +heightNoteHtml(hc, heightModel)
    +'<div style="margin-top:1.5rem;">'+heightModelHtml(heightModel, trees)+'</div>';

  setTimeout(function(){
    var canvas=document.getElementById('volume-chart'); if(!canvas)return;
    // Re-rendered when the Plots CSV is loaded: free the canvas first
    if (volumeChart) { volumeChart.destroy(); charts = charts.filter(function(c){ return c !== volumeChart; }); }
    volumeChart = new Chart(canvas,{type:'bar',data:{labels:plotIds,datasets:[{label:'Vol/ha',data:plotIds.map(function(p){return plots[p] ? parseFloat(plots[p].totalVolHa.toFixed(2)) : 0;}),backgroundColor:'#3266ad',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Volume per hectare by plot (m\u00B3/ha)'}},scales:{x:{ticks:{autoSkip:false,maxRotation:45,font:{size:10}}},y:{beginAtZero:true}}}});
    charts.push(volumeChart);
  },150);
}

function updateZoneUploadStatus() {
  var hasPlots = !!state.plots;
  var hasZones = !!state.zones;
  document.getElementById('upload-status').innerHTML =
    '<span class="'+(hasPlots?'ok':'missing')+'">\u25CF Plots CSV'+(hasPlots?' \u2713':' - not loaded')+'</span> &nbsp; '
    +'<span class="'+(hasZones?'ok':'missing')+'">\u25CF Zones CSV'+(hasZones?' \u2713':' - not loaded')+'</span>';
  document.getElementById('calc-zones-btn').disabled = !(hasPlots && hasZones && state.trees);
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
  var plotsRows   = state.plots.rows;
  var plotsHdrs   = state.plots.headers;
  var plotCodeCol = CONFIG.plotsPlotIdColumn || plotsHdrs[0];
  var classCol    = CONFIG.classColumn;
  var missingCols = [plotCodeCol, classCol].filter(function(c){ return plotsHdrs.indexOf(c) === -1; });
  if (missingCols.length) {
    el.innerHTML = '<p class="empty-msg" style="color:#D85A30;">&#9888; Plots CSV has no column '
      + missingCols.map(function(c){ return '"'+c+'"'; }).join(' or ')
      + ' (see CONFIG in js/config.js). Columns found: ' + plotsHdrs.join(', ') + '</p>';
    return;
  }

  var plotClassMap = {};
  plotsRows.forEach(function(r) {
    var code = (r[plotCodeCol]||'').trim();
    var cls  = (r[classCol]   ||'').trim();
    if (code && cls) plotClassMap[code] = cls;
  });

  // Zone x class hectares
  var zonesRows   = state.zones.rows;
  var zonesHdrs   = state.zones.headers;
  var zoneNameCol = zonesHdrs[0];
  var classNames  = zonesHdrs.slice(1).filter(function(h){return h.trim()!=='';});

  // Per-tree volumes
  var trees = calcTrees(rows, cols, state.heightModel);
  if (!trees.length) { el.innerHTML='<p class="empty-msg">No valid tree rows.</p>'; return; }

  // Per-plot vol/ha
  var plotSummary = buildPlotSummary(trees);

  // Per-class avg vol/ha — ALL plots in the plots CSV contribute;
  // plots with no trees count as 0 vol/ha
  var classAccum = {};
  Object.keys(plotClassMap).forEach(function(plotId) {
    var cls = plotClassMap[plotId];
    if (!cls) return;
    if (!classAccum[cls]) classAccum[cls] = { sum: 0, count: 0, zeros: 0 };
    var volHa = plotSummary[plotId] ? plotSummary[plotId].totalVolHa : 0;
    classAccum[cls].sum   += volHa;
    classAccum[cls].count += 1;
    if (!plotSummary[plotId]) classAccum[cls].zeros += 1;
  });

  var classAvg = {};
  Object.keys(classAccum).forEach(function(cls) {
    var a = classAccum[cls];
    classAvg[cls] = a.count > 0 ? a.sum / a.count : 0;
  });

  // Classes without plots borrow from the first class in CONFIG.classFallbacks that has plots
  var classAvgEff = {};
  classNames.forEach(function(cls) {
    if (classAvg[cls] !== undefined) {
      classAvgEff[cls] = { avg: classAvg[cls], source: null };
      return;
    }
    var fb = (CONFIG.classFallbacks[cls] || []).find(function(c){ return classAvg[c] !== undefined; });
    classAvgEff[cls] = fb ? { avg: classAvg[fb], source: fb } : { avg: 0, source: null, missing: true };
  });

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
               : eff.source  ? '<span style="color:#BA7517">fallback from class '+eff.source+'</span>'
               : '';
      return '<tr><td>'+cls+'</td><td>'+a.count+'</td><td>'+a.zeros+'</td><td>'+(eff.missing?'\u2014':fmtN(eff.avg,2))+'</td><td>'+note+'</td></tr>';
    }).join('')
    +'</tbody></table>';

  // Zone x class table
  var grandTotal = 0;
  var colTotals  = {};
  classNames.forEach(function(c){colTotals[c]=0;});

  var zoneRows = zonesRows.filter(function(r){return (r[zoneNameCol]||'').trim();});

  var thead = '<tr><th>Zone</th>';
  classNames.forEach(function(cls){ thead += '<th>'+cls+' area (ha)</th><th>'+cls+' vol (m\u00B3)</th>'; });
  thead += '<th>Total vol (m\u00B3)</th></tr>';

  var tbody = zoneRows.map(function(zrow){
    var zoneName = (zrow[zoneNameCol]||'').trim();
    var zoneTotal = 0;
    var cells = '<td><strong>'+zoneName+'</strong></td>';
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
    warningHtml = '<p style="font-size:12px;color:#D85A30;margin-top:1rem;">&#9888; '+unmatchedPlots.length+' plot(s) not found in Plots CSV and excluded: '+unmatchedPlots.join(', ')+'</p>';
  }
  if (unknownClasses.length) {
    warningHtml += '<p style="font-size:12px;color:#D85A30;margin-top:0.5rem;">&#9888; Class code(s) not in CONFIG.classCodes: '+unknownClasses.join(', ')+'</p>';
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
      // The Volume-tab mean averages over the plots in the Plots CSV
      if (state.trees) renderVolumeTab(state.trees.rows, state.cols, state.heightModel, state.plots);
      document.getElementById('name-plots').textContent = file.name;
      document.getElementById('btn-plots').classList.add('loaded');
      updateZoneUploadStatus();
    });
  });

  document.getElementById('input-zones').addEventListener('change', function(e) {
    var file = e.target.files[0]; if(!file) return;
    readFile(file, function(parsed) {
      state.zones = parsed;
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
    callback(parsed);
  };
  reader.readAsText(file);
}

// Node (tests) only — `module` is undefined in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseCSVText: parseCSVText, parseNum: parseNum, findCol: findCol, countBy: countBy,
    numStats: numStats, fmtN: fmtN,
    detectTreeColumns: detectTreeColumns, prepareTrees: prepareTrees,
    basalArea_m2: basalArea_m2, treeVolume_m3: treeVolume_m3,
    fitNaslund: fitNaslund, naslundHeight: naslundHeight,
    fitHeightModel: fitHeightModel, estimateHeight: estimateHeight,
    calcTrees: calcTrees, buildPlotSummary: buildPlotSummary, diameterClassTable: diameterClassTable,
    surveyedPlots: surveyedPlots, renderVolumeTab: renderVolumeTab, runZoneCalculation: runZoneCalculation,
    state: state
  };
}