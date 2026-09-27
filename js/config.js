/**
 * config.js - Forest Calculator settings.
 * Loaded before app.js; every project-specific constant lives here.
 */

var CONFIG = {
  // Tree volume: v = g · h · formFactor (same factor for all species)
  formFactor: 0.441,

  // Tree CSV column linking each tree to its plot (KoBo repeat-group parent index)
  treePlotIdColumn: '_parent_index',
  // Plots CSV column holding the plot ID (values must match treePlotIdColumn); null = first column
  plotsPlotIdColumn: null,
  // Plots CSV column holding each plot's class; the Zones CSV has one column per class code
  classColumn: 'Zone SLIM',
  // Known class codes; codes outside this list are flagged in the Zones tab
  classCodes: ['12', '21', '22'],
  // A class with no plots borrows the average vol/ha of the first listed class that has plots
  classFallbacks: {
    '12': ['21'],
    '21': ['22'],
    '22': ['21', '12']
  },

  // Width of diameter classes (histogram and trees/ha table), cm
  diameterClassWidth_cm: 5,
  // Minimum exploitable (merchantable) diameter, cm — not used in calculations yet
  minExploitableDiameter_cm: 30,

  // Estimate missing heights from a Näslund height–diameter curve
  heightModel: {
    enabled: true,
    // Species with fewer measured trees use the all-species curve
    // (which itself needs at least this many measured trees)
    minTreesPerSpecies: 10
  }
};

// Node (tests) only — `module` is undefined in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
