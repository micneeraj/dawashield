import { useState } from "react";
import { BadgeCheck, BookOpenText, CalendarPlus, CalendarCheck, ExternalLink, FileText, Flag, PackagePlus, Receipt, ShieldAlert, Check, Database, Smartphone } from "lucide-react";
import { useApp, type CheckState } from "../state";
import { Button, Card, cx, inputCls } from "./ui";
import { Sheet } from "./Sheet";
import { GREY_STEPS, OFFICIAL, type Lang } from "../content/messages";
import { explain } from "../content/templates";
import { monthLabel, dateLabel, officialLink } from "../lib/format";
import { expiryStatus } from "../lib/expiry";
import { downloadIcs, expiryIcs, expiryMonth } from "../lib/reminders";
import { reportWrongResult, type WrongKind } from "../lib/cloud";
import type { DatasetMeta } from "../lib/types";

const L = {
  checkedUpTo: { hi: "सरकारी डेटा इस महीने तक जाँचा गया", en: "Official data checked up to" },
  lastUpdated: { hi: "आख़िरी अपडेट", en: "Last updated" },
  source: { hi: "स्रोत", en: "Source" },
  alertMonth: { hi: "CDSCO चेतावनी का महीना", en: "CDSCO alert month" },
  recordId: { hi: "रिकॉर्ड ID", en: "Record ID" },
  official: { hi: "सरकारी लिंक", en: "Official link" },
  portal: { hi: "CDSCO NSQ पोर्टल", en: "CDSCO NSQ portal" },
  pdf: { hi: "इस चेतावनी की मासिक CDSCO PDF", en: "Monthly CDSCO PDF for this alert" },
  alertsPage: { hi: "CDSCO चेतावनी पेज", en: "CDSCO alerts page" },
  noRecord: { hi: "इस बैच का कोई सरकारी रिकॉर्ड नहीं मिला। हमने यह सूची जाँची:", en: "No official record matched this batch. We checked this list:" },
  verified: { hi: "हाथ से मिलाया गया", en: "Verified" },
  meaning: { hi: "इसका मतलब क्या है", en: "What this means" },
  meaningNote: { hi: "पहले से लिखा संदेश, सरकारी रिकॉर्ड से भरा गया · इसी फ़ोन पर, बिना इंटरनेट", en: "Pre-written message filled from the official record · on this device, works offline" },
  nextSteps: { hi: "आगे क्या करें", en: "What to do next" },
  saveOne: { hi: "एक बार दबाकर सहेजें", en: "Save with one tap" },
  saved: { hi: "सहेज ली गई", en: "Saved" },
  reportSusp: { hi: "शिकायत का संदेश बनाएँ", en: "Write a complaint" },
  wrong: { hi: "गलत नतीजा? बताइए", en: "Report a wrong result" },
  wrongTitle: { hi: "नतीजे में क्या गलत लगा?", en: "What looks wrong?" },
  wrongNote: { hi: "सिर्फ़ नतीजे का रंग, बैच, कंपनी और रिकॉर्ड ID भेजे जाते हैं। आपका नाम, फ़ोन या कोई निजी जानकारी नहीं।", en: "Only the result colour, batch, company and record IDs are sent. No name, phone or personal details." },
  notePh: { hi: "छोटी टिप्पणी (ज़रूरी नहीं, कोई निजी जानकारी न लिखें)", en: "Short note (optional, no personal details)" },
  send: { hi: "भेजें", en: "Send" },
  thanks: { hi: "धन्यवाद। हम इसकी जाँच करेंगे।", en: "Thank you. We will look into it." },
  failed: { hi: "भेजा नहीं जा सका। इंटरनेट से जुड़कर फिर कोशिश कीजिए।", en: "Could not send. Connect to the internet and try again." },
  calendar: { hi: "तारीख़ कैलेंडर में जोड़ें", en: "Add expiry to my calendar" },
  calendarDone: { hi: "कैलेंडर फ़ाइल डाउनलोड हुई", en: "Calendar file downloaded" },
  demo: { hi: "डेमो: असली सरकारी रिकॉर्ड", en: "Demo: a real official record" },
};

const KINDS: { k: WrongKind; t: Record<Lang, string> }[] = [
  { k: "should-not-be-red", t: { hi: "मेरी दवा इस चेतावनी वाली नहीं है", en: "My medicine is not the one in this alert" } },
  { k: "should-be-red", t: { hi: "यह बैच चेतावनी में है, पर ऐप ने नहीं पकड़ा", en: "This batch is on an alert, but the app missed it" } },
  { k: "wrong-record", t: { hi: "दिखाया गया रिकॉर्ड गलत है", en: "The record shown is wrong" } },
  { k: "photo-misread", t: { hi: "फ़ोटो गलत पढ़ी गई", en: "The photo was read wrongly" } },
  { k: "other", t: { hi: "कुछ और", en: "Something else" } },
];

/** "Official data checked up to: <month>" and "Last updated: <date>". */
export function DataFreshness({ meta, className }: { meta?: DatasetMeta | null; className?: string }) {
  const { lang } = useApp();
  return (
    <div className={cx("grid grid-cols-2 gap-2", className)} data-testid="data-upto">
      <div className="rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-line">
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{L.checkedUpTo[lang]}</p>
        <p className="text-[17px] font-bold text-ink" data-testid="checked-up-to">{monthLabel(meta?.latestMonth, lang)}</p>
      </div>
      <div className="rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-line">
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{L.lastUpdated[lang]}</p>
        <p className="text-[17px] font-bold text-ink" data-testid="last-updated">{dateLabel(meta?.lastChecked ?? meta?.lastSynced, lang)}</p>
      </div>
    </div>
  );
}

/** Source of the answer, on every result: CDSCO alert month, official link, record ID, verified badge. */
export function SourceBlock({ check }: { check: CheckState }) {
  const { lang, dataset } = useApp();
  const rs = check.result.records.slice(0, 3);
  return (
    <Card className="mt-4 p-5" >
      <h3 className="mb-3 flex items-center gap-2 text-[18px] font-bold"><Database size={20} className="text-brand-600" aria-hidden /> {L.source[lang]}</h3>
      {rs.length === 0 && (
        <div data-testid="source-none">
          <p className="text-[16px] text-ink">{L.noRecord[lang]}</p>
          <a href={OFFICIAL.portalUrl} target="_blank" rel="noreferrer" className="tap mt-2 inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 text-[16px] font-semibold text-brand-800"><ExternalLink size={18} /> {L.portal[lang]}</a>
        </div>
      )}
      <ul className="space-y-3">
        {rs.map((r) => (
          <li key={r.id} className="rounded-2xl bg-paper p-3.5" data-testid="source-record">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-muted">{L.alertMonth[lang]}:</span>
              <b className="text-[16px] text-ink">{monthLabel(r.month, lang)}</b>
              {r.status === "verified" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2.5 py-0.5 text-[13px] font-bold text-white" data-testid="verified-badge"><BadgeCheck size={14} /> {L.verified[lang]}</span>
              )}
            </div>
            <p className="mt-1 text-[15px] text-muted">{L.recordId[lang]}: <span className="num font-semibold text-ink" data-testid="record-id">{r.id}</span></p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={officialLink(r).url} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-1.5 rounded-2xl bg-white px-3.5 text-[15px] font-semibold text-brand-800 ring-1 ring-line" data-testid="official-link" data-kind={officialLink(r).kind}>{officialLink(r).kind === "pdf" ? <FileText size={17} /> : <ExternalLink size={17} />} {officialLink(r).kind === "pdf" ? L.pdf[lang] : L.alertsPage[lang]}</a>
              <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-1.5 rounded-2xl bg-white px-3.5 text-[15px] font-semibold text-brand-800 ring-1 ring-line"><ExternalLink size={17} /> {L.portal[lang]}</a>
            </div>
          </li>
        ))}
      </ul>
      <DataFreshness meta={dataset?.meta} className="mt-3" />
    </Card>
  );
}

/** Pre-written Hindi/English explanation for the result. Offline, no AI. */
export function WhatItMeans({ check }: { check: CheckState }) {
  const { lang } = useApp();
  const { input, result } = check;
  const paras = explain(result, input, lang, { expired: !!input.expiry && expiryStatus(input.expiry) === "expired", uncertain: input.uncertain });
  if (!paras.length) return null;
  return (
    <Card className="mt-4 p-5" >
      <h3 className="flex items-center gap-2 text-[18px] font-bold"><BookOpenText size={20} className="text-brand-600" aria-hidden /> {L.meaning[lang]}</h3>
      <div className="mt-2 space-y-2" data-testid="template-explanation">
        {paras.map((p, i) => <p key={i} className="text-[17.5px] leading-relaxed text-ink">{p}</p>)}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-muted"><Smartphone size={14} aria-hidden /> {L.meaningNote[lang]}</p>
    </Card>
  );
}

const STEP_ICON = { expiry: CalendarCheck, chemist: Receipt, save: PackagePlus, report: ShieldAlert };

/** Next steps under GREY, so "no alert" never reads as "safe". */
export function GreyNextSteps({ saved, onSave, onReport }: { saved: boolean; onSave: () => void; onReport: () => void }) {
  const { lang } = useApp();
  return (
    <Card className="mt-4 p-5" >
      <h3 className="text-[19px] font-bold">{L.nextSteps[lang]}</h3>
      <ol className="mt-3 space-y-3" data-testid="grey-steps">
        {GREY_STEPS.map((st) => {
          const Icon = STEP_ICON[st.key];
          return (
            <li key={st.key} className="flex gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon size={22} aria-hidden /></span>
              <div className="flex-1">
                <p className="text-[17px] font-bold leading-snug text-ink">{st.title[lang]}</p>
                <p className="text-[15.5px] leading-snug text-muted">{st.body[lang]}</p>
                {st.key === "save" && (
                  <Button variant={saved ? "soft" : "primary"} className="mt-2" icon={saved ? <Check size={20} /> : <PackagePlus size={20} />} onClick={() => !saved && onSave()} data-testid="grey-save">
                    {saved ? L.saved[lang] : L.saveOne[lang]}
                  </Button>
                )}
                {st.key === "report" && (
                  <Button variant="secondary" className="mt-2" icon={<Flag size={20} />} onClick={onReport}>{L.reportSusp[lang]}</Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Fallback for people who don't allow push: download an .ics reminder 5 days before expiry. */
export function CalendarButton({ name, expiry, who, className }: { name: string; expiry?: string; who?: string; className?: string }) {
  const { lang } = useApp();
  const [done, setDone] = useState(false);
  const month = expiryMonth(expiry);
  if (!month) return null;
  return (
    <Button variant="secondary" className={className} icon={done ? <Check size={20} /> : <CalendarPlus size={20} />} data-testid="ics-btn"
      onClick={() => {
        const title = lang === "hi" ? `दवा की तारीख़ ख़त्म होने वाली है: ${name}` : `Medicine expiring soon: ${name}`;
        const desc = lang === "hi"
          ? `${who ? who + " की " : ""}दवा ${name} की समाप्ति तिथि ${month} है। केमिस्ट से नई दवा के बारे में पूछिए। — दवा कवच`
          : `${name}${who ? ` (${who})` : ""} expires ${month}. Ask your chemist about a fresh pack. — DawaShield`;
        const ics = expiryIcs({ title, description: desc, month, uid: `${month}-${name}`.replace(/[^A-Za-z0-9-]/g, "") });
        if (ics) { downloadIcs(`dawashield-expiry-${month}.ics`, ics); setDone(true); }
      }}>
      {done ? L.calendarDone[lang] : L.calendar[lang]}
    </Button>
  );
}

/** "Report a wrong result": stored in Firestore, no personal data. */
export function WrongResultSheet({ open, onClose, check }: { open: boolean; onClose: () => void; check: CheckState }) {
  const { lang, dataset } = useApp();
  const [kind, setKind] = useState<WrongKind | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  async function send() {
    if (!kind) return;
    setState("busy");
    const ok = await reportWrongResult({
      level: check.result.level, reason: check.result.reason, batch: check.input.batch, company: check.input.manufacturer,
      recordIds: check.result.records.slice(0, 10).map((r) => r.id), kind, note, datasetVersion: dataset?.meta.version,
    });
    setState(ok ? "ok" : "fail");
  }
  return (
    <Sheet open={open} onClose={onClose} title={L.wrongTitle[lang]}>
      {state === "ok" ? (
        <p className="rounded-2xl bg-brand-50 p-4 text-[17px] font-semibold text-brand-900" data-testid="wrong-thanks">{L.thanks[lang]}</p>
      ) : (
        <>
          <div className="space-y-2">
            {KINDS.map(({ k, t }) => (
              <button key={k} onClick={() => setKind(k)} className={cx("flex min-h-14 w-full items-center rounded-2xl border-2 px-4 text-left text-[17px] font-semibold", kind === k ? "border-brand-600 bg-brand-50 text-brand-900" : "border-line bg-white text-ink")} data-testid="wrong-kind">
                {t[lang]}
              </button>
            ))}
          </div>
          <input className={cx(inputCls, "mt-3 text-[17px]")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={L.notePh[lang]} aria-label={L.notePh[lang]} />
          <p className="mt-2 text-[14px] leading-snug text-muted">{L.wrongNote[lang]}</p>
          {state === "fail" && <p className="mt-2 text-[15px] font-semibold text-amber-ink">{L.failed[lang]}</p>}
          <Button full className="mt-4" icon={<Flag size={20} />} disabled={!kind || state === "busy"} onClick={send} data-testid="wrong-send">{L.send[lang]}</Button>
        </>
      )}
    </Sheet>
  );
}

export function DemoBadge() {
  const { lang } = useApp();
  return <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-red-soft px-3 py-1 text-[13px] font-bold uppercase tracking-wide text-red-ink" data-testid="demo-badge">{L.demo[lang]}</p>;
}

export { L as RESULT_EXTRA_TEXT };
