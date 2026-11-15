import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChevronRight, Database, Keyboard, Mic, Package, ShieldCheck, WifiOff } from "lucide-react";
import { useApp } from "../state";
import { Card, Disclaimer, LevelPill } from "../components/ui";
import { LogoMark } from "../components/Logo";
import { db, type CabinetItem } from "../lib/db";
import { expiryStatus } from "../lib/expiry";
import { monthLabel } from "../lib/format";

export default function Home() {
  const { t, lang, go, dataMeta, cabinetVersion, say } = useApp();
  const [items, setItems] = useState<CabinetItem[]>([]);
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
      <section className="relative mt-1 overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-5 pb-5 pt-6 text-white shadow-[0_24px_48px_-24px_rgba(15,94,87,0.7)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-brand-300/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-2 text-[14px] font-semibold text-brand-100">
          <span className="rounded-xl bg-white/95 p-1"><LogoMark size={22} /></span>
          {t("greeting")} 🙏
        </div>
        <h1 className="relative mt-3 text-[28px] font-bold leading-[1.15] tracking-tight" data-testid="hero">{t("hero")}</h1>
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

      <button onClick={() => go({ name: "cabinet" })} className="mt-5 text-left">
        <Card className="flex items-center gap-4 p-4 transition hover:border-brand-300">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#fbf3e4] text-[#9a6a12]"><Package size={26} /></span>
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

      <Disclaimer className="mt-5 px-1" />
    </motion.div>
  );
}
