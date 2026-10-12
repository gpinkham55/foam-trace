import type { Gray } from "../core/types";

export interface Photo {
  gray: Gray;
  /** Object URL of the (possibly downscaled) image, same pixel size as gray. */
  url: string;
}

/** Decode an image file, downscale so the long side is at most maxDim, and convert to gray. */
export async function loadPhoto(file: File, maxDim = 3000): Promise<Photo> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't read that file. Use a JPEG or PNG.");
  }
  const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4)
    data[i] = Math.round(0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]);
  return { gray: { width: w, height: h, data }, url: await canvasUrl(canvas, "image/jpeg") };
}

export async function grayUrl(g: Gray): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = g.width;
  canvas.height = g.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(g.width, g.height);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
    img.data[j] = img.data[j + 1] = img.data[j + 2] = g.data[i];
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvasUrl(canvas, "image/png");
}

function canvasUrl(canvas: HTMLCanvasElement, type: string): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("Could not encode image"))), type, 0.92),
  );
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
