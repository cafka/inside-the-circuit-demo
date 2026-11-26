/** preparar.js — mismo cálculo que preparedSize de backend/gemini_recognizer.mjs: escala uniforme para que la imagen
 *  entre en ancho ≤ 480 y alto ≤ 1280, sin agrandar (redondeo hacia abajo). P1 se evaluó sobre imágenes preparadas así. */
export function preparedSize(width, height, MAXW = 480, MAXH = 1280) { const k = Math.min(1, MAXW / width, MAXH / height); return { width: Math.max(1, Math.floor(width * k)), height: Math.max(1, Math.floor(height * k)), k }; }
