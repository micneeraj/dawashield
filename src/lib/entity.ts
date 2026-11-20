// Company entity resolution. Plain code, no AI.
//
//   1. Normalise: drop the address, legal suffixes (Pvt, Ltd, Limited, LLP...),
//      "M/s", punctuation; standardise spelling of common words
//      (Pharmaceuticals -> PHARMA, Laboratories -> LABS) and spacing.
//   2. Alias table: a few well-known short forms map to one canonical name.
//   3. Fuzzy similarity: token-set ratio (as in the classic fuzzywuzzy method)
//      on the normalised names, with guards so that sharing only generic words
//      ("Pharma", "Healthcare") never counts as a match.
//
// The result is a confidence 0..1 and a band: exact / high / medium / low.
import { levenshtein, manufacturerName } from "./normalize";

export type CompanyBand = "exact" | "high" | "medium" | "low";
export interface CompanyMatch {
  score: number; // 0..1
  band: CompanyBand;
}

export const HIGH = 0.9;
export const MEDIUM = 0.72;

const LEGAL = new Set([
  "PVT", "PRIVATE", "LTD", "LIMITED", "LLP", "INC", "INCORPORATED", "CO", "COMPANY", "CORP", "CORPORATION",
  "THE", "MS", "M", "S", "INDIA", "OPC", "PLC", "GMBH", "AG", "SA", "AND",
]);

// Spelling variants of common words -> one form.
const CANON: [RegExp, string][] = [
  [/^PHARMA(CEUTICALS?|CEUTICS?|CEUTICA|CY|S)?$|^PHARM$|^PHAMA$/, "PHARMA"],
  [/^LAB(ORATOR(Y|IES)|S)?$|^LABORATORIE$/, "LABS"],
  [/^HEALTH ?CARE$|^HEALTHCARES$/, "HEALTHCARE"],
  [/^LIFE ?SCIENCES?$/, "LIFESCIENCES"],
  [/^BIO ?TECH$|^BIOTECHNOLOGY$/, "BIOTECH"],
  [/^REMED(Y|IES)$/, "REMEDIES"],
  [/^INDUSTR(Y|IES)$|^INDS?$/, "IND"],
  [/^FORMULATIONS?$/, "FORMULATIONS"],
  [/^DRUGS?$/, "DRUGS"],
  [/^MEDICAMENTS?$/, "MEDICAMENTS"],
  [/^INTERNATIONAL$|^INTL$/, "INTL"],
  [/^ORGANICS?$/, "ORGANICS"],
  [/^CHEMICALS?$/, "CHEMICALS"],
  [/^SURGICALS?$/, "SURGICALS"],
];

/** Words that say what kind of company it is, not which one. */
const GENERIC = new Set([
  "PHARMA", "LABS", "HEALTHCARE", "LIFESCIENCES", "BIOTECH", "REMEDIES", "IND", "FORMULATIONS", "DRUGS",
  "MEDICAMENTS", "INTL", "ORGANICS", "CHEMICALS", "SURGICALS", "LIFECARE", "MEDICARE", "BIOSCIENCES",
  "GLOBAL", "MEDICAL", "MEDICINES", "SCIENCES", "TECHNOLOGIES", "ENTERPRISES", "PRODUCTS", "UNIT", "NEW", "GROUP",
]);

// Known short forms. Only well-documented names; extend with care.
const ALIASES: Record<string, string> = {
  "GSK": "GLAXOSMITHKLINE PHARMA",
  "GLAXO SMITHKLINE PHARMA": "GLAXOSMITHKLINE PHARMA",
  "GLAXOSMITHKLINE": "GLAXOSMITHKLINE PHARMA",
  "J J": "JOHNSON JOHNSON",
  "JNJ": "JOHNSON JOHNSON",
  "DR REDDYS": "DR REDDY LABS",
  "DR REDDY": "DR REDDY LABS",
  "DRL": "DR REDDY LABS",
  "DR REDDYS LABS": "DR REDDY LABS",
  "SUN PHARMA IND": "SUN PHARMA",
  "SPIL": "SUN PHARMA",
  "CADILA HEALTHCARE": "ZYDUS LIFESCIENCES",
  "ZYDUS CADILA": "ZYDUS LIFESCIENCES",
  "ZYDUS": "ZYDUS LIFESCIENCES",
  "HLL LIFECARE": "HLL LIFECARE",
  "ABBOTT": "ABBOTT HEALTHCARE",
  "MANKIND": "MANKIND PHARMA",
  "CIPLA": "CIPLA",
  "ALKEM": "ALKEM LABS",
  "LUPIN": "LUPIN",
  "TORRENT": "TORRENT PHARMA",
  "INTAS": "INTAS PHARMA",
  "MICRO LABS": "MICRO LABS",
  "GLENMARK": "GLENMARK PHARMA",
  "MACLEODS": "MACLEODS PHARMA",
  "FDC": "FDC",
};

/** Normalised company tokens: "M/s. Sun Pharmaceutical Industries Ltd., Plot 4" -> ["SUN","PHARMA","IND"]. */
export function companyTokens(raw: string | null | undefined): string[] {
  const name = manufacturerName(raw).toUpperCase();
  if (!name || /INVESTIGATION|NOT KNOWN|UNKNOWN|N\/A/.test(name)) return [];
  const words = name
    .replace(/&/g, " ")
    .replace(/HEALTH\s+CARE/g, "HEALTHCARE")
    .replace(/LIFE\s+SCIENCES?/g, "LIFESCIENCES")
    .replace(/BIO\s+TECH/g, "BIOTECH")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !LEGAL.has(w));
  return words.map((w) => CANON.find(([re]) => re.test(w))?.[1] ?? w);
}

/** Canonical company key (after aliases). "" when unknown / under investigation. */
const keyCache = new Map<string, string>();
export function companyKey(raw: string | null | undefined): string {
  const src = String(raw ?? "");
  const hit = keyCache.get(src);
  if (hit !== undefined) return hit;
  const k = companyTokens(src).join(" ");
  const out = ALIASES[k] ?? k;
  if (keyCache.size > 20000) keyCache.clear();
  keyCache.set(src, out);
  return out;
}

/** 0..1 similarity, 2*LCS/(|a|+|b|) (the Indel ratio used by fuzzywuzzy / rapidfuzz). */
export function ratio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return (2 * prev[b.length]) / (a.length + b.length);
}

/** Token-set ratio: compares the shared words plus each side's remainder,
 *  so word order and extra words matter less. */
export function tokenSetRatio(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((w) => B.has(w)).sort();
  const onlyA = [...A].filter((w) => !B.has(w)).sort();
  const onlyB = [...B].filter((w) => !A.has(w)).sort();
  const t0 = inter.join(" ");
  const t1 = [t0, onlyA.join(" ")].filter(Boolean).join(" ");
  const t2 = [t0, onlyB.join(" ")].filter(Boolean).join(" ");
  if (!t1 || !t2) return 0;
  return Math.max(ratio(t0, t1), ratio(t0, t2), ratio(t1, t2));
}

const distinctive = (ws: string[]) => ws.filter((w) => !GENERIC.has(w) && w.length >= 2);

/** How confident are we that two company names are the same entity? */
export function companyMatch(input: string | null | undefined, record: string | null | undefined): CompanyMatch {
  const ka = companyKey(input), kb = companyKey(record);
  if (!ka || !kb) return { score: 0, band: "low" };
  if (ka === kb) return { score: 1, band: "exact" };
  const a = ka.split(" "), b = kb.split(" ");
  const da = distinctive(a), db = distinctive(b);
  // Must share a distinctive word (exactly or with a small typo); sharing only "Pharma" is not a match.
  const shared = da.filter((w) => db.some((v) => w === v || (Math.max(w.length, v.length) >= 5 && levenshtein(w, v) <= 1)));
  if (!shared.length) return { score: 0, band: "low" };
  // Compare with typo-tolerant token alignment: replace near-equal words by the record's spelling.
  const aligned = a.map((w) => b.find((v) => v !== w && Math.max(w.length, v.length) >= 5 && levenshtein(w, v) <= 1) ?? w);
  let score = tokenSetRatio(aligned, b);
  // Distinctive words present on only one side lower confidence ("SUN PHARMA" vs "SUN MOON PHARMA").
  const extra = da.filter((w) => !shared.includes(w)).length + db.filter((w) => !shared.some((s) => s === w || levenshtein(s, w) <= 1)).length;
  if (extra > 0) score = Math.min(score, extra === 1 ? 0.8 : 0.65);
  // Same distinctive words but a different kind of company ("X Pharma" vs "X Healthcare"): medium at most.
  const ga = a.filter((w) => GENERIC.has(w)), gb = b.filter((w) => GENERIC.has(w));
  if (!extra && ga.length && gb.length && !ga.some((w) => gb.includes(w))) score = Math.min(score, 0.8);
  // A single short distinctive word is weak evidence ("FDC" vs "FDC Pharma" is fine, "AB" is not).
  if (shared.length === 1 && shared[0].length <= 2) score = Math.min(score, 0.7);
  score = Math.round(score * 100) / 100;
  return { score, band: score >= HIGH ? "high" : score >= MEDIUM ? "medium" : "low" };
}

export const isConfident = (m: CompanyMatch) => m.band === "exact" || m.band === "high";
