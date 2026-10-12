import { applyH, homographyFromPoints, invertH, projectiveW, type Mat3 } from "./homography";
import type { Pt, Rect } from "./types";

export interface Calibration {
  /** Photo pixel -> mm. The calibration rectangle's first corner is the mm origin. */
  imgToMm: Mat3;
  mmToImg: Mat3;
  /** The clicked rectangle in mm. */
  rectMm: Rect;
}

/**
 * Sort 4 clicked points into top-left, top-right, bottom-right, bottom-left
 * (clockwise on screen, image y pointing down).
 */
export function orderCorners(pts: Pt[]): Pt[] {
  if (pts.length !== 4) throw new Error("Need 4 corners");
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  }
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]);
}

/**
 * Build the photo->mm mapping from 4 clicked grid corners.
 * squaresX counts squares along the top edge, squaresY along the side edge.
 */
export function calibrate(corners: Pt[], squaresX: number, squaresY: number, gridMm: number): Calibration {
  if (!(squaresX > 0 && squaresY > 0 && gridMm > 0)) throw new Error("Grid counts and size must be positive");
  const ordered = orderCorners(corners);
  const w = squaresX * gridMm;
  const h = squaresY * gridMm;
  const dst = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const imgToMm = homographyFromPoints(ordered, dst);
  return { imgToMm, mmToImg: invertH(imgToMm), rectMm: { x: 0, y: 0, w, h } };
}

/**
 * The mm-space area the photo covers, clamped to a sane range around the
 * calibration rectangle (strong tilt can push far corners towards infinity).
 */
export function photoBoundsMm(cal: Calibration, imgW: number, imgH: number): Rect {
  const r = cal.rectMm;
  const span = Math.max(r.w, r.h) * 2;
  const lim = { minX: r.x - span, minY: r.y - span, maxX: r.x + r.w + span, maxY: r.y + r.h + span };
  const pts = [
    { x: 0, y: 0 },
    { x: imgW, y: 0 },
    { x: imgW, y: imgH },
    { x: 0, y: imgH },
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (projectiveW(cal.imgToMm, p) <= 0) {
      minX = Math.min(minX, lim.minX); minY = Math.min(minY, lim.minY);
      maxX = Math.max(maxX, lim.maxX); maxY = Math.max(maxY, lim.maxY);
      continue;
    }
    const m = applyH(cal.imgToMm, p);
    minX = Math.min(minX, m.x); minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x); maxY = Math.max(maxY, m.y);
  }
  minX = Math.max(minX, lim.minX); minY = Math.max(minY, lim.minY);
  maxX = Math.min(maxX, lim.maxX); maxY = Math.min(maxY, lim.maxY);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
