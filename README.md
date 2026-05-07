# Tree Inventory Analyzer

A lightweight, browser-based tool for exploring tree inventory data exported from **KoBoToolbox** (or any compatible CSV). No server needed — just open `index.html`.

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
└── js/
    ├── app.js          # CSV parsing, column detection, chart rendering
    └── calculations.js # Forest metrics — basal area, volume, stem density
```

## ⚠️ Inclusion Zone — action required

Stand-level metrics (stems/ha, basal area, volume per ha) depend on the **inclusion zone** — the area each sampled tree represents. Open `js/calculations.js` and set the `INCLUSION_ZONE` object at the top:

```js
const INCLUSION_ZONE = {
  method: "fixed_area",   // "fixed_area" | "angle_count" | "strip"
  plotRadius_m: 10,       // for fixed-area plots: radius in metres
  // baf: 2,              // for Bitterlich angle-count: BAF in m²/ha
  // stripWidth_m: 5, stripLength_m: 100,  // for strip transects
};
```

Once set, the summary cards for stems/ha, basal area and volume will appear automatically.

## Column naming

The app expects KoBoToolbox-style column headers (e.g. `Species:`, `Diameter [cm]:`, `Height [m]:`). If your headers differ, adjust the `findCol()` calls in `js/app.js`.

## Contributing

1. Fork the repo and create a feature branch
2. Make your changes in `js/calculations.js` (new metrics) or `js/app.js` (UI)
3. Open a pull request with a short description of what you added

## License

MIT
