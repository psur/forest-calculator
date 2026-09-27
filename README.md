# Tree Inventory Analyzer

A lightweight, browser-based tool for exploring tree inventory data exported from **KoBoToolbox** (or any compatible CSV).

## Features

- Drag-and-drop CSV upload (comma **or** semicolon separated, European decimals supported)
- Summary statistics: species count, mean/max diameter & height
- Categorical breakdowns: Species, Health, Origin, Quality, Use
- Diameter and height histograms
- Stand-level metrics (stems/ha, basal area, volume) — **ready once inclusion zone is configured**

## Getting Started

```bash
git clone https://github.com/YOUR_ORG/tree-inventory-analyzer.git
cd tree-inventory-analyzer
# No build step — open index.html directly in a browser
open index.html
```

## Project structure

```
tree-inventory-analyzer/
├── index.html          # Main UI
├── js/
│   ├── config.js       # Settings: form factor, class column/codes/fallbacks, height model …
│   └── app.js          # CSV parsing, calculations, rendering
└── tests/              # node --test, with synthetic fixtures
```

## Settings

Project-specific settings live in `js/config.js` (form factor, plot-ID and class columns, class codes and fallbacks, diameter class width, height–diameter model). The area each tree represents comes from the `InclusionZone_ha` column of the tree CSV.

## Column naming

The app expects KoBoToolbox-style column headers (e.g. `Species:`, `Diameter [cm]:`, `Height [m]:`). If your headers differ, adjust the `findCol()` calls in `js/app.js`.

## Contributing

1. Fork the repo and create a feature branch
2. Make your changes in `js/calculations.js` (new metrics) or `js/app.js` (UI)
3. Open a pull request with a short description of what you added

## License

MIT
