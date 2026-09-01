"use strict";

window.GX_MOLECULE_MODELS = window.GX_MOLECULE_MODELS || {};
window.GX_MOLECULE_MODELS.chromatin = {
  id: "1KX5",
  label: "Chromatin package",
  note: "DNA wrapped around histone proteins",
  styles: {
    cartoon: { cartoon: { color: "spectrum" } },
    surface: { cartoon: { color: "spectrum", opacity: 0.22 }, surface: { opacity: 0.68, colorscheme: "amino" } },
    stick: { stick: { radius: 0.14, colorscheme: "Jmol" } },
  },
};
