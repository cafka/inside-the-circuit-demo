/**
 * motor.js — motor P1+M+ común (EXPERIMENTAL), separado de la placa (A03).
 *
 *   reconocerPlaca(img, perfil, estrategia)
 *     img        RGBA ya preparada (≤ 480 × ≤ 1280, preparedSize), { width, height, channels: 4, data }
 *     perfil     perfil RESUELTO (perfil.js → resolverPerfil/cargarPerfil): componentes evaluados, verificación de cada
 *                uno, plantillas, rivales, métricas de referencia, referencias de localización
 *     estrategia objeto { id, unidad, textos: { favorable, sinLocalizacion }, compatible(perfil), localizar(...) }
 *
 * Contrato con la estrategia:
 *   entrada  localizar({ img, gray, perfil }) — gray = { g: Float32Array, width, height } de la misma img
 *   salida   { ok: true, H, unidad, referenciasPx?, controles? }
 *              H: 9 números, matriz 3×3 por filas, del PLANO DEL PERFIL (unidad del perfil, ejes del catálogo) a
 *              PÍXELES de img (x a la derecha, y hacia abajo); unidad debe ser la del perfil
 *            { ok: false, motivo } — no hay localización; el motor abstiene todas las piezas («sin_geometria»)
 *   El motor no sabe cómo se obtuvo H (anillos, bordes, conectores…): solo la usa.
 *
 * Pipeline (idéntico a «M+ σ0,5» de experimental/ncc_macro, antes en p1_reconocer.js + variante5.js):
 *   localización → por pieza evaluada: calidad (calidad.js) → si «textura» y factor de calidad sin nitidez fina ≥ 0,25,
 *   NCC macroscópica σ 0,5 mm contra su plantilla y las rivales (ncc_macro.js) → reglas de E5 sin Gemini.
 *   Piel: se calcula como antes, con umbrales 99 (desactivada).
 * Lo que antes decidía el id de la pieza (lista de piezas, plantillas, rivales, nombres, la rama del GPIO) ahora sale
 * del perfil; los textos que describen la localización salen de la estrategia.
 *
 * Configuración insuficiente (perfil inválido, sin estrategia, estrategia de otro perfil o incompatible, localización
 * mal formada, error de la estrategia): resultado { ok: false, error: { codigo, motivo }, piezas: {} }. Nunca se usa
 * otra placa como respaldo ni se publica una pieza positiva.
 */
import { apply, localScale, rectCorners } from "../geometry.js";
import { regionMetrics, judgeQuality } from "./calidad.js";
import { skinFraction, judgeSkin } from "./piel.js";
import { qualityFactor } from "./variante5.js";
import { classifyMacro } from "./ncc_macro.js";
import { preparedSize } from "./preparar.js";

export const P1M = Object.freeze({ version: "P1+M+ v2 (motor con perfil)", sigmaMM: 0.5, qfOmitir: 0.25, qfConfiable: 0.5, pielActivada: false,
  pielOpts: Object.freeze({ oclusion: 99, parcial: 99 }) });
export { preparedSize };

export function grayImage({ data, width, height, channels = 4 }) {   // igual que tools/geom_eval/visual_check.mjs
  const g = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) g[i] = 0.299 * data[i * channels] + 0.587 * data[i * channels + 1] + 0.114 * data[i * channels + 2];
  return { g, width, height };
}

const ctr = r => [r[0] + r[2] / 2, r[1] + r[3] / 2], f = v => String(+(+v).toFixed(2)).replace(".", ",");

function fallo(perfil, estrategia, codigo, motivo, t0) {
  return { version: P1M.version, ok: false, perfil: perfil?.id ?? null, estrategia: estrategia?.id ?? null, error: { codigo, motivo },
    geometria: { ok: false, motivo: `configuración: ${motivo}` }, piezas: {}, ms: { total: +(performance.now() - t0).toFixed(1), localizacion: 0, ncc: 0 } };
}
const matrizValida = H => Array.isArray(H) && H.length === 9 && H.every(Number.isFinite);

export function reconocerPlaca(img, perfil, estrategia) {
  const t0 = performance.now();
  if (!perfil || !Array.isArray(perfil.evaluados) || !perfil.motor || !perfil.porId) return fallo(perfil, estrategia, "perfil_invalido", "el perfil no está resuelto (usar resolverPerfil)", t0);
  if (!estrategia || typeof estrategia.localizar !== "function") return fallo(perfil, estrategia, "sin_estrategia", "no se entregó una estrategia de localización", t0);
  if (perfil.localizacion?.estrategia !== estrategia.id) return fallo(perfil, estrategia, "estrategia_de_otro_perfil", `el perfil pide «${perfil.localizacion?.estrategia}» y se entregó «${estrategia.id}»`, t0);
  const comp = estrategia.compatible?.(perfil) ?? { ok: false, motivo: "la estrategia no declara compatibilidad" };
  if (!comp.ok) return fallo(perfil, estrategia, "estrategia_incompatible", comp.motivo, t0);
  if (!estrategia.textos?.favorable || !estrategia.textos?.sinLocalizacion) return fallo(perfil, estrategia, "estrategia_incompleta", "la estrategia no describe su localización (textos)", t0);

  const gray = grayImage(img);
  let loc;
  try { loc = estrategia.localizar({ img, gray, perfil }); }
  catch (e) { return fallo(perfil, estrategia, "error_estrategia", `la estrategia falló: ${e.message}`, t0); }
  const tLoc = performance.now() - t0;
  if (!loc || typeof loc.ok !== "boolean") return fallo(perfil, estrategia, "localizacion_mal_formada", "la estrategia no devolvió { ok }", t0);
  if (loc.ok && !matrizValida(loc.H)) return fallo(perfil, estrategia, "localizacion_mal_formada", "la transformación no es una matriz 3×3 de números finitos", t0);
  if (loc.ok && loc.unidad !== perfil.unidad) return fallo(perfil, estrategia, "localizacion_mal_formada", `la transformación está en «${loc.unidad}» y el perfil en «${perfil.unidad}»`, t0);

  const I = loc.ok ? loc.H : null, M = perfil.motor, byId = perfil.porId, piezas = {}, omitidas = {}; let tNcc = 0;
  // evidencia por pieza (mismo cálculo que evidence() de E5 con qfDebil 99 + la NCC macroscópica de P1)
  for (const c of perfil.evaluados) {
    const rect = c.rect, p = { id: c.id }, conPlantilla = c.verificacion === "textura";
    if (I) {
      p.poligonoPx = rectCorners(rect).map(q => apply(I, q).map(v => +v.toFixed(1))); p.centroPx = apply(I, ctr(rect)).map(v => +v.toFixed(1));
      const qm = regionMetrics(gray, img, I, rect), q = conPlantilla ? judgeQuality(qm, M.refMetrics[c.id], undefined) : { evaluable: false, motivos: [], metricas: qm, sinPlantilla: true };
      const m = { ...q.metricas, factor: conPlantilla ? qualityFactor(q) : null, motivos: q.motivos, fuera: !!q.fuera, oclusionUniforme: !!q.oclusion };
      p.piel = judgeSkin(skinFraction(img, I, rect), M.refSkin[c.id], P1M.pielOpts);
      if (conPlantilla) {
        const fq = (m.fuera || m.oclusionUniforme) ? 0 : qualityFactor({ metricas: { ...m, nitidez: 1 } }), motivos = (m.motivos || []).filter(x => !/desenfoque/.test(x));
        p.calidad = { ...m, factor: fq, motivos };
        if (m.fuera || m.oclusionUniforme || fq < P1M.qfOmitir) { p.textura = { resultado: "no_evaluable", motivo: motivos.join("; ") || `factor de calidad ${fq}` }; omitidas[c.id] = p.textura.motivo; }
        else { const t1 = performance.now(), r = classifyMacro(gray, M.engine, byId, I, c.id, perfil.rivales, P1M.sigmaMM); tNcc += performance.now() - t1; p.textura = { ...r, confiable: fq >= P1M.qfConfiable }; }
      } else { p.calidad = m; p.textura = { resultado: "no_aplica", motivo: "sin plantilla" }; }
    }
    piezas[c.id] = p;
  }
  const out = {};
  for (const c of perfil.evaluados) {
    const p = piezas[c.id], d = decidir(I, p, c, estrategia.textos), t = p.textura || {};
    out[c.id] = { id: c.id, nombre: c.etiqueta, estado: d.estado, subtipo: d.subtipo, motivo: d.motivo, poligono: d.poligonoPx, centro: p.centroPx ?? null,
      favorable: d.evidenciaFavorable, contradictoria: d.evidenciaContradictoria, nccOmitida: omitidas[c.id] ?? null,
      ncc: t.resultado && t.resultado !== "no_evaluable" && t.resultado !== "no_aplica" ? { resultado: t.resultado, local: t.nccLocal, desplMM: t.desplLocalMM, margen: t.margen, rival: t.mejorRival } : null,
      calidad: p.calidad ? { factor: p.calidad.factor, contrasteRelativo: p.calidad.contrasteRelativo ?? null, reflejo: p.calidad.reflejoSobreReferencia ?? null } : null };
  }
  const ms = performance.now() - t0;
  return { version: P1M.version, ok: true, perfil: perfil.id, estrategia: estrategia.id,
    geometria: loc.ok ? { ok: true, referenciasPx: loc.referenciasPx ?? null } : { ok: false, motivo: loc.motivo },
    piezas: out, ms: { total: +ms.toFixed(1), localizacion: +tLoc.toFixed(1), ncc: +tNcc.toFixed(1) } };
}

/** reglas de E5 sin Gemini (decideOne de variante5.js con conGemini = false), sin depender del id de la pieza */
function decidir(I, p, c, textos) {
  const fav = [], con = [], pack = (estado, subtipo, motivo, poly) => ({ estado, subtipo, motivo, poligonoPx: poly, evidenciaFavorable: fav, evidenciaContradictoria: con });
  if (!I) return pack("no_determinado", "sin_geometria", textos.sinLocalizacion, null);
  const poly = p.poligonoPx, t = p.textura, sk = p.piel;
  fav.push(textos.favorable);
  if (p.calidad.fuera) return pack("no_determinado", "fuera_de_cuadro", "menos del 50 % de la pieza está en el cuadro", poly);
  if (p.calidad.oclusionUniforme) { con.push("interior uniforme"); return pack("no_determinado", "oclusion", "el interior es uniforme: probable oclusión", poly); }
  const texOK = t.resultado === "coherente", conf = t.confiable;
  if (texOK) fav.push(`textura coherente (NCC local ${f(t.nccLocal)}, margen ${f(t.margen)} frente a ${t.mejorRival}${conf ? "" : "; calidad baja: evidencia débil"})`);
  else if (t.resultado === "ambigua") (t.margen >= 0 ? fav : con).push(`textura ambigua (margen ${f(t.margen)} frente a ${t.mejorRival})`);
  else if (t.resultado === "contradictoria") con.push(`textura ${conf ? "confiable y " : ""}contradictoria: ${t.motivo}`);
  else if (t.resultado === "no_evaluable") con.push(`textura no evaluable: ${t.motivo}`);
  const pielBloquea = sk.juicio === "oclusion", pielParcial = sk.juicio !== "libre" && sk.juicio !== "sin dato";
  if (pielBloquea) { con.push(`color de piel en ${Math.round(sk.exceso * 100)} % del interior sobre la referencia`); return pack("no_determinado", "oclusion_piel", `probable dedo u oclusión (piel en ${Math.round(sk.exceso * 100)} % del interior)`, poly); }
  if (pielParcial) con.push(`color de piel en ${Math.round(sk.exceso * 100)} % del interior`);
  if (t.resultado === "contradictoria" && conf) return pack("no_determinado", "contradiccion_textura", `textura confiable y contradictoria: ${t.motivo}`, poly);
  if (t.resultado === "contradictoria" || (t.resultado === "ambigua" && t.margen < 0)) return pack("no_determinado", "textura_desfavorable", t.resultado === "ambigua" ? `una plantilla rival (${t.mejorRival}) supera a la propia` : `textura contradictoria con calidad baja: ${t.motivo}`, poly);
  // pieza sin plantilla (capacidad del perfil, antes «if (id === "gpio")»): como mucho probable, con el motivo del perfil
  if (c.verificacion === "solo_geometria") return pack("probable", "solo_geometria", c.motivoSoloGeometria, poly);
  if (texOK && conf && !pielParcial) return pack("confirmado", null, null, poly);
  if (texOK || t.resultado === "ambigua" || t.resultado === "no_evaluable") return pack("probable", texOK ? (pielParcial ? "piel_parcial" : "textura_debil") : t.resultado === "ambigua" ? "textura_ambigua" : "textura_no_evaluable",
    texOK ? (pielParcial ? "posible oclusión parcial: no se confirma" : "textura coherente con calidad baja") : t.resultado === "ambigua" ? "la textura no distingue la pieza de una rival" : `textura no evaluable (${t.motivo})`, poly);
  return pack("no_determinado", "incierto", con[0] ?? "evidencia insuficiente", poly);
}
