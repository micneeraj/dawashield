import { BadgeCheck, ExternalLink, FileText } from "lucide-react";
import { useApp } from "../state";
import { Card, cx } from "./ui";
import { monthLabel } from "../lib/format";
import { NSQ_NOTE, SPURIOUS_NOTE } from "../content/messages";
import type { AlertRecord } from "../lib/types";

function Row({ label, value, big, mono }: { label: string; value?: string; big?: boolean; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="border-t border-line/70 py-3 first:border-t-0 first:pt-0">
      <dt className="text-[14px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cx("mt-0.5 text-ink", big ? "text-[22px] font-bold" : "text-[17px]", mono && "num")}>{value}</dd>
    </div>
  );
}

/** The full government record behind a result. */
export function RecordCard({ r }: { r: AlertRecord }) {
  const { t, lang } = useApp();
  const spurious = r.type === "SPURIOUS";
  return (
    <Card className="p-5" >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cx("rounded-full px-3 py-1 text-[13px] font-bold tracking-wide", spurious ? "bg-red-ink text-white" : "bg-ink text-white")}>
          {spurious ? (lang === "hi" ? "नकली (SPURIOUS)" : "SPURIOUS") : (lang === "hi" ? "मानक से कम (NSQ)" : "NSQ")}
        </span>
        {r.status === "verified" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[13px] font-semibold text-brand-800 ring-1 ring-brand-200">
            <BadgeCheck size={15} /> {t("verified")}
          </span>
        )}
      </div>
      <p className="mb-4 text-[15px] leading-snug text-muted">{spurious ? SPURIOUS_NOTE[lang] : NSQ_NOTE[lang]}</p>
      <dl data-testid="record">
        <Row label={t("medicineName")} value={r.name + (r.brand ? ` (${r.brand})` : "")} big />
        <Row label={t("batchNo")} value={r.batch} big mono />
        <Row label={t("manufacturer")} value={r.manufacturerName || r.manufacturer} />
        {r.labelManufacturer && <Row label={lang === "hi" ? "लेबल पर कंपनी" : "Company on label"} value={r.labelManufacturer} />}
        <Row label={t("mfgExp")} value={[r.mfgDate, r.expDate].filter(Boolean).join("  →  ")} mono />
        <Row label={t("failure")} value={r.reason} />
        {r.remarks && <Row label={lang === "hi" ? "टिप्पणी" : "Remarks"} value={r.remarks} />}
        <Row label={t("testedBy")} value={[r.lab, r.reportingSource].filter(Boolean).join(" · ")} />
        <Row label={t("alertMonth")} value={monthLabel(r.month, lang)} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 text-[16px] font-semibold text-brand-800 hover:bg-brand-100">
          <ExternalLink size={18} /> {t("openSource")}
        </a>
        {r.pdfUrl && (
          <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-4 text-[16px] font-semibold text-brand-800 hover:border-brand-300">
            <FileText size={18} /> {t("openPdf")}
          </a>
        )}
      </div>
    </Card>
  );
}
