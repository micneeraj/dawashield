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
