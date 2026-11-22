import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertOctagon, CalendarClock, CheckCircle2, ChevronRight, PackageOpen, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Disclaimer, LevelPill, Page, cx } from "../components/ui";
import { db, type CabinetItem } from "../lib/db";
import { expiryStatus, formatExpiry } from "../lib/expiry";
import { recheckCabinet } from "../lib/sync";
import { dateLabel, monthLabel } from "../lib/format";
import { cabinetSummary } from "../lib/cabinet";
import { DISPOSAL, EXPIRY, OFFICIAL, RESULT } from "../content/messages";
import { useRunCheck } from "../useCheck";
import { syncMeds } from "../lib/cloud";
import { PushOffer } from "../components/PushOffer";

const TXT = {
  allClear: { hi: (m: string) => `${m} तक के CDSCO डेटा से जाँचा: सब ठीक, कोई चेतावनी नहीं`, en: (m: string) => `Last checked against CDSCO data up to ${m}: all clear` },
  flaggedSince: { hi: (n: number) => `पिछली जाँच के बाद ${n} दवा पर चेतावनी आई`, en: (n: number) => `${n} medicine${n > 1 ? "s" : ""} flagged since your last check` },
  flagged: { hi: (n: number) => `${n} दवा पर सरकारी चेतावनी है`, en: (n: number) => `${n} medicine${n > 1 ? "s" : ""} flagged by a CDSCO alert` },
  quality: { hi: "गुणवत्ता चेतावनियाँ", en: "Quality alerts" },
  qualitySub: { hi: "हर नई CDSCO सूची पर दोबारा जाँच", en: "Re-checked on every new CDSCO list" },
  expiry: { hi: "समाप्ति तिथि याद-दिलाना", en: "Expiry reminders" },
  expirySub: { hi: "जिनकी तारीख़ निकल गई या जल्द निकलेगी", en: "Expired or expiring soon" },
  noExpiry: { hi: "कोई दवा जल्द ख़त्म नहीं हो रही", en: "Nothing expiring soon" },
  emptyTitle: { hi: "दवाएँ एक बार रखिए। हर नई CDSCO सूची आने पर हम उन्हें फिर से जाँचते हैं।", en: "Save medicines once. We re-check them every time CDSCO publishes a new list." },
  emptySub: { hi: "चेतावनी मिलते ही आपको और परिवार को पता चलेगा।", en: "You and your family hear about it as soon as one is flagged." },
  addFirst: { hi: "पहली दवा जोड़ें", en: "Add your first medicine" },
  family: { hi: "परिवार", en: "Family" },
};

export default function Cabinet() {
  const { t, lang, go, dataset, cabinetVersion, bumpCabinet } = useApp();
  const runCheck = useRunCheck();
  const [items, setItems] = useState<CabinetItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { db.cabinet.orderBy("id").reverse().toArray().then((x) => { setItems(x); setLoaded(true); }); }, [cabinetVersion]);

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
    void syncMeds(lang);
    bumpCabinet();
  }

  const sum = cabinetSummary(items);
  const groups = items.reduce<Record<string, CabinetItem[]>>((acc, it) => {
    const k = it.who || TXT.family[lang];
    (acc[k] ??= []).push(it);
    return acc;
  }, {});
  const anyExpired = items.some((i) => expiryStatus(i.expiry) === "expired");
  const open = (it: CabinetItem) => runCheck({ name: it.name, batch: it.batch, manufacturer: it.manufacturer, expiry: it.expiry, who: it.who }, it.id);

  if (loaded && !items.length) {
    return (
      <Page title={t("cabinet")} onBack={() => go({ name: "home" })}>
        <Card className="flex flex-col items-center gap-4 overflow-hidden px-6 pb-8 pt-10 text-center">
          <span className="relative grid h-24 w-24 place-items-center rounded-[32px] bg-gradient-to-br from-brand-50 to-accent-soft text-brand-700 shadow-soft">
            <PackageOpen size={44} />
            <span className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-brand-700 text-white shadow-soft"><RefreshCw size={18} /></span>
          </span>
          <p className="max-w-[24ch] text-[21px] font-bold leading-snug text-ink" data-testid="cabinet-empty">{TXT.emptyTitle[lang]}</p>
          <p className="max-w-[30ch] text-[16px] text-muted">{TXT.emptySub[lang]}</p>
          <Button className="mt-2 min-h-14 px-6" icon={<Plus size={22} />} onClick={() => go({ name: "type" })} data-testid="add-first">{TXT.addFirst[lang]}</Button>
        </Card>
        <Disclaimer className="mt-5" />
      </Page>
    );
  }

  const bannerRed = sum.flagged.length > 0;
  return (
    <Page title={t("cabinet")} onBack={() => go({ name: "home" })}>
      {/* Banner */}
      {items.length > 0 && (
        <div className={cx("mb-4 flex items-start gap-3 rounded-3xl border-2 p-4", bannerRed ? "border-red-line bg-red-soft" : "border-brand-200 bg-brand-50")} data-testid="cabinet-banner" data-state={bannerRed ? "flagged" : "clear"}>
          {bannerRed ? <AlertOctagon size={26} className="mt-0.5 shrink-0 text-red-ink" /> : <CheckCircle2 size={26} className="mt-0.5 shrink-0 text-brand-700" />}
          <div>
            <p className={cx("text-[18px] font-bold leading-snug", bannerRed ? "text-red-ink" : "text-brand-900")}>
              {bannerRed
                ? sum.newlyFlagged.length ? TXT.flaggedSince[lang](sum.newlyFlagged.length) : TXT.flagged[lang](sum.flagged.length)
                : TXT.allClear[lang](monthLabel(dataset?.meta.latestMonth, lang))}
            </p>
            <p className="mt-0.5 text-[14.5px] text-muted">{t("lastChecked")}: {dateLabel(sum.lastCheckAt, lang)}</p>
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Button icon={<Plus size={22} />} onClick={() => go({ name: "type" })}>{t("addMedicine")}</Button>
        <Button variant="secondary" icon={<RefreshCw size={20} className={cx(busy && "animate-spin")} />} onClick={recheck} disabled={!items.length || busy}>{t("recheckAll")}</Button>
      </div>

      {/* Section 1: quality alerts */}
      <section className="mb-6" data-testid="section-quality">
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white"><ShieldAlert size={19} /></span>
          <div>
            <h2 className="text-[19px] font-bold leading-tight text-ink">{TXT.quality[lang]}</h2>
            <p className="text-[13.5px] text-muted">{TXT.qualitySub[lang]}</p>
          </div>
        </div>
        {Object.entries(groups).map(([who, list]) => (
          <div key={who} className="mb-4">
            <h3 className="mb-2 flex items-center gap-2 px-1 text-[16px] font-bold text-brand-900">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-[14px] text-brand-800">{who.slice(0, 1)}</span>
              {who}
            </h3>
            <div className="space-y-3">
              {list.map((it, i) => {
                const level = it.lastCheck?.level ?? "GREY";
                return (
                  <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Card className={cx("p-4", level === "RED" && "border-red-line", level === "AMBER" && "border-amber-line")}>
                      <button className="flex w-full items-start gap-3 text-left" onClick={() => open(it)}>
                        <span className="flex-1">
                          <span className="block text-[20px] font-bold leading-tight">{it.name}</span>
                          <span className="num mt-0.5 block text-[16px] text-muted">{t("batchNo")}: <b className="text-ink">{it.batch || "—"}</b></span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            <LevelPill level={level} label={RESULT[level].word[lang]} />
                            {it.changedAt && level !== "GREY" && <span className="rounded-full bg-red-ink px-2.5 py-0.5 text-[13px] font-bold text-white">{t("changed")}</span>}
                          </span>
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
          </div>
        ))}
      </section>

      {/* Section 2: expiry reminders, visually separate */}
      <section className="mb-5 rounded-[28px] bg-brand-50 p-4 ring-1 ring-brand-200" data-testid="section-expiry">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-800 text-white"><CalendarClock size={19} /></span>
          <div>
            <h2 className="text-[19px] font-bold leading-tight text-ink">{TXT.expiry[lang]}</h2>
            <p className="text-[13.5px] text-muted">{TXT.expirySub[lang]}</p>
          </div>
        </div>
        {sum.expiring.length ? (
          <ul className="space-y-2">
            {sum.expiring.map((it) => {
              const exp = expiryStatus(it.expiry);
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-soft">
                  <span className="flex-1">
                    <span className="block text-[17px] font-bold">{it.name}{it.who ? <span className="font-medium text-muted"> · {it.who}</span> : null}</span>
                    <span className="text-[14.5px] text-muted">{formatExpiry(it.expiry, lang)}</span>
                  </span>
                  <span className={cx("rounded-full px-2.5 py-0.5 text-[13.5px] font-semibold", exp === "expired" ? "bg-red-soft text-red-ink" : "bg-amber-soft text-amber-ink")}>{EXPIRY[exp][lang]}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl bg-white/70 px-4 py-3 text-[15.5px] text-muted">{TXT.noExpiry[lang]}</p>
        )}
        {anyExpired && (
          <div className="mt-3 rounded-2xl bg-white p-4">
            <p className="text-[16px] font-bold text-amber-ink">{t("disposal")}</p>
            <p className="mt-1 text-[15px] leading-snug">{DISPOSAL[lang]}</p>
            <a href={OFFICIAL.disposalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[15px] font-semibold text-brand-700 underline">CDSCO PDF</a>
          </div>
        )}
      </section>
      {items.length > 0 && <PushOffer className="mb-4" />}
      <Disclaimer />
    </Page>
  );
}
