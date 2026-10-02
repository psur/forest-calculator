# Forest Calculator

Static, client-side web app that analyses tree-inventory CSV exports from KoBoToolbox: species/health/quality breakdowns, diameter/height distributions, per-plot volume per hectare, and total standing volume per management zone.

## Running

No build, no package manager. Open `index.html` in a browser (or serve the folder, e.g. `python -m http.server`). Chart.js 4.4.1, PapaParse 5.6.1 (pinned, with SRI `integrity` hash) and Font Awesome load from cdnjs; Google Analytics (gtag) is embedded in `index.html`. When bumping PapaParse, update the version and integrity hash in `index.html` and replace `tests/vendor/papaparse-<version>.min.js` with the same file (tests/helpers.js requires it by name).

## Testing

```bash
node --test
```

Node's built-in test runner (Node 20+), no npm dependencies. It picks up `tests/*.test.js`.

- `tests/fixtures/` — synthetic KoBo-style `trees.csv` (20 trees, 5 plots; tree 18 has a quoted multi-line `Notes:` cell), `plots.csv`, `zones.csv`. Every expected value in the tests is worked out by hand in comments against these files; if you change a fixture, update those comments and values.
- `tests/helpers.js` — installs a minimal `document` stub (class lists, tab panels) and a recording `Chart` stub (`ChartStub.instances`; throws on double destroy), sets `globalThis.Papa` from `tests/vendor/` and `globalThis.CONFIG` from `js/config.js`, then `require`s `js/app.js` (which exports its functions via a conditional `module.exports` at the bottom — keep that block when adding functions you want to test). Volume-tab and zone results are read back from the rendered `innerHTML`. `withConfig(patch, fn)` runs a test with patched settings and restores the defaults.
- Test files: `parse` (CSV/number parsing), `volume` (calcTrees, plot summary, Volume tab), `height` (Näslund model), `zones` (zone aggregation), `config` (settings, column errors, diameter-class table), `render` (HTML escaping, chart lifecycle), `species` (species analysis, totals cross-checks, species chart).
- Known bugs are written as tests for the **correct** value with `{ todo: 'KNOWN ISSUE: …' }`; they're reported as TODO without failing the run. When you fix one, remove the `todo` option and delete or update the matching "current behaviour" test.

## Structure

- `index.html` — all markup and CSS (CSS variables, dark mode via `prefers-color-scheme`). Tabs: Species, Genus, Health, Origin, Quality, Dimensions, Volume, Zones, Species analysis (`spp`). Uses inline `onclick` handlers that call global functions in `app.js`. Loads `js/config.js` then `js/app.js`.
- `js/config.js` — the global `CONFIG` object: every project-specific constant (see below). Put new settings here, not in app.js.
- `js/app.js` — everything else: CSV parsing (`parseCSVText` wraps PapaParse; `parseNum`), column detection (`detectTreeColumns`, `findCol`), `prepareTrees` (detect columns + fit height model into `state`), tree metrics (`basalArea_m2`, `treeVolume_m3`, `calcTrees`, `buildPlotSummary`, `diameterClassTable`), height model (`fitNaslund`, `naslundHeight`, `fitHeightModel`, `estimateHeight`), rendering (`renderDashboard`, `renderVolumeTab`, `runZoneCalculation`), file loading. ES5 style; globals `state` (`trees`, `plots`, `zones`, `cols`, `heightModel`) and `charts`.

## Settings (`js/config.js`)

| Key | Default | Used for |
|---|---|---|
| `formFactor` | 0.441 | tree volume, all species |
| `treePlotIdColumn` | `_parent_index` | tree CSV column linking a tree to its plot |
| `plotsPlotIdColumn` | `null` (= first column) | plot ID column in the Plots CSV |
| `classColumn` | `Zone SLIM` | class column in the Plots CSV; missing → error in Zones tab |
| `classCodes` | `12`, `21`, `22` | known classes; others are flagged |
| `classFallbacks` | `12→[21]`, `21→[22]`, `22→[21,12]` | class without plots borrows first listed class that has plots |
| `diameterClassWidth_cm` | 5 | diameter histogram and trees/ha table |
| `minExploitableDiameter_cm` | 30 | splits species tables / chart into regeneration (< 30) and exploitable (≥ 30); diameter class edges are laid on a grid through it |
| `heightModel.enabled` | true | estimate missing heights |
| `heightModel.minTreesPerSpecies` | 10 | measured trees needed for a species curve (and for the all-species curve) |

## Data flow

1. **Tree CSV** (required): one row per tree. Detected columns: `Diameter [cm]:`, `Height [m]:`, `Bole Height [m]:`, `Species:`, `Health:`, `Origin:`, `Quality:`, `InclusionZone_ha` (plot area in ha that represents that tree), plot ID column (`CONFIG.treePlotIdColumn`). Delimiter `;` or `,` auto-detected; decimal comma supported.
2. **Plots CSV** (Zones tab): plot ID column (`CONFIG.plotsPlotIdColumn`, default first column; values must match the tree plot IDs) and class column (`CONFIG.classColumn`).
3. **Zones CSV** (Zones tab): first column = zone name, remaining columns = hectares per class; header names must equal the class codes.

## Key formulas (app.js)

- Basal area per tree: `g = π/40000 · d²` (m², d in cm)
- Volume per tree: `v = g · h · CONFIG.formFactor`
- Missing height (d and inclusion zone present, no height): Näslund `h = 1.3 + d² / (a + b·d)²`, fitted by OLS on `d/√(h−1.3) = a + b·d` from trees with d > 0 and h > 1.3. Per-species curve if the species has ≥ `minTreesPerSpecies` measured trees and a valid fit (a > 0, b > 0), else all-species curve, else the tree is dropped. Estimated heights are flagged on the tree (`heightEstimated`, `heightSource`), counted per plot, listed in the Volume tab and reported in Volume and Zones tabs. Dimensions-tab height statistics use measured heights only.
- Per-tree vol/ha: `v / InclusionZone_ha`; plot vol/ha = sum over trees in the plot
- Volume tab mean = average over the surveyed plots (`surveyedPlots`): every plot in the Plots CSV once loaded (the tab re-renders then), otherwise every plot with a row in the tree data; plots without volume count as 0. Tree-data plots missing from the Plots CSV are listed with `*` and excluded — same rule as the Zones tab, so the mean equals the plot-weighted mean of the class averages
- Class avg vol/ha = average over **all** plots in Plots CSV of that class (plots without volume count as 0); classes without plots use `CONFIG.classFallbacks`
- Zone volume = Σ(class ha × class avg vol/ha)
- **One plot-averaging rule everywhere**: per-hectare figures are Σ(value / InclusionZone_ha) over the trees of the surveyed plots (`surveyedPlots`) ÷ number of those plots. Volume tab, Dimensions diameter-class table and Species analysis all use it and re-render when the Plots CSV is loaded; the Zones tab applies it per class (`classAverages`)
- Diameter classes (`dClassIndex`, `dClassRange`): `CONFIG.diameterClassWidth_cm` wide, `lo ≤ d < hi`, edges on a grid through `minExploitableDiameter_cm` (so 30 cm is always an edge), from the class holding the smallest diameter to the one holding the largest
- Diameter-class trees/ha table (Dimensions): each tree counts `1 / InclusionZone_ha`; class values rounded, TOTAL = sum of rounded values (`sumTreesHa` holds the unrounded total)
- Species analysis (`speciesAnalysis`, pure): per species trees/ha, basal area/ha, sample volume, vol/ha, share of total vol/ha, vol/ha ≥ 30 cm, diameter n/mean/min/max (sample) and QMD per hectare = √(BA/ha ÷ trees/ha × 40000/π); species × class tables of trees/ha and vol/ha. Trees without volume (no height, no curve) still count for trees/ha and BA/ha. Species sums equal the overall totals (tested)
- Volume per species and zone (`speciesZoneVolumes`): same as the Zones tab but per species — `readPlotClasses` + `classAverages` (incl. fallbacks) on the species' per-plot vol/ha; species add up to the Zones-tab totals
- Näslund fit is OLS on the linearized form. It's slightly biased low (≈ −0.03 m with height error proportional to height; up to ≈ −0.5 m if many small trees near 1.3 m are measured with constant ±2 m error). Negligible next to prediction error at typical n; switch to a direct least-squares fit in h if that ever matters

## Conventions

- Match existing ES5 style in app.js (`var`, `function`), HTML built by string concatenation into `innerHTML`.
- **Any CSV-derived text** (cell values, headers, plot IDs, class codes, zone names) must go through `escapeHtml()` before it is concatenated into HTML; numbers from `fmtN`/`toFixed` don't need it. `render.test.js` has hostile-input tests — extend them when adding output.
- CSV parsing: `parseCSVText` picks `;` or `,` from the first non-blank line and passes it to PapaParse explicitly (Papa's own guessing is unreliable with decimal commas). Parse warnings (e.g. unclosed quote) are returned in `errors` and shown in the debug line for the tree file.
- Charts: never create them directly or in `setTimeout`. Register with `setTabCharts(tab, buildFn)` (buildFn returns an array of Chart instances); it destroys the tab's old charts and draws now if the tab is visible, otherwise on `switchTab`. `resetApp` → `destroyAllCharts()`.
- Number display: `fmtN` (non-breaking-space thousands, comma decimal).
- **Species values**: always read them with `speciesOf(row, col)` (trimmed value; blank → `NOT_RECORDED` = "(not recorded)") and count them with `speciesCounts` — no filtering, numeric values such as "7" included everywhere (Species/Genus tabs, summary card, Species analysis). `speciesNumber` excludes "(not recorded)" from the species count; it still appears as a row and in totals. Numeric values get `numericSpeciesWarningHtml` (likely KoBo choice codes). Health/Origin/Quality still use `countBy`, which hides numeric values.
- Counting by value: use `countValues` (Map-based). Plain objects enumerate integer-like keys ("7") first, which breaks the tie order.
- Line endings: `.gitattributes` stores js/html/css/md/csv/json with LF.
