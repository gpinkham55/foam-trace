declare module "clipper-lib" {
  export interface IntPoint { X: number; Y: number }
  export type Path = IntPoint[];
  export type Paths = Path[];
  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: Path, joinType: number, endType: number): void;
    AddPaths(paths: Paths, joinType: number, endType: number): void;
    Execute(solution: Paths, delta: number): void;
  }
  export class Clipper {
    constructor(initOptions?: number);
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean;
    Execute(clipType: number, solution: Paths, subjFillType?: number, clipFillType?: number): boolean;
    static Area(path: Path): number;
  }
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
  export const EndType: { etClosedPolygon: number; etClosedLine: number; etOpenButt: number; etOpenSquare: number; etOpenRound: number };
  export const ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
  export const PolyType: { ptSubject: number; ptClip: number };
  export const PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number };
  const ClipperLib: {
    ClipperOffset: typeof ClipperOffset;
    Clipper: typeof Clipper;
    JoinType: typeof JoinType;
    EndType: typeof EndType;
    ClipType: typeof ClipType;
    PolyType: typeof PolyType;
    PolyFillType: typeof PolyFillType;
  };
  export default ClipperLib;
}
