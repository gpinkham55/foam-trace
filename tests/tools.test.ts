import { describe, expect, it } from "vitest";
import { fitBoundary, hitTool, insertPoint, nearestEdge, outside, removePoint, type Tool } from "../src/core/tools";
import type { Ring } from "../src/core/types";

const sq = (x: number, y: number, s: number): Ring => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
];

describe("tool editing", () => {
  it("finds the nearest edge and inserts on it", () => {
    const r = sq(0, 0, 10);
    const e = nearestEdge(r, { x: 5, y: -1 });
    expect(e.index).toBe(0);
    expect(e.point).toEqual({ x: 5, y: 0 });
    expect(insertPoint(r, e.index, e.point)[1]).toEqual({ x: 5, y: 0 });
  });

  it("never removes below 3 points", () => {
    const tri = removePoint(sq(0, 0, 10), 0);
    expect(tri.length).toBe(3);
    expect(removePoint(tri, 0).length).toBe(3);
  });

  it("hit-tests the smallest containing pocket", () => {
    const tools: Tool[] = [
      { id: 1, silhouette: [], pocket: sq(0, 0, 100), edited: false },
      { id: 2, silhouette: [], pocket: sq(10, 10, 10), edited: false },
    ];
    expect(hitTool(tools, { x: 15, y: 15 })?.id).toBe(2);
    expect(hitTool(tools, { x: 50, y: 50 })?.id).toBe(1);
    expect(hitTool(tools, { x: 500, y: 50 })).toBeNull();
  });

  it("fits a boundary snapped to whole mm", () => {
    const b = fitBoundary([sq(10.4, 20.6, 30)], 10)!;
    expect(b).toEqual({ x: 0, y: 10, w: 51, h: 51 });
    expect(outside([sq(10.4, 20.6, 30)], b)).toBe(false);
    expect(outside([sq(10.4, 20.6, 30)], { x: 20, y: 0, w: 10, h: 10 })).toBe(true);
  });
});
