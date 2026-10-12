import { contours } from "d3-contour";
import { open, otsu, threshold } from "./binarize";
import { area, bbox, simplifyRing } from "./polygon";
import type { Ring } from "./types";
import type { Warped } from "./warp";

export interface TraceParams {
  /** Gray level below which a pixel counts as tool. null = automatic (Otsu). */
  threshold: number | null;
  /** Dark features thinner than about twice this are removed (grid lines). */
  gridRemovalMm: number;
  /** Blobs smaller than this are ignored. */
  minAreaMm2: number;
}

export const DEFAULT_TRACE: TraceParams = { threshold: null, gridRemovalMm: 0.75, minAreaMm2: 100 };

export interface TraceResult {
  /** Tool outlines in mm. */
  silhouettes: Ring[];
  thresholdUsed: number;
}

/** Find dark tool silhouettes in a top-down image and return their outer outlines in mm. */
export function traceTools(warped: Warped, params: TraceParams): TraceResult {
  const { gray, pxPerMm, originMm } = warped;
  const { width: w, height: h } = gray;
  const t = params.threshold ?? otsu(gray);
  let mask = threshold(gray, t);
  const r = Math.round(params.gridRemovalMm * pxPerMm);
  if (r > 0) mask = open(mask, w, h, r);

  const multi = contours().size([w, h]).thresholds([0.5]).smooth(true)(mask as unknown as number[])[0];
  const silhouettes: Ring[] = [];
  for (const poly of multi?.coordinates ?? []) {
    const outer = poly[0];
    if (!outer || outer.length < 4) continue;
    // Blobs touching the image edge are the unlit surround, not tools.
    const pxBox = bbox([outer.map(([x, y]) => ({ x, y }))]);
    if (pxBox.x <= 1 || pxBox.y <= 1 || pxBox.x + pxBox.w >= w - 1 || pxBox.y + pxBox.h >= h - 1) continue;
    // d3-contour repeats the first point at the end; drop it.
    const ring: Ring = outer.slice(0, -1).map(([x, y]) => ({ x: originMm.x + x / pxPerMm, y: originMm.y + y / pxPerMm }));
    if (area(ring) < params.minAreaMm2) continue;
    // Remove pixel staircase noise; well under one pixel.
    silhouettes.push(simplifyRing(ring, 0.25 / pxPerMm));
  }
  silhouettes.sort((a, b) => area(b) - area(a));
  return { silhouettes, thresholdUsed: t };
}
