// Hindi-aware phonetic matching of medicine names. Plain code, works offline.
//
// Speech-to-text in Hindi often returns medicine names as broken Devanagari,
// e.g. "पैरासाइट परासीईटीअमोल" for "Paracetamol". We:
//   1. transliterate Devanagari to Latin (normalize.ts),
//   2. reduce every word to a metaphone-style phonetic key tuned for how
//      Hindi speakers say and Hindi STT spells English drug names
//      (ph=f, kh=k, bh=b, z=j, c=k/s, w=v, vowels dropped after the first...),
//   3. score dictionary entries by edit distance on the phonetic key and on the
//      folded spelling, over single words and joined neighbouring words (STT
//      often splits one name into two words).
import { levenshtein, nameTokens, transliterate } from "./normalize";
import { indicToDevanagari, scriptOf } from "./indic";

const VOWEL = /[aeiouy]/;

/** Lowercase a-z only. */
export function fold(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/** Metaphone-style key for Indian pronunciation. "Paracetamol" and
 *  "parasieetiamol" both give "PRSTML". */
export function phoneticKey(word: string): string {
  let s = fold(word);
  if (!s) return "";
  s = s
    .replace(/chh|ch/g, "C")
    .replace(/sh|ss/g, "s")
    .replace(/ph/g, "f")
    .replace(/kh|gh/g, (m) => m[0])
    .replace(/bh/g, "b")
    .replace(/dh/g, "d")
    .replace(/th/g, "t")
    .replace(/jh/g, "j")
    .replace(/ck|q/g, "k")
    .replace(/x/g, "ks")
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/g(?=e[a-z])/g, "j") // soft g: "Digene" ~ "डाइजीन"
    .replace(/c/g, "k")
    .replace(/C/g, "c")
    .replace(/(?<=[^aeiou])h/g, "")
    .replace(/([a-z])\1+/g, "$1");
  const first = VOWEL.test(s[0]) ? "A" : s[0].toUpperCase();
  const rest = s.slice(1).replace(/[aeiouyh]/g, "").toUpperCase();
  return (first + rest).replace(/(.)\1+/g, "$1");
}

/** 0..1 similarity from edit distance. */
export function sim(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// ---------- Latin -> Devanagari (for showing names in Hindi) ----------
const CONS: [string, string][] = [
  ["chh", "छ"], ["kh", "ख"], ["gh", "घ"], ["ch", "च"], ["jh", "झ"], ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"],
  ["sh", "श"], ["k", "क"], ["g", "ग"], ["j", "ज"], ["t", "ट"], ["d", "ड"], ["n", "न"], ["p", "प"], ["b", "ब"],
  ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"], ["w", "व"], ["s", "स"], ["h", "ह"], ["f", "फ़"],
  ["z", "ज़"], ["q", "क"], ["x", "क्स"],
];
const VOW: [string, string, string][] = [
  // latin, independent, matra
  ["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"], ["ee", "ई", "ी"], ["oo", "ऊ", "ू"], ["a", "अ", ""],
  ["i", "इ", "ि"], ["u", "उ", "ु"], ["e", "ए", "े"], ["o", "ओ", "ो"], ["y", "ई", "ी"],
];

/** Rough phonetic Devanagari spelling of an English medicine name: "Paracetamol" -> "पारासेटामोल"-like. */
export function toDevanagari(latin: string): string {
  return latin
    .split(/(\s+)/)
    .map((w) => (/^\s+$/.test(w) ? w : /^[a-z]+$/i.test(w) ? word(w.toLowerCase()) : w))
    .join("");
}

function word(w: string): string {
  let out = "";
  let i = 0;
  let prevCons = false;
  while (i < w.length) {
    if (w[i] === "c") { // c before e/i/y sounds like s
      const sound = /[eiy]/.test(w[i + 1] ?? "") ? "स" : "क";
      out += (prevCons ? "्" : "") + sound;
      prevCons = true;
      i++;
      continue;
    }
    const c = CONS.find(([l]) => w.startsWith(l, i));
    if (c) {
      if (prevCons) out += "्";
      out += c[1];
      prevCons = true;
      i += c[0].length;
      continue;
    }
    const v = VOW.find(([l]) => w.startsWith(l, i));
    if (v) {
      out += prevCons ? v[2] : v[1];
      prevCons = false;
      i += v[0].length;
      continue;
    }
    i++;
  }
  return out;
}

// ---------- Dictionary ----------
export interface DictEntry {
  name: string; // display name, English spelling as printed
  hi: string; // Devanagari transliteration
  keys: string[]; // phonetic key of each meaningful word, and of the joined name
  folded: string; // spelling of the main word(s), a-z only
  parts: string[]; // the main words, folded
  common?: boolean;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function makeEntry(name: string, common = false): DictEntry | null {
  const clean = name.replace(/^\(|\)$/g, "").replace(/\s+/g, " ").trim();
  const words = nameTokens(clean).map((w) => w.toLowerCase()).filter((w) => /^[a-z]+$/.test(w));
  const main = words.length ? words : fold(clean) ? [fold(clean)] : [];
  if (!main.length) return null;
  const keys = [...new Set([...main.map(phoneticKey), phoneticKey(main.join(""))])].filter((k) => k.length >= 2);
  return { name: clean, hi: toDevanagari(clean), keys, folded: main.join(""), parts: main, ...(common ? { common: true } : {}) };
}

/** Display name for a record: its brand if any, else the first meaningful words of the generic name. */
export function recordNames(r: { name: string; brand?: string }): string[] {
  const out: string[] = [];
  const brand = (r.brand ?? "").replace(/^\(|\)$/g, "").trim();
  if (brand && brand.length <= 40 && !/^n\/?a$/i.test(brand)) out.push(brand.split(/\s+/).slice(0, 3).join(" "));
  const generic = nameTokens(r.name).filter((w) => /^[A-Z]+$/.test(w)).slice(0, 2);
  if (generic.length) out.push(titleCase(generic.join(" ")));
  return out;
}

/** Medicine-name dictionary from every record name plus the common list. */
export function buildDictionary(records: { name: string; brand?: string }[], common: string[]): DictEntry[] {
  const map = new Map<string, DictEntry>();
  for (const c of common) {
    const e = makeEntry(c, true);
    if (e) map.set(e.name.toLowerCase(), e);
  }
  for (const r of records) {
    for (const n of recordNames(r)) {
      const k = n.toLowerCase();
      if (map.has(k)) continue;
      const e = makeEntry(n);
      if (e) map.set(k, e);
    }
  }
  return [...map.values()];
}

// ---------- Matching a spoken transcript ----------
// Words people say around a medicine name; never matched as names.
export const STOP = new Set([
  "sar", "dard", "dawa", "dawai", "davai", "davaa", "dava", "hai", "hain", "ki", "ka", "ke", "ko", "mera", "meri", "mere",
  "yeh", "ye", "wali", "vali", "waali", "goli", "tablet", "tablets", "medicine", "the", "for", "my", "this", "is", "it",
  "its", "headache", "fever", "bukhar", "bukhaar", "pet", "khansi", "ilaj", "maa", "papa", "liye", "lie", "chahiye",
  "naam", "name", "aur", "and", "syrup", "capsule", "kaun", "kya", "se", "me", "mein", "nahi", "ek", "do", "teen",
]);

export interface SpokenMatch {
  entry: DictEntry;
  score: number;
}

interface Win { w: string; k: string; len: number; single: boolean }

/** Candidate words: single words and joined neighbours ("para cetamol" -> "paracetamol"). */
function windows(text: string): { wins: Win[]; total: number } {
  // Punjabi / Gujarati / Tamil / Kannada transcripts are read as Devanagari first.
  const deva = indicToDevanagari(text);
  const latin = /[ऀ-ॿ]/.test(deva) ? transliterate(deva) : deva;
  const words = latin.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && /[a-z]/.test(w));
  const out = new Map<string, Win>();
  const add = (w: string, single: boolean) => { if (w.length >= 3 && !out.has(w)) out.set(w, { w, k: phoneticKey(w), len: w.length, single }); };
  for (let i = 0; i < words.length; i++) {
    add(fold(words[i]), true);
    if (i + 1 < words.length) add(fold(words[i] + words[i + 1]), false);
    if (i + 2 < words.length) add(fold(words[i] + words[i + 1] + words[i + 2]), false);
  }
  const total = words.reduce((n, w) => n + fold(w).length, 0);
  return { wins: [...out.values()], total: Math.max(1, total) };
}

/** Score one candidate word against one target spelling + phonetic key. */
function scorePair(w: string, k: string, folded: string, ek: string): number {
  if (k.length < 2 || ek.length < 2) return 0;
  const target = folded.length > w.length + 6 ? folded.slice(0, w.length + 2) : folded;
  let s = 0.6 * sim(k, ek) + 0.4 * sim(w, target);
  const m = Math.min(k.length, ek.length);
  if (m >= 3 && (k.startsWith(ek) || ek.startsWith(k))) s = Math.max(s, 0.75 + (0.05 * m) / Math.max(k.length, ek.length));
  if (k === ek) s = Math.max(s, ek.length >= 3 ? 0.95 : 0.8);
  return Math.min(1, s);
}

/** Entry score with coverage: how much of what was said this name explains. */
function scoreEntry(e: DictEntry, wins: Win[], total: number): number {
  const cover = (len: number) => 0.7 + 0.3 * Math.min(1, len / total);
  // Whole name against each window.
  const whole = phoneticKey(e.folded);
  let best = 0;
  for (const win of wins) best = Math.max(best, scorePair(win.w, win.k, e.folded, whole) * cover(win.len));
  // Multi-word names: every word should be heard ("Tranexamic Acid", not just "Acid").
  if (e.parts.length > 1) {
    let sum = 0, len = 0;
    for (const part of e.parts) {
      const pk = phoneticKey(part);
      let pb = 0, pl = 0;
      for (const win of wins) {
        if (!win.single) continue;
        const sc = scorePair(win.w, win.k, part, pk);
        if (sc > pb) { pb = sc; pl = win.len; }
      }
      sum += pb;
      len += pb >= 0.7 ? pl : 0;
    }
    best = Math.max(best, (sum / e.parts.length) * cover(len) * (e.common ? 1 : 0.92));
  } else {
    for (const win of wins) best = Math.max(best, scorePair(win.w, win.k, e.parts[0], e.keys[0] ?? whole) * cover(win.len));
  }
  return best;
}

/** Top medicine names for a (possibly garbled, possibly Devanagari) transcript. */
/** Tamil script has no separate voiced letters (one letter for k/g, t/d, p/b),
 *  so for Tamil transcripts both sides are compared with voicing removed. */
const devoice = (s: string) => s.replace(/g/g, "k").replace(/d/g, "t").replace(/b/g, "p").replace(/G/g, "K").replace(/D/g, "T").replace(/B/g, "P");
const devoiceEntry = (e: DictEntry): DictEntry => ({ ...e, keys: e.keys.map(devoice), folded: devoice(e.folded), parts: e.parts.map(devoice) });

export function matchSpoken(text: string, dict: DictEntry[], limit = 4, min = 0.6): SpokenMatch[] {
  const tamil = scriptOf(text) === "ta";
  const w0 = windows(text);
  const wins = tamil ? w0.wins.map((w) => ({ ...w, w: devoice(w.w), k: devoice(phoneticKey(devoice(w.w))) })) : w0.wins;
  const total = w0.total;
  if (!wins.length) return [];
  const scored: SpokenMatch[] = [];
  for (const e0 of dict) {
    const e = tamil ? devoiceEntry(e0) : e0;
    let s = scoreEntry(e, wins, total);
    if (e.common) s += 0.03; // tie-break towards everyday names
    if (s >= min) scored.push({ entry: e0, score: Math.min(1, s) });
  }
  scored.sort((a, b) => b.score - a.score || Number(!!b.entry.common) - Number(!!a.entry.common) || a.entry.name.length - b.entry.name.length);
  // One option per sound: "Pantoprazol" and "Pantoprazole" are the same choice for the user.
  const out: SpokenMatch[] = [];
  for (const m of scored) {
    const key = phoneticKey(m.entry.folded);
    const dup = out.findIndex((o) => phoneticKey(o.entry.folded) === key);
    if (dup >= 0) {
      if (m.entry.common && !out[dup].entry.common && out[dup].score - m.score < 0.08) out[dup] = m;
      continue;
    }
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}
