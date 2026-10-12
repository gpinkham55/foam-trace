import type { Pt, Rect } from "../core/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const TAP_SLOP_PX = 5;

export interface DragHandler {
  /** Called on pointerdown over an element with data-handle. Return true to take the drag. */
  start(handle: SVGElement, p: Pt): boolean;
  move(p: Pt): void;
  /** moved=false means it was a tap on the handle. */
  end(moved: boolean): void;
}

type Mode = "none" | "pan" | "handle" | "pinch";

/** An SVG canvas with an image underlay, an overlay group, and pan/zoom (mouse, wheel, touch). */
export class Viewer {
  readonly svg: SVGSVGElement;
  readonly image: SVGImageElement;
  readonly overlay: SVGGElement;
  onTap: ((p: Pt) => void) | null = null;
  onView: (() => void) | null = null;
  drag: DragHandler | null = null;

  private cx = 0;
  private cy = 0;
  /** World units per CSS pixel. */
  private scale = 1;
  private world: Rect = { x: 0, y: 0, w: 100, h: 100 };
  private pointers = new Map<number, { x: number; y: number }>();
  private mode: Mode = "none";
  private down = { x: 0, y: 0 };
  private moved = false;
  private pinch = { dist: 1, scale: 1, world: { x: 0, y: 0 } };

  constructor(container: HTMLElement) {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.classList.add("viewer");
    this.image = document.createElementNS(SVG_NS, "image");
    this.image.setAttribute("preserveAspectRatio", "none");
    this.overlay = document.createElementNS(SVG_NS, "g");
    this.svg.append(this.image, this.overlay);
    container.append(this.svg);

    new ResizeObserver(() => this.apply()).observe(this.svg);
    this.svg.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.svg.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.svg.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.svg.addEventListener("pointercancel", (e) => this.pointerUp(e, true));
    this.svg.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
  }

  /** World units per screen pixel; use it to size handles. */
  get unitsPerPx(): number {
    return this.scale;
  }

  setImage(url: string | null, rect: Rect): void {
    if (url) {
      this.image.setAttribute("href", url);
      this.image.setAttribute("x", String(rect.x));
      this.image.setAttribute("y", String(rect.y));
      this.image.setAttribute("width", String(rect.w));
      this.image.setAttribute("height", String(rect.h));
      this.image.style.display = "";
    } else {
      this.image.style.display = "none";
    }
  }

  showImage(show: boolean): void {
    this.image.style.visibility = show ? "visible" : "hidden";
  }

  /** Set the world extent and zoom to fit it. */
  setWorld(rect: Rect): void {
    this.world = rect;
    this.fit();
  }

  fit(): void {
    const { width, height } = this.size();
    const pad = 0.95;
    this.scale = Math.max(this.world.w / (width * pad), this.world.h / (height * pad), 1e-6);
    this.cx = this.world.x + this.world.w / 2;
    this.cy = this.world.y + this.world.h / 2;
    this.apply();
  }

  zoomBy(factor: number): void {
    this.zoomAt({ x: this.cx, y: this.cy }, this.scale / factor);
  }

  toWorld(clientX: number, clientY: number): Pt {
    const r = this.svg.getBoundingClientRect();
    return {
      x: this.cx + (clientX - r.left - r.width / 2) * this.scale,
      y: this.cy + (clientY - r.top - r.height / 2) * this.scale,
    };
  }

  private size() {
    return { width: Math.max(1, this.svg.clientWidth), height: Math.max(1, this.svg.clientHeight) };
  }

  private apply(): void {
    const { width, height } = this.size();
    const w = width * this.scale, h = height * this.scale;
    this.svg.setAttribute("viewBox", `${this.cx - w / 2} ${this.cy - h / 2} ${w} ${h}`);
    this.onView?.();
  }

  /** Change scale, keeping world point p fixed on screen. */
  private zoomAt(p: Pt, newScale: number): void {
    const max = Math.max(this.world.w, this.world.h) / 50;
    const min = max / 2000;
    newScale = Math.min(max, Math.max(min, newScale));
    const k = newScale / this.scale;
    this.cx = p.x - (p.x - this.cx) * k;
    this.cy = p.y - (p.y - this.cy) * k;
    this.scale = newScale;
    this.apply();
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.toWorld(e.clientX, e.clientY);
    this.zoomAt(p, this.scale * Math.exp(e.deltaY * 0.0015));
  }

  private pointerDown(e: PointerEvent): void {
    this.svg.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.down = { x: e.clientX, y: e.clientY };
      this.moved = false;
      const handle = (e.target as Element).closest?.("[data-handle]") as SVGElement | null;
      const p = this.toWorld(e.clientX, e.clientY);
      this.mode = handle && this.drag?.start(handle, p) ? "handle" : "pan";
    } else if (this.pointers.size === 2) {
      if (this.mode === "handle") this.drag?.end(true);
      const [a, b] = [...this.pointers.values()];
      this.mode = "pinch";
      this.moved = true;
      this.pinch = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        scale: this.scale,
        world: this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
  }

  private pointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > TAP_SLOP_PX) this.moved = true;
    if (this.mode === "handle") {
      if (this.moved) this.drag?.move(this.toWorld(e.clientX, e.clientY));
    } else if (this.mode === "pan" && this.moved) {
      this.cx -= (e.clientX - prev.x) * this.scale;
      this.cy -= (e.clientY - prev.y) * this.scale;
      this.apply();
    } else if (this.mode === "pinch" && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      // Scale about the original pinch point, then move it under the fingers' midpoint.
      this.scale = this.pinch.scale * (this.pinch.dist / dist);
      const r = this.svg.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left - r.width / 2;
      const my = (a.y + b.y) / 2 - r.top - r.height / 2;
      this.cx = this.pinch.world.x - mx * this.scale;
      this.cy = this.pinch.world.y - my * this.scale;
      this.apply();
    }
  }

  private pointerUp(e: PointerEvent, cancelled = false): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === "handle") {
      this.drag?.end(this.moved);
      this.mode = "none";
    } else if (this.mode === "pan") {
      if (!this.moved && !cancelled) this.onTap?.(this.toWorld(e.clientX, e.clientY));
      this.mode = "none";
    } else if (this.mode === "pinch" && this.pointers.size < 2) {
      // Wait for all fingers to lift so the remaining one doesn't start a pan with a jump.
      this.mode = this.pointers.size === 0 ? "none" : "pinch";
    }
  }
}

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
