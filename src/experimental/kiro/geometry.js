/**
 * geometry.js — transformaciones planas para alinear el mapa de la placa (mm) con la imagen (px).
 * Sin dependencias. Matrices 3×3 como arreglos de 9 números (fila mayor).
 */

export function apply(M, [x, y]) {
  const w = M[6] * x + M[7] * y + M[8];
  return [(M[0] * x + M[1] * y + M[2]) / w, (M[3] * x + M[4] * y + M[5]) / w];
}

/** Similaridad (rotación + escala uniforme + traslación, sin espejo) de 2 pares de puntos. */
export function similarity2([a0, a1], [b0, b1]) {
  const ax = a1[0] - a0[0], ay = a1[1] - a0[1], bx = b1[0] - b0[0], by = b1[1] - b0[1];
  const den = ax * ax + ay * ay;
  if (den < 1e-9) return null;
  const c = (ax * bx + ay * by) / den, s = (ax * by - ay * bx) / den;   // s·e^{iθ}
  const tx = b0[0] - (c * a0[0] - s * a0[1]), ty = b0[1] - (s * a0[0] + c * a0[1]);
  return [c, -s, tx, s, c, ty, 0, 0, 1];
}

/** Afín por mínimos cuadrados (>= 3 pares no colineales). */
export function affineLS(src, dst) {
  if (src.length < 3) return null;
  // Normal equations para [a b c] y [d e f] con filas [x y 1]
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (let i = 0; i < src.length; i++) {
    const r = [src[i][0], src[i][1], 1];
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) A[j][k] += r[j] * r[k];
      bx[j] += r[j] * dst[i][0];
      by[j] += r[j] * dst[i][1];
    }
  }
  const sx = solve3(A, bx), sy = solve3(A, by);
  if (!sx || !sy) return null;
  return [sx[0], sx[1], sx[2], sy[0], sy[1], sy[2], 0, 0, 1];
}

function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-9) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/** Homografía por DLT normalizado (>= 4 pares). Jacobi para el autovector menor de AᵀA. */
export function homographyDLT(src, dst) {
  if (src.length < 4) return null;
  const norm = pts => {
    const n = pts.length, cx = pts.reduce((s, p) => s + p[0], 0) / n, cy = pts.reduce((s, p) => s + p[1], 0) / n;
    const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / n || 1;
    const k = Math.SQRT2 / d;
    return { T: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1], p: pts.map(q => [k * (q[0] - cx), k * (q[1] - cy)]) };
  };
  const a = norm(src), b = norm(dst);
  const AtA = Array.from({ length: 9 }, () => new Float64Array(9));
  for (let i = 0; i < src.length; i++) {
    const [x, y] = a.p[i], [u, v] = b.p[i];
    for (const r of [[-x, -y, -1, 0, 0, 0, u * x, u * y, u], [0, 0, 0, -x, -y, -1, v * x, v * y, v]]) {
      for (let j = 0; j < 9; j++) for (let k = 0; k < 9; k++) AtA[j][k] += r[j] * r[k];
    }
  }
  const h = smallestEigvec(AtA);
  if (!h) return null;
  const H = mul(inv3(b.T), mul(h, a.T));
  return H[8] ? H.map(v => v / H[8]) : null;
}

function smallestEigvec(S) {
  const n = 9, A = S.map(r => Array.from(r)), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  let m = 0;
  for (let i = 1; i < n; i++) if (A[i][i] < A[m][m]) m = i;
  return V.map(r => r[m]);
}

export function mul(A, B) {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
}

export function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(v => v / det);
}

export const rectCorners = ([x, y, w, h]) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export const rectCenter = ([x, y, w, h]) => [x + w / 2, y + h / 2];
export const bboxOf = pts => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])),
  Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
export const boxCenter = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

export function iou(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - ix * iy;
  return u > 0 ? (ix * iy) / u : 0;
}

/** Área con signo (positivo = antihorario en coordenadas de pantalla con y hacia abajo invertida). */
export function signedArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

export function isConvex(p) {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) continue;
    if (!sign) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

/** Escala local media (px por mm) de la transformación en un punto del mapa. */
export function localScale(M, [x, y]) {
  const p = apply(M, [x, y]), px = apply(M, [x + 1, y]), py = apply(M, [x, y + 1]);
  return Math.sqrt(Math.abs((px[0] - p[0]) * (py[1] - p[1]) - (px[1] - p[1]) * (py[0] - p[0])));
}
