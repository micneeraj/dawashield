import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChevronRight, Keyboard, Package, ShieldCheck } from "lucide-react";
import { useApp } from "../state";
import { Card, Disclaimer, LevelPill, cx } from "../components/ui";
import { MicButton } from "../components/MicButton";
import { db, type CabinetItem } from "../lib/db";
import { expiryStatus } from "../lib/expiry";
import { monthLabel } from "../lib/format";

export default function Home() {
  const { t, lang, go, dataset, cabinetVersion, say } = useApp();
  const [items, setItems] = useState<CabinetItem[]>([]);
  useEffect(() => { db.cabinet.toArray().then(setItems); }, [cabinetVersion]);

  const alerts = items.filter((i) => i.lastCheck && i.lastCheck.level !== "GREY").length;
  const expiring = items.filter((i) => ["soon", "expired"].includes(expiryStatus(i.expiry))).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col px-4 pb-6">
      <section className="pt-2 text-center">
        <p className="text-[17px] font-medium text-brand-600">{t("greeting")} 🙏</p>
        <h1 className="mx-auto mt-1 max-w-[18ch] text-[30px] font-bold leading-[1.15] tracking-tight text-ink">{t("homeQ")}</h1>
      </section>

      <div className="my-3 flex flex-col items-center">
        <MicButton listening={false} label={t("tapToSpeak")} onClick={() => { say("welcome"); go({ name: "voice" }); }} />
        <p className="-mt-2 text-[19px] font-semibold text-brand-800">{t("tapToSpeak")}</p>
        <p className="mt-0.5 text-[15px] text-muted">{lang === "hi" ? "जैसे: “सर दर्द की दवा है, डोलो”" : "e.g. “It's my headache medicine, Dolo”"}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => go({ name: "photo" })} className="tap group flex flex-col items-start gap-3 rounded-3xl border border-line/70 bg-white p-4 text-left shadow-soft transition hover:border-brand-300">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Camera size={26} /></span>
          <span className="text-[18px] font-semibold leading-tight text-ink">{t("photo")}</span>
        </button>
        <button onClick={() => go({ name: "type" })} className="tap group flex flex-col items-start gap-3 rounded-3xl border border-line/70 bg-white p-4 text-left shadow-soft transition hover:border-brand-300" data-testid="type-btn">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Keyboard size={26} /></span>
          <span className="text-[18px] font-semibold leading-tight text-ink">{t("type")}</span>
        </button>
      </div>

      <button onClick={() => go({ name: "cabinet" })} className="mt-3 text-left">
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

      {dataset && (
        <div className={cx("mt-3 flex items-center gap-3 rounded-2xl bg-brand-50/80 px-4 py-3 text-[15px] text-brand-900")}>
          <ShieldCheck size={22} className="shrink-0 text-brand-600" aria-hidden />
          <span>
            {lang === "hi"
              ? <>CDSCO की {dataset.meta.records.toLocaleString("en-IN")} चेतावनियाँ फ़ोन में · {monthLabel(dataset.meta.latestMonth, lang)} तक</>
              : <>{dataset.meta.records.toLocaleString("en-IN")} CDSCO alerts on this phone · up to {monthLabel(dataset.meta.latestMonth, lang)}</>}
          </span>
        </div>
      )}

      <Disclaimer className="mt-5 px-1" />
    </motion.div>
  );
}
