import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, ChevronRight, PackageOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Disclaimer, LevelPill, Page, cx } from "../components/ui";
import { db, type CabinetItem } from "../lib/db";
import { expiryStatus, formatExpiry } from "../lib/expiry";
import { recheckCabinet } from "../lib/sync";
import { dateLabel } from "../lib/format";
import { DISPOSAL, EXPIRY, OFFICIAL, RESULT } from "../content/messages";
import { useRunCheck } from "../useCheck";

export default function Cabinet() {
  const { t, lang, go, dataset, cabinetVersion, bumpCabinet } = useApp();
  const runCheck = useRunCheck();
  const [items, setItems] = useState<CabinetItem[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { db.cabinet.orderBy("id").reverse().toArray().then(setItems); }, [cabinetVersion]);

  async function recheck() {
    if (!dataset) return;
    setBusy(true);
    await recheckCabinet(dataset, true);
    bumpCabinet();
    setBusy(false);
  }
  async function remove(id?: number) {
    if (id == null) return;
    await db.cabinet.delete(id);
    bumpCabinet();
  }

  const groups = items.reduce<Record<string, CabinetItem[]>>((acc, it) => {
    const k = it.who || (lang === "hi" ? "परिवार" : "Family");
    (acc[k] ??= []).push(it);
    return acc;
  }, {});
  const anyExpired = items.some((i) => expiryStatus(i.expiry) === "expired");

  return (
    <Page title={t("cabinet")} onBack={() => go({ name: "home" })}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Button icon={<Plus size={22} />} onClick={() => go({ name: "type" })}>{t("addMedicine")}</Button>
        <Button variant="secondary" icon={<RefreshCw size={20} className={cx(busy && "animate-spin")} />} onClick={recheck} disabled={!items.length || busy}>{t("recheckAll")}</Button>
      </div>

      {!items.length && (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[#fbf3e4] text-[#9a6a12]"><PackageOpen size={32} /></span>
          <p className="text-[18px] text-muted">{t("emptyCabinet")}</p>
        </Card>
      )}

      {Object.entries(groups).map(([who, list]) => (
        <section key={who} className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 px-1 text-[17px] font-bold text-brand-900">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-700 text-[15px] text-white">{who.slice(0, 1)}</span>
            {who}
          </h2>
          <div className="space-y-3">
            {list.map((it, i) => {
              const level = it.lastCheck?.level ?? "GREY";
              const exp = expiryStatus(it.expiry);
              return (
                <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Card className={cx("p-4", level === "RED" && "border-red-line", level === "AMBER" && "border-amber-line")}>
                    <button className="flex w-full items-start gap-3 text-left" onClick={() => runCheck({ name: it.name, batch: it.batch, manufacturer: it.manufacturer, expiry: it.expiry, who: it.who }, it.id)}>
                      <span className="flex-1">
                        <span className="block text-[20px] font-bold leading-tight">{it.name}</span>
                        <span className="num mt-0.5 block text-[16px] text-muted">{t("batchNo")}: <b className="text-ink">{it.batch || "—"}</b></span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <LevelPill level={level} label={RESULT[level].word[lang]} />
                          {it.changedAt && level !== "GREY" && <span className="rounded-full bg-red-ink px-2.5 py-0.5 text-[13px] font-bold text-white">{t("changed")}</span>}
                          <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[14px] font-semibold",
                            { valid: "bg-brand-50 text-brand-800", soon: "bg-amber-soft text-amber-ink", expired: "bg-red-soft text-red-ink", unknown: "bg-grey-soft text-grey-ink" }[exp])}>
                            <CalendarClock size={14} /> {EXPIRY[exp][lang]}{it.expiry ? ` · ${formatExpiry(it.expiry, lang)}` : ""}
                          </span>
                        </span>
                        {it.lastCheck && <span className="mt-2 block text-[13px] text-muted">{t("lastChecked")}: {dateLabel(it.lastCheck.at, lang)}</span>}
                      </span>
                      <ChevronRight className="mt-1 text-muted" />
                    </button>
                    <div className="mt-2 flex justify-end border-t border-line/70 pt-2">
                      <button onClick={() => remove(it.id)} className="flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold text-muted hover:bg-red-soft hover:text-red-ink">
                        <Trash2 size={17} /> {t("remove")}
                      </button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </section>
      ))}

      {anyExpired && (
        <Card className="mb-4 border-amber-line bg-amber-soft p-4">
          <p className="text-[17px] font-bold text-amber-ink">{t("disposal")}</p>
          <p className="mt-1 text-[16px] leading-snug">{DISPOSAL[lang]}</p>
          <a href={OFFICIAL.disposalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[15px] font-semibold text-brand-700 underline">CDSCO PDF</a>
        </Card>
      )}
      <Disclaimer />
    </Page>
  );
}
