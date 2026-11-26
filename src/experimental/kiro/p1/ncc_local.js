// COPIA para el navegador de experimental/verificacion_e5/ncc_local.mjs (sha 68c25ac1effb). Solo cambian las rutas de importación. No editar: regenerar con experimental/p1_navegador/copiar_modulos.mjs
// ncc_local.mjs — mapa NCC completo (±4 mm cada 0,5 mm, misma plantilla y grilla de 0,25 mm que R+GV) de la pieza
// propia y de las rivales, y su clasificación con una ventana local acorde a la incertidumbre de la geometría
// independiente. No cambia R+GV: usa las plantillas del motor (tplG) y el muestreo bilineal idéntico.
import { apply, mul } from "../geometry.js";
export const NL = Object.freeze({ rango: 4, paso: 0.5, radioLocalMM: 1.5, deltaPico: 0.05, nccMin: 0.3, margenMin: 0.1, minValidos: 0.8 });
function bil(img, x, y) { if (!(x >= 0 && y >= 0 && x < img.width - 1 && y < img.height - 1)) return NaN; const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, w = img.width, g = img.g;
  return g[y0 * w + x0] * (1 - fx) * (1 - fy) + g[y0 * w + x0 + 1] * fx * (1 - fy) + g[(y0 + 1) * w + x0] * (1 - fx) * fy + g[(y0 + 1) * w + x0 + 1] * fx * fy; }
const T = (dx, dy) => [1, 0, dx, 0, 1, dy, 0, 0, 1], ctr = r => [r[0] + r[2] / 2, r[1] + r[3] / 2];
/** mapa NCC de la plantilla tplId colocada en el centro de atId bajo H (mm → px). Devuelve [{dx,dy,ncc}] */
const MEMO = new WeakMap();   // por imagen gris: el mapa no depende de los parámetros de clasificación
export function nccMap(gray, tpl, H, tplRect, atRect) {
  let m = MEMO.get(gray); if (!m) { m = new Map(); MEMO.set(gray, m); }
  const key = `${tplRect.join(",")}|${atRect.join(",")}|${H.join(",")}`; if (m.has(key)) return m.get(key);
  const r = nccMapRaw(gray, tpl, H, tplRect, atRect); m.set(key, r); return r;
}
// Grilla extendida (como frameGrid de R+GV): el cuadro se muestrea UNA vez en (nu+2R)×(nv+2R) puntos y cada
// desplazamiento es un corrimiento de índices (0,5 mm = 2 celdas de 0,25 mm). Mismo resultado que muestrear por desplazamiento.
function nccMapRaw(gray, tpl, H, tplRect, atRect) {
  const Hh = tplRect === atRect ? H : mul(H, T(ctr(atRect)[0] - ctr(tplRect)[0], ctr(atRect)[1] - ctr(tplRect)[1]));
  const EU = tpl.ue.length, EV = tpl.ve.length, F = new Float64Array(EU * EV), out = [];
  for (let i = 0; i < EU; i++) for (let j = 0; j < EV; j++) { const q = apply(Hh, [tpl.ue[i], tpl.ve[j]]); F[i * EV + j] = bil(gray, q[0], q[1]); }
  const st = tpl.step ?? 0.25, cells = Math.round(NL.paso / st), R = tpl.R;
  for (let dx = -NL.rango; dx <= NL.rango + 1e-9; dx += NL.paso) for (let dy = -NL.rango; dy <= NL.rango + 1e-9; dy += NL.paso) {
    const oi = R + Math.round(dx / st), oj = R + Math.round(dy / st); let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, k = 0;
    let m = 0, ta = 0, tb = 0, taa = 0, tbb = 0, tab = 0;   // solo el interior del chip (rectángulo − 0,5 mm), para no depender del entorno
    for (let i = 0; i < tpl.nu; i++) { const row = (i + oi) * EV + oj, u = tpl.ue[R + i], inU = u >= tplRect[0] + 0.5 - 1e-9 && u <= tplRect[0] + tplRect[2] - 0.5 + 1e-9;
      for (let j = 0; j < tpl.nv; j++, k++) { const a = tpl.ref[k]; if (a !== a) continue; const b = F[row + j]; if (b !== b) continue;
        n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
        const v = tpl.ve[R + j]; if (inU && v >= tplRect[1] + 0.5 - 1e-9 && v <= tplRect[1] + tplRect[3] - 0.5 + 1e-9) { m++; ta += a; tb += b; taa += a * a; tbb += b * b; tab += a * b; } } }
    let ci = NaN; if (m > 10) { const cv = tab / m - ta / m * tb / m, va = taa / m - (ta / m) ** 2, vb = tbb / m - (tb / m) ** 2; if (va > 1e-6 && vb > 1e-6) ci = cv / Math.sqrt(va * vb); }
    let c = NaN; if (n >= tpl.n * NL.minValidos) { const cv = sab / n - sa / n * sb / n, va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2; if (va > 1e-6 && vb > 1e-6) c = cv / Math.sqrt(va * vb); }
    out.push({ dx: +dx.toFixed(2), dy: +dy.toFixed(2), ncc: c, nccInterior: ci }); }
  return out;
}
const best = (m, lim) => m.filter(p => p.ncc === p.ncc && (lim == null || Math.hypot(p.dx, p.dy) <= lim + 1e-9)).sort((a, b) => b.ncc - a.ncc)[0] || null;
/**
 * Clasificación de la textura de la pieza id (con calidad ya juzgada evaluable):
 *  coherente       máximo local (|d| ≤ radio) ≥ nccMin, sin un máximo lejano mejor por más de deltaPico, margen ≥ margenMin
 *  ambigua         coherente pero margen frente a las rivales < margenMin
 *  contradictoria  máximo local < nccMin, o un máximo fuera de la ventana mejor que el local por más de deltaPico
 * Las rivales se comparan con su máximo en ±4 mm (como R+GV), lo que es más exigente para la propia.
 */
export function classifyTexture(gray, engine, byId, H, id, rivals, opts = {}) {
  const P = { ...NL, ...opts }, rect = byId[id].rect, own = nccMap(gray, engine.tplG[id], H, rect, rect);
  const loc = best(own, P.radioLocalMM), glob = best(own, null);
  const riv = Object.fromEntries(rivals.filter(o => o !== id).map(o => { const b = best(nccMap(gray, engine.tplG[o], H, byId[o].rect, rect), null); return [o, b ? { ncc: +b.ncc.toFixed(3), desplMM: [b.dx, b.dy] } : null]; }));
  const top = Object.entries(riv).filter(([, v]) => v).sort((a, b) => b[1].ncc - a[1].ncc)[0] || null;
  const r = { nccLocal: loc ? +loc.ncc.toFixed(3) : null, nccInteriorLocal: loc && loc.nccInterior === loc.nccInterior ? +loc.nccInterior.toFixed(3) : null, desplLocalMM: loc ? [loc.dx, loc.dy] : null, nccGlobal: glob ? +glob.ncc.toFixed(3) : null, desplGlobalMM: glob ? [glob.dx, glob.dy] : null,
    picoLejanoMejorPor: loc && glob ? +(glob.ncc - loc.ncc).toFixed(3) : null, rivales: riv, mejorRival: top?.[0] ?? null, nccRival: top?.[1].ncc ?? null, margen: loc && top ? +(loc.ncc - top[1].ncc).toFixed(3) : null, parametros: { radioLocalMM: P.radioLocalMM, deltaPico: P.deltaPico } };
  if (!loc || loc.ncc < P.nccMin) return { ...r, resultado: "contradictoria", motivo: `NCC local ${r.nccLocal ?? "—"} < ${P.nccMin} con la pieza donde la ubican los agujeros` };
  if (glob.ncc - loc.ncc > P.deltaPico) return { ...r, resultado: "contradictoria", motivo: `un máximo a ${Math.hypot(glob.dx, glob.dy).toFixed(1)} mm es mejor que el local por ${r.picoLejanoMejorPor} (> ${P.deltaPico})` };
  if (r.margen == null || r.margen < P.margenMin) return { ...r, resultado: "ambigua", motivo: `margen ${r.margen} frente a ${r.mejorRival} (< ${P.margenMin})` };
  return { ...r, resultado: "coherente", motivo: null };
}
