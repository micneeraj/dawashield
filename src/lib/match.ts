// The matching engine. Plain code: AI never decides the colour.
//
//   RED   = normalised batch equals an alert batch AND the medicine name matches.
//   AMBER = possible match: batch one character off for the same medicine,
//           batch equal but medicine name differs, the exact company entity has
//           an alert but this batch is not listed, or no batch was given for a
//           medicine that has alerts.
//   GREY  = nothing found in the downloaded data. Never "safe".
import type { AlertRecord, MatchInput, MatchResult } from "./types";
import { levenshtein, manufacturerEntity, namesMatch, normalizeBatch } from "./normalize";

const named = (r: AlertRecord, name?: string) => namesMatch(name, r.name, r.brand);

export function matchMedicine(input: MatchInput, records: AlertRecord[]): MatchResult {
  const batch = normalizeBatch(input.batch);
  const entity = manufacturerEntity(input.manufacturer);

  if (batch) {
    const sameBatch = records.filter((r) => r.batchNorm === batch);
    const exact = sameBatch.filter((r) => named(r, input.name));
    if (exact.length) return { level: "RED", reason: "exact", records: exact };

    // Short batches ("12", "A1") are too common to call near-matches.
    if (batch.length >= 4) {
      const near = records.filter(
        (r) => r.batchNorm.length >= 4 && levenshtein(r.batchNorm, batch) === 1 && named(r, input.name),
      );
      if (near.length) return { level: "AMBER", reason: "near-batch", records: near };
    }
    if (sameBatch.length) return { level: "AMBER", reason: "batch-other-name", records: sameBatch };
  } else if (input.name) {
    const byName = records.filter((r) => named(r, input.name));
    if (byName.length) return { level: "AMBER", reason: "name-no-batch", records: byName };
  }

  if (entity) {
    const company = records.filter((r) => r.manufacturerEntity === entity);
    if (company.length) return { level: "AMBER", reason: "company", records: company };
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
