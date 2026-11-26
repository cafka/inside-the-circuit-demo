// COPIA para el navegador de experimental/verificacion_adaptativa/calidad.mjs (sha aedcd0a43bbf). Solo cambian las rutas de importación. No editar: regenerar con experimental/p1_navegador/copiar_modulos.mjs
// calidad.mjs — calidad visual por región (DISENO.md §3), calculada ANTES de NCC y sin Gemini.
// Región: pieza + 2 mm en la pose dada (la independiente cuando existe), grilla de 0,25 mm.
import { apply } from "../geometry.js";
export const Q = Object.freeze({ paso: 0.25, margen: 2, inset: 0.5, anilloDesde: 0.5, clip: 245, reflejoMax: 0.05, contrasteMinRel: 0.5, contrasteRefMin: 20, nitidezMin: 0.12, oclusionStd: 4 });
const bil = (img, x, y) => { if (!(x >= 0 && y >= 0 && x < img.width - 1 && y < img.height - 1)) return NaN; const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, w = img.width, g = img.g;
  return g[y0 * w + x0] * (1 - fx) * (1 - fy) + g[y0 * w + x0 + 1] * fx * (1 - fy) + g[(y0 + 1) * w + x0] * (1 - fx) * fy + g[(y0 + 1) * w + x0 + 1] * fx * fy; };
const clipped = (rgb, x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= rgb.width || yi >= rgb.height) return NaN; const o = (yi * rgb.width + xi) * rgb.channels;
  return Math.max(rgb.data[o], rgb.data[o + 1], rgb.data[o + 2]) >= Q.clip ? 1 : 0; };
/** Métricas crudas de la región de rect bajo H (mm → px). gray {g,width,height}; rgb {data,width,height,channels}. */
export function regionMetrics(gray, rgb, H, rect) {
  const [x, y, w, h] = rect, us = [], vs = []; for (let u = x - Q.margen; u <= x + w + Q.margen + 1e-9; u += Q.paso) us.push(u); for (let v = y - Q.margen; v <= y + h + Q.margen + 1e-9; v += Q.paso) vs.push(v);
  const G = us.map(u => vs.map(v => { const q = apply(H, [u, v]); return bil(gray, q[0], q[1]); }));
  let n = 0, nIn = 0, s = 0, ss = 0, e = 0, ne = 0, si = 0, ssi = 0, ni = 0, sr = 0, nr = 0, clip = 0;
  for (let i = 0; i < us.length; i++) for (let j = 0; j < vs.length; j++) { const a = G[i][j]; nIn++; if (a !== a) continue; n++; s += a; ss += a * a;
    if (i + 1 < us.length && j + 1 < vs.length && G[i + 1][j] === G[i + 1][j] && G[i][j + 1] === G[i][j + 1]) { e += (G[i + 1][j] - a) ** 2 + (G[i][j + 1] - a) ** 2; ne++; }
    const u = us[i], v = vs[j], inner = u >= x + Q.inset - 1e-9 && u <= x + w - Q.inset + 1e-9 && v >= y + Q.inset - 1e-9 && v <= y + h - Q.inset + 1e-9;
    const ring = u < x - Q.anilloDesde + 1e-9 || u > x + w + Q.anilloDesde - 1e-9 || v < y - Q.anilloDesde + 1e-9 || v > y + h + Q.anilloDesde - 1e-9;
    if (inner) { si += a; ssi += a * a; ni++; const q = apply(H, [u, v]), c = clipped(rgb, q[0], q[1]); if (c === c) clip += c; } else if (ring) { sr += a; nr++; } }
  const fracDentro = n / nIn; if (fracDentro < 0.5 || !ni || !nr) return { fracDentro: +fracDentro.toFixed(2), completa: false };
  const variance = ss / n - (s / n) ** 2, mi = si / ni;
  return { fracDentro: +fracDentro.toFixed(2), completa: fracDentro >= 0.999, nitidez: +(e / Math.max(1, ne) / Math.max(1e-6, variance)).toFixed(4), contraste: +(mi - sr / nr).toFixed(1),
    stdInterior: +Math.sqrt(Math.max(0, ssi / ni - mi * mi)).toFixed(2), fracSaturado: +(clip / ni).toFixed(4), media: +mi.toFixed(1) };
}
/** Referencia (foto oficial) con las mismas métricas, por pieza. ref: { gimg, rgb, A_mm_to_px } */
export const referenceMetrics = (ref, rect) => regionMetrics(ref.gimg, ref.rgb, ref.A_mm_to_px, rect);
/** Juicio de evaluabilidad (DISENO.md §3). Devuelve { evaluable, oclusion, motivos[], metricas } */
export function judgeQuality(m, mref, opts = {}) {
  const P = { ...Q, ...opts }, motivos = [];
  if (!m || m.fracDentro < 0.5) return { evaluable: false, oclusion: false, fuera: true, motivos: ["menos del 50 % de la región en el cuadro"], metricas: m };
  if (m.stdInterior < P.oclusionStd) return { evaluable: false, oclusion: true, motivos: [`interior uniforme (desvío ${m.stdInterior} < ${P.oclusionStd}): posible oclusión`], metricas: m };
  const reflejo = +(m.fracSaturado - (mref?.fracSaturado ?? 0)).toFixed(4), rel = mref && Math.abs(mref.contraste) >= P.contrasteRefMin ? +(m.contraste / mref.contraste).toFixed(3) : null;
  if (reflejo > P.reflejoMax) motivos.push(`reflejo: ${(reflejo * 100).toFixed(1)} % del interior saturado sobre la referencia (> ${P.reflejoMax * 100} %)`);
  if (rel != null && rel < P.contrasteMinRel) motivos.push(`contraste ${m.contraste} frente a ${mref.contraste} en la referencia (relativo ${rel} < ${P.contrasteMinRel}): perdido o invertido`);
  if (m.nitidez < P.nitidezMin) motivos.push(`desenfoque: nitidez ${m.nitidez} < ${P.nitidezMin}`);
  return { evaluable: motivos.length === 0, oclusion: false, motivos, metricas: { ...m, reflejoSobreReferencia: reflejo, contrasteRelativo: rel } };
}
