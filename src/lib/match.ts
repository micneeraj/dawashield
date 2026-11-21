// The matching engine. Plain, deterministic code: AI never decides the colour.
//
// Decision table (docs/ARCHITECTURE.md has the same table, with the Dolo example):
//
//   CAN'T READ  photo / voice confidence too low to match anything. Never GREY.
//   RED         exact batch AND company matched with high confidence
//               (exact or high entity match). When the official record names
//               no company ("Under Investigation", common for spurious drugs),
//               the medicine name must match instead.
//   AMBER       "possible match": exact batch, but the company match is
//               uncertain (medium confidence, not given, or a different
//               company / medicine on the record). Also a batch one character
//               or one OCR look-alike off, or an incomplete batch, for the
//               same medicine or company.
//   AMBER       "other batches flagged": same company (high confidence) AND same
//               medicine (normalised generic / brand), different batch.
//   GREY + note same company, DIFFERENT medicine. "Your medicine is not affected."
//   GREY        no record.
//
// An exact batch match is never GREY. A company match alone never makes a
// result RED or AMBER: that was the Dolo-650 / Micro Labs false scare.
import type { AlertRecord, MatchInput, MatchResult } from "./types";
import { levenshtein, nameTokens, namesMatch, normalizeBatch } from "./normalize";
import { companyKey, companyMatch, isConfident, type CompanyMatch } from "./entity";

/** Well-known Indian brands -> generic, so "Dolo 650" and a "Paracetamol Tablets"
 *  record count as the same medicine. Only unambiguous single-ingredient brands. */
export const BRAND_GENERIC: Record<string, string> = {
  DOLO: "PARACETAMOL", CROCIN: "PARACETAMOL", CALPOL: "PARACETAMOL", PACIMOL: "PARACETAMOL",
  AMLONG: "AMLODIPINE", AMLOKIND: "AMLODIPINE", STAMLO: "AMLODIPINE", AMLOPRES: "AMLODIPINE",
  TELMA: "TELMISARTAN", TELMIKIND: "TELMISARTAN", PAN: "PANTOPRAZOLE", PANTOCID: "PANTOPRAZOLE", PANTOP: "PANTOPRAZOLE",
  GLYCOMET: "METFORMIN", GLUCOPHAGE: "METFORMIN", THYRONORM: "LEVOTHYROXINE", ELTROXIN: "LEVOTHYROXINE",
  ECOSPRIN: "ASPIRIN", DISPRIN: "ASPIRIN", AZITHRAL: "AZITHROMYCIN", AZEE: "AZITHROMYCIN", ATORVA: "ATORVASTATIN",
  ROSUVAS: "ROSUVASTATIN", AMARYL: "GLIMEPIRIDE", RANTAC: "RANITIDINE", ALLEGRA: "FEXOFENADINE", FLAGYL: "METRONIDAZOLE",
  VOVERAN: "DICLOFENAC", ZERODOL: "ACECLOFENAC", OMEZ: "OMEPRAZOLE", MONTAIR: "MONTELUKAST", CETZINE: "CETIRIZINE",
};

/** Characters OCR and people commonly confuse on strips: O/0, I/L/1, S/5, B/8, Z/2. */
export function ocrKey(batch: string): string {
  return batch.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
}

/** Generic names behind a medicine name: "Dolo 650" -> ["PARACETAMOL"]. */
function generics(name?: string): string[] {
  return nameTokens(name).map((w) => BRAND_GENERIC[w]).filter((g): g is string => !!g);
}

/** Same medicine? Fuzzy on generic or brand, plus the brand -> generic table. */
export function sameMedicine(name: string | undefined, r: AlertRecord): boolean {
  if (!nameTokens(name).length) return false;
  if (namesMatch(name, r.name, r.brand)) return true;
  const g = generics(name);
  if (g.length && g.some((x) => namesMatch(x, r.name, r.brand))) return true;
  const rg = [...generics(r.name), ...generics(r.brand)];
  return rg.some((x) => namesMatch(x, name));
}

const recCompany = (r: AlertRecord) => r.labelManufacturer || r.manufacturerName || r.manufacturer;
const companyKnown = (r: AlertRecord) => !!companyKey(recCompany(r));

/** Best company match of the input against a set of records. */
function bestCompany(input: string | undefined, rs: AlertRecord[]): CompanyMatch {
  let best: CompanyMatch = { score: 0, band: "low" };
  if (!input) return best;
  for (const r of rs) {
    const m = companyMatch(input, recCompany(r));
    if (m.score > best.score) best = m;
    if (m.band === "exact") break;
  }
  return best;
}

export function matchMedicine(input: MatchInput, records: AlertRecord[]): MatchResult {
  if (input.unreadable) return { level: "UNREADABLE", reason: "unreadable", records: [] };

  const batch = normalizeBatch(input.batch);
  const hasCompany = !!companyKey(input.manufacturer);
  const hasName = nameTokens(input.name).length > 0;
  const coOf = (r: AlertRecord) => companyMatch(input.manufacturer, recCompany(r));

  if (batch) {
    // ---- 1. Exact batch ----
    const sameBatch = records.filter((r) => r.batchNorm === batch);
    if (sameBatch.length) {
      const low: CompanyMatch = { score: 0, band: "low" };
      const scored = sameBatch.map((r) => ({ r, m: hasCompany ? coOf(r) : low })).sort((a, b) => b.m.score - a.m.score);
      const top = scored[0];
      const confident = scored.filter((x) => isConfident(x.m)).map((x) => x.r);
      // A clearly different medicine name overrides a company match (two products, one batch code).
      const conflicting = (r: AlertRecord) => hasName && !sameMedicine(input.name, r);
      const red = confident.filter((r) => !conflicting(r));
      const company = hasCompany ? top.m : undefined;
      if (red.length) return { level: "RED", reason: "exact", records: red, company };
      // Record names no company (spurious / under investigation): medicine name decides.
      const unknownCo = sameBatch.filter((r) => !companyKnown(r) && hasName && sameMedicine(input.name, r));
      if (unknownCo.length) return { level: "RED", reason: "exact", records: unknownCo, company };
      if (confident.length) return { level: "AMBER", reason: "batch-other-name", records: confident, company };
      if (hasCompany && top.m.band === "medium") return { level: "AMBER", reason: "possible-company", records: scored.map((x) => x.r), company };
      if (hasCompany && companyKnown(top.r)) return { level: "AMBER", reason: "batch-other-company", records: scored.map((x) => x.r), company };
      if (hasName && sameBatch.every((r) => !sameMedicine(input.name, r))) return { level: "AMBER", reason: "batch-other-name", records: sameBatch, company };
      return { level: "AMBER", reason: "company-unconfirmed", records: sameBatch, company };
    }

    // ---- 2. Near or incomplete batch, same medicine or same company ----
    if (batch.length >= 4) {
      const ok = batch.length >= 5 ? ocrKey(batch) : "";
      const related = (r: AlertRecord) => (hasName && sameMedicine(input.name, r)) || (hasCompany && isConfident(coOf(r)));
      const near = records.filter((r) => {
        if (r.batchNorm.length < 4) return false;
        if (ok && ocrKey(r.batchNorm) === ok) return hasName || hasCompany ? related(r) : true;
        return levenshtein(r.batchNorm, batch) === 1 && related(r);
      });
      if (near.length) return { level: "AMBER", reason: "near-batch", records: near };
      const partial = records.filter((r) => r.batchNorm.length > batch.length && r.batchNorm.startsWith(batch) && related(r));
      if (partial.length) return { level: "AMBER", reason: "partial-batch", records: partial };
    }
  } else if (hasName) {
    const byName = records.filter((r) => sameMedicine(input.name, r));
    if (byName.length) return { level: "AMBER", reason: "name-no-batch", records: byName };
  }

  // ---- 3. Same company, batch not listed ----
  if (hasCompany && isConfident(bestCompany(input.manufacturer, records))) {
    const company = records.filter((r) => isConfident(coOf(r)));
    if (company.length) {
      const m = bestCompany(input.manufacturer, company);
      if (hasName) {
        const sameMed = company.filter((r) => sameMedicine(input.name, r));
        if (sameMed.length) return { level: "AMBER", reason: "other-batches", records: sameMed, company: m };
        // Dolo-650 by Micro Labs vs a Micro Labs Amlodipine alert: not affected.
        return { level: "GREY", reason: "company-other-medicine", records: company, company: m };
      }
      return { level: "GREY", reason: "company-batch-unlisted", records: company, company: m };
    }
  }

  return { level: "GREY", reason: "none", records: [] };
}

/** True when the result's records are about THIS medicine (shown as the official record).
 *  For GREY company notes they are another medicine: only behind "See details". */
export function recordsAreThisMedicine(result: MatchResult): boolean {
  return result.level === "RED" || result.level === "AMBER";
}

/** Local search for the guided voice flow: medicine names in the dataset that
 *  look like what the user said. Returns distinct display names. */
export function searchNames(query: string, records: AlertRecord[], common: string[], limit = 4): string[] {
  const out = new Map<string, number>();
  const labels = new Map<string, string>();
  const add = (label: string, score: number) => {
    const key = label.toLowerCase();
    if (!out.has(key) || (out.get(key) ?? 0) < score) out.set(key, score);
    labels.set(key, label);
  };
  const q = query.trim();
  if (!q) return [];
  for (const c of common) if (namesMatch(q, c)) add(c, c.toLowerCase().startsWith(q.toLowerCase()) ? 3 : 2);
  for (const r of records) {
    if (r.brand && namesMatch(q, r.brand)) add(cleanBrand(r.brand), 1);
    else if (namesMatch(q, r.name)) add(shortName(r.name), 1);
    if (out.size > 40) break;
  }
  return [...out.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => labels.get(k)!);
}

function cleanBrand(b: string) {
  return b.replace(/^\(|\)$/g, "").trim();
}
function shortName(n: string) {
  return n.split(/\s+/).slice(0, 4).join(" ");
}
