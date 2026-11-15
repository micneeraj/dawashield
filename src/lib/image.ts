// Photo preparation for the label-reading model. Keep resolution high (small
// sideways text must stay legible) and crop/zoom the B.No / EXP area when it is small.
import type { Box } from "./label";

export const MIN_LONG_SIDE = 2000; // never downscale below this
export const MAX_LONG_SIDE = 3072; // only very large photos are reduced, to this
export const JPEG_QUALITY = 0.92;
export const SMALL_BOX = 0.35; // box narrower/shorter than 35% of the image -> crop + zoom
export const CROP_TARGET = 2000; // long side of the zoomed crop

/** Scale for the full photo: 1 unless the long side exceeds MAX_LONG_SIDE; never below MIN_LONG_SIDE. */
export function fullScale(w: number, h: number): number {
  const long = Math.max(w, h);
  if (long <= MAX_LONG_SIDE) return 1;
  return Math.max(MIN_LONG_SIDE, MAX_LONG_SIDE) / long;
}

export function isSmallBox(box?: Box): boolean {
  if (!box) return false;
  return (box[2] - box[0]) / 1000 < SMALL_BOX && (box[3] - box[1]) / 1000 < SMALL_BOX;
}

/** Pixel crop around the box with generous padding (text near the box edge, sideways print). */
export function cropRect(box: Box, w: number, h: number, pad = 0.6) {
  const [y0, x0, y1, x1] = box.map((v) => v / 1000) as Box;
  const bw = x1 - x0, bh = y1 - y0;
  const side = Math.max(bw, bh) * (1 + 2 * pad); // square-ish so rotated text fits
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const sx = Math.max(0, cx - side / 2), sy = Math.max(0, cy - side / 2);
  const ex = Math.min(1, cx + side / 2), ey = Math.min(1, cy + side / 2);
  return { x: Math.round(sx * w), y: Math.round(sy * h), w: Math.round((ex - sx) * w), h: Math.round((ey - sy) * h) };
}

/** Zoom factor for the crop: up to CROP_TARGET on the long side, at most 4x. */
export function cropZoom(cw: number, ch: number): number {
  return Math.max(1, Math.min(4, CROP_TARGET / Math.max(cw, ch)));
}

async function toJpeg(bmp: ImageBitmap, sx: number, sy: number, sw: number, sh: number, scale: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", JPEG_QUALITY));
}

export interface PreparedPhoto {
  full: Blob;
  crop(box: Box): Promise<Blob>;
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { full: file, crop: async () => file };
  }
  const s = fullScale(bmp.width, bmp.height);
  const full = s === 1 && file.type === "image/jpeg" ? file : await toJpeg(bmp, 0, 0, bmp.width, bmp.height, s);
  return {
    full,
    crop: (box) => {
      const r = cropRect(box, bmp.width, bmp.height);
      return toJpeg(bmp, r.x, r.y, r.w, r.h, cropZoom(r.w, r.h));
    },
  };
}
