export interface Pt {
  x: number;
  y: number;
}

/** Closed polygon; the last point connects back to the first. */
export type Ring = Pt[];

/** 8-bit grayscale image, row-major. */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
