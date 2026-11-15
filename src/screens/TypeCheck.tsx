import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Search, Sparkles } from "lucide-react";
import { useApp } from "../state";
import { Button, Disclaimer, Field, Page, inputCls, cx } from "../components/ui";
import { searchNames } from "../lib/match";
import { demoRecord } from "../lib/demo";
import { COMMON_MEDICINES } from "../content/common-medicines";
import { useRunCheck } from "../useCheck";

const TXT = {
  title: { hi: "लिखकर जाँच", en: "Type to check" },
  more: { hi: "और जानकारी (ज़रूरी नहीं)", en: "More details (optional)" },
  demo: { hi: "असली चेतावनी वाला बैच आज़माएँ", en: "Try a real flagged batch" },
  namePh: { hi: "जैसे: Dolo 650", en: "e.g. Dolo 650" },
  batchPh: { hi: "जैसे: 251TTF014", en: "e.g. 251TTF014" },
  enter: { hi: "Enter दबाकर भी जाँच सकते हैं", en: "Press Enter to check" },
};

export default function TypeCheck() {
  const { t, lang, screen, dataset } = useApp();
  const prefill = screen.name === "type" ? screen.prefill : undefined;
  const runCheck = useRunCheck();
  const [name, setName] = useState(prefill?.name ?? "");
  const [batch, setBatch] = useState(prefill?.batch ?? "");
  const [manufacturer, setManufacturer] = useState(prefill?.manufacturer ?? "");
  const [expiry, setExpiry] = useState(prefill?.expiry ?? "");
  const [more, setMore] = useState(!!(prefill?.manufacturer || prefill?.expiry));
  const [picked, setPicked] = useState(false);

  const suggestions = useMemo(
    () => (name.trim().length >= 3 && !picked ? searchNames(name, dataset?.records ?? [], COMMON_MEDICINES, 4) : []),
    [name, picked, dataset],
  );
  const demo = useMemo(() => demoRecord(dataset?.records ?? []), [dataset]);

  function tryDemo() {
    if (!demo) return;
    setName(demo.name); setBatch(demo.batch); setPicked(true);
    runCheck({ name: demo.name, batch: demo.batch });
  }

  return (
    <Page title={TXT.title[lang]}>
      {demo && (
        <button type="button" onClick={tryDemo} data-testid="demo-chip" className="tap mb-4 inline-flex items-center gap-2 rounded-full border border-red-line bg-red-soft px-4 text-[15px] font-semibold text-red-ink transition hover:brightness-95">
          <Sparkles size={17} aria-hidden /> {TXT.demo[lang]}
          <span className="num rounded-full bg-white/80 px-2 py-0.5 text-[13px]">{demo.batch}</span>
        </button>
      )}
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); runCheck({ name, batch, manufacturer, expiry }); }}>
        <Field label={t("medicineName")}>
          <input className={cx(inputCls, "min-h-16 text-[22px] font-semibold")} value={name} onChange={(e) => { setName(e.target.value); setPicked(false); }} placeholder={TXT.namePh[lang]} autoComplete="off" enterKeyHint="search" data-testid="name-input" />
        </Field>
        {suggestions.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button type="button" key={s} onClick={() => { setName(s); setPicked(true); }} className="min-h-12 rounded-full border border-brand-200 bg-brand-50 px-4 text-[16px] font-semibold text-brand-800 hover:bg-brand-100">{s}</button>
            ))}
          </div>
        )}
        <Field label={t("batchNo")} hint={t("batchHint")}>
          <input className={cx(inputCls, "num min-h-16 text-[26px] font-bold tracking-wider")} value={batch} onChange={(e) => setBatch(e.target.value.toUpperCase())} placeholder={TXT.batchPh[lang]} autoCapitalize="characters" autoComplete="off" enterKeyHint="search" data-testid="type-batch" />
        </Field>

        <div className="rounded-3xl border border-line bg-white/60">
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="tap flex w-full items-center justify-between px-4 text-[16px] font-semibold text-brand-800" data-testid="more-details">
            {TXT.more[lang]}
            <ChevronDown size={20} className={cx("transition", more && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {more && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-4 px-4 pb-4">
                  <Field label={t("manufacturer")}>
                    <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} autoComplete="off" />
                  </Field>
                  <Field label={t("expiry")}>
                    <input className={cx(inputCls, "num")} value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YYYY" autoComplete="off" />
                  </Field>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Button type="submit" full className="min-h-16 text-[19px]" icon={<Search size={22} />} disabled={!name.trim() && !batch.trim()} data-testid="check-btn">{t("check")}</Button>
        <p className="-mt-2 text-center text-[14px] text-muted">{TXT.enter[lang]}</p>
      </form>
      <Disclaimer className="mt-6" />
    </Page>
  );
}
