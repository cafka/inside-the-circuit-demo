/**
 * registro.js — estrategias de localización disponibles y selección según el perfil.
 * Hoy hay una sola (la de la Raspberry Pi 5). No hay estrategia por defecto: si el perfil pide una que no está
 * registrada, o la registrada no es compatible con el perfil, la selección falla con el motivo.
 */
import { estrategiaAnillosRpi5 } from "./anillos_dorados_rpi5.js";

export const ESTRATEGIAS = Object.freeze({ [estrategiaAnillosRpi5.id]: estrategiaAnillosRpi5 });

/** @returns {{ ok: true, estrategia } | { ok: false, codigo, motivo }} */
export function seleccionarEstrategia(perfil, registro = ESTRATEGIAS) {
  const id = perfil?.localizacion?.estrategia;
  if (!id) return { ok: false, codigo: "sin_estrategia", motivo: "el perfil no indica estrategia de localización" };
  const e = registro[id];
  if (!e) return { ok: false, codigo: "estrategia_no_disponible", motivo: `la estrategia «${id}» que pide el perfil no está disponible` };
  const c = e.compatible(perfil);
  if (!c.ok) return { ok: false, codigo: "estrategia_incompatible", motivo: c.motivo };
  return { ok: true, estrategia: e };
}
