import "./style.css";
import { calibrate, photoBoundsMm, type Calibration } from "./core/calibration";
import { applyH } from "./core/homography";
import { bbox } from "./core/polygon";
import { DEFAULT_POCKET, makePocket } from "./core/pockets";
import { buildSvg, mergedCount } from "./core/svg";
import { fitBoundary, hitTool, insertPoint, nearestEdge, outside, removePoint, type Tool } from "./core/tools";
import { DEFAULT_TRACE, traceTools } from "./core/trace";
import type { Pt, Rect, Ring } from "./core/types";
import { choosePxPerMm, warpToMm, type Warped } from "./core/warp";
import { download, grayUrl, loadPhoto, type Photo } from "./ui/image";
import { el, Viewer } from "./ui/viewer";

type Step = 1 | 2 | 3;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const num = (id: string) => parseFloat(input(id).value);

const state = {
  step: 1 as Step,
  photo: null as Photo | null,
  /** Clicked calibration corners in photo pixels, in click order. */
  corners: [] as Pt[],
  warped: null as Warped | null,
  warpedUrl: null as string | null,
  /** Calibration inputs the current warp was made from. */
  warpKey: "",
  trace: { ...DEFAULT_TRACE },
  pocket: { ...DEFAULT_POCKET },
  thresholdUsed: 128,
  tools: [] as Tool[],
  deletedCount: 0,
  nextId: 1,
  selected: null as number | null,
  selPoint: null as number | null,
  boundary: null as Rect | null,
  boundaryAuto: true,
};

const viewer = new Viewer($("viewer"));

// ---------- helpers ----------

const isDirty = () => state.deletedCount > 0 || state.tools.some((t) => t.edited);
const selectedTool = () => state.tools.find((t) => t.id === state.selected) ?? null;
const calKey = () => JSON.stringify([state.corners, num("sq-x"), num("sq-y"), num("grid-mm")]);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const fmt = (v: number, d = 1) => v.toFixed(d);

function busy(on: boolean): void {
  $("busy").hidden = !on;
}

function previewCalibration(): Calibration | null {
  if (state.corners.length !== 4) return null;
  try {
    return calibrate(state.corners, num("sq-x"), num("sq-y"), num("grid-mm"));
  } catch {
    return null;
  }
}

function pathD(r: Ring): string {
  return "M" + r.map((p) => `${p.x} ${p.y}`).join("L") + "Z";
}

let timer = 0;
function debounce(fn: () => void, ms = 80): void {
  clearTimeout(timer);
  timer = window.setTimeout(fn, ms);
}

// ---------- steps ----------

function setStep(s: Step): void {
  state.step = s;
  document.querySelectorAll<HTMLElement>(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === String(s)));
  $("empty").hidden = !!state.photo;
  if (s === 3 && state.warped) {
    const w = state.warped;
    const rect = { x: w.originMm.x, y: w.originMm.y, w: w.gray.width / w.pxPerMm, h: w.gray.height / w.pxPerMm };
    viewer.setImage(state.warpedUrl, rect);
    viewer.showImage(input("show-photo").checked);
    viewer.setWorld(rect);
  } else if (state.photo) {
    const rect = { x: 0, y: 0, w: state.photo.gray.width, h: state.photo.gray.height };
    viewer.setImage(state.photo.url, rect);
    viewer.showImage(true);
    viewer.setWorld(rect);
  } else {
    viewer.setImage(null, { x: 0, y: 0, w: 1, h: 1 });
  }
  refreshPanel();
  render();
}

async function loadFile(file: File): Promise<void> {
  busy(true);
  try {
    const photo = await loadPhoto(file);
    if (state.photo) URL.revokeObjectURL(state.photo.url);
    state.photo = photo;
    state.corners = [];
    state.warped = null;
    state.warpKey = "";
    state.tools = [];
    state.deletedCount = 0;
    setStep(2);
  } catch (e) {
    alert((e as Error).message);
  } finally {
    busy(false);
  }
}

async function goToTrace(): Promise<void> {
  if (!state.photo || state.corners.length !== 4) return;
  const key = calKey();
  if (state.warped && key === state.warpKey) return setStep(3);
  if (isDirty() && !confirm("Recalibrating traces the tools again and discards your edits. Continue?")) return;
  let cal: Calibration;
  try {
    cal = calibrate(state.corners, num("sq-x"), num("sq-y"), num("grid-mm"));
  } catch (e) {
    alert((e as Error).message);
    return;
  }
  busy(true);
  await nextFrame();
  try {
    const { gray } = state.photo;
    const bounds = photoBoundsMm(cal, gray.width, gray.height);
    state.warped = warpToMm(gray, cal.mmToImg, bounds, choosePxPerMm(bounds));
    if (state.warpedUrl) URL.revokeObjectURL(state.warpedUrl);
    state.warpedUrl = await grayUrl(state.warped.gray);
    state.warpKey = key;
    state.boundaryAuto = true;
    retrace();
    setStep(3);
  } finally {
    busy(false);
  }
}

// ---------- tracing ----------

function retrace(): void {
  if (!state.warped) return;
  const r = traceTools(state.warped, state.trace);
  state.thresholdUsed = r.thresholdUsed;
  state.tools = r.silhouettes.map((s) => ({
    id: state.nextId++,
    silhouette: s,
    pocket: makePocket(s, state.pocket) ?? s,
    edited: false,
  }));
  state.deletedCount = 0;
  state.selected = null;
  state.selPoint = null;
  refitBoundary();
  refreshPanel();
  render();
}

function repocket(): void {
  for (const t of state.tools) if (!t.edited) t.pocket = makePocket(t.silhouette, state.pocket) ?? t.silhouette;
  refitBoundary();
  refreshPanel();
  render();
}

function refitBoundary(): void {
  if (!state.boundaryAuto) return;
  state.boundary = fitBoundary(state.tools.map((t) => t.pocket), Math.max(0, num("bnd-m") || 0));
}

function markEdited(t: Tool): void {
  t.edited = true;
  refitBoundary();
  refreshPanel();
}

function deletePoint(): void {
  const t = selectedTool();
  if (!t || state.selPoint === null) return;
  if (t.pocket.length <= 3) return;
  t.pocket = removePoint(t.pocket, state.selPoint);
  state.selPoint = null;
  markEdited(t);
  render();
}

function deleteTool(): void {
  const t = selectedTool();
  if (!t) return;
  state.tools = state.tools.filter((x) => x !== t);
  state.deletedCount++;
  state.selected = null;
  state.selPoint = null;
  refitBoundary();
  refreshPanel();
  render();
}

function resetTool(): void {
  const t = selectedTool();
  if (!t) return;
  t.pocket = makePocket(t.silhouette, state.pocket) ?? t.silhouette;
  t.edited = false;
  state.selPoint = null;
  refitBoundary();
  refreshPanel();
  render();
}

// ---------- overlay ----------

function render(): void {
  viewer.overlay.replaceChildren();
  if (state.step === 2) renderCalibrate();
  else if (state.step === 3) renderTrace();
  renderHint();
}

function renderCalibrate(): void {
  const u = viewer.unitsPerPx;
  const g = viewer.overlay;
  const cal = previewCalibration();
  if (cal) {
    const sx = num("sq-x"), sy = num("sq-y"), mm = num("grid-mm");
    if (sx + sy <= 400) {
      const lines = el("g", { class: "ov-grid" });
      const line = (a: Pt, b: Pt) => {
        const p = applyH(cal.mmToImg, a), q = applyH(cal.mmToImg, b);
        lines.append(el("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y }));
      };
      for (let i = 0; i <= sx; i++) line({ x: i * mm, y: 0 }, { x: i * mm, y: sy * mm });
      for (let j = 0; j <= sy; j++) line({ x: 0, y: j * mm }, { x: sx * mm, y: j * mm });
      g.append(lines);
    }
    const quad = [0, 1, 2, 3].map((i) => applyH(cal.mmToImg, [
      { x: 0, y: 0 }, { x: cal.rectMm.w, y: 0 }, { x: cal.rectMm.w, y: cal.rectMm.h }, { x: 0, y: cal.rectMm.h },
    ][i]));
    g.append(el("path", { class: "ov-quad", d: pathD(quad) }));
  }
  state.corners.forEach((c, i) => {
    g.append(el("circle", { class: "ov-corner", cx: c.x, cy: c.y, r: 9 * u, "data-handle": `c:${i}` }));
    const label = el("text", { class: "ov-label", x: c.x + 12 * u, y: c.y - 12 * u, "font-size": 14 * u });
    label.textContent = String(i + 1);
    g.append(label);
  });
}

function renderTrace(): void {
  const u = viewer.unitsPerPx;
  const g = viewer.overlay;
  if (state.boundary && input("bnd-on").checked) {
    const b = state.boundary;
    g.append(el("rect", { class: "ov-boundary", x: b.x, y: b.y, width: b.w, height: b.h }));
  }
  const showSil = input("show-sil").checked;
  for (const t of state.tools) {
    const cls = ["ov-pocket", t.edited ? "edited" : "", t.id === state.selected ? "selected" : ""].join(" ");
    g.append(el("path", { class: cls, d: pathD(t.pocket) }));
    if (showSil) g.append(el("path", { class: "ov-sil", d: pathD(t.silhouette) }));
  }
  const sel = selectedTool();
  if (sel) {
    sel.pocket.forEach((p, i) => {
      const active = i === state.selPoint;
      g.append(el("circle", {
        class: `ov-handle${active ? " active" : ""}`,
        cx: p.x, cy: p.y, r: (active ? 7 : 5) * u, "data-handle": `p:${i}`,
      }));
    });
  }
}

function renderHint(): void {
  let text = "";
  if (state.step === 2) {
    const n = state.corners.length;
    text = n < 4
      ? `Tap corner ${n + 1} of 4. Scroll or pinch to zoom, drag to pan.`
      : "Check that the cyan lines sit on the grid, then Straighten & trace.";
  } else if (state.step === 3) {
    text = state.selected === null ? "Tap a pocket to select it." : "Drag points to edit. Tap the outline to add a point.";
  }
  $("hint").textContent = text;
}

// ---------- panel ----------

function refreshPanel(): void {
  document.querySelectorAll<HTMLButtonElement>(".step").forEach((b) => {
    const n = Number(b.dataset.step) as Step;
    if (n === state.step) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
    b.disabled = (n === 2 && !state.photo) || (n === 3 && (!state.photo || state.corners.length !== 4));
  });

  $("corner-count").textContent = String(state.corners.length);
  $<HTMLButtonElement>("to-trace").disabled = state.corners.length !== 4;

  const dirty = isDirty();
  $<HTMLFieldSetElement>("detect").disabled = dirty;
  $("detect-lock").hidden = !dirty;
  input("auto-t").checked = state.trace.threshold === null;
  input("t").value = String(state.trace.threshold ?? state.thresholdUsed);
  $("t-val").textContent = `${state.trace.threshold ?? state.thresholdUsed}${state.trace.threshold === null ? " (auto)" : ""}`;
  $("grid-val").textContent = `${fmt(state.trace.gridRemovalMm, 2)} mm`;
  $("min-val").textContent = `${state.trace.minAreaMm2} mm²`;
  $("clr-val").textContent = `${fmt(state.pocket.clearanceMm)} mm`;
  $("smooth-val").textContent = `${fmt(state.pocket.smoothingMm)} mm`;

  $("tool-count").textContent = String(state.tools.length);
  const t = selectedTool();
  if (t) {
    const s = bbox([t.silhouette]), p = bbox([t.pocket]);
    const idx = state.tools.indexOf(t) + 1;
    $("sel-info").textContent =
      `Tool ${idx}${t.edited ? " (edited)" : ""}\nTool  ${fmt(s.w)} × ${fmt(s.h)} mm\nPocket ${fmt(p.w)} × ${fmt(p.h)} mm`;
  } else {
    $("sel-info").textContent = state.tools.length ? "No tool selected." : "";
  }
  $("sel-info").style.whiteSpace = "pre";
  $<HTMLButtonElement>("del-point").disabled = !t || state.selPoint === null || t.pocket.length <= 3;
  $<HTMLButtonElement>("del-tool").disabled = !t;
  $<HTMLButtonElement>("reset-tool").disabled = !t || !t.edited;

  const b = state.boundary;
  for (const [id, v] of [["bnd-w", b?.w], ["bnd-h", b?.h], ["bnd-x", b?.x], ["bnd-y", b?.y]] as const) {
    if (document.activeElement !== input(id)) input(id).value = v === undefined ? "" : String(Math.round(v * 10) / 10);
  }

  const warnings: string[] = [];
  const pockets = state.tools.map((t) => t.pocket);
  if (state.warped && state.tools.length === 0)
    warnings.push("No tools found. Try the threshold or grid line removal sliders.");
  if (pockets.length > 1 && mergedCount(pockets) < pockets.length)
    warnings.push("Some pockets overlap. They'll be merged into one cut path; move tools apart or reduce clearance if that's not wanted.");
  if (b && input("bnd-on").checked && outside(pockets, b))
    warnings.push("Some pockets extend past the foam boundary.");
  $("warn").hidden = warnings.length === 0;
  $("warn").textContent = warnings.join(" ");
}

// ---------- interaction ----------

let dragging: { kind: "c" | "p"; index: number } | null = null;

viewer.drag = {
  start(handle, _p) {
    const [kind, idx] = (handle.dataset.handle ?? "").split(":");
    if (kind === "c" && state.step === 2) dragging = { kind: "c", index: Number(idx) };
    else if (kind === "p" && state.step === 3 && selectedTool()) dragging = { kind: "p", index: Number(idx) };
    else return false;
    return true;
  },
  move(p) {
    if (!dragging) return;
    if (dragging.kind === "c") {
      state.corners[dragging.index] = p;
    } else {
      const t = selectedTool();
      if (!t) return;
      t.pocket = t.pocket.map((q, i) => (i === dragging!.index ? p : q));
      t.edited = true;
      state.selPoint = dragging.index;
    }
    render();
  },
  end(moved) {
    if (!dragging) return;
    if (dragging.kind === "p") {
      state.selPoint = dragging.index;
      const t = selectedTool();
      if (moved && t) markEdited(t);
    }
    dragging = null;
    refreshPanel();
    render();
  },
};

viewer.onTap = (p) => {
  if (state.step === 2) {
    if (state.corners.length < 4) {
      state.corners.push(p);
      refreshPanel();
      render();
    }
    return;
  }
  if (state.step !== 3) return;
  const sel = selectedTool();
  if (sel) {
    const edge = nearestEdge(sel.pocket, p);
    if (edge.d < 10 * viewer.unitsPerPx) {
      sel.pocket = insertPoint(sel.pocket, edge.index, edge.point);
      state.selPoint = edge.index + 1;
      markEdited(sel);
      render();
      return;
    }
  }
  const hit = hitTool(state.tools, p);
  state.selected = hit?.id ?? null;
  state.selPoint = null;
  refreshPanel();
  render();
};

viewer.onView = () => render();

// Step navigation
document.querySelectorAll<HTMLButtonElement>(".step").forEach((b) =>
  b.addEventListener("click", () => {
    const n = Number(b.dataset.step) as Step;
    if (n === 3) void goToTrace();
    else setStep(n);
  }),
);

// Photo
const fileInput = input("file");
$("pick").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) void loadFile(f);
  fileInput.value = "";
});
const stage = document.querySelector(".stage")!;
stage.addEventListener("dragover", (e) => {
  e.preventDefault();
  $("empty").classList.add("dragover");
});
stage.addEventListener("dragleave", () => $("empty").classList.remove("dragover"));
stage.addEventListener("drop", (e) => {
  e.preventDefault();
  $("empty").classList.remove("dragover");
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) void loadFile(f);
});

// Calibration
$("reset-corners").addEventListener("click", () => {
  state.corners = [];
  refreshPanel();
  render();
});
for (const id of ["sq-x", "sq-y", "grid-mm"]) input(id).addEventListener("input", () => render());
$("to-trace").addEventListener("click", () => void goToTrace());

// Detection
input("auto-t").addEventListener("change", () => {
  state.trace.threshold = input("auto-t").checked ? null : state.thresholdUsed;
  debounce(retrace);
  refreshPanel();
});
input("t").addEventListener("input", () => {
  state.trace.threshold = Number(input("t").value);
  refreshPanel();
  debounce(retrace);
});
input("grid-rm").addEventListener("input", () => {
  state.trace.gridRemovalMm = num("grid-rm");
  refreshPanel();
  debounce(retrace);
});
input("min-area").addEventListener("input", () => {
  state.trace.minAreaMm2 = num("min-area");
  refreshPanel();
  debounce(retrace);
});
$("unlock").addEventListener("click", () => {
  if (confirm("Discard all edits and deleted tools?")) retrace();
});

// Pockets
input("clr").addEventListener("input", () => {
  state.pocket.clearanceMm = num("clr");
  refreshPanel();
  debounce(repocket, 40);
});
input("smooth").addEventListener("input", () => {
  state.pocket.smoothingMm = num("smooth");
  refreshPanel();
  debounce(repocket, 40);
});

// Tools
$("del-point").addEventListener("click", deletePoint);
$("del-tool").addEventListener("click", deleteTool);
$("reset-tool").addEventListener("click", resetTool);
document.addEventListener("keydown", (e) => {
  if (state.step !== 3) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    if (state.selPoint !== null) deletePoint();
    else deleteTool();
  } else if (e.key === "Escape") {
    state.selected = null;
    state.selPoint = null;
    refreshPanel();
    render();
  }
});

// Boundary
for (const id of ["bnd-w", "bnd-h", "bnd-x", "bnd-y"]) {
  input(id).addEventListener("input", () => {
    const w = num("bnd-w"), h = num("bnd-h"), x = num("bnd-x"), y = num("bnd-y");
    if (![w, h, x, y].every(Number.isFinite) || w <= 0 || h <= 0) return;
    state.boundaryAuto = false;
    state.boundary = { x, y, w, h };
    refreshPanel();
    render();
  });
}
input("bnd-m").addEventListener("input", () => {
  refitBoundary();
  refreshPanel();
  render();
});
$("bnd-fit").addEventListener("click", () => {
  state.boundaryAuto = true;
  refitBoundary();
  refreshPanel();
  render();
});
input("bnd-on").addEventListener("change", () => {
  refreshPanel();
  render();
});

// View
input("show-photo").addEventListener("change", () => viewer.showImage(input("show-photo").checked));
input("show-sil").addEventListener("change", () => render());
$("zoom-in").addEventListener("click", () => viewer.zoomBy(1.4));
$("zoom-out").addEventListener("click", () => viewer.zoomBy(1 / 1.4));
$("zoom-fit").addEventListener("click", () => viewer.fit());

// Export
$("export").addEventListener("click", () => {
  const pockets = state.tools.map((t) => t.pocket);
  const boundary = input("bnd-on").checked ? state.boundary : null;
  if (pockets.length === 0 && !boundary) {
    alert("Nothing to export yet.");
    return;
  }
  download("foam-insert.svg", buildSvg({ pockets, boundary }), "image/svg+xml");
});

setStep(1);
