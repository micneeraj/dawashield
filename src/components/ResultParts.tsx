import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Cloud, Code2, Copy, Cpu, ExternalLink, FileText, HelpCircle, History, Keyboard, Minus, Smartphone, X } from "lucide-react";
import { useApp, type CheckState } from "../state";
import { Card, cx } from "./ui";
import { monthLabel, officialLink } from "../lib/format";
import { isPastOrToday, formatExpiry } from "../lib/expiry";
import { explainResult, whySummary, type RowStatus } from "../lib/why";
import type { AlertRecord } from "../lib/types";

const L = {
  reason: { hi: "जाँच में कमी", en: "Failure reason" },
  lab: { hi: "जाँच करने वाली लैब", en: "Testing lab" },
  month: { hi: "चेतावनी का महीना", en: "Alert month" },
  maker: { hi: "निर्माता (जैसा लिखा है)", en: "Manufacturer (as stated)" },
  type: { hi: "प्रकार", en: "Type" },
  nsq: { hi: "मानक से कम (NSQ)", en: "Not of Standard Quality (NSQ)" },
  spurious: { hi: "नकली (Spurious)", en: "Spurious" },
  pdf: { hi: "सरकारी PDF खोलें", en: "Open official PDF" },
  portal: { hi: "CDSCO चेतावनी पेज खोलें", en: "Open CDSCO alerts page" },
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
  stepNano: { hi: "Gemini Nano ने समझा · इसी फ़ोन पर", en: "Understood by Gemini Nano · On this device" },
  stepFlash: { hi: "Gemini Flash ने समझा · क्लाउड", en: "Understood by Gemini Flash · Cloud" },
  stepLocal: { hi: "इसी फ़ोन पर नाम-खोज से समझा · AI उपलब्ध नहीं था", en: "Understood by name search on this device · AI was not available" },
  stepTyped: { hi: "आपने लिखा", en: "Typed by you" },
  stepCode: { hi: (n: string) => `${n} CDSCO रिकॉर्ड से सादे कोड ने जाँचा`, en: (n: string) => `Checked by plain code against ${n} CDSCO records` },
  noAiSafety: { hi: "सुरक्षा का फ़ैसला AI नहीं करता", en: "No AI decides safety" },
  heard: { hi: "सुना", en: "Heard" },
  how: { hi: "यह जवाब कैसे बना", en: "How this answer was made" },
  device: { hi: "इसी फ़ोन पर", en: "On this device" },
  cloud: { hi: "क्लाउड", en: "Cloud" },
  code: { hi: "सादा कोड · इसी फ़ोन पर", en: "Plain code · On this device" },
  noAiCalls: { hi: "कोई AI कॉल नहीं हुई, सब कुछ आपने लिखा।", en: "No AI calls were made, you typed everything." },
  listed: { hi: (n: number) => `स्रोत PDF में ${n} बार दर्ज`, en: (n: number) => `Listed ${n} times in the source PDF` },
  entries: { hi: "प्रविष्टि", en: "entries" },
  task: {
    speech: { hi: "आवाज़ से दवा का नाम समझा", en: "Understood the spoken medicine name" },
    transcribe: { hi: "रिकॉर्ड की गई आवाज़ को शब्दों में लिखा", en: "Wrote the recorded speech as text" },
    "photo-full": { hi: "पूरी फ़ोटो पढ़ी", en: "Read the full photo" },
    "photo-crop": { hi: "B.No / EXP वाला हिस्सा ज़ूम करके पढ़ा", en: "Read the zoomed B.No / EXP area" },
    "photo-enhanced": { hi: "चमक घटाकर, कंट्रास्ट बढ़ाकर दोबारा पढ़ा", en: "Re-read with glare reduced and contrast boosted" },
    explain: { hi: "रिकॉर्ड आसान शब्दों में समझाया", en: "Explained the record" },
    chat: { hi: "आपके सवाल का जवाब", en: "Answered your question" },
    match: { hi: "सरकारी सूची से मिलान", en: "Matched against the official list" },
  },
};

/** Two-step pipeline on every result: what the AI understood (real inferenceSource), then plain-code matching. */
export function PipelineStrip({ check }: { check: CheckState }) {
  const { lang } = useApp();
  const { input } = check;
  const n = (check.searched ?? 0).toLocaleString("en-IN");
  const u = input.understood;
  const src = input.readSource;
  const step1 = !u ? L.stepTyped[lang] : src === "device" ? L.stepNano[lang] : src === "cloud" ? L.stepFlash[lang] : L.stepLocal[lang];
  const Icon1 = !u ? Keyboard : src === "cloud" ? Cloud : Smartphone;
  return (
    <ol className="mt-4 rounded-2xl bg-white/80 p-3 ring-1 ring-black/5" data-testid="pipeline" data-source={u ? src ?? "local" : "typed"}>
      <li className="flex gap-3">
        <span className="flex flex-col items-center">
          <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-white", src === "cloud" && u ? "bg-sky-600" : "bg-brand-700")}><Icon1 size={16} /></span>
          <span className="my-1 w-0.5 flex-1 bg-line" />
        </span>
        <div className="pb-3">
          <p className="text-[14.5px] font-bold leading-tight text-ink" data-testid="pipeline-step1">{step1}</p>
          {u?.heard && <p className="mt-1 text-[14px] text-muted">{L.heard[lang]}: “{u.heard}”</p>}
          {u && u.items.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[14px] text-ink">
              {u.heard && <ArrowRight size={14} className="text-muted" aria-hidden />}
              {u.items.map((it) => (
                <span key={it.label.en} className="rounded-lg bg-brand-50 px-2 py-0.5 font-semibold text-brand-900">{it.label[lang]}: <span className="num">{it.value}</span></span>
              ))}
            </p>
          )}
          {!u && (input.name || input.batch) && (
            <p className="mt-1 text-[14px] text-muted"><span className="num">{[input.name, input.batch].filter(Boolean).join(" · ")}</span></p>
          )}
        </div>
      </li>
      <li className="flex gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white"><Code2 size={16} /></span>
        <div>
          <p className="text-[14.5px] font-bold leading-tight text-ink" data-testid="pipeline-step2">{L.stepCode[lang](n)}</p>
          <p className="mt-0.5 text-[13.5px] text-muted">{L.noAiSafety[lang]}</p>
        </div>
      </li>
    </ol>
  );
}

/** Every AI call behind this answer: task, real source and time. Shows the hybrid routing. */
export function HowMade({ check }: { check: CheckState }) {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const steps = check.input.aiSteps ?? [];
  return (
    <Card className="mt-4 overflow-hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="tap flex w-full items-center gap-2.5 px-5 text-left" data-testid="how-toggle">
        <Cpu size={20} className="text-brand-600" aria-hidden />
        <span className="flex-1 text-[17px] font-bold">{L.how[lang]}</span>
        <ChevronDown size={20} className={cx("text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="divide-y divide-line/70 border-t border-line/70 px-5" data-testid="how-list">
          {steps.length === 0 && <li className="py-3 text-[15px] text-muted">{L.noAiCalls[lang]}</li>}
          {steps.map((st, i) => (
            <li key={i} className="flex items-center gap-3 py-3" data-testid="how-step" data-source={st.source}>
              <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", st.source === "cloud" ? "bg-sky-50 text-sky-700" : "bg-brand-50 text-brand-700")}>
                {st.source === "cloud" ? <Cloud size={16} /> : <Smartphone size={16} />}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">{L.task[st.task][lang]}</span>
                <span className="text-[13.5px] text-muted">{st.source === "cloud" ? `Gemini Flash · ${L.cloud[lang]}` : `Gemini Nano · ${L.device[lang]}`}</span>
              </span>
              <span className="num text-[15px] font-bold text-ink">{st.ms < 1000 ? `${st.ms} ms` : `${(st.ms / 1000).toFixed(1)} s`}</span>
            </li>
          ))}
          <li className="flex items-center gap-3 py-3" data-testid="how-step" data-source="code">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white"><Code2 size={16} /></span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-ink">{L.task.match[lang]}</span>
              <span className="text-[13.5px] text-muted">{L.code[lang]} · {(check.searched ?? 0).toLocaleString("en-IN")}</span>
            </span>
            <span className="num text-[15px] font-bold text-ink">{check.matchMs ?? 1} ms</span>
          </li>
        </ul>
      )}
    </Card>
  );
}

/** "Listed 2 times in the source PDF (entries 88 and 89)". */
export function ListedNote({ r }: { r: AlertRecord }) {
  const { lang } = useApp();
  if (!r.listedTimes || r.listedTimes < 2) return null;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-grey-soft px-3.5 py-2.5 text-[15px] font-medium text-grey-ink" data-testid="listed-note">
      <Copy size={16} className="mt-0.5 shrink-0" aria-hidden />
      {L.listed[lang](r.listedTimes)}{r.pdfEntries?.length ? ` (${L.entries[lang]} ${r.pdfEntries.join(lang === "hi" ? " और " : " and ")})` : ""}
    </p>
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
        <ListedNote r={r} />
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
        <a href={officialLink(r).url} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 rounded-2xl bg-brand-700 px-4 text-[16px] font-semibold text-white hover:bg-brand-800" data-testid="source-pdf" data-kind={officialLink(r).kind}>
          {officialLink(r).kind === "pdf" ? <FileText size={18} /> : <ExternalLink size={18} />} {officialLink(r).kind === "pdf" ? L.pdf[lang] : L.portal[lang]}
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
  const [open, setOpen] = useState(check.result.level === "RED" || check.result.level === "AMBER");
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
          {(w.level === "RED" || w.level === "AMBER") && (
            <p className="mb-3 rounded-2xl bg-paper px-4 py-3 text-[16px] font-semibold text-ink" data-testid="why-summary">{whySummary(w.rows, lang)}</p>
          )}
          {(w.level === "RED" || w.level === "AMBER") && (
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
