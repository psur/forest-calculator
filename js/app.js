/**
 * app.js - Forest Calculator v1.1
 */

var charts = [];
var state = { trees: null, plots: null, zones: null };
var treeColumns = {};

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
  state = { trees: null, plots: null, zones: null };
  treeColumns = {};
  charts.forEach(function(c) { c.destroy(); });
  charts = [];
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

var FORM_FACTOR = 0.441;

function calcTrees(rows, diagCol, htCol, izCol, plotCol) {
  return rows.map(function(r) {
    var diam = parseNum(r[diagCol]), ht = parseNum(r[htCol]), iz = parseNum(r[izCol]);
    var plot = (plotCol ? r[plotCol] : '') || 'unknown';
    if (isNaN(diam)||isNaN(ht)||isNaN(iz)||diam<=0||ht<=0||iz<=0) return null;
    var ba  = (Math.PI/40000)*diam*diam;
    var vol = ba*ht*FORM_FACTOR;
    return { plot: String(plot).trim(), ba: ba, vol: vol, volHa: vol/iz };
  }).filter(function(t){return t!==null;});
}

function buildPlotSummary(trees) {
  var plots = {};
  trees.forEach(function(t) {
    if (!plots[t.plot]) plots[t.plot] = { trees:0, totalBA:0, totalVol:0, totalVolHa:0 };
    plots[t.plot].trees++;
    plots[t.plot].totalBA    += t.ba;
    plots[t.plot].totalVol   += t.vol;
    plots[t.plot].totalVolHa += t.volHa;
  });
  return plots;
}

function renderDashboard(parsed, fileName) {
  var rows = parsed.rows, headers = parsed.headers, delim = parsed.delim;

  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('file-name').textContent = fileName;
  document.getElementById('row-count').textContent = rows.length + ' records';

  var diagCol    = findCol(headers,'Diameter [cm]:','Diameter','diameter');
  var htCol      = headers.find(function(h){return /^Height \[m\]/i.test(h)&&!/bole|diameter/i.test(h);})||findCol(headers,'Height [m]:',null,'Height [m]');
  var boleCol    = findCol(headers,'Bole Height [m]:','Bole','bole');
  var speciesCol = findCol(headers,'Species:','Species',null);
  var healthCol  = findCol(headers,'Health:','Health:',null);
  var originCol  = findCol(headers,'Origin:','Origin:',null);
  var qualityCol = findCol(headers,'Quality:','Quality:',null);
  var izCol      = findCol(headers,'InclusionZone_ha',null,'inclusionzone');
  var plotCol    = findCol(headers,'_parent_index',null,'parent_index');

  treeColumns = { diagCol:diagCol, htCol:htCol, izCol:izCol, plotCol:plotCol };

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

  renderVolumeTab(rows, diagCol, htCol, izCol, plotCol);

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
  charts.forEach(function(c){c.destroy();}); charts=[];
  setTimeout(function(){
    if(diams.length){var dh=makeHistFixed(diams,5);charts.push(new Chart(document.getElementById('diam-chart'),{type:'bar',data:{labels:dh.labels,datasets:[{label:'Trees',data:dh.counts,backgroundColor:'#3266ad',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Diameter distribution (cm) \u2014 5 cm classes'}},scales:{x:{ticks:{autoSkip:true,maxRotation:45}},y:{beginAtZero:true}}}}));}
    if(hts.length){var hh=makeHist(hts,12);charts.push(new Chart(document.getElementById('ht-chart'),{type:'bar',data:{labels:hh.labels,datasets:[{label:'Trees',data:hh.counts,backgroundColor:'#1D9E75',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Height distribution (m)'}},scales:{x:{ticks:{autoSkip:true,maxRotation:45}},y:{beginAtZero:true}}}}));}
  },100);
}

function renderVolumeTab(rows, diagCol, htCol, izCol, plotCol) {
  var el = document.getElementById('volume-stats');
  if (!diagCol||!htCol||!izCol) { el.innerHTML='<p class="empty-msg">Need Diameter, Height and InclusionZone_ha columns.</p>'; return; }
  var trees = calcTrees(rows, diagCol, htCol, izCol, plotCol);
  if (!trees.length) { el.innerHTML='<p class="empty-msg">No valid rows for volume calculation.</p>'; return; }
  var plots = buildPlotSummary(trees);
  var plotIds = Object.keys(plots).sort(function(a,b){return Number(a)-Number(b);});
  var totalVolHa = plotIds.reduce(function(s,p){return s+plots[p].totalVolHa;},0);
  var meanVolHa  = totalVolHa/plotIds.length;

  el.innerHTML =
    '<div class="stat-grid" style="margin-bottom:1.25rem;">'
    +'<div class="stat-card"><div class="label">Trees calculated</div><div class="value">'+trees.length+'</div></div>'
    +'<div class="stat-card"><div class="label">Plots</div><div class="value">'+plotIds.length+'</div></div>'
    +'<div class="stat-card"><div class="label">Mean vol/ha</div><div class="value">'+fmtN(meanVolHa,1)+'<span> m\u00B3/ha</span></div></div>'
    +'</div>'
    +'<div class="section-title">Volume per hectare by plot</div>'
    +'<table class="summary"><thead><tr><th>Plot</th><th>Trees</th><th>Basal area (m\u00B2)</th><th>Volume (m\u00B3)</th><th>Vol/ha (m\u00B3/ha)</th></tr></thead><tbody>'
    +plotIds.map(function(p){var d=plots[p];return '<tr><td>'+p+'</td><td>'+d.trees+'</td><td>'+d.totalBA.toFixed(4)+'</td><td>'+d.totalVol.toFixed(3)+'</td><td><strong>'+fmtN(d.totalVolHa,2)+'</strong></td></tr>';}).join('')
    +'</tbody></table>';

  setTimeout(function(){
    var canvas=document.getElementById('volume-chart'); if(!canvas)return;
    charts.push(new Chart(canvas,{type:'bar',data:{labels:plotIds,datasets:[{label:'Vol/ha',data:plotIds.map(function(p){return parseFloat(plots[p].totalVolHa.toFixed(2));}),backgroundColor:'#3266ad',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Volume per hectare by plot (m\u00B3/ha)'}},scales:{x:{ticks:{autoSkip:false,maxRotation:45,font:{size:10}}},y:{beginAtZero:true}}}}));
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

  var rows    = state.trees.rows;
  var diagCol = treeColumns.diagCol;
  var htCol   = treeColumns.htCol;
  var izCol   = treeColumns.izCol;
  var plotCol = treeColumns.plotCol;

  if (!diagCol||!htCol||!izCol||!plotCol) {
    el.innerHTML = '<p class="empty-msg">Could not find required columns in tree data.</p>'; return;
  }

  // Build plot -> class map
  var plotsRows   = state.plots.rows;
  var plotsHdrs   = state.plots.headers;
  var plotCodeCol = plotsHdrs[0];
  var classCol    = 'Zone SLIM';
  if (plotsHdrs.indexOf(classCol) === -1) classCol = plotsHdrs[plotsHdrs.length-1];

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
  var trees = calcTrees(rows, diagCol, htCol, izCol, plotCol);
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

  // Fallback chain: 12->21, 21->22, 22->21 (then 12)
  var FALLBACKS = {'12':'21', '21':'22', '22':'21'};
  var FALLBACKS2 = {'22':'12'};

  var classAvgEff = {};
  classNames.forEach(function(cls) {
    if (classAvg[cls] !== undefined) {
      classAvgEff[cls] = { avg: classAvg[cls], source: null };
    } else {
      var fb1 = FALLBACKS[cls];
      var fb2 = FALLBACKS2[cls];
      if (fb1 && classAvg[fb1] !== undefined) {
        classAvgEff[cls] = { avg: classAvg[fb1], source: fb1 };
      } else if (fb2 && classAvg[fb2] !== undefined) {
        classAvgEff[cls] = { avg: classAvg[fb2], source: fb2 };
      } else {
        classAvgEff[cls] = { avg: 0, source: null, missing: true };
      }
    }
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
    state.trees = parsed;
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