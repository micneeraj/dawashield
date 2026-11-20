// The matching engine. Plain code: AI never decides the colour.
//
//   RED   = normalised batch equals an alert batch AND
//           (the company is an exact / high-confidence entity match, or no
//           company was given and the medicine name matches).
//   AMBER = possible match, please check with a chemist:
//           exact batch + medium-confidence company ("possible-company"),
//           exact batch + clearly different company or medicine name,
//           batch one character / one OCR look-alike off ("near-batch"),
//           company has official action but this batch is not listed ("company"),
//           or no batch given for a medicine that has alerts ("name-no-batch").
//   GREY  = nothing found in the downloaded data. Never "safe".
//
// An exact batch match is never GREY. A company match alone never says all of
// that company's batches are affected.
import type { AlertRecord, MatchInput, MatchResult } from "./types";
import { levenshtein, namesMatch, normalizeBatch } from "./normalize";
import { companyKey, companyMatch, isConfident, type CompanyMatch } from "./entity";

const named = (r: AlertRecord, name?: string) => namesMatch(name, r.name, r.brand);

/** Characters OCR and people commonly confuse on strips: O/0, I/L/1, S/5, B/8, Z/2. */
export function ocrKey(batch: string): string {
  return batch.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
}

/** Best company match of the input against a set of records. */
function bestCompany(input: string | undefined, rs: AlertRecord[]): { m: CompanyMatch; r?: AlertRecord } {
  let best: { m: CompanyMatch; r?: AlertRecord } = { m: { score: 0, band: "low" } };
  if (!input) return best;
  for (const r of rs) {
    const m = companyMatch(input, r.manufacturerName || r.manufacturer);
    if (m.score > best.m.score) best = { m, r };
    if (m.band === "exact") break;
  }
  return best;
}

export function matchMedicine(input: MatchInput, records: AlertRecord[]): MatchResult {
  const batch = normalizeBatch(input.batch);
  const hasCompany = !!companyKey(input.manufacturer);

  if (batch) {
    const sameBatch = records.filter((r) => r.batchNorm === batch);
    if (sameBatch.length) {
      if (hasCompany) {
        const scored = sameBatch
          .map((r) => ({ r, m: companyMatch(input.manufacturer, r.manufacturerName || r.manufacturer) }))
          .sort((a, b) => b.m.score - a.m.score);
        const top = scored[0];
        const confident = scored.filter((x) => isConfident(x.m)).map((x) => x.r);
        if (confident.length) return { level: "RED", reason: "exact", records: confident, company: top.m };
        // Record's company unknown ("Under Investigation", spurious): fall back to the medicine name.
        const unknownCo = sameBatch.filter((r) => !companyKey(r.manufacturerName || r.manufacturer) && named(r, input.name));
        if (unknownCo.length) return { level: "RED", reason: "exact", records: unknownCo, company: top.m };
        if (top.m.band === "medium") return { level: "AMBER", reason: "possible-company", records: scored.map((x) => x.r), company: top.m };
        return { level: "AMBER", reason: "batch-other-company", records: scored.map((x) => x.r), company: top.m };
      }
      const exact = sameBatch.filter((r) => named(r, input.name));
      if (exact.length) return { level: "RED", reason: "exact", records: exact };
      return { level: "AMBER", reason: "batch-other-name", records: sameBatch };
    }

    // Near batch: one character off (same medicine or company), or an OCR look-alike.
    if (batch.length >= 4) {
      const ok = batch.length >= 5 ? ocrKey(batch) : "";
      const near = records.filter((r) => {
        if (r.batchNorm.length < 4) return false;
        if (ok && ocrKey(r.batchNorm) === ok) return true;
        if (levenshtein(r.batchNorm, batch) !== 1) return false;
        return named(r, input.name) || (hasCompany && isConfident(companyMatch(input.manufacturer, r.manufacturerName || r.manufacturer)));
      });
      if (near.length) return { level: "AMBER", reason: "near-batch", records: near };
    }
  } else if (input.name) {
    const byName = records.filter((r) => named(r, input.name));
    if (byName.length) return { level: "AMBER", reason: "name-no-batch", records: byName };
  }

  if (hasCompany) {
    const { m } = bestCompany(input.manufacturer, records);
    if (isConfident(m)) {
      const company = records.filter((r) => isConfident(companyMatch(input.manufacturer, r.manufacturerName || r.manufacturer)));
      if (company.length) return { level: "AMBER", reason: "company", records: company, company: m };
    }
  }

  return { level: "GREY", reason: "none", records: [] };
}

/** Local search for the guided voice flow: medicine names in the dataset that
 *  look like what the user said. Returns distinct display names. */
export function searchNames(query: string, records: AlertRecord[], common: string[], limit = 4): string[] {
  const out = new Map<string, number>();
  const add = (label: string, score: number) => {
    const key = label.toLowerCase();
    if (!out.has(key) || (out.get(key) ?? 0) < score) out.set(key, score);
    labels.set(key, label);
  };
  const labels = new Map<string, string>();
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
