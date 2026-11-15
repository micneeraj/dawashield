// "Why this result?" — plain code only, no AI. Explains a RED / AMBER / GREY
// result from the user's own fields, the matched CDSCO record and dataset meta.
import { manufacturerEntity, namesMatch, normalizeBatch } from "./normalize";
import type { AlertRecord, DatasetMeta, MatchInput, MatchResult } from "./types";

export type RowStatus = "match" | "different" | "missing";
export interface WhyRow {
  field: "name" | "batch" | "manufacturer";
  yours?: string;
  record?: string;
  status: RowStatus;
}
export interface WhySearch {
  records: number;
  from: string | null;
  to: string | null;
  missingMonths: string[];
  statesMissing: string[];
}

export function compareFields(input: MatchInput, r: AlertRecord): WhyRow[] {
  const rows: WhyRow[] = [];
  const st = (yours: string | undefined, ok: boolean): RowStatus => (!yours?.trim() ? "missing" : ok ? "match" : "different");
  rows.push({ field: "name", yours: input.name, record: r.name + (r.brand ? ` (${r.brand})` : ""), status: st(input.name, namesMatch(input.name, r.name, r.brand)) });
  const b = normalizeBatch(input.batch);
  rows.push({ field: "batch", yours: input.batch, record: r.batch, status: st(input.batch, !!b && b === r.batchNorm) });
  const e = manufacturerEntity(input.manufacturer);
  rows.push({ field: "manufacturer", yours: input.manufacturer, record: r.manufacturerName || r.manufacturer, status: st(input.manufacturer, !!e && !!r.manufacturerEntity && e === r.manufacturerEntity) });
  return rows;
}

export function whySearch(meta: DatasetMeta | null | undefined): WhySearch {
  return {
    records: meta?.records ?? 0,
    from: meta?.earliestMonth ?? null,
    to: meta?.latestMonth ?? null,
    missingMonths: meta?.missingMonths ?? [],
    statesMissing: meta?.statesPendingLatestMonth ?? [],
  };
}

export function explainResult(input: MatchInput, result: MatchResult, meta?: DatasetMeta | null) {
  const r = result.records[0];
  return { level: result.level, rows: r && result.level !== "GREY" ? compareFields(input, r) : [], search: whySearch(meta) };
}

const FIELD_WORD = {
  en: { name: "medicine", batch: "batch", manufacturer: "manufacturer" },
  hi: { name: "दवा", batch: "बैच", manufacturer: "कंपनी" },
} as const;

/** One honest sentence, e.g. "Medicine and batch match; manufacturer not provided".
 *  A field the user did not give is never described as verified. */
export function whySummary(rows: WhyRow[], lang: "hi" | "en"): string {
  const w = (s: RowStatus) => rows.filter((r) => r.status === s).map((r) => FIELD_WORD[lang][r.field]);
  const join = (a: string[]) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} ${lang === "hi" ? "और" : "and"} ${a[a.length - 1]}`);
  const m = w("match"), d = w("different"), x = w("missing");
  const parts: string[] = [];
  if (lang === "hi") {
    if (m.length) parts.push(`${join(m)} ${m.length > 1 ? "मिलते हैं" : "मिलता है"}`);
    if (d.length) parts.push(`${join(d)} अलग ${d.length > 1 ? "हैं" : "है"}`);
    if (x.length) parts.push(`${join(x)} नहीं डाला गया`);
  } else {
    if (m.length) parts.push(`${join(m)} ${m.length > 1 ? "match" : "matches"}`);
    if (d.length) parts.push(`${join(d)} ${d.length > 1 ? "differ" : "differs"}`);
    if (x.length) parts.push(`${join(x)} not provided`);
  }
  const s = parts.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
