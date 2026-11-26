// COPIA para el navegador de experimental/verificacion_e5/piel.mjs (sha cbdc80878f59). Solo cambian las rutas de importación. No editar: regenerar con experimental/p1_navegador/copiar_modulos.mjs
// piel.mjs — oclusión probable por dedo/mano: fracción de píxeles con color de piel en el interior de la pieza,
// comparada con la MISMA región de la foto oficial (metal, serigrafía y oro también dan «piel» y se descuentan).
// Regla de color: clásica RGB (Kovac et al. 2003). Sin Gemini y sin NCC.
import { apply } from "../geometry.js";
export const PIEL = Object.freeze({ paso: 0.25, inset: 0.5, oclusion: 0.2, parcial: 0.08 });
export const isSkin = (r, g, b) => r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && r - g > 15 && r > b;
export function skinFraction(rgb, H, rect) {
  const [x, y, w, h] = rect; let n = 0, s = 0;
  for (let u = x + PIEL.inset; u <= x + w - PIEL.inset + 1e-9; u += PIEL.paso) for (let v = y + PIEL.inset; v <= y + h - PIEL.inset + 1e-9; v += PIEL.paso) {
    const q = apply(H, [u, v]), xi = Math.round(q[0]), yi = Math.round(q[1]); if (xi < 0 || yi < 0 || xi >= rgb.width || yi >= rgb.height) continue;
    const o = (yi * rgb.width + xi) * rgb.channels; n++; if (isSkin(rgb.data[o], rgb.data[o + 1], rgb.data[o + 2])) s++; }
  return n ? s / n : null;
}
/** exceso de piel sobre la referencia y juicio */
export function judgeSkin(frac, fracRef, opts = {}) {
  const P = { ...PIEL, ...opts }; if (frac == null) return { exceso: null, juicio: "sin dato" };
  const ex = +(frac - (fracRef ?? 0)).toFixed(3);
  return { fraccion: +frac.toFixed(3), referencia: +(fracRef ?? 0).toFixed(3), exceso: ex, juicio: ex > P.oclusion ? "oclusion" : ex > P.parcial ? "parcial" : "libre" };
}
