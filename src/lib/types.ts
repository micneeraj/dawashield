/** One official CDSCO alert row, as built by data/build_dataset.py. */
export interface AlertRecord {
  id: string;
  type: "NSQ" | "SPURIOUS";
  name: string;
  brand?: string;
  batch: string;
  batchNorm: string;
  manufacturer: string;
  manufacturerName: string;
  manufacturerEntity: string;
  labelManufacturer?: string;
  mfgDate?: string;
  expDate?: string;
  reason: string;
  reportingSource?: string;
  lab: string;
  month: string; // "2026-09"
  sourceUrl: string;
  sourceLabel?: string;
  pdfUrl?: string;
  pdfMatch?: boolean;
  remarks?: string;
  firmReply?: string;
  status: "verified" | "pending" | "revised";
  listedTimes?: number; // same listing repeated in the source, merged into this record
  pdfEntries?: number[]; // serial numbers of those listings in the source PDF
}

export interface DatasetMeta {
  version: string;
  records: number;
  duplicatesMerged?: number;
  nsq: number;
  spurious: number;
  verified: number;
  pdfCrossChecked: number;
  earliestMonth: string | null;
  latestMonth: string | null;
  lastSynced: string;
  /** Date the daily pipeline last checked CDSCO successfully (even with no new records). */
  lastChecked?: string;
  /** Size of nsq.json, raw and gzip-compressed (what is actually downloaded). */
  bytes?: number;
  gzipBytes?: number;
  missingMonths: string[];
  statesPendingLatestMonth: string[];
  failed: { month: string; type: string; error: string }[];
  sources: string[];
}

export type Level = "RED" | "AMBER" | "GREY";

/** Why a result got its colour. Each maps to one pre-written message. */
export type MatchReason =
  | "exact" // batch + (medicine or confident company) match an alert
  | "possible-company" // exact batch, company only a medium-confidence match
  | "batch-other-company" // exact batch, but a clearly different company
  | "batch-other-name" // batch matches, medicine name differs
  | "near-batch" // batch one character off, same medicine
  | "company" // exact company entity has an alert, batch not listed
  | "name-no-batch" // no batch given, medicine has alerts
  | "none";

export interface MatchInput {
  name?: string;
  batch?: string;
  manufacturer?: string;
}

export interface MatchResult {
  level: Level;
  reason: MatchReason;
  records: AlertRecord[];
  /** Company entity resolution against the top record, when a company was given. */
  company?: { score: number; band: "exact" | "high" | "medium" | "low" };
}

export type Source = "device" | "cloud";
