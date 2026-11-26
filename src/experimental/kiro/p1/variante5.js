// COPIA para el navegador de experimental/verificacion_e5/variante5.mjs (sha ae2528774089). Solo cambian las rutas de importación. No editar: regenerar con experimental/p1_navegador/copiar_modulos.mjs
// variante5.mjs — E5: verificación por componente con geometría independiente, NCC con ventana local ponderada por
// calidad y Gemini como UNA sola fuente. EXPERIMENTAL, no integrada. Tres condiciones sobre el mismo caso:
//   gemini     solo las cajas de Gemini
//   geoNcc     anillos + calidad + NCC, sin Gemini
//   combinada  anillos + calidad + NCC + Gemini (la pose de R+GV no cuenta como evidencia: deriva de Gemini;
//              solo se usa para el GPIO como control fotométrico, igual que en el Experimento 4)
// Estados: confirmado / probable / no_determinado (con subtipo). Scores 0–100 NO calibrados.
import { apply, localScale, rectCorners } from "../geometry.js";
import { regionMetrics, judgeQuality } from "./calidad.js";
import { classifyTexture } from "./ncc_local.js";
import { skinFraction, judgeSkin } from "./piel.js";
export const E5 = Object.freeze({ acuerdoGeminiMM: 3.0, contradiceGeminiMM: 6.0, consistenciaMin: 0.6, acuerdoPoseGpioMM: 1.0, qfConfiable: 0.5, qfDebil: 0.25,
  pesos: { gemini: 0.4, textura: 0.4, geometria: 0.2 }, topes: { confirmado: 100, probable: 60, no_determinado: 30 },
  rotulo: "score experimental no calibrado (0–100); no es una probabilidad ni un porcentaje de certeza" });
const TARGETS = ["soc", "ram", "rp1", "gpio"], TEMPLATES = ["soc", "ram", "rp1", "pmic"], ANCHORS = ["soc", "ram", "rp1", "gpio", "pmic"];
const NAMES = { soc: "SoC BCM2712", ram: "Memoria RAM", rp1: "Controlador RP1", gpio: "Conector GPIO de 40 pines" };
const ctr = r => [r[0] + r[2] / 2, r[1] + r[3] / 2], n2 = v => v == null ? null : +(+v).toFixed(2), f = v => String(+(+v).toFixed(2)).replace(".", ",");
const detCenter = d => d.quad ? [d.quad.reduce((s, p) => s + p[0], 0) / d.quad.length, d.quad.reduce((s, p) => s + p[1], 0) / d.quad.length] : [(d.box[0] + d.box[2]) / 2, (d.box[1] + d.box[3]) / 2];
const usable = d => d.specificity === "specific" && ["visible", "partial"].includes(d.visibility) && (d.box || d.quad);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** factor de calidad continuo 0–1 (DISENO_E5.md): contraste relativo y nitidez en rampas, reflejo como veto */
export function qualityFactor(q) { const m = q.metricas || {}; if (q.fuera || q.oclusion) return 0;
  const c = m.contrasteRelativo == null ? 1 : clamp((m.contrasteRelativo - 0.3) / 0.4), s = clamp((m.nitidez - 0.08) / 0.08), r = (m.reflejoSobreReferencia ?? 0) > 0.05 ? 0 : 1; return +(Math.min(c, s) * r).toFixed(3); }
/** evidencia común (se calcula una vez por caso y la usan las tres condiciones) */
export function evidence(ctx) {
  const byId = Object.fromEntries(ctx.map.components.map(c => [c.id, c])), I = ctx.ind?.ok ? ctx.ind.H : null, mm = (H, c) => localScale(H, c) || 1, out = { I, byId, piezas: {} };
  if (I) { const items = [];
    for (const d of ctx.dets.filter(usable)) { const c = detCenter(d);
      if (ANCHORS.includes(d.id)) { const t = apply(I, ctr(byId[d.id].rect)); items.push({ id: d.instance_id ?? d.id, e: Math.hypot(c[0] - t[0], c[1] - t[1]) / mm(I, ctr(byId[d.id].rect)) }); }
      else if (d.id === "mounting_hole") { const b = ctx.map.holes.map(h => { const p = apply(I, h.c); return Math.hypot(c[0] - p[0], c[1] - p[1]) / mm(I, h.c); }).sort((a, b) => a - b)[0]; items.push({ id: d.instance_id, e: b }); } }
    const ok = items.filter(x => x.e <= E5.acuerdoGeminiMM).length; out.consistencia = { referencias: items.length, concordantes: ok, ok: items.length >= 3 && ok / items.length >= E5.consistenciaMin }; }
  for (const id of TARGETS) { const rect = byId[id].rect, p = { id };
    if (I) { const t0 = performance.now();
      p.poligonoPx = rectCorners(rect).map(q => apply(I, q).map(v => +v.toFixed(1))); p.centroPx = apply(I, ctr(rect)).map(v => +v.toFixed(1));
      const qm = regionMetrics(ctx.gray, ctx.rgb, I, rect), q = TEMPLATES.includes(id) ? judgeQuality(qm, ctx.refMetrics[id], ctx.qOpts) : { evaluable: false, motivos: [], metricas: qm, sinPlantilla: true };
      p.calidad = { ...q.metricas, factor: TEMPLATES.includes(id) ? qualityFactor(q) : null, motivos: q.motivos, fuera: !!q.fuera, oclusionUniforme: !!q.oclusion };
      p.piel = judgeSkin(skinFraction(ctx.rgb, I, rect), ctx.refSkin[id], ctx.pielOpts);
      if (TEMPLATES.includes(id) && !q.fuera && !q.oclusion && p.calidad.factor >= (ctx.e5?.qfDebil ?? E5.qfDebil)) p.textura = { ...classifyTexture(ctx.gray, ctx.engine, byId, I, id, TEMPLATES, ctx.nlOpts), confiable: p.calidad.factor >= (ctx.e5?.qfConfiable ?? E5.qfConfiable) };
      else p.textura = { resultado: TEMPLATES.includes(id) ? "no_evaluable" : "no_aplica", motivo: TEMPLATES.includes(id) ? (q.motivos.join("; ") || `factor de calidad ${p.calidad.factor}`) : "sin plantilla" };
      p.ms = performance.now() - t0;
      if (ctx.R?.aligned) p.discrepanciaPoseRGVmm = n2(rectCorners(rect).reduce((s, c) => { const a = apply(ctx.R.M, c), b = apply(I, c); return s + Math.hypot(a[0] - b[0], a[1] - b[1]); }, 0) / 4 / mm(I, ctr(rect))); }
    // Gemini (medido frente a la predicción de los anillos; sin anillos, sin referencia independiente)
    const own = ctx.dets.filter(d => d.id === id && usable(d)).map(d => ({ d, c: detCenter(d), e: I ? Math.hypot(detCenter(d)[0] - apply(I, ctr(rect))[0], detCenter(d)[1] - apply(I, ctr(rect))[1]) / mm(I, ctr(rect)) : null })).sort((a, b) => (a.e ?? 0) - (b.e ?? 0));
    const g = own[0] || null; p.gemini = g ? { instancia: g.d.instance_id, visibilidad: g.d.visibility, confianza: g.d.confidence, caja: g.d.box?.map(v => +v.toFixed(1)) ?? null, quad: g.d.quad ?? null, distanciaMM: n2(g.e) } : null;
    if (g && I) { const o = ctx.map.components.filter(x => x.id !== id).map(x => { const t = apply(I, ctr(x.rect)); return { id: x.id, e: Math.hypot(g.c[0] - t[0], g.c[1] - t[1]) / mm(I, ctr(x.rect)) }; }).sort((a, b) => a.e - b.e)[0]; p.gemini.piezaMasCercanaDistinta = { id: o.id, mm: n2(o.e) }; }
    out.piezas[id] = p; }
  return out;
}
// ---------------- condiciones ----------------
export function decideGemini(ev) {   // solo Gemini: su caja es la ubicación; confianza y visibilidad dan el estado
  return TARGETS.map(id => { const g = ev.piezas[id].gemini;
    if (!g) return pack(id, "no_determinado", "sin_deteccion", "Gemini no detectó la pieza", null, { fuente: "gemini" });
    const st = g.visibilidad === "visible" && g.confianza === "high" ? "confirmado" : "probable";
    return pack(id, st, null, `caja de Gemini (${g.visibilidad}, confianza ${g.confianza})`, g.quad || boxPoly(g.caja), { fuente: "gemini", nota: "sin verificación independiente" }); }); }
const boxPoly = b => b ? [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]] : null;
export function decideGeoNcc(ev, opts = {}) { return TARGETS.map(id => decideOne(ev, id, { ...opts, conGemini: false })); }
export function decideCombinada(ev, ctx, opts = {}) { return TARGETS.map(id => decideOne(ev, id, { ...opts, conGemini: true, R: ctx.R })); }
function decideOne(ev, id, o) {
  const p = ev.piezas[id], fav = [], con = [], P = { ...E5, ...(o.e5 || {}) };
  if (!ev.I) return pack(id, "no_determinado", "sin_geometria", "no hay geometría independiente de la placa (anillos)", null, { favorable: fav, contradictoria: con });
  const poly = p.poligonoPx, t = p.textura, sk = p.piel, g = o.conGemini ? p.gemini : null;
  fav.push("posición predicha por los 4 agujeros de montaje (sin Gemini)");
  if (p.calidad.fuera) return pack(id, "no_determinado", "fuera_de_cuadro", "menos del 50 % de la pieza está en el cuadro", poly, { favorable: fav, contradictoria: con });
  if (p.calidad.oclusionUniforme) { con.push("interior uniforme"); return pack(id, "no_determinado", "oclusion", "el interior es uniforme: probable oclusión", poly, { favorable: fav, contradictoria: con }); }
  // Gemini: contradicciones reales (no se ignoran)
  if (o.conGemini && g) {
    if (g.distanciaMM > P.acuerdoGeminiMM && g.piezaMasCercanaDistinta && g.piezaMasCercanaDistinta.mm <= P.acuerdoGeminiMM) { con.push(`la caja de Gemini rotulada ${id} está sobre ${g.piezaMasCercanaDistinta.id}`);
      return pack(id, "no_determinado", "contradiccion_identidad", `la caja de Gemini rotulada ${id} está sobre ${g.piezaMasCercanaDistinta.id} (${f(g.piezaMasCercanaDistinta.mm)} mm)`, poly, { favorable: fav, contradictoria: con }); }
    if (g.distanciaMM > P.contradiceGeminiMM) { con.push(`caja de Gemini a ${f(g.distanciaMM)} mm`); return pack(id, "no_determinado", "contradiccion_geometrica", `la caja de Gemini está a ${f(g.distanciaMM)} mm de la posición de los agujeros (> ${P.contradiceGeminiMM} mm)`, poly, { favorable: fav, contradictoria: con }); } }
  const gOK = o.conGemini ? !!g && g.distanciaMM <= P.acuerdoGeminiMM : null, cOK = o.conGemini ? !!ev.consistencia?.ok : null;
  if (o.conGemini) { if (gOK) fav.push(`caja de Gemini a ${f(g.distanciaMM)} mm`); else con.push(g ? `caja de Gemini a ${f(g.distanciaMM)} mm (> ${P.acuerdoGeminiMM})` : "Gemini no detectó la pieza");
    if (!cOK) con.push(`consistencia global de Gemini insuficiente (${ev.consistencia?.concordantes}/${ev.consistencia?.referencias})`); }
  // textura
  const texOK = t.resultado === "coherente", conf = t.confiable;
  if (texOK) fav.push(`textura coherente (NCC local ${f(t.nccLocal)}, margen ${f(t.margen)} frente a ${t.mejorRival}${conf ? "" : "; calidad baja: evidencia débil"})`);
  else if (t.resultado === "ambigua") (t.margen >= 0 ? fav : con).push(`textura ambigua (margen ${f(t.margen)} frente a ${t.mejorRival})`);
  else if (t.resultado === "contradictoria") con.push(`textura ${conf ? "confiable y " : ""}contradictoria: ${t.motivo}`);
  else if (t.resultado === "no_evaluable") con.push(`textura no evaluable: ${t.motivo}`);
  // piel: un dedo no reproduce la textura del chip; solo se aplica si la textura no confirma con calidad confiable
  // v2 (corrección posterior a la corrida v1): la excepción exige que el INTERIOR del chip también coincida
  // (NCC del interior ≥ nccMin). En v1 bastaba la NCC completa, que un parche claro uniforme puede imitar con el entorno.
  // v3 (vigente): sin excepción. Piel > umbral de oclusión → nunca hay afirmación positiva (también falló v2: un parche
  // que no cubre todo el interior deja ver el borde del blindaje y la NCC del interior llega a 0,41).
  const interiorOK = o.version === "v1" ? true : (t.nccInteriorLocal ?? -1) >= 0.3;
  const exento = o.version === "v1" || o.version === "v2" ? (texOK && conf && interiorOK) : false;
  const pielBloquea = !exento && sk.juicio === "oclusion", pielParcial = sk.juicio !== "libre" && sk.juicio !== "sin dato";
  if (sk.juicio === "oclusion" && !pielBloquea) fav.push(`la textura del interior coincide (NCC ${f(t.nccInteriorLocal ?? 0)}), así que el color de piel se atribuye a un reflejo`);
  if (pielBloquea) { con.push(`color de piel en ${Math.round(sk.exceso * 100)} % del interior sobre la referencia`); return pack(id, "no_determinado", "oclusion_piel", `probable dedo u oclusión (piel en ${Math.round(sk.exceso * 100)} % del interior)`, poly, { favorable: fav, contradictoria: con }); }
  if (pielParcial) con.push(`color de piel en ${Math.round(sk.exceso * 100)} % del interior`);
  if (t.resultado === "contradictoria" && conf) return pack(id, "no_determinado", "contradiccion_textura", `textura confiable y contradictoria: ${t.motivo}`, poly, { favorable: fav, contradictoria: con });
  if (t.resultado === "contradictoria" || (t.resultado === "ambigua" && t.margen < 0)) return pack(id, "no_determinado", "textura_desfavorable", t.resultado === "ambigua" ? `una plantilla rival (${t.mejorRival}) supera a la propia` : `textura contradictoria con calidad baja: ${t.motivo}`, poly, { favorable: fav, contradictoria: con });
  // decisión positiva
  const extOK = o.conGemini ? gOK && cOK : true;
  if (id === "gpio") { const R = o.R, rgvOK = R?.aligned && R.components.find(c => c.id === "gpio")?.status === "reconocido" && p.discrepanciaPoseRGVmm != null && p.discrepanciaPoseRGVmm <= P.acuerdoPoseGpioMM;
    if (o.conGemini && extOK && rgvOK && !pielParcial) { fav.push(`control fotométrico de R+GV y su pose a ${f(p.discrepanciaPoseRGVmm)} mm de la de los agujeros`); return pack(id, "confirmado", null, null, poly, { favorable: fav, contradictoria: con }); }
    if (o.conGemini && R?.aligned && p.discrepanciaPoseRGVmm > P.acuerdoPoseGpioMM) con.push(`la pose de R+GV difiere ${f(p.discrepanciaPoseRGVmm)} mm`);
    if (extOK) return pack(id, "probable", o.conGemini ? "gpio_sin_control" : "solo_geometria", o.conGemini ? "el GPIO no tiene textura de referencia y no pasó el control de R+GV" : "solo geometría: el GPIO no tiene textura de referencia", poly, { favorable: fav, contradictoria: con });
    return pack(id, "no_determinado", "incierto", con[0] ?? "evidencia insuficiente", poly, { favorable: fav, contradictoria: con }); }
  if (texOK && conf && extOK && !pielParcial) return pack(id, "confirmado", null, null, poly, { favorable: fav, contradictoria: con });
  if (extOK && (texOK || t.resultado === "ambigua" || t.resultado === "no_evaluable")) return pack(id, "probable", texOK ? (pielParcial ? "piel_parcial" : "textura_debil") : t.resultado === "ambigua" ? "textura_ambigua" : "textura_no_evaluable",
    texOK ? (pielParcial ? "posible oclusión parcial: no se confirma" : "textura coherente con calidad baja") : t.resultado === "ambigua" ? "la textura no distingue la pieza de una rival" : `textura no evaluable (${t.motivo})`, poly, { favorable: fav, contradictoria: con });
  return pack(id, "no_determinado", "incierto", con[0] ?? "evidencia insuficiente", poly, { favorable: fav, contradictoria: con });
}
function pack(id, estado, subtipo, motivo, poly, extra = {}) { return { id, nombre: NAMES[id], estado, subtipo, motivo, poligonoPx: poly, evidenciaFavorable: extra.favorable ?? [], evidenciaContradictoria: extra.contradictoria ?? [], fuente: extra.fuente ?? "geometria_independiente", nota: extra.nota ?? null }; }
// ---------------- scores (no calibrados) ----------------
/** identidad = 100·(wG·g + wT·t + wGeo·geo), con tope por estado. Los pesos son una hipótesis: se analiza su sensibilidad. */
export function scoreOf(ev, d, pesos = E5.pesos, conGemini = true) {
  const p = ev.piezas[d.id], t = p.textura || {}, qf = p.calidad?.factor ?? 0;
  const g = !conGemini || !p.gemini || p.gemini.distanciaMM == null ? 0 : clamp(1 - p.gemini.distanciaMM / 3);
  const tx = t.resultado === "coherente" ? clamp(0.6 + 1.6 * t.margen) * qf : t.resultado === "ambigua" ? (t.margen >= 0 ? 0.3 : 0) * qf : t.resultado === "no_aplica" ? 0.3 : t.resultado === "no_evaluable" ? 0.3 : 0;
  const geo = ev.I ? (conGemini ? (ev.consistencia?.ok ? 1 : 0.5) : 1) : 0;
  const W = conGemini ? pesos : { gemini: 0, textura: pesos.textura / (pesos.textura + pesos.geometria), geometria: pesos.geometria / (pesos.textura + pesos.geometria) };
  const cap = E5.topes[d.estado], ident = 100 * (W.gemini * g + W.textura * tx + W.geometria * geo), loc = ev.I ? 100 * (conGemini ? 0.7 + 0.3 * g : 0.85) : 0;
  return { ubicacion: Math.round(Math.min(cap, loc)), identidad: Math.round(Math.min(cap, ident)), componentes: { gemini: +g.toFixed(2), textura: +tx.toFixed(2), geometria: geo, factorCalidad: qf }, pesos: W, rotulo: E5.rotulo,
    calibracion: "ninguna: no hay datos independientes etiquetados; no leer como probabilidad (NCC 0,65 no es 65 %)" };
}
/** explicación local (plantilla) a partir de la evidencia: nunca cambia el estado ni agrega porcentajes */
export function explainLocal(d) {
  const base = `${d.nombre}: ${d.estado.replace("_", " ")}.`;
  if (d.estado === "confirmado") return `${base} A favor: ${d.evidenciaFavorable.join("; ")}.`;
  if (d.estado === "probable") return `${base} ${d.motivo[0].toUpperCase() + d.motivo.slice(1)}. A favor: ${d.evidenciaFavorable.join("; ")}.${d.evidenciaContradictoria.length ? " En contra: " + d.evidenciaContradictoria.join("; ") + "." : ""} No es una confirmación.`;
  return `${base} ${d.motivo ? d.motivo[0].toUpperCase() + d.motivo.slice(1) : "Evidencia insuficiente"}.`;
}
