// Photo preprocessing before the label is read. Pure functions on grayscale
// pixel arrays, so they are unit-tested and run on any phone (no AI, no WASM).
//   autoCropBox  - find the area with printed text (edge energy), drop background
//   toGray       - RGBA -> luminance
//   reduceGlare  - pull blown-out highlights (reflections on foil) toward the local mean
//   clahe        - contrast-limited adaptive histogram equalisation (tiles, bilinear blend)
//   sharpen      - unsharp mask (3x3)

export interface Gray { w: number; h: number; d: Uint8ClampedArray }

export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const d = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return { w, h, d };
}

/** Box (x, y, w, h) around rows/columns with strong local contrast (printed text). */
export function autoCropBox(g: Gray, pad = 0.04): { x: number; y: number; w: number; h: number } {
  const { w, h, d } = g;
  const col = new Float64Array(w), row = new Float64Array(h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const e = Math.abs(d[i + 1] - d[i - 1]) + Math.abs(d[i + w] - d[i - w]);
      if (e > 40) { col[x] += 1; row[y] += 1; }
    }
  }
  const span = (a: Float64Array, n: number): [number, number] => {
    let max = 0;
    for (const v of a) if (v > max) max = v;
    if (max <= 0) return [0, n - 1];
    const thr = max * 0.08;
    let lo = 0, hi = n - 1;
    while (lo < n && a[lo] < thr) lo++;
    while (hi > lo && a[hi] < thr) hi--;
    return [lo, hi];
  };
  const [x0, x1] = span(col, w), [y0, y1] = span(row, h);
  const px = Math.round(w * pad), py = Math.round(h * pad);
  const x = Math.max(0, x0 - px), y = Math.max(0, y0 - py);
  const cw = Math.min(w, x1 + px + 1) - x, ch = Math.min(h, y1 + py + 1) - y;
  // Never crop to a sliver: keep at least half of each side.
  if (cw < w * 0.5 || ch < h * 0.5) {
    const nw = Math.max(cw, Math.round(w * 0.5)), nh = Math.max(ch, Math.round(h * 0.5));
    return { x: Math.max(0, Math.min(x, w - nw)), y: Math.max(0, Math.min(y, h - nh)), w: nw, h: nh };
  }
  return { x, y, w: cw, h: ch };
}

/** Pixels above `thr` (glare on foil) are blended toward the mean of their neighbourhood. */
export function reduceGlare(g: Gray, thr = 235, radius = 6): Gray {
  const { w, h, d } = g;
  const out = new Uint8ClampedArray(d);
  const W = w + 1;
  const I = new Float64Array(W * (h + 1)); // integral image for fast box means
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) { s += d[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + s; }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] < thr) continue;
      const xa = Math.max(0, x - radius), ya = Math.max(0, y - radius), xb = Math.min(w, x + radius + 1), yb = Math.min(h, y + radius + 1);
      const sum = I[yb * W + xb] - I[ya * W + xb] - I[yb * W + xa] + I[ya * W + xa];
      const mean = sum / ((xb - xa) * (yb - ya));
      out[i] = Math.round(0.35 * d[i] + 0.65 * Math.min(mean, thr - 10));
    }
  }
  return { w, h, d: out };
}

/** CLAHE: equalise contrast per tile with a clip limit, blend tiles bilinearly. */
export function clahe(g: Gray, tiles = 8, clip = 3): Gray {
  const { w, h, d } = g;
  const tx = Math.max(1, Math.min(tiles, Math.floor(w / 8))), ty = Math.max(1, Math.min(tiles, Math.floor(h / 8)));
  const tw = w / tx, th = h / ty;
  const maps: Uint8ClampedArray[] = [];
  for (let j = 0; j < ty; j++) {
    for (let i = 0; i < tx; i++) {
      const hist = new Float64Array(256);
      const x0 = Math.floor(i * tw), x1 = Math.floor((i + 1) * tw), y0 = Math.floor(j * th), y1 = Math.floor((j + 1) * th);
      const n = Math.max(1, (x1 - x0) * (y1 - y0));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[d[y * w + x]]++;
      const limit = Math.max(1, (clip * n) / 256);
      let excess = 0;
      for (let k = 0; k < 256; k++) if (hist[k] > limit) { excess += hist[k] - limit; hist[k] = limit; }
      const add = excess / 256;
      const map = new Uint8ClampedArray(256);
      let cdf = 0;
      for (let k = 0; k < 256; k++) { cdf += hist[k] + add; map[k] = Math.round((cdf / n) * 255); }
      maps.push(map);
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(ty - 1, Math.max(0, y / th - 0.5));
    const j0 = Math.floor(fy), j1 = Math.min(ty - 1, j0 + 1), ay = fy - j0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(tx - 1, Math.max(0, x / tw - 0.5));
      const i0 = Math.floor(fx), i1 = Math.min(tx - 1, i0 + 1), ax = fx - i0;
      const v = d[y * w + x];
      const top = maps[j0 * tx + i0][v] * (1 - ax) + maps[j0 * tx + i1][v] * ax;
      const bot = maps[j1 * tx + i0][v] * (1 - ax) + maps[j1 * tx + i1][v] * ax;
      out[y * w + x] = top * (1 - ay) + bot * ay;
    }
  }
  return { w, h, d: out };
}

/** Unsharp mask with a 3x3 box blur. */
export function sharpen(g: Gray, amount = 0.8): Gray {
  const { w, h, d } = g;
  const out = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const blur = (d[i - w - 1] + d[i - w] + d[i - w + 1] + d[i - 1] + d[i] + d[i + 1] + d[i + w - 1] + d[i + w] + d[i + w + 1]) / 9;
      out[i] = d[i] + amount * (d[i] - blur);
    }
  }
  return { w, h, d: out };
}

/** Full chain for the label text area. */
export function enhanceGray(g: Gray): Gray {
  return sharpen(clahe(reduceGlare(g)));
}

/** (max - min) / (max + min) of a gray image: a simple contrast measure. */
export function contrast(g: Gray): number {
  let lo = 255, hi = 0;
  for (const v of g.d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi + lo === 0 ? 0 : (hi - lo) / (hi + lo);
}
