// Indic script helpers for the online regional languages. Plain code, no AI.
//
// The Brahmic Unicode blocks share one layout: क is U+0915 in Devanagari, ਕ is
// U+0A15 in Gurmukhi, ક U+0A95 Gujarati, க U+0B95 Tamil, ಕ U+0C95 Kannada. So a
// letter can be moved between scripts by its offset in the block. We use that to
//   - read a Punjabi / Gujarati / Marathi / Kannada / Tamil speech transcript as
//     Devanagari, then Latin, for the medicine-name matcher (phonetic.ts), and
//   - show a transliteration of a medicine name in the user's script
//     (names themselves are never translated).
import { toDevanagari } from "./phonetic";

export type Regional = "pa" | "gu" | "mr" | "kn" | "ta";
export const BLOCK: Record<Regional | "hi", number> = { hi: 0x0900, mr: 0x0900, pa: 0x0a00, gu: 0x0a80, ta: 0x0b80, kn: 0x0c80 };

const DEVA = 0x0900;
const ASSIGNED = /\p{Assigned}/u;
const INDIC = /[਀-೿]/;

/** Which non-Devanagari Indic script a text is in, if any. */
export function scriptOf(text: string): Regional | null {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0a00 && cp < 0x0a80) return "pa";
    if (cp >= 0x0a80 && cp < 0x0b00) return "gu";
    if (cp >= 0x0b80 && cp < 0x0c00) return "ta";
    if (cp >= 0x0c80 && cp < 0x0d00) return "kn";
  }
  return null;
}

/** Gurmukhi / Gujarati / Tamil / Kannada text -> Devanagari, letter by letter. */
export function indicToDevanagari(text: string): string {
  if (!INDIC.test(text)) return text;
  const chars = [...text.normalize("NFC")];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0)!;
    if (cp === 0x0a70) { out += "ं"; continue; } // Gurmukhi tippi
    if (cp === 0x0a71) { // Gurmukhi addak: doubles the next consonant
      const next = chars[i + 1];
      if (next) out += String.fromCodePoint(DEVA + (next.codePointAt(0)! - 0x0a00)) + "्";
      continue;
    }
    if (cp === 0x0b9a) { out += "स"; continue; } // Tamil ச: mostly "s" in medicine names
    const base = cp >= 0x0a00 && cp < 0x0a80 ? 0x0a00 : cp >= 0x0a80 && cp < 0x0b00 ? 0x0a80 : cp >= 0x0b80 && cp < 0x0c00 ? 0x0b80 : cp >= 0x0c80 && cp < 0x0d00 ? 0x0c80 : 0;
    out += base ? String.fromCodePoint(DEVA + (cp - base)) : ch;
  }
  return out;
}

// Devanagari consonants Tamil does not have -> the Tamil letter used for them.
const TAMIL_FALLBACK: Record<string, string> = {
  "ख": "क", "ग": "क", "घ": "क", "छ": "च", "झ": "ज", "ठ": "ट", "ड": "ट", "ढ": "ट",
  "थ": "त", "द": "त", "ध": "त", "फ": "प", "ब": "प", "भ": "प", "श": "ष", "़": "",
};

/** Devanagari -> another Brahmic script. Letters a script lacks fall back to the nearest one. */
export function devanagariTo(text: string, lang: Regional | "hi"): string {
  const base = BLOCK[lang];
  if (base === DEVA) return text;
  let out = "";
  for (let ch of text.normalize("NFD")) {
    const cp0 = ch.codePointAt(0)!;
    if (cp0 < 0x0900 || cp0 > 0x097f) { out += ch; continue; }
    if (lang === "ta" && ch in TAMIL_FALLBACK) ch = TAMIL_FALLBACK[ch];
    if (!ch) continue;
    const mapped = String.fromCodePoint(base + (ch.codePointAt(0)! - DEVA));
    if (ASSIGNED.test(mapped)) out += mapped;
    else if (ch === "ं" && lang === "ta") out += "ம்";
  }
  return out.normalize("NFC");
}

/** Medicine name in the user's script, for display next to the untranslated name. */
export function transliterateName(latin: string, lang: Regional | "hi"): string {
  if (!/[a-z]/i.test(latin)) return "";
  return devanagariTo(toDevanagari(latin), lang);
}
