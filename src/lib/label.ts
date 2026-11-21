// Reading a medicine strip photo: strict parsing of the model's JSON, then
// plain-code checks that catch the classic mistakes (licence number taken as
// batch, manufacturing date taken as expiry). The user always confirms the
// fields on screen before any check runs.
import { parseModelJson } from "./json";
import { isPastOrToday, parseExpiry } from "./expiry";

export type LabelKey = "name" | "manufacturer" | "batch" | "expiry";
export const LABEL_KEYS: LabelKey[] = ["name", "manufacturer", "batch", "expiry"];

export interface LabelField {
  value?: string;
  source?: string; // exact text on the strip the value came from
  confidence?: number; // 0..1 as reported by the model
  uncertain?: boolean; // set by code checks or low confidence
  note?: string; // why it is uncertain (for debugging / tests)
}

export interface LabelReading {
  name: LabelField;
  manufacturer: LabelField;
  batch: LabelField;
  expiry: LabelField;
  mfd: LabelField; // read only to cross-check expiry; never shown as expiry
}

const LOW_CONFIDENCE = 0.6;

const clean = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s || /^(null|none|n\/a|na|unknown|not visible|not found|-)$/i.test(s)) return undefined;
  return s.slice(0, max);
};

function field(raw: unknown, max?: number): LabelField {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const value = clean(o.value ?? o.text, max);
    const c = Number(o.confidence);
    return { value, source: clean(o.source ?? o.source_text ?? o.evidence, 160), confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : undefined };
  }
  return { value: clean(raw, max) };
}

/** Parse model JSON. Accepts {field:{value,source,confidence}} or flat strings. */
export function parseLabel(raw: string): LabelReading | null {
  const o = parseModelJson(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const reading: LabelReading = {
    name: field(r.name ?? r.medicine ?? r.product),
    manufacturer: field(r.manufacturer ?? r.company),
    batch: field(r.batch ?? r.batch_no, 40),
    expiry: field(r.expiry ?? r.exp, 30),
    mfd: field(r.mfd ?? r.mfg_date ?? r.manufacturing_date, 30),
  };
  return LABEL_KEYS.some((k) => reading[k].value) ? reading : null;
}

// "JK/01/08-09/156", "MNB/05/123", "G/28/1234" style drug manufacturing licence numbers.
const LICENCE_PATTERN = /^[A-Z]{1,4}\s*\/\s*\d{1,3}\s*\/\s*\d{2,4}(\s*-\s*\d{2,4})?\s*\/\s*\d{2,5}$/i;
const LICENCE_DIGITS = /^\d{1,3}\s*\/\s*\d{2,4}(\s*-\s*\d{2,4})?\s*\/\s*\d{2,5}$/; // prefix lost: "01/08/09/156"
const SLASH_GROUPS = /^\d+(\s*[/-]\s*\d+){3,}$/; // 4+ number groups joined by / or -
const BATCH_LABEL = /\b(B\.?\s*NO|BATCH(\s*NO)?|LOT(\s*NO)?)\b/i;
const NOT_BATCH_LABEL = /\b(LIC|LICEN[CS]E|M\.?\s*L\.?|MFD|MFG|MRP|EXP|BARCODE|QR|GTIN|REG)\b/i;

export function looksLikeLicence(value?: string, source?: string): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (/lic/i.test(v) || /lic/i.test(source ?? "")) return true;
  return LICENCE_PATTERN.test(v) || LICENCE_DIGITS.test(v) || SLASH_GROUPS.test(v);
}

/** Plain-code checks on a model reading. Never invents values; only clears or flags. */
export function validateLabel(input: LabelReading): LabelReading {
  const r: LabelReading = JSON.parse(JSON.stringify(input));
  for (const k of [...LABEL_KEYS, "mfd"] as const) {
    if (r[k].value && r[k].confidence !== undefined && r[k].confidence! < LOW_CONFIDENCE) {
      r[k].uncertain = true;
      r[k].note = "low confidence";
    }
  }

  // Batch: never a licence number; source must carry a batch label, not another label.
  const b = r.batch;
  if (b.value) {
    if (looksLikeLicence(b.value, b.source)) {
      r.batch = { source: b.source, uncertain: true, note: "rejected: looks like a manufacturing licence number" };
    } else if (b.source && NOT_BATCH_LABEL.test(b.source) && !BATCH_LABEL.test(b.source)) {
      r.batch = { source: b.source, uncertain: true, note: "rejected: source text is not a batch label" };
    } else if (b.source && !BATCH_LABEL.test(b.source)) {
      b.uncertain = true;
      b.note = "no B.No / Batch / Lot label in source text";
    }
  }

  // Expiry: never the MFD. If both are found, expiry must be the later date.
  const e = r.expiry;
  const exp = parseExpiry(e.value);
  const mfd = parseExpiry(r.mfd.value);
  if (e.value && e.source && /\b(MFD|MFG|MANUFACTUR)/i.test(e.source) && !/\bEXP|USE\s*BEFORE|BEST\s*BEFORE/i.test(e.source)) {
    r.expiry = { source: e.source, uncertain: true, note: "rejected: source text is a manufacturing date" };
  } else if (exp && mfd) {
    if (exp.getTime() <= mfd.getTime()) {
      // Swapped or misread. Only swap when the later date is clearly labelled EXP in its source.
      if (r.mfd.source && /\bEXP|USE\s*BEFORE/i.test(r.mfd.source)) {
        r.expiry = { value: r.mfd.value, source: r.mfd.source, confidence: r.mfd.confidence, uncertain: true, note: "swapped: later date was labelled EXP" };
      } else {
        e.uncertain = true;
        e.note = "expiry is not later than MFD";
      }
    }
  } else if (e.value && !exp) {
    e.uncertain = true;
    e.note = "unreadable date";
  }
  return r;
}

/** Merge two photos (e.g. front and the batch/expiry side). For each field keep
 *  the value that is present, not uncertain, then higher confidence. */
export function mergeLabels(a: LabelReading | null, b: LabelReading | null): LabelReading | null {
  if (!a) return b;
  if (!b) return a;
  const score = (f: LabelField) => (f.value ? 2 : 0) + (f.uncertain ? 0 : 1) + (f.confidence ?? 0.5);
  const out = {} as LabelReading;
  for (const k of [...LABEL_KEYS, "mfd"] as const) out[k] = score(b[k]) > score(a[k]) ? b[k] : a[k];
  return validateLabel(out);
}

/** Below this, a batch or expiry is shown in amber with "please confirm". */
export const CONFIRM_BELOW = 0.75;

/** Confidence 0..1 for one extracted field: the model's own score, lowered by
 *  any plain-code check that flagged it (two reads differ, no label in the
 *  source text, licence-number pattern, expiry not after MFD...). */
export function fieldConfidence(f: LabelField): number {
  if (!f.value) return 0;
  const base = f.confidence ?? 0.7;
  return Math.round((f.uncertain ? Math.min(base, 0.5) : base) * 100) / 100;
}

/** Fields the user must look at: missing, uncertain or low confidence. */
export function needsCheck(f: LabelField): boolean {
  return !f.value || !!f.uncertain || fieldConfidence(f) < CONFIRM_BELOW;
}

/** Below this, a photo-read batch the user did not touch is too uncertain to match:
 *  the result is "Can't read clearly" (keypad + retake), never GREY. */
export const UNREADABLE_BELOW = 0.45;

/** Is the photo reading too weak to match? Plain code. A batch the user typed or
 *  corrected is always trusted; an untouched low-confidence or missing batch is not. */
export function photoUnreadable(reading: LabelReading | null, form: { name: string; batch: string }, editedBatch: boolean): boolean {
  if (editedBatch && form.batch.trim()) return false;
  if (!form.batch.trim()) return !form.name.trim();
  if (!reading?.batch.value) return false; // typed by the user from scratch
  return fieldConfidence(reading.batch) < UNREADABLE_BELOW;
}

/** A batch heard by speech recognition that cannot be a real batch number
 *  (too short, or no digit at all): treat as "Can't read clearly". */
export function spokenBatchUnreadable(batch: string): boolean {
  const b = batch.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return b.length < 3 || !/\d/.test(b);
}

// ---------- Image quality, double read, expiry safety ----------

export type ImageQuality = "ok" | "blurry" | "too_small";
/** Box around the B.No / EXP text, Gemini convention [ymin, xmin, ymax, xmax] in 0..1000. */
export type Box = [number, number, number, number];

export interface StripRead {
  reading: LabelReading | null;
  quality: ImageQuality;
  box?: Box;
}

/** Parse the full model reply: the label fields plus image_quality and batch_expiry_box. */
export function parseStripRead(raw: string): StripRead | null {
  const o = parseModelJson(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const q = String(r.image_quality ?? "ok").toLowerCase().replace(/[\s-]+/g, "_");
  const quality: ImageQuality = q === "blurry" ? "blurry" : q === "too_small" || q === "small" ? "too_small" : "ok";
  const b = r.batch_expiry_box;
  const box =
    Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(Number(n)))
      ? (b.map((n) => Math.max(0, Math.min(1000, Number(n)))) as Box)
      : undefined;
  const reading = parseLabel(raw);
  if (!reading && quality === "ok") return null;
  return { reading: reading ? validateLabel(reading) : null, quality, box: box && box[2] > box[0] && box[3] > box[1] ? box : undefined };
}

/** Normalise a batch or expiry for comparing two reads (case, spaces, punctuation; dates by month). */
export function sameValue(k: "batch" | "expiry" | "mfd", a?: string, b?: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (k !== "batch") {
    const da = parseExpiry(a), db = parseExpiry(b);
    if (da && db) return da.getTime() === db.getTime();
  }
  const n = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return n(a) === n(b);
}

/** Combine two independent reads of the same image. Batch / expiry / mfd that
 *  differ between the reads are marked uncertain (amber on the confirm screen). */
export function compareReads(a: LabelReading | null, b: LabelReading | null): LabelReading | null {
  if (!a || !b) {
    const one = a ?? b;
    if (!one) return null;
    const r: LabelReading = JSON.parse(JSON.stringify(one));
    for (const k of ["batch", "expiry"] as const)
      if (r[k].value) { r[k].uncertain = true; r[k].note = "only one read succeeded"; }
    return r;
  }
  const out = mergeLabels(a, b)!;
  for (const k of ["batch", "expiry", "mfd"] as const) {
    if (!sameValue(k, a[k].value, b[k].value)) {
      out[k] = { ...out[k], uncertain: true, note: "two reads differ" };
    }
  }
  return out;
}

/** Use the zoomed crop's read for batch / expiry / mfd where it found them. */
export function preferCrop(full: LabelReading | null, crop: LabelReading | null): LabelReading | null {
  if (!crop) return full;
  if (!full) return crop;
  const out: LabelReading = JSON.parse(JSON.stringify(full));
  for (const k of ["batch", "expiry", "mfd"] as const) if (crop[k].value || crop[k].uncertain) out[k] = crop[k];
  return out;
}

/** True when the photo should be retaken closer instead of guessing. */
export function needsCloserPhoto(s: { reading: LabelReading | null; quality: ImageQuality }): boolean {
  if (!s.reading) return true;
  return s.quality !== "ok" && (!s.reading.batch.value || !s.reading.expiry.value);
}

/** EXP on or before MFD (both readable) means one of them is misread. */
export function expiryNotAfterMfd(expiry?: string, mfd?: string): boolean {
  const e = parseExpiry(expiry), m = parseExpiry(mfd);
  return !!e && !!m && e.getTime() <= m.getTime();
}

/** Expiry safety: a read expiry in the past, on/before MFD, or with no MFD to
 *  cross-check against, is never trusted straight away. */
export function expiryNeedsConfirm(r: LabelReading | null, now = new Date()): boolean {
  if (!r?.expiry.value) return false;
  return isPastOrToday(r.expiry.value, now) || !r.mfd.value || expiryNotAfterMfd(r.expiry.value, r.mfd.value);
}

/** Confirm-screen rule, decided from the date currently in the field: show AMBER
 *  with "Is the expiry date correct?" and the Yes button until the user taps Yes.
 *  A date that is today or in the past ALWAYS asks, whatever the model said or the user typed. */
export function expiryAsk(formExpiry: string, r: LabelReading | null, opts: { confirmed: boolean; edited: boolean }, now = new Date()): boolean {
  const v = formExpiry.trim();
  if (!v || opts.confirmed) return false;
  if (isPastOrToday(v, now)) return true;
  if (opts.edited) return false; // user typed a future date themselves
  return expiryNeedsConfirm(r, now) || expiryNotAfterMfd(v, r?.mfd.value);
}

/** What expiry is passed to the check. A past/today date only counts once the user
 *  tapped "Yes, this date is on the strip"; otherwise no "expired" warning is shown. */
export function expiryForCheck(value: string, opts: { confirmed: boolean }, now = new Date()): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (opts.confirmed) return v;
  return isPastOrToday(v, now) ? undefined : v;
}
