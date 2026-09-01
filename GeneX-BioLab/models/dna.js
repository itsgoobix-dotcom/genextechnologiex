"use strict";

window.GX_MOLECULE_MODELS = window.GX_MOLECULE_MODELS || {};
window.GX_MOLECULE_MODELS.dna = {
  id: "1BNA",
  label: "DNA double helix",
  note: "a real DNA dodecamer",
  styles: {
    cartoon: { stick: { radius: 0.18, colorscheme: "Jmol" } },
    surface: { stick: { radius: 0.18, colorscheme: "Jmol" }, surface: { opacity: 0.34, colorscheme: "Jmol" } },
    stick: { stick: { radius: 0.18, colorscheme: "Jmol" } },
  },
};
