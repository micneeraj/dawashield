// Language picker, offline fallback banner, and the screen translation layer.
import { useEffect, useState } from "react";
import { Check, Globe, WifiOff } from "lucide-react";
import { useApp } from "../state";
import { Sheet } from "./Sheet";
import { cx } from "./ui";
import { LANG_NAMES, REGIONAL, isRegional, startTranslating, type AppLang } from "../lib/i18n";

const TXT = {
  needsNet: { hi: "इंटरनेट चाहिए", en: "Needs internet" },
  soon: { hi: "अनुवाद जाँच में", en: "Translation in review" },
  offlineOk: { hi: "बिना इंटरनेट भी", en: "Works offline" },
  title: { hi: "भाषा चुनें", en: "Choose language" },
  sub: { hi: "हिन्दी और अंग्रेज़ी बिना इंटरनेट चलती हैं। बाकी भाषाओं के लिए इंटरनेट चाहिए।", en: "Hindi and English work offline. The other languages need internet." },
};

/** Big buttons, each language in its own script. Regional ones carry a "Needs internet" badge. */
export function LanguagePicker({ onPicked, className }: { onPicked?: () => void; className?: string }) {
  const { lang, uiLang, setUiLang, regionalAvailable, online } = useApp();
  const all: AppLang[] = ["hi", "en", ...REGIONAL];
  return (
    <div className={className}>
      <p className="mb-3 text-[15px] leading-snug text-muted">{TXT.sub[lang]}</p>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={TXT.title[lang]} data-testid="lang-picker">
        {all.map((l) => {
          const regional = isRegional(l);
          // A regional language is offered once its reviewed translation is published.
          // Offline we cannot check, so a language picked earlier stays selectable.
          const ready = !regional || regionalAvailable[l] === true || (!online && uiLang === l);
          const active = uiLang === l;
          return (
            <button key={l} role="radio" aria-checked={active} disabled={!ready} lang={l} translate="no"
              onClick={() => { setUiLang(l); onPicked?.(); }}
              data-testid={`lang-${l}`} data-ready={ready ? "1" : "0"}
              className={cx(
                "tap relative flex min-h-[76px] flex-col items-start justify-center rounded-2xl border-2 px-4 py-2.5 text-left transition",
                active ? "border-brand-600 bg-brand-700 text-white shadow-soft" : "border-line bg-white text-ink hover:border-brand-300",
                !ready && "cursor-not-allowed opacity-55 hover:border-line",
              )}>
              <span className="text-[22px] font-bold leading-tight">{LANG_NAMES[l].native}</span>
              <span className={cx("mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold", active ? "text-brand-100" : regional ? "text-amber-ink" : "text-brand-700")}>
                {regional ? <><Globe size={13} aria-hidden /> {ready ? TXT.needsNet[lang] : TXT.soon[lang]}</> : <><Check size={13} aria-hidden /> {TXT.offlineOk[lang]}</>}
              </span>
              {active && <Check size={20} className="absolute right-3 top-3" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Header button: shows the current language, opens the picker. */
export function LanguageButton() {
  const { uiLang, lang } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} translate="no"
        className="inline-flex h-12 items-center gap-1.5 rounded-2xl border border-line bg-white px-3 text-[16px] font-bold text-brand-800 shadow-soft"
        aria-label={TXT.title[lang]} data-testid="lang-button">
        <Globe size={18} aria-hidden /> {LANG_NAMES[uiLang].native}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={TXT.title[lang]}>
        <LanguagePicker onPicked={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** Offline with a regional language picked: polite banner, Hindi until back online. */
export function RegionalFallbackBanner() {
  const { uiLang, regionalFallback, online } = useApp();
  if (!regionalFallback || !isRegional(uiLang)) return null;
  return (
    <div className="mx-4 mb-2 flex items-start gap-2.5 rounded-2xl border border-amber-line bg-amber-soft px-4 py-3 text-amber-ink" role="status" data-testid="regional-fallback">
      <WifiOff size={20} className="mt-0.5 shrink-0" aria-hidden />
      <p className="text-[15px] leading-snug">
        <b translate="no">{LANG_NAMES[uiLang].native}</b>{" "}
        {online
          ? "का अनुवाद अभी लोड नहीं हुआ, इसलिए हिन्दी दिखा रहे हैं। · Translation not loaded yet, showing Hindi."
          : "के लिए इंटरनेट चाहिए। तब तक हिन्दी में दिखा रहे हैं; इंटरनेट आते ही अपने-आप बदल जाएगा। · Needs internet. Showing Hindi until you are back online."}
      </p>
    </div>
  );
}

/** Applies the reviewed regional translation to the screen while it is active. */
export function TranslationLayer() {
  const { regionalActive, regionalDict } = useApp();
  useEffect(() => {
    if (!regionalActive || !regionalDict) return;
    const root = document.getElementById("root");
    if (!root) return;
    return startTranslating(root, regionalDict);
  }, [regionalActive, regionalDict]);
  return null;
}
