/**
 * app.js
 * ------
 * UI logic for the Tree Inventory Analyzer.
 * Depends on calculations.js being loaded first.
 */

let charts = [];

const COLORS = [
  '#3266ad','#1D9E75','#D85A30','#BA7517',
  '#993556','#534AB7','#639922','#E24B4A',
  '#888780','#185FA5'
];

function resetApp() {
  document.getElementById('upload-section').style.display = '';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('file-input').value = '';
  charts.forEach(c => c.destroy());
  charts = [];
}

function switchTab(name) {
  const names = ['species','health','origin','quality','use','dims','volume'];
  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', names[i] === name)
  );
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) { parseCSV(e.target.result, file.name); };
  reader.readAsText(file);
}

function parseNum(val) {
  if (!val || val.trim() === '') return NaN;
  var s = val.trim();
  if (s.includes(',') && s.includes('.')) {
    var lastComma = s.lastIndexOf(',');
    var lastDot   = s.lastIndexOf('.');
    s = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    var parts = s.split(',');
    s = (parts.length === 2 && parts[1].length !== 3)
      ? s.replace(',', '.')
      : s.replace(/,/g, '');
  }
  return parseFloat(s);
}

function parseCSV(text, name) {
  var lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) { alert('File appears empty or has only a header.'); return; }

  var h0 = lines[0];
  var delim = (h0.split(';').length > h0.split(',').length) ? ';' : ',';

  function splitLine(line) {
    var result = [];
    var cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  }

  var headers = splitLine(lines[0]).map(function(h) { 
    return h.replace(/^"|"$/g, '').replace(/^\uFEFF/, '').trim(); 
  });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var cells = splitLine(lines[i]).map(function(c) { return c.replace(/^"|"$/g, '').trim(); });
    var obj = {};
    headers.forEach(function(h, j) { obj[h] = cells[j] !== undefined ? cells[j] : ''; });
    rows.push(obj);
  }

  renderDashboard(rows, headers, name, delim);
}

function findCol(headers, exact, startsWith, contains) {
  return headers.find(function(h) { return h === exact; })
      || (startsWith ? headers.find(function(h) { return h.startsWith(startsWith) && !h.includes('/'); }) : null)
      || (contains   ? headers.find(function(h) { return h.toLowerCase().includes(contains.toLowerCase()) && !h.includes('/'); }) : null)
      || null;
}

function countBy(rows, col) {
  var counts = {};
  rows.forEach(function(r) {
    var v = (r[col] || '').trim() || '(not recorded)';
    counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts)
    .filter(function(entry) { return !/^\(?\d+(\.\d+)?\)?$/.test(entry[0]); })
    .sort(function(a, b) { return b[1] - a[1]; });
}

function numStats(vals) {
  if (!vals.length) return null;
  var sorted = vals.slice().sort(function(a, b) { return a - b; });
  var mean   = vals.reduce(function(s, v) { return s + v; }, 0) / vals.length;
  var mid    = Math.floor(sorted.length / 2);
  var median = sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min: sorted[0], max: sorted[sorted.length - 1], mean: mean, median: median, n: vals.length };
}

function barChart(entries, total) {
  if (!entries.length) return '<p class="empty-msg">No data found in this column.</p>';
  var max = entries[0][1] || 1;
  return entries.slice(0, 20).map(function(entry, i) {
    var label = entry[0], count = entry[1];
    return '<div class="bar-row">'
      + '<span class="bar-label" title="' + label + '">' + label + '</span>'
      + '<div class="bar-track"><div class="bar-fill" style="width:' + (count / max * 100).toFixed(1) + '%; background:' + COLORS[i % COLORS.length] + ';"></div></div>'
      + '<span class="bar-count">' + count + ' <span style="opacity:.6;">(' + (count / total * 100).toFixed(0) + '%)</span></span>'
      + '</div>';
  }).join('');
}

function renderDashboard(rows, headers, fileName, delim) {
  console.log('renderDashboard called', rows.length, headers.length);

  document.getElementById('upload-section').style.display = 'none';
  document.getElementById('dashboard').style.display = '';
  document.getElementById('file-name').textContent = fileName;
  document.getElementById('row-count').textContent = rows.length + ' records';

  var diagCol    = findCol(headers, 'Diameter [cm]:', 'Diameter', 'diameter');
  var htCol      = headers.find(function(h) { return /^Height \[m\]/i.test(h) && !/bole|diameter/i.test(h); })
                || findCol(headers, 'Height [m]:', null, 'Height [m]');
  var boleCol    = findCol(headers, 'Bole Height [m]:', 'Bole', 'bole');
  var speciesCol = findCol(headers, 'Species:', 'Species', null);
  var healthCol  = findCol(headers, 'Health:', 'Health:', null);
  var originCol  = findCol(headers, 'Origin:', 'Origin:', null);
  var qualityCol = findCol(headers, 'Quality:', 'Quality:', null);
  var useCol     = findCol(headers, 'Use:', 'Use:', null);
  var izCol      = findCol(headers, 'InclusionZone_ha', null, 'inclusionzone');
  var plotCol    = findCol(headers, '_parent_index', null, 'parent_index');

  document.getElementById('debug-info').innerHTML =
    '<strong>Delimiter:</strong> "' + delim + '" &nbsp;|&nbsp; <strong>Columns mapped:</strong> '
    + 'Species: <em>' + (speciesCol || '—') + '</em> &nbsp; '
    + 'Health: <em>'  + (healthCol  || '—') + '</em> &nbsp; '
    + 'Diameter: <em>'+ (diagCol    || '—') + '</em> &nbsp; '
    + 'Height: <em>'  + (htCol      || '—') + '</em> &nbsp; '
    + 'IZ: <em>'      + (izCol      || '—') + '</em> &nbsp; '
    + 'Plot: <em>'    + (plotCol    || '—') + '</em>';

  var diams = diagCol ? rows.map(function(r) { return parseNum(r[diagCol]); }).filter(function(v) { return !isNaN(v) && v > 0; }) : [];
  var hts   = htCol   ? rows.map(function(r) { return parseNum(r[htCol]);   }).filter(function(v) { return !isNaN(v) && v > 0; }) : [];
  var boles = boleCol ? rows.map(function(r) { return parseNum(r[boleCol]); }).filter(function(v) { return !isNaN(v) && v > 0; }) : [];

  var ds = numStats(diams);
  var hs = numStats(hts);

  var stand = (diagCol && htCol) ? computeStandMetrics(rows, diagCol, htCol) : null;
  var speciesEntries = speciesCol ? countBy(rows, speciesCol) : [];

  var standCards = (stand && stand.inclusionZoneConfigured)
    ? '<div class="stat-card"><div class="label">Stems / ha</div><div class="value">' + Math.round(stand.stemDensityPerHa) + '</div></div>'
      + '<div class="stat-card"><div class="label">Basal area</div><div class="value">' + stand.basalAreaPerHa.toFixed(1) + '<span> m\u00B2/ha</span></div></div>'
    : '';

  document.getElementById('top-stats').innerHTML =
    '<div class="stat-card"><div class="label">Total trees</div><div class="value">' + rows.length + '</div></div>'
    + '<div class="stat-card"><div class="label">Species</div><div class="value">' + speciesEntries.length + '</div></div>'
    + (ds ? '<div class="stat-card"><div class="label">Avg diameter</div><div class="value">' + ds.mean.toFixed(1) + '<span> cm</span></div></div>' : '')
    + (hs ? '<div class="stat-card"><div class="label">Avg height</div><div class="value">'   + hs.mean.toFixed(1) + '<span> m</span></div></div>'  : '')
    + (ds ? '<div class="stat-card"><div class="label">Max diameter</div><div class="value">' + ds.max + '<span> cm</span></div></div>' : '')
    + (hs ? '<div class="stat-card"><div class="label">Max height</div><div class="value">'   + hs.max + '<span> m</span></div></div>'  : '')
    + standCards;

  var tabDefs = [
    { id: 'species', col: speciesCol, label: 'Species breakdown' },
    { id: 'health',  col: healthCol,  label: 'Health status' },
    { id: 'origin',  col: originCol,  label: 'Origin' },
    { id: 'quality', col: qualityCol, label: 'Quality' },
    { id: 'use',     col: useCol,     label: 'Use' }
  ];
  tabDefs.forEach(function(t) {
    document.getElementById('tab-' + t.id).innerHTML = t.col
      ? '<div class="section-title">' + t.label + '</div>' + barChart(countBy(rows, t.col), rows.length)
      : '<p class="empty-msg">Column not found in this file.</p>';
  });

  if (ds || hs) {
    var tbody = '';
    if (ds) tbody += '<tr><td>Diameter (cm)</td><td>' + ds.n + '</td><td>' + ds.min + '</td><td>' + ds.max + '</td><td>' + ds.mean.toFixed(1) + '</td><td>' + ds.median.toFixed(1) + '</td></tr>';
    if (hs) tbody += '<tr><td>Height (m)</td><td>'    + hs.n + '</td><td>' + hs.min + '</td><td>' + hs.max + '</td><td>' + hs.mean.toFixed(1) + '</td><td>' + hs.median.toFixed(1) + '</td></tr>';
    if (boles.length) {
      var bs = numStats(boles);
      tbody += '<tr><td>Bole height (m)</td><td>' + bs.n + '</td><td>' + bs.min + '</td><td>' + bs.max + '</td><td>' + bs.mean.toFixed(1) + '</td><td>' + bs.median.toFixed(1) + '</td></tr>';
    }
    document.getElementById('dims-stats').innerHTML =
      '<table class="summary"><thead><tr><th>Metric</th><th>n</th><th>Min</th><th>Max</th><th>Mean</th><th>Median</th></tr></thead><tbody>' + tbody + '</tbody></table>';
  }

  renderVolumeTab(rows, diagCol, htCol, izCol, plotCol);

  function makeHistogram(vals, bins) {
    var mn = Math.floor(Math.min.apply(null, vals));
    var mx = Math.ceil(Math.max.apply(null, vals));
    var step = Math.max((mx - mn) / bins, 0.001);
    var labels = [], counts = [];
    for (var i = 0; i < bins; i++) {
      var lo = mn + i * step, hi = lo + step;
      labels.push(lo.toFixed(1) + '\u2013' + hi.toFixed(1));
      counts.push(vals.filter(function(v) { return v >= lo && v < hi; }).length);
    }
    return { labels: labels, counts: counts };
  }

  charts.forEach(function(c) { c.destroy(); });
  charts = [];

  setTimeout(function() {
    if (diams.length) {
      var dh = makeHistogram(diams, 12);
      charts.push(new Chart(document.getElementById('diam-chart'), {
        type: 'bar',
        data: { labels: dh.labels, datasets: [{ label: 'Trees', data: dh.counts, backgroundColor: '#3266ad', borderRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Diameter distribution (cm)' } },
          scales: { x: { ticks: { autoSkip: true, maxRotation: 45 } }, y: { beginAtZero: true } } }
      }));
    }
    if (hts.length) {
      var hh = makeHistogram(hts, 12);
      charts.push(new Chart(document.getElementById('ht-chart'), {
        type: 'bar',
        data: { labels: hh.labels, datasets: [{ label: 'Trees', data: hh.counts, backgroundColor: '#1D9E75', borderRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Height distribution (m)' } },
          scales: { x: { ticks: { autoSkip: true, maxRotation: 45 } }, y: { beginAtZero: true } } }
      }));
    }
  }, 100);
}

function renderVolumeTab(rows, diagCol, htCol, izCol, plotCol) {
  var el = document.getElementById('volume-stats');
  if (!diagCol || !htCol || !izCol) {
    el.innerHTML = '<p class="empty-msg">Missing columns: need Diameter, Height [m] and InclusionZone_ha.</p>';
    return;
  }

  var FORM_FACTOR = 0.441;

  // Per-tree calculations
  var trees = rows.map(function(r) {
    var diam = parseNum(r[diagCol]);
    var ht   = parseNum(r[htCol]);
    var iz   = parseNum(r[izCol]);
    var plot = plotCol ? (r[plotCol] || 'unknown') : 'all';
    if (isNaN(diam) || isNaN(ht) || isNaN(iz) || diam <= 0 || ht <= 0 || iz <= 0) return null;
    var ba      = (Math.PI / 40000) * diam * diam;
    var vol     = ba * ht * FORM_FACTOR;
    var volHa   = vol / iz;
    return { plot: plot, diam: diam, ht: ht, iz: iz, ba: ba, vol: vol, volHa: volHa };
  }).filter(function(t) { return t !== null; });

  if (!trees.length) {
    el.innerHTML = '<p class="empty-msg">No valid rows — check that Diameter, Height and InclusionZone_ha all have numeric values.</p>';
    return;
  }

  // Group by plot
  var plots = {};
  trees.forEach(function(t) {
    if (!plots[t.plot]) plots[t.plot] = { trees: 0, totalVol: 0, totalVolHa: 0, totalBA: 0 };
    plots[t.plot].trees++;
    plots[t.plot].totalVol   += t.vol;
    plots[t.plot].totalVolHa += t.volHa;
    plots[t.plot].totalBA    += t.ba;
  });

  var plotIds   = Object.keys(plots).sort();
  var totalVolHa = plotIds.reduce(function(s, p) { return s + plots[p].totalVolHa; }, 0);
  var meanVolHa  = totalVolHa / plotIds.length;

  // Summary cards
  el.innerHTML =
    '<div class="stat-grid" style="margin-bottom:1.25rem;">'
    + '<div class="stat-card"><div class="label">Trees calculated</div><div class="value">' + trees.length + '</div></div>'
    + '<div class="stat-card"><div class="label">Plots</div><div class="value">' + plotIds.length + '</div></div>'
    + '<div class="stat-card"><div class="label">Mean vol/ha</div><div class="value">' + meanVolHa.toFixed(1) + '<span> m\u00B3/ha</span></div></div>'
    + '<div class="stat-card"><div class="label">Total vol/ha</div><div class="value">' + totalVolHa.toFixed(1) + '<span> m\u00B3/ha</span></div></div>'
    + '</div>'
    + '<div class="section-title">Volume per hectare by plot</div>'
    + '<table class="summary"><thead><tr>'
    + '<th>Plot (_parent_index)</th><th>Trees</th><th>Total BA (m\u00B2)</th><th>Total vol (m\u00B3)</th><th>Vol/ha (m\u00B3/ha)</th>'
    + '</tr></thead><tbody>'
    + plotIds.map(function(p) {
        var d = plots[p];
        return '<tr>'
          + '<td>' + p + '</td>'
          + '<td>' + d.trees + '</td>'
          + '<td>' + d.totalBA.toFixed(4) + '</td>'
          + '<td>' + d.totalVol.toFixed(3) + '</td>'
          + '<td><strong>' + d.totalVolHa.toFixed(2) + '</strong></td>'
          + '</tr>';
      }).join('')
    + '</tbody></table>';

  // Bar chart — vol/ha per plot
  setTimeout(function() {
    var canvas = document.getElementById('volume-chart');
    if (!canvas) return;
    var volData = plotIds.map(function(p) { return parseFloat(plots[p].totalVolHa.toFixed(2)); });
    charts.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: plotIds,
        datasets: [{
          label: 'Vol/ha (m\u00B3/ha)',
          data: volData,
          backgroundColor: '#3266ad',
          borderRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Volume per hectare by plot (m\u00B3/ha)' }
        },
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 45, font: { size: 10 } } },
          y: { beginAtZero: true }
        }
      }
    }));
  }, 150);
}

document.addEventListener('DOMContentLoaded', function() {
  var dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', function() { dz.classList.remove('over'); });
  dz.addEventListener('drop', function(e) {
    e.preventDefault();
    dz.classList.remove('over');
    handleFile(e.dataTransfer.files[0]);
  });
  document.getElementById('file-input').addEventListener('change', function(e) { handleFile(e.target.files[0]); });
});