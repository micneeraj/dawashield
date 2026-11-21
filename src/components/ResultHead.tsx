// The top of every result: colour, headline, data freshness right beside it,
// NSQ vs spurious on RED, one-line WHY on AMBER, the GREY company note, and the
// calm "Can't read clearly" state. Every word is pre-written (messages.ts).
import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Camera, ChevronDown, Database, Grid3x3, Hand, Info, ShieldAlert } from "lucide-react";
import { useApp, type CheckState } from "../state";
import { Button, Card, LEVEL_STYLE, cx } from "./ui";
import { PipelineStrip } from "./ResultParts";
import { RecordCard } from "./RecordCard";
import { BatchKeypad } from "./Keypad";
import { ACTION, AMBER_REASON, AMBER_TITLE, GREY_NOTE, INFO_TOOL, RED_TYPE, RESULT, actionKey, amberKind, fillNote } from "../content/messages";
import { dateLabel, monthLabel, nextUpdateExpected } from "../lib/format";
import { useRunCheck } from "../useCheck";

const L = {
  upTo: { hi: "सरकारी डेटा जाँचा गया", en: "Official data checked up to" },
  next: { hi: "अगला अपडेट अपेक्षित", en: "Next update expected" },
  todo: { hi: "मुझे क्या करना चाहिए?", en: "What should I do?" },
  details: { hi: "विवरण देखें", en: "See details" },
  hide: { hi: "विवरण छिपाएँ", en: "Hide details" },
  otherMed: { hi: "दूसरी दवा का सरकारी रिकॉर्ड (आपकी दवा नहीं)", en: "Official record of the other medicine (not yours)" },
  keypad: { hi: "बटनों से बैच नंबर डालें", en: "Type batch on keypad" },
  retake: { hi: "दोबारा फ़ोटो लें", en: "Retake photo" },
  type: { hi: "प्रकार", en: "Type" },
};

/** "Official data checked up to <month>" + "Next update expected: <date>", next to the headline. */
export function FreshnessLine({ className }: { className?: string }) {
  const { lang, dataMeta } = useApp();
  const next = nextUpdateExpected(dataMeta?.latestMonth);
  return (
    <div className={cx("flex flex-wrap gap-x-4 gap-y-1 text-[14.5px] font-semibold text-ink/80", className)} data-testid="result-freshness">
      <span className="inline-flex items-center gap-1.5"><Database size={15} aria-hidden /> {L.upTo[lang]}: <b className="text-ink" data-testid="result-upto">{monthLabel(dataMeta?.latestMonth, lang)}</b></span>
      {next && <span className="inline-flex items-center gap-1.5"><CalendarClock size={15} aria-hidden /> {L.next[lang]}: <b className="text-ink" data-testid="result-next">{dateLabel(next.toISOString(), lang)}</b></span>}
    </div>
  );
}

export function ResultHeadline({ check }: { check: CheckState }) {
  const { lang } = useApp();
  const { result } = check;
  const level = result.level;
  const s = LEVEL_STYLE[level];
  const Icon = s.icon;
  const msg = RESULT[level];
  const top = result.records[0];
  const title = level === "AMBER" ? AMBER_TITLE[amberKind(result.reason)][lang] : msg.title[lang];
  const type = level === "RED" && top ? RED_TYPE[top.type] : null;
  const note = level === "GREY" && top && (result.reason === "company-other-medicine" || result.reason === "company-batch-unlisted")
    ? fillNote(GREY_NOTE[result.reason][lang], { medicine: (top.brand || top.name).replace(/^\(|\)$/g, ""), month: monthLabel(top.month, lang) })
    : null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cx("rounded-[28px] border-2 p-5", s.bg, s.line)}
      data-testid="result"
      data-level={level}
      data-reason={result.reason}
      aria-live="assertive"
    >
      <div className="flex items-center gap-3">
        <span className={cx("grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white shadow-soft", s.ink)}>
          <Icon size={30} strokeWidth={2.2} aria-hidden />
        </span>
        <span className={cx("text-[15px] font-bold uppercase tracking-[0.08em]", s.ink)} data-testid="result-word">{msg.word[lang]}</span>
      </div>
      <h2 className="mt-4 text-[25px] font-bold leading-tight text-ink" data-testid={level === "RED" ? "red-exact" : "result-title"}>{title}</h2>
      <FreshnessLine className="mt-2" />

      {type && top && (
        <div className={cx("mt-3 rounded-2xl px-4 py-3", top.type === "SPURIOUS" ? "bg-red-ink text-white" : "bg-white/80 text-ink")} data-testid="red-type" data-type={top.type}>
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] opacity-80">{L.type[lang]}</p>
          <p className="text-[19px] font-bold leading-snug">{type.label[lang]}</p>
          <p className="mt-0.5 text-[16px] leading-snug">{type.line[lang]}</p>
          {type.extra && <p className="mt-2 flex items-start gap-2 text-[17px] font-bold leading-snug" data-testid="spurious-extra"><ShieldAlert size={20} className="mt-0.5 shrink-0" aria-hidden /> {type.extra[lang]}</p>}
        </div>
      )}

      {level !== "AMBER" && <p className={cx("mt-3 leading-relaxed text-ink/90", level === "RED" ? "text-[18px] font-semibold" : "text-[18px]")} data-testid="result-body">{msg.body[lang]}</p>}
      {level === "AMBER" && AMBER_REASON[result.reason] && (
        <p className="mt-3 rounded-2xl bg-white/75 px-4 py-3 text-[17px] font-semibold leading-snug text-ink" data-testid="amber-why">{AMBER_REASON[result.reason][lang]}</p>
      )}
      {note && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-white/75 px-4 py-3 text-[15.5px] leading-snug text-ink" data-testid="grey-note">
          <Info size={17} className="mt-0.5 shrink-0 text-grey-ink" aria-hidden /> {note}
        </p>
      )}
      {level !== "UNREADABLE" && <PipelineStrip check={check} />}
    </motion.section>
  );
}

/** Big "What should I do?" card: the one action, repeated in large type. */
export function WhatToDo({ check }: { check: CheckState }) {
  const { lang } = useApp();
  const { result } = check;
  const k = actionKey(result.level, result.reason, result.records[0]?.type);
  const s = LEVEL_STYLE[result.level];
  return (
    <Card className={cx("mt-4 border-2 p-5", s.line)} data-testid="what-to-do" data-action={k}>
      <h3 className="flex items-center gap-2 text-[17px] font-bold uppercase tracking-[0.06em] text-muted"><Hand size={20} aria-hidden /> {L.todo[lang]}</h3>
      <p className="mt-2 text-[26px] font-bold leading-snug text-ink">{ACTION[k][lang]}</p>
    </Card>
  );
}

/** GREY company note: the other medicine's record only behind a small "See details" link. */
export function OtherMedicineDetails({ check }: { check: CheckState }) {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const r = check.result.records[0];
  if (!r) return null;
  return (
    <div className="mt-3">
      <button className="tap inline-flex items-center gap-1.5 px-1 text-[15px] font-semibold text-brand-800 underline underline-offset-4" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="see-details">
        <ChevronDown size={17} className={cx("transition", open && "rotate-180")} /> {open ? L.hide[lang] : L.details[lang]}
      </button>
      {open && (
        <div className="mt-2" data-testid="other-medicine-record">
          <p className="mb-2 text-[14px] font-bold uppercase tracking-wide text-muted">{L.otherMed[lang]}</p>
          <RecordCard r={r} />
        </div>
      )}
    </div>
  );
}

/** "Can't read clearly": keypad and retake, calm, never GREY. */
export function UnreadableActions({ check }: { check: CheckState }) {
  const { lang, go } = useApp();
  const runCheck = useRunCheck();
  const [keypad, setKeypad] = useState(false);
  return (
    <div className="mt-4 grid gap-3" data-testid="unreadable-actions">
      <Button full icon={<Grid3x3 size={22} />} onClick={() => setKeypad(true)} data-testid="unreadable-keypad">{L.keypad[lang]}</Button>
      <Button full variant="secondary" icon={<Camera size={22} />} onClick={() => go({ name: "photo", prefill: { name: check.input.name } })} data-testid="unreadable-retake">{L.retake[lang]}</Button>
      <BatchKeypad open={keypad} value={check.input.batch ?? ""} onClose={() => setKeypad(false)} onDone={(v) => {
        setKeypad(false);
        if (v) runCheck({ ...check.input, batch: v, unreadable: false, uncertain: false });
      }} />
    </div>
  );
}

/** The information-tool line, shown wherever a result or data claim appears. */
export function InfoToolNote({ className }: { className?: string }) {
  const { lang } = useApp();
  return (
    <p className={cx("flex items-start gap-2 rounded-2xl bg-paper px-4 py-3 text-[14.5px] leading-snug text-muted ring-1 ring-line", className)} role="note" data-testid="info-tool">
      <Info size={16} className="mt-0.5 shrink-0" aria-hidden /> {INFO_TOOL[lang]}
    </p>
  );
}
