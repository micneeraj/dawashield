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

export type Level = "RED" | "AMBER" | "GREY" | "UNREADABLE";

/** Why a result got its colour. Each maps to one pre-written message. */
export type MatchReason =
  | "exact" // RED: exact batch + high-confidence company (or medicine, when the record names no company)
  | "possible-company" // AMBER: exact batch, company only a medium-confidence match
  | "company-unconfirmed" // AMBER: exact batch, no company given to confirm it
  | "batch-other-company" // AMBER: exact batch, but a clearly different company
  | "batch-other-name" // AMBER: exact batch, different medicine name
  | "near-batch" // AMBER: batch one character / OCR look-alike off, same medicine or company
  | "partial-batch" // AMBER: batch looks incomplete, same medicine or company
  | "other-batches" // AMBER: same company AND same medicine, different batch
  | "name-no-batch" // AMBER: no batch given, medicine has alerts
  | "company-other-medicine" // GREY + note: same company, different medicine (the Dolo case)
  | "company-batch-unlisted" // GREY + note: same company, medicine not given, batch not listed
  | "unreadable" // CAN'T READ: photo / voice confidence too low
  | "none";

export interface MatchInput {
  name?: string;
  batch?: string;
  manufacturer?: string;
  /** Photo / voice reading too uncertain to match: result is "Can't read clearly". */
  unreadable?: boolean;
}

export interface MatchResult {
  level: Level;
  reason: MatchReason;
  records: AlertRecord[];
  /** Company entity resolution against the top record, when a company was given. */
  company?: { score: number; band: "exact" | "high" | "medium" | "low" };
}

export type Source = "device" | "cloud";
