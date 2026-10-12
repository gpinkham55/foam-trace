import { describe, expect, it } from "vitest";
import { applyH, homographyFromPoints, invertH } from "../src/core/homography";
import { calibrate, orderCorners } from "../src/core/calibration";

describe("homography", () => {
  const src = [{ x: 10, y: 20 }, { x: 410, y: 40 }, { x: 380, y: 300 }, { x: 30, y: 280 }];
  const dst = [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 100 }, { x: 0, y: 100 }];

  it("maps the four source points onto the destination points", () => {
    const h = homographyFromPoints(src, dst);
    src.forEach((p, i) => {
      const q = applyH(h, p);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it("inverts", () => {
    const h = homographyFromPoints(src, dst);
    const back = applyH(invertH(h), applyH(h, { x: 200, y: 150 }));
    expect(back.x).toBeCloseTo(200, 6);
    expect(back.y).toBeCloseTo(150, 6);
  });

  it("rejects collinear points", () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(() => homographyFromPoints(line, dst)).toThrow();
  });
});

describe("orderCorners", () => {
  it("returns TL, TR, BR, BL whatever the click order", () => {
    const tl = { x: 10, y: 12 }, tr = { x: 400, y: 30 }, br = { x: 390, y: 300 }, bl = { x: 20, y: 290 };
    expect(orderCorners([br, tl, bl, tr])).toEqual([tl, tr, br, bl]);
  });
});

describe("calibrate", () => {
  it("sizes the full 11 x 17 in sheet of quarter-inch squares", () => {
    const corners = [{ x: 50, y: 40 }, { x: 1700, y: 60 }, { x: 1680, y: 1100 }, { x: 40, y: 1080 }];
    const cal = calibrate(corners, 68, 44, 0.25 * 25.4);
    expect(cal.rectMm.w).toBeCloseTo(431.8, 6);
    expect(cal.rectMm.h).toBeCloseTo(279.4, 6);
    const far = applyH(cal.imgToMm, corners[2]);
    expect(far.x).toBeCloseTo(431.8, 6);
    expect(far.y).toBeCloseTo(279.4, 6);
  });
});
