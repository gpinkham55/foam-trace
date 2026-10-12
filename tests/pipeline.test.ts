import { describe, expect, it } from "vitest";
import { calibrate, photoBoundsMm } from "../src/core/calibration";
import { applyH, homographyFromPoints, invertH } from "../src/core/homography";
import { bbox } from "../src/core/polygon";
import { makePocket } from "../src/core/pockets";
import { traceTools, DEFAULT_TRACE } from "../src/core/trace";
import type { Gray, Pt } from "../src/core/types";
import { choosePxPerMm, warpToMm } from "../src/core/warp";

/**
 * A synthetic backlit scene in mm: light panel 0..200 x 0..150 with dark 5 mm grid
 * lines, a 100 x 40 mm bar at (31.2, 31.7) and a 40 mm disc centred at (151.3, 101.6).
 * Shapes sit off the grid lines, as real tools do.
 * Outside the panel is the dark unlit surround.
 */
function scene(p: Pt): number {
  if (p.x < 0 || p.y < 0 || p.x > 200 || p.y > 150) return 30;
  if (p.x >= 31.2 && p.x <= 131.2 && p.y >= 31.7 && p.y <= 71.7) return 15;
  if (Math.hypot(p.x - 151.3, p.y - 101.6) <= 20) return 15;
  const gx = p.x % 5, gy = p.y % 5;
  if (gx < 0.4 || gy < 0.4) return 110;
  return 235;
}

/** Render the scene as seen by a tilted camera, 4x supersampled. */
function photograph(mmToPhoto: number[], w: number, h: number): Gray {
  const photoToMm = invertH(mmToPhoto);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]])
        s += scene(applyH(photoToMm, { x: x + ox, y: y + oy }));
      data[y * w + x] = Math.round(s / 4);
    }
  return { width: w, height: h, data };
}

describe("end to end on a tilted synthetic photo", () => {
  // Panel corners as they land in a 1000 x 800 photo taken at an angle.
  const panelMm = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }];
  const panelPhoto = [{ x: 120, y: 90 }, { x: 900, y: 140 }, { x: 860, y: 720 }, { x: 80, y: 650 }];
  const mmToPhoto = homographyFromPoints(panelMm, panelPhoto);
  const photo = photograph(mmToPhoto, 1000, 800);

  // The user clicks the corners of a 30 x 20 square block starting at grid (10, 10) mm.
  const clickMm = [{ x: 10, y: 10 }, { x: 160, y: 10 }, { x: 160, y: 110 }, { x: 10, y: 110 }];
  const clicks = clickMm.map((p) => applyH(mmToPhoto, p));
  const cal = calibrate([clicks[2], clicks[0], clicks[3], clicks[1]], 30, 20, 5);
  const bounds = photoBoundsMm(cal, photo.width, photo.height);
  const warped = warpToMm(photo, cal.mmToImg, bounds, choosePxPerMm(bounds));
  const { silhouettes } = traceTools(warped, DEFAULT_TRACE);

  it("finds exactly the two tools", () => {
    expect(silhouettes.length).toBe(2);
  });

  it("measures the bar within 0.5 mm", () => {
    // Calibration origin is grid (10, 10), so the bar sits at (21.2, 21.7) in calibrated mm.
    const b = bbox([silhouettes[0]]);
    expect(Math.abs(b.w - 100)).toBeLessThan(0.5);
    expect(Math.abs(b.h - 40)).toBeLessThan(0.5);
    expect(Math.abs(b.x - 21.2)).toBeLessThan(0.5);
    expect(Math.abs(b.y - 21.7)).toBeLessThan(0.5);
  });

  it("measures the disc within 0.5 mm", () => {
    const b = bbox([silhouettes[1]]);
    expect(Math.abs(b.w - 40)).toBeLessThan(0.5);
    expect(Math.abs(b.h - 40)).toBeLessThan(0.5);
  });

  it("pockets add the clearance", () => {
    const pocket = makePocket(silhouettes[0], { clearanceMm: 1.5, smoothingMm: 1 })!;
    const b = bbox([pocket]);
    expect(Math.abs(b.w - 103)).toBeLessThan(0.6);
    expect(Math.abs(b.h - 43)).toBeLessThan(0.6);
  });
});
