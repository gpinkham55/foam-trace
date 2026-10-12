import { describe, expect, it } from "vitest";
import { area, bbox, offsetRing, simplifyRing, unionRings } from "../src/core/polygon";
import { makePocket } from "../src/core/pockets";
import { buildSvg } from "../src/core/svg";
import type { Ring } from "../src/core/types";

const square = (x: number, y: number, s: number): Ring => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
];

describe("polygon helpers", () => {
  it("offsets a square outward with round corners", () => {
    const [r] = offsetRing(square(0, 0, 10), 2);
    const b = bbox([r]);
    expect(b.w).toBeCloseTo(14, 2);
    // 10x10 + four 10x2 strips + a full circle of radius 2.
    expect(area(r)).toBeCloseTo(100 + 80 + Math.PI * 4, 0);
  });

  it("simplifies collinear points away", () => {
    const pts: Ring = [];
    for (let i = 0; i < 10; i++) pts.push({ x: i, y: 0 });
    for (let i = 0; i < 10; i++) pts.push({ x: 10, y: i });
    for (let i = 10; i > 0; i--) pts.push({ x: i, y: 10 });
    for (let i = 10; i > 0; i--) pts.push({ x: 0, y: i });
    expect(simplifyRing(pts, 0.01).length).toBe(4);
  });

  it("merges overlapping rings", () => {
    expect(unionRings([square(0, 0, 10), square(5, 5, 10)]).length).toBe(1);
    expect(unionRings([square(0, 0, 10), square(50, 50, 10)]).length).toBe(2);
  });
});

describe("makePocket", () => {
  it("adds clearance on every side", () => {
    const p = makePocket(square(0, 0, 20), { clearanceMm: 1.5, smoothingMm: 0 })!;
    const b = bbox([p]);
    expect(b.x).toBeCloseTo(-1.5, 1);
    expect(b.w).toBeCloseTo(23, 1);
  });

  it("smoothing fills notches but never shrinks the pocket", () => {
    // An L shape: the inside corner gets rounded over, area only grows.
    const L: Ring = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 40 }, { x: 0, y: 40 }];
    const sharp = makePocket(L, { clearanceMm: 1, smoothingMm: 0 })!;
    const smooth = makePocket(L, { clearanceMm: 1, smoothingMm: 3 })!;
    expect(area(smooth)).toBeGreaterThan(area(sharp));
    expect(bbox([smooth]).w).toBeCloseTo(bbox([sharp]).w, 1);
  });
});

describe("buildSvg", () => {
  it("writes mm units and both layers", () => {
    const svg = buildSvg({ pockets: [square(10, 10, 20)], boundary: { x: 0, y: 0, w: 100, h: 50 } });
    expect(svg).toContain('width="100mm"');
    expect(svg).toContain('height="50mm"');
    expect(svg).toContain('inkscape:label="pockets"');
    expect(svg).toContain('inkscape:label="boundary"');
    const d = svg.match(/id="pocket-1" d="([^"]+)"/)![1];
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    for (const corner of ["10 10", "30 10", "30 30", "10 30"]) expect(d).toContain(corner);
  });
});
