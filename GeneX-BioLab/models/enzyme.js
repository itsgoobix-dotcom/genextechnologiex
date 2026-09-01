"use strict";

window.GX_MOLECULE_MODELS = window.GX_MOLECULE_MODELS || {};
window.GX_MOLECULE_MODELS.enzyme = {
  id: "1AKE",
  label: "Enzyme",
  note: "adenylate kinase protein",
  styles: {
    cartoon: { cartoon: { color: "spectrum" } },
    surface: { cartoon: { color: "spectrum", opacity: 0.18 }, surface: { opacity: 0.78, colorscheme: "amino" } },
    stick: { stick: { radius: 0.14, colorscheme: "Jmol" } },
  },
  highlight: { resi: "9-18" },
};
