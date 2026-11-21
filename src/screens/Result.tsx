import { useEffect, useRef, useState } from "react";
import { BellRing, ChevronDown, Flag, MessageCircle, PackagePlus, RotateCcw, Send, Sparkles, Check } from "lucide-react";
import type { ChatSession } from "firebase/ai";
import { useApp } from "../state";
import { Button, Card, Disclaimer, ErrorCard, Page, SourceChip, Spinner, cx, inputCls } from "../components/ui";
import { InfoToolNote, OtherMedicineDetails, ResultHeadline, UnreadableActions, WhatToDo } from "../components/ResultHead";
import { recordsAreThisMedicine } from "../lib/match";
import { transliterateName } from "../lib/indic";
import { isRegional } from "../lib/i18n";
import { RecordCard } from "../components/RecordCard";
import { HowMade, RedFacts, WhyPanel } from "../components/ResultParts";
import { CalendarButton, DemoBadge, GreyNextSteps, SourceBlock, WhatItMeans, WrongResultSheet } from "../components/ResultExtras";
import { PushOffer } from "../components/PushOffer";
import { Sheet } from "../components/Sheet";
import { DISPOSAL, ERRORS, EXPIRY, OFFICIAL, VOICE, familyMessage } from "../content/messages";
import { askChat, explainRecord, startRecordChat } from "../lib/ai";
import { db, type FamilyMember } from "../lib/db";
import { expiryStatus, formatExpiry } from "../lib/expiry";
import { monthLabel, officialLink } from "../lib/format";
import { notify } from "../lib/sync";
import { syncMeds } from "../lib/cloud";
import type { Source } from "../lib/types";

const WHO = { hi: ["माँ", "पापा", "मैं", "दादी", "दादा"], en: ["Maa", "Papa", "Me", "Dadi", "Dada"] };

export default function Result() {
  const { t, lang, uiLang, regionalActive, check, go, dataset, online, say, bumpCabinet } = useApp();
  const [showAll, setShowAll] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [saved, setSaved] = useState(!!check?.cabinetId);
  const [wrongOpen, setWrongOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const onSaved = () => { setSaved(true); setJustSaved(true); bumpCabinet(); void syncMeds(lang); };

  if (!check) return <Page title="—"><p>{ERRORS.noData[lang]}</p></Page>;
  const { input, result } = check;
  const level = result.level;
  // RED / AMBER records are about this medicine. A GREY company note's record is
  // another medicine: hidden behind "See details", no family alert or report buttons.
  const flagged = level === "RED" || level === "AMBER";
  const thisMed = recordsAreThisMedicine(result);
  const greyNote = level === "GREY" && result.records.length > 0;
  const exp = input.expiry ? expiryStatus(input.expiry) : null;
  const records = showAll ? result.records : result.records.slice(0, 2);

  return (
    <Page title={lang === "hi" ? "नतीजा" : "Result"} onBack={() => go({ name: "home" })}>
      {input.demo && <DemoBadge />}
      {/* Fixed, pre-written result. Colour is always paired with an icon and a word. */}
      <ResultHeadline check={check} />
      {level === "UNREADABLE" && <UnreadableActions check={check} />}
      <WhatToDo check={check} />
      {level === "RED" && result.records[0] && <RedFacts r={result.records[0]} />}
      {level !== "UNREADABLE" && <WhatItMeans check={check} />}
      {greyNote && <OtherMedicineDetails check={check} />}
      {level === "GREY" && <GreyNextSteps saved={saved} onSave={() => void quickSave(check, dataset?.meta.version ?? "").then(onSaved)} onReport={() => go({ name: "report" })} />}
      {justSaved && <PushOffer className="mt-4" />}
      {level !== "UNREADABLE" && <WhyPanel check={check} />}
      {level !== "UNREADABLE" && <HowMade check={check} />}

      {/* What was checked: big text, never spoken. */}
      <Card className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 p-5">
        <div className="col-span-2">
          <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("medicineName")}</p>
          <p className="text-[24px] font-bold leading-tight" translate="no">{input.name || "—"}</p>
          {regionalActive && isRegional(uiLang) && input.name && <p className="text-[17px] font-medium text-brand-800" lang={uiLang} translate="no" data-testid="name-translit">{transliterateName(input.name, uiLang)}</p>}
        </div>
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("batchNo")}</p>
          <p className="num text-[24px] font-bold" data-testid="checked-batch" translate="no">{input.batch || "—"}</p>
        </div>
        {input.expiry && exp && (
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("expiry")}</p>
            <p className="text-[18px] font-semibold">{formatExpiry(input.expiry, lang)}</p>
            <ExpiryBadge status={exp} />
          </div>
        )}
      </Card>

      {exp === "expired" && (
        <Card className="mt-3 border-amber-line bg-amber-soft p-4">
          <p className="text-[17px] font-semibold text-amber-ink">{VOICE.expired.text[lang]}</p>
          <p className="mt-2 text-[16px] leading-snug text-ink">{DISPOSAL[lang]}</p>
          <a href={OFFICIAL.disposalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[15px] font-semibold text-brand-700 underline">CDSCO PDF</a>
        </Card>
      )}

      {/* Actions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {flagged && (
          <Button variant="primary" icon={<MessageCircle size={21} />} onClick={() => setFamilyOpen(true)} data-testid="family-alert">{t("alertFamily")}</Button>
        )}
        {flagged && (
          <Button variant="secondary" icon={<Flag size={21} />} onClick={() => go({ name: "report" })}>{t("reportIt")}</Button>
        )}
        <Button variant={saved ? "soft" : "secondary"} icon={saved ? <Check size={21} /> : <PackagePlus size={21} />} onClick={() => !saved && setSaveOpen(true)} disabled={!input.name || level === "UNREADABLE"}>
          {saved ? t("savedToCabinet") : t("saveToCabinet")}
        </Button>
        <Button variant="ghost" icon={<RotateCcw size={21} />} onClick={() => go({ name: "home" })}>{t("checkAnother")}</Button>
        {input.expiry && <CalendarButton className="col-span-2" name={input.name || input.batch || ""} expiry={input.expiry} who={input.who} />}
        <Button variant="ghost" className="col-span-2 text-[16px]" icon={<Flag size={19} />} onClick={() => setWrongOpen(true)} data-testid="wrong-result">
          {lang === "hi" ? "गलत नतीजा? बताइए" : "Report a wrong result"}
        </Button>
      </div>

      {/* The official records */}
      {thisMed && result.records.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 text-[20px] font-bold">{t("officialRecord")}</h3>
          <div className="space-y-3">
            {records.map((r, i) => (
              <div key={r.id} className="space-y-3">
                <RecordCard r={r} />
                {i === 0 && online && <Explain key={r.id} recordIndex={0} />}
              </div>
            ))}
          </div>
          {result.records.length > 2 && !showAll && (
            <Button variant="ghost" full className="mt-2" icon={<ChevronDown size={20} />} onClick={() => setShowAll(true)}>
              +{result.records.length - 2} {t("moreRecords")}
            </Button>
          )}
        </section>
      )}

      {level !== "UNREADABLE" && <SourceBlock check={check} />}
      <InfoToolNote className="mt-4" />
      {!online && <p className="mt-3 text-center text-[15px] font-semibold text-brand-800">{t("offline")}</p>}
      <Disclaimer className="mt-3" />

      <SaveSheet open={saveOpen} onClose={() => setSaveOpen(false)} onSaved={onSaved} />
      <WrongResultSheet open={wrongOpen} onClose={() => setWrongOpen(false)} check={check} />
      <FamilySheet open={familyOpen} onClose={() => setFamilyOpen(false)} onSent={() => say(VOICE.familySent.clip)} />
    </Page>
  );
}

/** One-tap save from a result (used under GREY): no questions asked. */
async function quickSave(check: NonNullable<ReturnType<typeof useApp>["check"]>, version: string): Promise<void> {
  const { input, result } = check;
  await db.cabinet.add({
    name: input.name || input.batch || "", batch: input.batch ?? "", manufacturer: input.manufacturer, expiry: input.expiry, who: input.who,
    addedAt: new Date().toISOString(),
    lastCheck: { level: result.level, reason: result.reason, recordIds: result.records.map((r) => r.id), version, at: new Date().toISOString() },
  });
}

function ExpiryBadge({ status }: { status: "valid" | "soon" | "expired" | "unknown" }) {
  const { lang } = useApp();
  const cls = { valid: "bg-brand-50 text-brand-800", soon: "bg-amber-soft text-amber-ink", expired: "bg-red-soft text-red-ink", unknown: "bg-grey-soft text-grey-ink" }[status];
  return <span className={cx("mt-1 inline-block rounded-full px-2.5 py-0.5 text-[13px] font-semibold", cls)}>{EXPIRY[status][lang]}</span>;
}

/** "Read simple explanation" + follow-up chat. AI output, always labelled. */
function Explain({ recordIndex }: { recordIndex: number }) {
  const { t, lang, check, online, noteAi } = useApp();
  const r = check!.result.records[recordIndex];
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source>("cloud");
  const [chat, setChat] = useState<{ q: string; a: string; source: Source }[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const session = useRef<ChatSession | null>(null);

  useEffect(() => { session.current = null; }, [lang]);

  async function go() {
    setState("busy");
    try {
      const res = await explainRecord(r, lang);
      setText(res.value);
      setSource(res.source);
      noteAi(res.source);
      setState("done");
    } catch {
      setState("error");
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setAsking(true);
    try {
      session.current ??= startRecordChat(r, lang);
      const res = await askChat(session.current, q.trim());
      noteAi(res.source);
      setChat((c) => [...c, { q: q.trim(), a: res.value, source: res.source }]);
      setQ("");
    } catch {
      setChat((c) => [...c, { q: q.trim(), a: ERRORS.aiUnavailable[lang], source: "cloud" }]);
    } finally {
      setAsking(false);
    }
  }

  if (state === "idle") {
    return (
      <Button variant="soft" full icon={<Sparkles size={21} />} onClick={go} data-testid="explain">
        {t("explain")}
      </Button>
    );
  }
  return (
    <Card className="p-5">
      {state === "busy" && <Spinner label={t("thinking")} />}
      {state === "error" && <ErrorCard k={online ? "aiUnavailable" : "network"} on={{ retry: go }} />}
      {state === "done" && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-800"><Sparkles size={17} /> {t("explain")}</span>
            <SourceChip source={source} />
          </div>
          {lang === "hi" && source === "device" && <p className="mb-2 text-[14px] text-muted">{ERRORS.explainOfflineHindi.hi}</p>}
          <p className="whitespace-pre-line text-[18px] leading-relaxed text-ink" data-testid="explanation">{text}</p>
          <p className="mt-3 text-[13px] text-muted">{t("aiNote")}</p>

          {online && (
            <div className="mt-4 border-t border-line pt-4">
              {chat.map((c, i) => (
                <div key={i} className="mb-3 space-y-2">
                  <p className="ml-8 rounded-2xl rounded-br-md bg-brand-700 px-4 py-2.5 text-[17px] text-white">{c.q}</p>
                  <div className="mr-4 rounded-2xl rounded-bl-md bg-brand-50 px-4 py-2.5">
                    <p className="whitespace-pre-line text-[17px] leading-relaxed">{c.a}</p>
                    <div className="mt-1.5"><SourceChip source={c.source} /></div>
                  </div>
                </div>
              ))}
              <form onSubmit={ask} className="flex gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "text-[17px]")} placeholder={t("askPlaceholder")} aria-label={t("askMore")} />
                <button disabled={asking} className="tap grid w-14 shrink-0 place-items-center rounded-2xl bg-brand-700 text-white disabled:opacity-50" aria-label={t("askMore")}>
                  <Send size={22} />
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function SaveSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t, lang, check, dataset } = useApp();
  const [who, setWho] = useState("");
  const [expiry, setExpiry] = useState(check?.input.expiry ?? "");
  async function save() {
    if (!check) return;
    const { input, result } = check;
    await db.cabinet.add({
      name: input.name ?? "", batch: input.batch ?? "", manufacturer: input.manufacturer, expiry: expiry || undefined, who: who || undefined,
      addedAt: new Date().toISOString(),
      lastCheck: { level: result.level, reason: result.reason, recordIds: result.records.map((r) => r.id), version: dataset?.meta.version ?? "", at: new Date().toISOString() },
    });
    onSaved();
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title={t("saveToCabinet")}>
      <p className="mb-2 text-[16px] font-semibold">{t("forWhom")}</p>
      <div className="flex flex-wrap gap-2">
        {WHO[lang].map((w) => (
          <button key={w} onClick={() => setWho(w)} className={cx("min-h-12 rounded-full border px-5 text-[17px] font-semibold", who === w ? "border-brand-600 bg-brand-700 text-white" : "border-line bg-white text-ink")}>{w}</button>
        ))}
      </div>
      <input className={cx(inputCls, "mt-3")} value={who} onChange={(e) => setWho(e.target.value)} placeholder={t("name")} aria-label={t("forWhom")} />
      <p className="mb-2 mt-4 text-[16px] font-semibold">{t("expiry")}</p>
      <input className={cx(inputCls, "num")} value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YYYY" aria-label={t("expiry")} />
      <Button full className="mt-5" icon={<PackagePlus size={21} />} onClick={save}>{t("save")}</Button>
    </Sheet>
  );
}

function FamilySheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const { t, lang, check, online, go } = useApp();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => { if (open) db.family.toArray().then(setMembers); setQueued(null); }, [open]);
  if (!check || (check.result.level !== "RED" && check.result.level !== "AMBER")) return null;
  const r = check.result.records[0];
  const text = familyMessage(lang, {
    level: check.result.level as "RED" | "AMBER",
    who: check.input.who,
    name: check.input.name || r?.name || "",
    batch: check.input.batch || r?.batch || "",
    month: r ? monthLabel(r.month, lang) : "",
    link: r ? officialLink(r).url : OFFICIAL.portalUrl,
  });

  async function send(to: string, phone?: string) {
    const url = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
    if (!online) {
      await db.queue.add({ url, text, to, createdAt: new Date().toISOString() });
      if ("Notification" in self && Notification.permission === "default") await Notification.requestPermission();
      setQueued(to);
      void notify("DawaShield", t("queued"), "queued");
      return;
    }
    window.open(url, "_blank", "noopener");
    onSent();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("alertFamily")}>
      <p className="mb-2 flex items-center gap-1.5 text-[14px] font-bold uppercase tracking-wide text-muted" data-testid="family-preview-label">
        {lang === "hi" ? "बिल्कुल यही संदेश भेजा जाएगा" : "Exactly this message will be shared"}
      </p>
      <pre className="mb-4 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl bg-white p-4 font-sans text-[15px] leading-snug text-ink shadow-soft" data-testid="family-msg">{text}</pre>
      {queued && <p className="mb-3 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-[16px] font-semibold text-brand-800"><BellRing size={20} /> {queued}: {t("queued")}</p>}
      <p className="mb-2 text-[16px] font-semibold">{t("sendTo")}</p>
      <div className="space-y-2">
        {members.map((m) => (
          <Button key={m.id} full variant="secondary" className="justify-start" icon={<MessageCircle size={21} className="text-[#1f9d55]" />} onClick={() => send(m.name, m.phone)}>
            {m.name}{m.relation ? ` · ${m.relation}` : ""}
          </Button>
        ))}
        {!members.length && (
          <Button full variant="soft" onClick={() => { onClose(); go({ name: "family" }); }}>{t("noFamily")}</Button>
        )}
        <Button full variant="ghost" icon={<Send size={20} />} onClick={() => send(lang === "hi" ? "कोई भी" : "anyone")}>{t("shareAnyone")}</Button>
      </div>
    </Sheet>
  );
}

