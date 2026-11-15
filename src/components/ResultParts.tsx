import { useState } from "react";
import { Check, ChevronDown, Cloud, ExternalLink, FileText, HelpCircle, History, Minus, Smartphone, X } from "lucide-react";
import { useApp, type CheckState } from "../state";
import { Card, cx } from "./ui";
import { monthLabel } from "../lib/format";
import { isPastOrToday, formatExpiry } from "../lib/expiry";
import { explainResult, type RowStatus } from "../lib/why";
import type { AlertRecord } from "../lib/types";

const L = {
  exact: { hi: "यही बैच CDSCO चेतावनी में है", en: "This exact batch is in a CDSCO alert" },
  reason: { hi: "जाँच में कमी", en: "Failure reason" },
  lab: { hi: "जाँच करने वाली लैब", en: "Testing lab" },
  month: { hi: "चेतावनी का महीना", en: "Alert month" },
  maker: { hi: "निर्माता (जैसा लिखा है)", en: "Manufacturer (as stated)" },
  type: { hi: "प्रकार", en: "Type" },
  nsq: { hi: "मानक से कम (NSQ)", en: "Not of Standard Quality (NSQ)" },
  spurious: { hi: "नकली (Spurious)", en: "Spurious" },
  pdf: { hi: "सरकारी PDF खोलें", en: "Open official PDF" },
  portal: { hi: "CDSCO पोर्टल खोलें", en: "Open CDSCO portal" },
  upTo: { hi: "डेटा उपलब्ध", en: "Data available up to" },
  historical: { hi: "पुरानी चेतावनी — इस बैच की समाप्ति तिथि थी", en: "Historical alert, this batch's expiry was" },
  why: { hi: "यह नतीजा क्यों?", en: "Why this result?" },
  yours: { hi: "आपने डाला", en: "You entered" },
  record: { hi: "CDSCO रिकॉर्ड", en: "CDSCO record" },
  name: { hi: "दवा", en: "Medicine" },
  batch: { hi: "बैच", en: "Batch" },
  manufacturer: { hi: "कंपनी", en: "Company" },
  match: { hi: "मिलता है", en: "Matches" },
  different: { hi: "अलग है", en: "Different" },
  missing: { hi: "नहीं डाला", en: "Not given" },
  searched: { hi: "क्या खोजा गया", en: "What was searched" },
  recordsN: { hi: "सरकारी रिकॉर्ड इसी फ़ोन पर खोजे गए", en: "official records searched on this phone" },
  months: { hi: "अवधि", en: "Months covered" },
  states: { hi: "इन राज्यों की ताज़ा सूची अभी नहीं आई", en: "States not yet reported for the latest month" },
  none: { hi: "कोई नहीं", en: "None" },
  noGuarantee: { hi: "मिलान न होना सुरक्षा की गारंटी नहीं है।", en: "No match is not a safety guarantee." },
  plain: { hi: "यह सीधा कोड-मिलान है, इसमें AI नहीं है।", en: "Plain code matching, no AI involved." },
  amberMatched: { hi: "मिला", en: "Matched" },
  amberUnsure: { hi: "पक्का नहीं / अलग", en: "Uncertain or different" },
  deviceAns: { hi: "इसी फ़ोन पर जवाब · Gemini Nano", en: "Answered on this device · Gemini Nano" },
  cloudAns: { hi: "क्लाउड से जवाब", en: "Answered via cloud" },
  localMatch: { hi: "मिलान इसी फ़ोन पर हुआ · AI की ज़रूरत नहीं", en: "Matched on this device · no AI needed" },
};

/** Badge on every result: where the AI answer came from (SDK inferenceSource), or that no AI was used. */
export function AnswerBadge({ check }: { check: CheckState }) {
  const { lang, lastAi } = useApp();
  const src = check.input.readSource ?? null;
  const shown = src ?? null;
  const Icon = shown === "cloud" ? Cloud : Smartphone;
  const label = shown === "device" ? L.deviceAns[lang] : shown === "cloud" ? L.cloudAns[lang] : L.localMatch[lang];
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13.5px] font-semibold ring-1", shown === "cloud" ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-white/80 text-brand-800 ring-brand-200")}
      data-testid="answer-badge"
      data-source={shown ?? "none"}
      data-last-ai={lastAi ?? "none"}
    >
      <Icon size={14} aria-hidden /> {label}
    </span>
  );
}

/** RED: the facts that matter most, biggest after the verdict. */
export function RedFacts({ r }: { r: AlertRecord }) {
  const { lang, dataset } = useApp();
  const historical = r.expDate && isPastOrToday(r.expDate);
  return (
    <Card className="mt-4 overflow-hidden" >
      <dl className="space-y-4 p-5" data-testid="red-facts">
        <div>
          <dt className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{L.reason[lang]}</dt>
          <dd className="mt-1 text-[20px] font-bold leading-snug text-ink">{r.reason}</dd>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{L.lab[lang]}</dt>
            <dd className="mt-1 text-[19px] font-bold leading-snug text-ink">{r.lab}</dd>
            {r.reportingSource && <dd className="text-[14px] text-muted">{r.reportingSource}</dd>}
          </div>
          <div>
            <dt className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{L.month[lang]}</dt>
            <dd className="mt-1 text-[19px] font-bold leading-snug text-ink">{monthLabel(r.month, lang)}</dd>
          </div>
        </div>
        {historical && (
          <p className="flex items-start gap-2 rounded-2xl bg-grey-soft px-3.5 py-2.5 text-[15px] font-medium text-grey-ink" data-testid="historical">
            <History size={17} className="mt-0.5 shrink-0" aria-hidden /> {L.historical[lang]} {formatExpiry(r.expDate, lang)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-4 border-t border-line/70 pt-4 text-[16px]">
          <div>
            <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">{L.maker[lang]}</dt>
            <dd className="mt-0.5 font-semibold text-ink">{r.manufacturerName || r.manufacturer}</dd>
          </div>
          <div>
            <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">{L.type[lang]}</dt>
            <dd className={cx("mt-0.5 font-semibold", r.type === "SPURIOUS" ? "text-red-ink" : "text-ink")}>{r.type === "SPURIOUS" ? L.spurious[lang] : L.nsq[lang]}</dd>
          </div>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-5 py-4">
        <a href={r.pdfUrl || r.sourceUrl} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 rounded-2xl bg-brand-700 px-4 text-[16px] font-semibold text-white hover:bg-brand-800" data-testid="source-pdf">
          {r.pdfUrl ? <FileText size={18} /> : <ExternalLink size={18} />} {r.pdfUrl ? L.pdf[lang] : L.portal[lang]}
        </a>
        <span className="text-[14px] text-muted">{L.upTo[lang]} <b className="text-ink">{monthLabel(dataset?.meta.latestMonth, lang)}</b></span>
      </div>
    </Card>
  );
}

const STATUS_ICON: Record<RowStatus, { icon: typeof Check; cls: string }> = {
  match: { icon: Check, cls: "bg-brand-600 text-white" },
  different: { icon: X, cls: "bg-amber-ink text-white" },
  missing: { icon: Minus, cls: "bg-grey-soft text-grey-ink" },
};

/** "Why this result?" — plain code, on every result. */
export function WhyPanel({ check }: { check: CheckState }) {
  const { lang, dataset } = useApp();
  const [open, setOpen] = useState(check.result.level !== "GREY");
  const w = explainResult(check.input, check.result, dataset?.meta);
  const fieldLabel = { name: L.name, batch: L.batch, manufacturer: L.manufacturer };

  return (
    <Card className="mt-4 overflow-hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="tap flex w-full items-center gap-2.5 px-5 text-left" data-testid="why-toggle">
        <HelpCircle size={21} className="text-brand-600" aria-hidden />
        <span className="flex-1 text-[18px] font-bold">{L.why[lang]}</span>
        <ChevronDown size={20} className={cx("text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line/70 px-5 pb-5 pt-4" data-testid="why-panel" data-level={w.level}>
          {w.level !== "GREY" && (
            <table className="w-full table-fixed border-separate border-spacing-y-1.5 text-left">
              <thead>
                <tr className="text-[12.5px] font-bold uppercase tracking-wide text-muted">
                  <th className="w-[24%] pb-1" />
                  <th className="pb-1">{L.yours[lang]}</th>
                  <th className="pb-1">{L.record[lang]}</th>
                  <th className="w-9 pb-1" />
                </tr>
              </thead>
              <tbody>
                {w.rows.map((row) => {
                  const S = STATUS_ICON[row.status];
                  return (
                    <tr key={row.field} className="align-top" data-testid={`why-${row.field}`} data-status={row.status}>
                      <td className="py-1.5 pr-2 text-[14px] font-semibold text-muted">{fieldLabel[row.field][lang]}</td>
                      <td className={cx("break-words py-1.5 pr-2 text-[15.5px] font-semibold text-ink", row.field === "batch" && "num")}>{row.yours || "—"}</td>
                      <td className={cx("break-words py-1.5 pr-2 text-[15.5px] text-ink/85", row.field === "batch" && "num font-semibold")}>{row.record || "—"}</td>
                      <td className="py-1.5">
                        <span className={cx("grid h-7 w-7 place-items-center rounded-full", S.cls)} title={L[row.status][lang]} aria-label={L[row.status][lang]}>
                          <S.icon size={15} strokeWidth={3} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {w.level === "AMBER" && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-[14.5px]">
              <p className="rounded-2xl bg-brand-50 px-3 py-2"><b className="text-brand-800">{L.amberMatched[lang]}:</b> {w.rows.filter((r) => r.status === "match").map((r) => fieldLabel[r.field][lang]).join(", ") || L.none[lang]}</p>
              <p className="rounded-2xl bg-amber-soft px-3 py-2"><b className="text-amber-ink">{L.amberUnsure[lang]}:</b> {w.rows.filter((r) => r.status !== "match").map((r) => fieldLabel[r.field][lang]).join(", ") || L.none[lang]}</p>
            </div>
          )}
          {w.level === "GREY" && (
            <div className="space-y-3 text-[16px]">
              <p className="text-[15px] font-bold uppercase tracking-wide text-muted">{L.searched[lang]}</p>
              <p><b className="text-[22px]">{w.search.records.toLocaleString("en-IN")}</b> {L.recordsN[lang]}</p>
              <p><span className="text-muted">{L.months[lang]}:</span> <b>{monthLabel(w.search.from, lang)} – {monthLabel(w.search.to, lang)}</b></p>
              <div>
                <p className="text-muted">{L.states[lang]} ({w.search.statesMissing.length}):</p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink/85">{w.search.statesMissing.join(", ") || L.none[lang]}</p>
              </div>
              <p className="rounded-2xl bg-grey-soft px-4 py-3 font-semibold text-grey-ink" data-testid="no-guarantee">{L.noGuarantee[lang]}</p>
            </div>
          )}
          <p className="mt-3 text-[13px] text-muted">{L.plain[lang]}</p>
        </div>
      )}
    </Card>
  );
}
