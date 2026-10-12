import { largest, offsetRing, simplifyRing } from "./polygon";
import type { Ring } from "./types";

export interface PocketParams {
  /** Gap between tool and foam, in mm. */
  clearanceMm: number;
  /** Radius used to round off inside corners and notches, in mm. */
  smoothingMm: number;
}

export const DEFAULT_POCKET: PocketParams = { clearanceMm: 1.5, smoothingMm: 1 };

/**
 * Pocket = silhouette grown by the clearance, then closed with the smoothing radius.
 * Closing (grow by s, shrink by s) only ever adds area, so the pocket never cuts
 * into the clearance zone.
 */
export function makePocket(silhouette: Ring, p: PocketParams): Ring | null {
  const c = Math.max(0, p.clearanceMm);
  const s = Math.max(0, p.smoothingMm);
  let ring = largest(offsetRing(silhouette, c + s));
  if (!ring) return null;
  if (s > 0) ring = largest(offsetRing(ring, -s));
  if (!ring) return null;
  return simplifyRing(ring, 0.05);
}
