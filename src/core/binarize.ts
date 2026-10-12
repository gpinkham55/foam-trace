import type { Gray } from "./types";

/** Otsu's threshold: the gray level that best splits the histogram in two. */
export function otsu(g: Gray): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0, wB = 0, best = 0, bestT = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  // Pixels at or below bestT are the dark class; threshold() uses "< t".
  return bestT + 1;
}

/** 1 where the pixel is darker than t (tool), 0 elsewhere (light). */
export function threshold(g: Gray, t: number): Uint8Array {
  const out = new Uint8Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = g.data[i] < t ? 1 : 0;
  return out;
}

/** Summed-area table with a zero border row and column. */
function integral(mask: Uint8Array, w: number, h: number): Uint32Array {
  const W = w + 1;
  const s = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row;
    }
  }
  return s;
}

function boxSum(s: Uint32Array, w: number, h: number, x: number, y: number, r: number): number {
  const W = w + 1;
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
  return s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
}

/** Binary erosion with a (2r+1) square. Off-image counts as empty. */
export function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const s = integral(mask, w, h);
  const full = (2 * r + 1) * (2 * r + 1);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = boxSum(s, w, h, x, y, r) === full ? 1 : 0;
  return out;
}

/** Binary dilation with a (2r+1) square. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const s = integral(mask, w, h);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = boxSum(s, w, h, x, y, r) > 0 ? 1 : 0;
  return out;
}

/** Morphological opening: removes dark features thinner than 2r+1 pixels (grid lines). */
export function open(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return dilate(erode(mask, w, h, r), w, h, r);
}
