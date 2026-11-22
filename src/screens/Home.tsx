import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChevronRight, Cpu, Database, Download, Keyboard, Mic, Package, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import { DemoButtons } from "../components/Demo";
import { useApp } from "../state";
import { Card, Disclaimer, LevelPill } from "../components/ui";
import { InfoToolNote } from "../components/ResultHead";
import { LogoMark } from "../components/Logo";
import { db, type CabinetItem } from "../lib/db";
import { expiryStatus } from "../lib/expiry";
import { monthLabel } from "../lib/format";
import { PROFILE_EVENT, dateLine, getNickname, greeting } from "../lib/profile";

export default function Home() {
  const { t, lang, go, dataMeta, cabinetVersion, say, download } = useApp();
  const [items, setItems] = useState<CabinetItem[]>([]);
  const [nick, setNick] = useState(getNickname);
  useEffect(() => { const f = () => setNick(getNickname()); addEventListener(PROFILE_EVENT, f); return () => removeEventListener(PROFILE_EVENT, f); }, []);
  const now = new Date();
  useEffect(() => { db.cabinet.toArray().then(setItems); }, [cabinetVersion]);

  const alerts = items.filter((i) => i.lastCheck && i.lastCheck.level !== "GREY").length;
  const expiring = items.filter((i) => ["soon", "expired"].includes(expiryStatus(i.expiry))).length;
  const startVoice = () => { say("welcome"); go({ name: "voice" }); };

  const OPTIONS = [
    { key: "speak" as const, icon: Mic, onClick: startVoice, testId: "speak-btn" },
    { key: "type" as const, icon: Keyboard, onClick: () => go({ name: "type" }), testId: "type-btn" },
    { key: "photo" as const, icon: Camera, onClick: () => go({ name: "photo" }), testId: "photo-btn" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col px-4 pb-6">
      {/* Hero: the 5-second test. What it is, and the one thing to do. */}
      <section className="hero-brand relative mt-1 overflow-hidden rounded-[28px] px-5 pb-5 pt-6 text-white shadow-lift">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="rounded-xl bg-white p-1"><LogoMark size={26} /></span>
          <span className="flex flex-col leading-tight">
            <span className="text-[19px] font-bold text-white" data-testid="greeting">{greeting(lang, nick, now)}</span>
            <span className="text-[14px] font-medium text-brand-100" data-testid="today">{dateLine(lang, now)}</span>
          </span>
        </div>
        <h1 className="relative mt-4 text-[26px] font-bold leading-[1.15] tracking-tight" data-testid="hero">{t("hero")}</h1>
        <button
          onClick={startVoice}
          className="tap relative mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-[21px] font-bold text-brand-800 shadow-soft transition hover:bg-brand-50 active:scale-[0.98]"
          data-testid="check-btn-home"
        >
          <ShieldCheck size={26} /> {t("checkMedicine")}
        </button>
        <div className="relative mt-3 grid grid-cols-3 gap-2">
          {OPTIONS.map(({ key, icon: Icon, onClick, testId }) => (
            <button key={key} onClick={onClick} data-testid={testId} className="tap flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/10 py-2.5 text-[15px] font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20">
              <Icon size={22} aria-hidden />
              {t(key)}
            </button>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[13px] font-semibold text-brand-900" data-testid="trust-strip">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-line"><ShieldCheck size={14} className="text-brand-600" aria-hidden />{t("officialUpTo")} {dataMeta ? monthLabel(dataMeta.latestMonth, lang) : "…"}{lang === "hi" ? " तक" : ""}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-line"><Database size={13} className="text-brand-600" aria-hidden />{dataMeta ? dataMeta.records.toLocaleString("en-IN") : "…"} {t("recordsLower")}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-line"><WifiOff size={13} className="text-brand-600" aria-hidden />{t("worksOffline")}</span>
      </div>

      {download && (
        <div className="mt-3 rounded-2xl bg-white p-3.5 ring-1 ring-line" role="progressbar" aria-valuenow={Math.round((download.loaded / download.total) * 100)} aria-valuemin={0} aria-valuemax={100} data-testid="download-progress">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-brand-900">
            <Download size={17} aria-hidden /> {lang === "hi" ? "सरकारी सूची फ़ोन में सहेज रहे हैं (एक बार)" : "Saving the official list to this phone (once)"}
            <span className="num ml-auto">{(download.loaded / 1e6).toFixed(1)} / {(download.total / 1e6).toFixed(1)} MB</span>
          </p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-50"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(100, (download.loaded / download.total) * 100)}%` }} /></div>
        </div>
      )}

      <DemoButtons className="mt-5" />

      <button onClick={() => go({ name: "cabinet" })} className="mt-4 text-left">
        <Card className="flex items-center gap-4 p-4 transition hover:border-brand-300">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-brand-700"><Package size={26} /></span>
          <span className="flex-1">
            <span className="block text-[18px] font-semibold text-ink">{t("cabinet")}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[15px] text-muted">
              {items.length} {t("saved")}
              {alerts > 0 && <LevelPill level="RED" label={`${alerts} ${t("needAttention")}`} />}
              {expiring > 0 && <LevelPill level="AMBER" label={`${expiring} ${lang === "hi" ? "तारीख़" : "expiry"}`} />}
            </span>
          </span>
          <ChevronRight className="text-muted" />
        </Card>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => go({ name: "how" })} className="tap flex items-center gap-2.5 rounded-3xl border border-line/70 bg-white px-4 py-3 text-left shadow-soft" data-testid="how-link">
          <Cpu size={22} className="shrink-0 text-brand-600" /><span className="text-[16px] font-semibold leading-tight">{lang === "hi" ? "यह कैसे काम करता है" : "How it works"}</span>
        </button>
        <button onClick={() => go({ name: "why" })} className="tap flex items-center gap-2.5 rounded-3xl border border-line/70 bg-white px-4 py-3 text-left shadow-soft" data-testid="why-link">
          <Sparkles size={22} className="shrink-0 text-brand-600" /><span className="text-[16px] font-semibold leading-tight">{lang === "hi" ? "दवा कवच क्यों" : "Why DawaShield"}</span>
        </button>
      </div>

      <InfoToolNote className="mt-5" />
      <Disclaimer className="mt-3 px-1" />
    </motion.div>
  );
}
