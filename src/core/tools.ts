import { area, bbox, pointInRing, segmentDistance } from "./polygon";
import type { Pt, Rect, Ring } from "./types";

export interface Tool {
  id: number;
  /** Traced outline of the tool itself, mm. */
  silhouette: Ring;
  /** Cut path: silhouette plus clearance, possibly hand-edited, mm. */
  pocket: Ring;
  /** Hand-edited pockets are not regenerated when clearance or smoothing change. */
  edited: boolean;
}

/** Closest edge of a ring to p. A new point belongs after `index`. */
export function nearestEdge(r: Ring, p: Pt): { index: number; point: Pt; d: number } {
  let best = { index: 0, point: r[0], d: Infinity };
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const { d, t } = segmentDistance(p, a, b);
    if (d < best.d) best = { index: i, point: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, d };
  }
  return best;
}

export function insertPoint(r: Ring, afterIndex: number, p: Pt): Ring {
  return [...r.slice(0, afterIndex + 1), p, ...r.slice(afterIndex + 1)];
}

/** Remove a point; a ring keeps at least 3 points. */
export function removePoint(r: Ring, i: number): Ring {
  if (r.length <= 3) return r;
  return r.filter((_, k) => k !== i);
}

/** The tool whose pocket contains p; the smallest wins when pockets overlap. */
export function hitTool(tools: Tool[], p: Pt): Tool | null {
  let best: Tool | null = null, bestA = Infinity;
  for (const t of tools) {
    if (!pointInRing(p, t.pocket)) continue;
    const a = area(t.pocket);
    if (a < bestA) {
      bestA = a;
      best = t;
    }
  }
  return best;
}

/** Bounding box of all pockets plus a margin, snapped outward to whole mm. */
export function fitBoundary(pockets: Ring[], marginMm: number): Rect | null {
  if (pockets.length === 0) return null;
  const b = bbox(pockets);
  const x = Math.floor(b.x - marginMm), y = Math.floor(b.y - marginMm);
  return { x, y, w: Math.ceil(b.x + b.w + marginMm) - x, h: Math.ceil(b.y + b.h + marginMm) - y };
}

/** True if any pocket point lies outside the rectangle. */
export function outside(pockets: Ring[], r: Rect): boolean {
  return pockets.some((ring) => ring.some((p) => p.x < r.x || p.y < r.y || p.x > r.x + r.w || p.y > r.y + r.h));
}
