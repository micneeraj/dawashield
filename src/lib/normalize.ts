// Plain, testable text normalisation. Mirrors data/build_dataset.py.

const BATCH_PREFIX = /^\s*(BATCH\s*NUMBER|BATCH\s*NO|B\s*\.?\s*NO|BATCH|LOT\s*NO|LOT)\s*[.:#]?\s*/;

/** "B.No: 45A-2" -> "45A2". Uppercase, strip labels and every separator. */
export function normalizeBatch(raw: string | null | undefined): string {
  let s = String(raw ?? "").toUpperCase().trim();
  s = s.replace(BATCH_PREFIX, "");
  return s.replace(/[^A-Z0-9]/g, "");
}

const LEGAL = /\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|INDIA|THE)\b/g;

/** Company name as stated, without the address. */
export function manufacturerName(raw: string | null | undefined): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(MFG\.?\s*BY|MFD\.?\s*BY|MANUFACTURED\s*BY|MKTD\.?\s*BY)\s*[:.-]?\s*/i, "");
  s = s.replace(/^(M\s*\/\s*S\.?|MESSRS\.?)\s*/i, "");
  s = s.split(/,|\(Unit|\bUnit[- ]|\bPlot\b|\bSurvey\b|\bVillage\b|\bVill\b|\bKhasra\b|\s(?=[A-Z]?[- ]?\d)/i)[0];
  const m = s.match(/^(.*?(?:LTD|LIMITED|LLP)\.?)/i);
  if (m) s = m[1];
  return s.trim().replace(/[\s,;]+$/, "");
}

/** Exact company entity key. Only legal suffixes and punctuation are removed:
 *  "Sresan Pharmaceuticals Pvt Ltd" == "SRESAN PHARMACEUTICALS", but
 *  "Sresan Pharma" is a different entity. */
export function manufacturerEntity(raw: string | null | undefined): string {
  let s = manufacturerName(raw).toUpperCase();
  if (!s || s.includes("INVESTIGATION")) return "";
  s = s.replace(/[^A-Z0-9 ]/g, " ").replace(LEGAL, " ");
  return s.replace(/\s+/g, " ").trim();
}

const FORM_WORDS = new Set([
  "TABLET", "TABLETS", "TAB", "TABS", "CAPSULE", "CAPSULES", "CAP", "CAPS", "INJECTION", "INJ", "SYRUP",
  "SUSPENSION", "ORAL", "IP", "BP", "USP", "MG", "ML", "GM", "G", "MCG", "IU", "AND", "WITH", "OF",
  "FILM", "COATED", "SUSTAINED", "RELEASE", "SR", "ER", "XR", "DT", "PAEDIATRIC", "PEDIATRIC", "DROPS",
  "SOLUTION", "CREAM", "GEL", "OINTMENT", "POWDER", "FOR", "USE", "BRAND", "NAME", "I", "IV", "IM",
]);

/** Meaningful words of a medicine name: "Paracetamol Tablets IP 500 mg" -> ["PARACETAMOL"]. */
export function nameTokens(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FORM_WORDS.has(w) && !/^\d+$/.test(w));
}

/** Classic Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Two words are "the same" if equal, or close enough for a typo. */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const long = Math.max(a.length, b.length);
  if (long < 5) return false;
  const allowed = long >= 9 ? 2 : 1;
  return levenshtein(a, b) <= allowed;
}

/** Fuzzy medicine-name match: any meaningful word of the query matches a word
 *  of the record's generic or brand name. "Paracetmol" ~ "Paracetamol Tablets IP". */
export function namesMatch(query: string | undefined, ...candidates: (string | undefined)[]): boolean {
  const q = nameTokens(query);
  if (!q.length) return false;
  const c = candidates.flatMap((x) => nameTokens(x));
  return q.some((w) => c.some((v) => wordsMatch(w, v) || (w.length >= 5 && v.startsWith(w))));
}

// Very small Devanagari -> Latin transliteration, so a Hindi transcript such as
// "डोलो" can still be searched against English medicine names.
const VOWELS: Record<string, string> = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri" };
const MATRAS: Record<string, string> = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ं": "n", "ँ": "n", "ः": "h", "ॉ": "o" };
const CONS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "ज़": "z", "फ़": "f", "क़": "q", "ड़": "d", "ढ़": "dh",
};
export function transliterate(text: string): string {
  const chars = [...text.normalize("NFC")];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];
    if (chars[i + 1] === "़") { ch += "़"; i++; } // nukta
    if (CONS[ch]) {
      out += CONS[ch];
      const next = chars[i + 1];
      if (next === "्") { i++; continue; }
      if (next && MATRAS[next]) { out += MATRAS[next]; i++; continue; }
      const after = chars[i + 1];
      if (after && (CONS[after] || VOWELS[after])) out += "a";
      continue;
    }
    if (VOWELS[ch]) { out += VOWELS[ch]; continue; }
    if (MATRAS[ch]) { out += MATRAS[ch]; continue; }
    out += ch;
  }
  return out;
}
