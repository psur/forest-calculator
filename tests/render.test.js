'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, ChartStub, loadFixture, loadAllFixtures, el } = require('./helpers');
const { escapeHtml, barChart, parseCSVText, prepareTrees, renderDashboard, renderVolumeTab,
        switchTab, resetApp, charts, state } = app;

// ── Escaping CSV-derived text ───────────────────────────────────────────────

test('escapeHtml: special characters, null and numbers', () => {
  assert.equal(escapeHtml('<a href="x">Tom & Jerry\'s</a>'),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(5), '5');
  assert.equal(escapeHtml('Fagus sylvatica'), 'Fagus sylvatica');
});

test('barChart: labels escaped in text and title attribute', () => {
  const html = barChart([['<img src=x onerror=alert(1)>', 2], ['a" onmouseover="x', 1]], 3);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /title="a" onmouseover/);
  assert.match(html, /title="a&quot; onmouseover=&quot;x"/);
});

test('zones: zone names, class headers and plot IDs are escaped', () => {
  loadAllFixtures();
  app.state.plots = parseCSVText('_index;Zone SLIM\n1;21\n2;21\n');
  app.state.zones = parseCSVText('Zone;21;"<i>99</i>"\n"<script>alert(1)</script>";1;2\n');
  // tree plot 6 is not in these plots → listed in the warning; give it a hostile ID
  app.state.trees.rows.filter(r => r._parent_index === '6').forEach(r => { r._parent_index = '<b>6</b>'; });
  app.runZoneCalculation();
  const html = el('zones-result').innerHTML;
  assert.doesNotMatch(html, /<script>|<i>|<b>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);            // zone name
  assert.match(html, /&lt;i&gt;99&lt;\/i&gt; area \(ha\)/);                   // class header
  assert.match(html, /Class code\(s\) not in CONFIG\.classCodes: &lt;i&gt;99/);
  assert.match(html, /excluded: 3, 5, &lt;b&gt;6&lt;\/b&gt;/);                 // plot IDs
});

test('zones: missing-column error escapes the found headers', () => {
  loadAllFixtures();
  app.state.plots = parseCSVText('_index;<img src=x>\n1;21\n');
  app.runZoneCalculation();
  const html = el('zones-result').innerHTML;
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Columns found: _index, &lt;img src=x&gt;/);
});

test('volume tab: plot IDs are escaped (species names are not shown there)', () => {
  // 10 measured trees (enough for the all-species curve) + one without height
  const lines = ['"Species:";"Diameter [cm]:";"Height [m]:";"InclusionZone_ha";"_parent_index"'];
  for (let i = 0; i < 10; i++) lines.push(`"Picea abies";"${10 + 3 * i}";"${9 + 2 * i}";"0,1";"1"`);
  lines.push('"<svg onload=alert(1)>";"25";"";"0,1";"<b>2</b>"');
  prepareTrees(parseCSVText(lines.join('\n')));
  renderVolumeTab(state.trees.rows, state.cols, state.heightModel, null);
  const html = el('volume-stats').innerHTML;
  assert.doesNotMatch(html, /<svg|<b>2|svg onload/);
  assert.match(html, /&lt;b&gt;2&lt;\/b&gt;/);
});

test('dashboard: debug line escapes column names', () => {
  // (findCol skips headers containing "/", so use a tag without a closing slash)
  const parsed = parseCSVText('"Species:";"Diameter <img src=x onerror=alert(1)>"\n"Picea abies";"20"\n');
  prepareTrees(parsed);
  renderDashboard(parsed, 'x.csv');
  const html = el('debug-info').innerHTML;
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Diameter &lt;img src=x onerror=alert\(1\)&gt;/);
  resetApp();
});

// ── Charts: drawn when their tab is visible, destroyed cleanly ──────────────
// ChartStub throws if a chart is destroyed twice.

const live = () => ChartStub.instances.filter(c => !c.destroyed);
const liveOn = id => live().filter(c => c.canvasId === id);

function loadTrees() {
  const parsed = loadFixture('trees.csv');
  prepareTrees(parsed);
  renderDashboard(parsed, 'trees.csv');
}

test('charts: nothing drawn for hidden tabs; drawn once when the tab opens', () => {
  resetApp();
  switchTab('species');
  const before = ChartStub.instances.length;
  loadTrees();
  assert.equal(ChartStub.instances.length, before, 'no charts while Species tab is visible');

  switchTab('dims');
  assert.equal(liveOn('diam-chart').length, 1);
  assert.equal(liveOn('ht-chart').length, 1);
  switchTab('species');
  switchTab('dims');
  assert.equal(ChartStub.instances.length, before + 2, 'reopening does not redraw');

  switchTab('volume');
  assert.equal(liveOn('volume-chart').length, 1);
  assert.equal(Object.keys(charts).sort().join(), 'dims,volume');
});

test('charts: re-render replaces the chart (visible tab → now, hidden → on open)', () => {
  // Volume tab visible: loading the Plots CSV redraws the volume chart immediately
  const old = liveOn('volume-chart')[0];
  renderVolumeTab(state.trees.rows, state.cols, state.heightModel, loadFixture('plots.csv'));
  assert.ok(old.destroyed);
  const now = liveOn('volume-chart');
  assert.equal(now.length, 1);
  assert.deepEqual(now[0].config.data.labels, ['1', '2', '3', '4', '5', '6']);

  // Hidden tab: old chart destroyed at once, new one only when the tab opens
  switchTab('zones');
  renderVolumeTab(state.trees.rows, state.cols, state.heightModel, null);
  assert.ok(now[0].destroyed);
  assert.equal(liveOn('volume-chart').length, 0);
  switchTab('volume');
  assert.deepEqual(liveOn('volume-chart')[0].config.data.labels, ['1', '2', '3', '5', '6']);
  // Dimensions charts untouched
  assert.equal(liveOn('diam-chart').length, 1);
});

test('charts: reset destroys everything and forgets pending charts', () => {
  resetApp();
  assert.equal(live().length, 0);
  assert.deepEqual(Object.keys(charts), []);
  switchTab('dims');
  assert.equal(live().length, 0, 'no chart from the previous file');
});

test('charts: loading a file while a chart tab is open draws it right away', () => {
  // Dims tab still active from the previous test
  loadTrees();
  assert.equal(liveOn('diam-chart').length, 1);
  assert.equal(liveOn('volume-chart').length, 0);   // volume tab hidden
  resetApp();
  assert.equal(live().length, 0);
});
