/**
 * calculations.js
 * ---------------
 * Forest inventory calculations for the Tree Inventory Analyzer.
 *
 * Many of these functions depend on the INCLUSION ZONE — the area around
 * each sample point within which trees are counted. This must be defined
 * per survey design (fixed-area plot, angle-count / Bitterlich, etc.).
 *
 * TODO for collaborators:
 *   1. Define the inclusion zone method used in your survey (see INCLUSION_ZONE below).
 *   2. Implement or verify the per-ha expansion factor in getExpansionFactor().
 *   3. Add any site-specific corrections (slope, etc.) as needed.
 */

// ---------------------------------------------------------------------------
// INCLUSION ZONE CONFIGURATION
// Edit this section to match your survey design.
// ---------------------------------------------------------------------------

var INCLUSION_ZONE = {
  method: "fixed_area",   // "fixed_area" | "angle_count" | "strip"

  // Fixed-area plot: radius in metres
  plotRadius_m: null,     // TODO: set e.g. 5, 10, 15 …

  // Angle-count (Bitterlich / BAF): basal-area factor in m²/ha
  baf: null,              // TODO: set e.g. 1, 2, 4 …

  // Strip transect: width in metres, length in metres
  stripWidth_m: null,
  stripLength_m: null,
};

// ---------------------------------------------------------------------------
// EXPANSION FACTOR
// Returns the number of hectares represented by ONE sampled tree.
// ---------------------------------------------------------------------------

/**
 * @param {number} diamCm  - DBH of the tree in centimetres
 * @returns {number|null}  - expansion factor (trees / ha represented by 1 tree),
 *                           or null if inclusion zone is not configured.
 */
function getExpansionFactor(diamCm) {
  const iz = INCLUSION_ZONE;

  if (iz.method === "fixed_area" && iz.plotRadius_m) {
    const plotArea_ha = Math.PI * iz.plotRadius_m ** 2 / 10000;
    return 1 / plotArea_ha;
  }

  if (iz.method === "angle_count" && iz.baf && diamCm > 0) {
    // Expansion factor for Bitterlich sampling
    const dbh_m = diamCm / 100;
    const plotArea_ha = Math.PI * (dbh_m / 2) ** 2 / iz.baf;
    return 1 / plotArea_ha;
  }

  if (iz.method === "strip" && iz.stripWidth_m && iz.stripLength_m) {
    const stripArea_ha = (iz.stripWidth_m * iz.stripLength_m) / 10000;
    return 1 / stripArea_ha;
  }

  return null; // not configured yet
}

// ---------------------------------------------------------------------------
// BASAL AREA
// ---------------------------------------------------------------------------

/**
 * Basal area of a single tree (cross-sectional area at breast height).
 * @param {number} diamCm - diameter in cm
 * @returns {number} basal area in m²
 */
function basalArea_m2(diamCm) {
  const r = (diamCm / 100) / 2;
  return Math.PI * r * r;
}

/**
 * Stand-level basal area per hectare from a sample of trees.
 * @param {number[]} diameters - array of DBH values in cm
 * @returns {number|null} basal area in m²/ha, or null if inclusion zone not set
 */
function basalAreaPerHa(diameters) {
  // TODO: if multiple plots, sum per plot then average — do not pool all trees
  const ef = getExpansionFactor(diameters[0]); // simple version: same EF for all
  if (ef === null) return null;
  const totalBA = diameters.reduce((sum, d) => sum + basalArea_m2(d), 0);
  return totalBA * ef;
}

/**
 * Stem density (trees per hectare) from a sample.
 * @param {number} nTrees    - number of trees in the sample
 * @param {number} diamCm    - representative diameter (e.g. mean) for angle-count EF
 * @returns {number|null}
 */
function stemDensityPerHa(nTrees, diamCm) {
  const ef = getExpansionFactor(diamCm);
  if (ef === null) return null;
  return nTrees * ef;
}

// ---------------------------------------------------------------------------
// VOLUME ESTIMATION (stub)
// ---------------------------------------------------------------------------

/**
 * Simple form-factor volume estimate for a single tree.
 * Replace with species-specific allometric equations as needed.
 *
 * V = (π/4) × DBH² × H × f
 *   where f = form factor (≈ 0.5 for most broadleaves, 0.45 conifers)
 *
 * @param {number} diamCm   - DBH in cm
 * @param {number} heightM  - total height in m
 * @param {number} [f=0.5]  - form factor
 * @returns {number} volume in m³
 */
function treeVolume_m3(diamCm, heightM, f = 0.5) {
  const dbh_m = diamCm / 100;
  return (Math.PI / 4) * dbh_m * dbh_m * heightM * f;
}

/**
 * Total volume per hectare from a sample.
 * @param {Array<{diam: number, height: number}>} trees
 * @returns {number|null} m³/ha or null
 */
function volumePerHa(trees) {
  const ef = getExpansionFactor(trees[0]?.diam);
  if (ef === null) return null;
  const totalVol = trees.reduce((s, t) => s + treeVolume_m3(t.diam, t.height), 0);
  return totalVol * ef;
}

// ---------------------------------------------------------------------------
// SUMMARY HELPER
// Called by app.js to get all available stand-level metrics.
// Returns an object; any field may be null if inclusion zone not configured.
// ---------------------------------------------------------------------------

/**
 * @param {object[]} rows   - parsed CSV rows
 * @param {string} diamCol  - column name for diameter
 * @param {string} htCol    - column name for height
 * @returns {object}
 */
function computeStandMetrics(rows, diamCol, htCol) {
  const diams   = rows.map(r => parseNum(r[diamCol])).filter(v => !isNaN(v) && v > 0);
  const heights = rows.map(r => parseNum(r[htCol])).filter(v => !isNaN(v) && v > 0);
  const pairs   = rows
    .map(r => ({ diam: parseNum(r[diamCol]), height: parseNum(r[htCol]) }))
    .filter(p => !isNaN(p.diam) && !isNaN(p.height) && p.diam > 0 && p.height > 0);

  const meanDiam = diams.length ? diams.reduce((s,v) => s+v, 0) / diams.length : null;

  return {
    inclusionZoneConfigured: getExpansionFactor(meanDiam) !== null,
    basalAreaPerHa:   diams.length  ? basalAreaPerHa(diams)                  : null,
    stemDensityPerHa: diams.length && meanDiam ? stemDensityPerHa(diams.length, meanDiam) : null,
    volumePerHa:      pairs.length  ? volumePerHa(pairs)                     : null,
  };
}