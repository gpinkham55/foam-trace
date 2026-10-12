import { applyH, type Mat3 } from "./homography";
import type { Gray, Pt, Rect } from "./types";

/** A top-down image where pixel (i, j) covers mm [origin + i/ppm, origin + (i+1)/ppm). */
export interface Warped {
  gray: Gray;
  pxPerMm: number;
  originMm: Pt;
}

/** Pixels outside the photo are filled with this (bright = background). */
export const OUTSIDE = 255;

export function choosePxPerMm(bounds: Rect, target = 4, maxPx = 4000): number {
  const dim = Math.max(bounds.w, bounds.h);
  return Math.min(target, maxPx / dim);
}

/** Resample the photo into mm space with bilinear interpolation. */
export function warpToMm(src: Gray, mmToImg: Mat3, bounds: Rect, pxPerMm: number): Warped {
  const width = Math.max(1, Math.ceil(bounds.w * pxPerMm));
  const height = Math.max(1, Math.ceil(bounds.h * pxPerMm));
  const out = new Uint8Array(width * height);
  const sw = src.width, sh = src.height, sd = src.data;
  for (let j = 0; j < height; j++) {
    const my = bounds.y + (j + 0.5) / pxPerMm;
    for (let i = 0; i < width; i++) {
      const mx = bounds.x + (i + 0.5) / pxPerMm;
      const p = applyH(mmToImg, { x: mx, y: my });
      // Photo pixel centres sit at +0.5.
      const fx = p.x - 0.5, fy = p.y - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      if (!(x0 >= 0 && y0 >= 0 && x0 + 1 < sw && y0 + 1 < sh)) {
        out[j * width + i] = OUTSIDE;
        continue;
      }
      const tx = fx - x0, ty = fy - y0;
      const k = y0 * sw + x0;
      const top = sd[k] * (1 - tx) + sd[k + 1] * tx;
      const bot = sd[k + sw] * (1 - tx) + sd[k + sw + 1] * tx;
      out[j * width + i] = Math.round(top * (1 - ty) + bot * ty);
    }
  }
  return { gray: { width, height, data: out }, pxPerMm, originMm: { x: bounds.x, y: bounds.y } };
}
