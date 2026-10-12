import { bbox, unionRings } from "./polygon";
import type { Rect, Ring } from "./types";

export interface ExportInput {
  pockets: Ring[];
  boundary: Rect | null;
}

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

function pathData(r: Ring, dx: number, dy: number): string {
  return "M" + r.map((p) => `${n(p.x - dx)} ${n(p.y - dy)}`).join(" L") + " Z";
}

/**
 * Build an SVG in millimetres with two Inkscape-style layers:
 * "pockets" (one closed path per tool, overlaps merged) and "boundary".
 */
export function buildSvg({ pockets, boundary }: ExportInput): string {
  const merged = unionRings(pockets);
  const boundaryRing: Ring[] = boundary
    ? [[
        { x: boundary.x, y: boundary.y },
        { x: boundary.x + boundary.w, y: boundary.y },
        { x: boundary.x + boundary.w, y: boundary.y + boundary.h },
        { x: boundary.x, y: boundary.y + boundary.h },
      ]]
    : [];
  const page = bbox([...merged, ...boundaryRing]);
  const dx = page.x, dy = page.y;
  const pocketPaths = merged
    .map((r, i) => `    <path id="pocket-${i + 1}" d="${pathData(r, dx, dy)}"/>`)
    .join("\n");
  const boundaryPaths = boundaryRing.map((r) => `    <path id="boundary-outline" d="${pathData(r, dx, dy)}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="${n(page.w)}mm" height="${n(page.h)}mm" viewBox="0 0 ${n(page.w)} ${n(page.h)}">
  <g id="pockets" inkscape:groupmode="layer" inkscape:label="pockets" fill="none" stroke="#ff0000" stroke-width="0.1">
${pocketPaths}
  </g>
  <g id="boundary" inkscape:groupmode="layer" inkscape:label="boundary" fill="none" stroke="#0000ff" stroke-width="0.1">
${boundaryPaths}
  </g>
</svg>
`;
}

/** Number of separate pockets after merging; less than the input count means some overlap. */
export function mergedCount(pockets: Ring[]): number {
  return unionRings(pockets).length;
}
