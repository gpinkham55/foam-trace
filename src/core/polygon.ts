import ClipperLib from "clipper-lib";
import type { Pt, Rect, Ring } from "./types";

/** Clipper works in integers; 1000 units per mm gives micron precision. */
const SCALE = 1000;

export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x + r[i].x) * (r[j].y - r[i].y);
  return a / 2;
}

export function area(r: Ring): number {
  return Math.abs(signedArea(r));
}

export function bbox(rings: Ring[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings)
    for (const p of r) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from p to segment ab, and the parameter t of the closest point. */
export function segmentDistance(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

/** Ramer-Douglas-Peucker on an open polyline. */
function rdpOpen(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const { d } = segmentDistance(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** RDP on a closed ring, anchored at point 0 and the point farthest from it. */
export function simplifyRing(r: Ring, tol: number): Ring {
  if (r.length < 4 || tol <= 0) return r.slice();
  let far = 0, farD = -1;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i].x - r[0].x, r[i].y - r[0].y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = rdpOpen(r.slice(0, far + 1), tol);
  const b = rdpOpen([...r.slice(far), r[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

const toPath = (r: Ring) => r.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
const fromPath = (p: { X: number; Y: number }[]): Ring => p.map((q) => ({ x: q.X / SCALE, y: q.Y / SCALE }));

/** Offset a ring outward (delta > 0) or inward (delta < 0) with round joins. Returns outer rings only. */
export function offsetRing(r: Ring, deltaMm: number, arcTolMm = 0.05): Ring[] {
  if (deltaMm === 0) return [r.slice()];
  const co = new ClipperLib.ClipperOffset(2, arcTolMm * SCALE);
  co.AddPath(toPath(r), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out: { X: number; Y: number }[][] = [];
  co.Execute(out, deltaMm * SCALE);
  // Outer rings keep the input orientation's sign after Clipper normalises to positive.
  return out.filter((p) => ClipperLib.Clipper.Area(p) > 0).map(fromPath);
}

export function largest(rings: Ring[]): Ring | null {
  let best: Ring | null = null, bestA = 0;
  for (const r of rings) {
    const a = area(r);
    if (a > bestA) {
      bestA = a;
      best = r;
    }
  }
  return best;
}

/** Merge overlapping rings. Returns outer boundaries only (holes dropped). */
export function unionRings(rings: Ring[]): Ring[] {
  if (rings.length === 0) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(rings.map(toPath), ClipperLib.PolyType.ptSubject, true);
  const out: { X: number; Y: number }[][] = [];
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out.filter((p) => ClipperLib.Clipper.Area(p) > 0).map(fromPath);
}
