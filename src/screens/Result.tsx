import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BellRing, ChevronDown, Flag, MessageCircle, PackagePlus, RotateCcw, Send, Sparkles, Check } from "lucide-react";
import type { ChatSession } from "firebase/ai";
import { useApp } from "../state";
import { Button, Card, Disclaimer, ErrorCard, LEVEL_STYLE, Page, SourceChip, Spinner, cx, inputCls } from "../components/ui";
import { RecordCard } from "../components/RecordCard";
import { AnswerBadge, RedFacts, WhyPanel } from "../components/ResultParts";
import { Sheet } from "../components/Sheet";
import { AMBER_REASON, DISPOSAL, ERRORS, EXPIRY, OFFICIAL, RESULT, VOICE, familyMessage } from "../content/messages";
import { askChat, explainRecord, startRecordChat } from "../lib/ai";
import { db, type FamilyMember } from "../lib/db";
import { expiryStatus, formatExpiry } from "../lib/expiry";
import { monthLabel } from "../lib/format";
import { notify } from "../lib/sync";
import type { Source } from "../lib/types";

const WHO = { hi: ["माँ", "पापा", "मैं", "दादी", "दादा"], en: ["Maa", "Papa", "Me", "Dadi", "Dada"] };

export default function Result() {
  const { t, lang, check, go, dataset, online, say, bumpCabinet } = useApp();
  const [showAll, setShowAll] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [saved, setSaved] = useState(!!check?.cabinetId);

  if (!check) return <Page title="—"><p>{ERRORS.noData[lang]}</p></Page>;
  const { input, result } = check;
  const level = result.level;
  const s = LEVEL_STYLE[level];
  const Icon = s.icon;
  const msg = RESULT[level];
  const exp = input.expiry ? expiryStatus(input.expiry) : null;
  const records = showAll ? result.records : result.records.slice(0, 2);

  return (
    <Page title={lang === "hi" ? "नतीजा" : "Result"} onBack={() => go({ name: "home" })}>
      {/* Fixed, pre-written result. Colour is always paired with an icon and a word. */}
      <motion.section
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={cx("rounded-[28px] border-2 p-5", s.bg, s.line)}
        data-testid="result"
        data-level={level}
        aria-live="assertive"
      >
        <div className="flex items-center gap-3">
          <span className={cx("grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white shadow-soft", s.ink)}>
            <Icon size={30} strokeWidth={2.2} aria-hidden />
          </span>
          <span className={cx("text-[15px] font-bold uppercase tracking-[0.08em]", s.ink)}>{msg.word[lang]}</span>
        </div>
        <h2 className="mt-4 text-[25px] font-bold leading-tight text-ink" data-testid={level === "RED" ? "red-exact" : undefined}>
          {level === "RED" ? (lang === "hi" ? "यही बैच CDSCO चेतावनी में है" : "This exact batch is in a CDSCO alert") : msg.title[lang]}
        </h2>
        <p className={cx("mt-2 leading-relaxed text-ink/90", level === "RED" ? "text-[17px]" : "text-[19px]")}>{msg.body[lang]}</p>
        {level === "AMBER" && AMBER_REASON[result.reason] && (
          <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-[17px] leading-snug text-ink">{AMBER_REASON[result.reason][lang]}</p>
        )}
        <div className="mt-4"><AnswerBadge check={check} /></div>
      </motion.section>

      {level === "RED" && result.records[0] && <RedFacts r={result.records[0]} />}
      <WhyPanel check={check} />

      {/* What was checked: big text, never spoken. */}
      <Card className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 p-5">
        <div className="col-span-2">
          <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("medicineName")}</p>
          <p className="text-[24px] font-bold leading-tight">{input.name || "—"}</p>
        </div>
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("batchNo")}</p>
          <p className="num text-[24px] font-bold" data-testid="checked-batch">{input.batch || "—"}</p>
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
        {level !== "GREY" && (
          <Button variant="primary" icon={<MessageCircle size={21} />} onClick={() => setFamilyOpen(true)} data-testid="family-alert">{t("alertFamily")}</Button>
        )}
        {level !== "GREY" && (
          <Button variant="secondary" icon={<Flag size={21} />} onClick={() => go({ name: "report" })}>{t("reportIt")}</Button>
        )}
        <Button variant={saved ? "soft" : "secondary"} icon={saved ? <Check size={21} /> : <PackagePlus size={21} />} onClick={() => !saved && setSaveOpen(true)} disabled={!input.name}>
          {saved ? t("savedToCabinet") : t("saveToCabinet")}
        </Button>
        <Button variant="ghost" icon={<RotateCcw size={21} />} onClick={() => go({ name: "home" })}>{t("checkAnother")}</Button>
      </div>

      {/* The official records */}
      {result.records.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 text-[20px] font-bold">{t("officialRecord")}</h3>
          <div className="space-y-3">
            {records.map((r, i) => (
              <div key={r.id} className="space-y-3">
                <RecordCard r={r} />
                {i === 0 && <Explain key={r.id} recordIndex={0} />}
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

      <p className="mt-5 text-center text-[15px] text-muted" data-testid="data-upto">
        {t("dataUpTo")}: <b className="text-ink">{monthLabel(dataset?.meta.latestMonth, lang)}</b>
        {dataset && <> · {lang === "hi" ? "अपडेट" : "synced"} {dataset.meta.lastSynced}</>}
        {!online && <> · {t("offline")}</>}
      </p>
      <Disclaimer className="mt-3" />

      <SaveSheet open={saveOpen} onClose={() => setSaveOpen(false)} onSaved={() => { setSaved(true); bumpCabinet(); }} />
      <FamilySheet open={familyOpen} onClose={() => setFamilyOpen(false)} onSent={() => say(VOICE.familySent.clip)} />
    </Page>
  );
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
  if (!check || check.result.level === "GREY") return null;
  const r = check.result.records[0];
  const text = familyMessage(lang, {
    level: check.result.level as "RED" | "AMBER",
    who: check.input.who,
    name: check.input.name || r?.name || "",
    batch: check.input.batch || r?.batch || "",
    month: r ? monthLabel(r.month, lang) : "",
    link: r?.pdfUrl || r?.sourceUrl || OFFICIAL.portalUrl,
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

