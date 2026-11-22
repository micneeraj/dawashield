// First start: shield logo, "नमस्ते / Welcome", big language tiles (each in its
// own script) and the optional "What should we call you?" field.
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Globe, WifiOff } from "lucide-react";
import { useApp } from "../state";
import { LogoMark } from "./Logo";
import { Button, cx, inputCls } from "./ui";
import { NAME_SUGGEST, getNickname, languageTiles, setNickname } from "../lib/profile";

export const NAME_TXT = {
  q: { hi: "आपको क्या कहकर बुलाएँ?", en: "What should we call you?" },
  opt: { hi: "ज़रूरी नहीं", en: "Optional" },
};
const TXT = {
  pick: { hi: "अपनी भाषा चुनें", en: "Choose your language" },
  offline: { hi: "बिना इंटरनेट भी", en: "Works offline" },
  online: { hi: "इंटरनेट के साथ", en: "Online" },
  soon: { hi: "जल्द आ रहा है (ऑनलाइन)", en: "Coming soon (online)" },
  next: { hi: "आगे बढ़ें", en: "Continue" },
  change: { hi: "भाषा बाद में सेटिंग में बदल सकते हैं।", en: "You can change this later in Settings." },
};

/** Language tiles: Hindi and English on; regional ones on only when the manifest says so. */
export function LanguageTiles({ onPicked }: { onPicked?: () => void }) {
  const { uiLang, setUiLang, regionalAvailable, lang } = useApp();
  const tiles = languageTiles(regionalAvailable);
  return (
    <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={TXT.pick[lang]} data-testid="lang-picker">
      {tiles.map((t) => {
        const on = uiLang === t.lang;
        const active = t.active || on; // a language picked earlier stays selectable offline
        return (
          <button key={t.lang} role="radio" aria-checked={on} disabled={!active} lang={t.lang} translate="no"
            onClick={() => { setUiLang(t.lang); onPicked?.(); }} data-testid={`lang-${t.lang}`} data-ready={active ? "1" : "0"}
            className={cx(
              "relative flex min-h-[84px] flex-col items-start justify-center rounded-[20px] border-2 px-4 py-3 text-left",
              on ? "border-accent bg-accent-soft text-brand-900 shadow-soft" : "border-line bg-white text-ink hover:border-brand-300",
              !active && "cursor-not-allowed border-dashed bg-paper hover:border-line",
            )}>
            <span className={cx("text-[24px] font-bold leading-tight", !active && "text-muted")}>{t.native}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-muted">
              {t.note === "offline" ? <><WifiOff size={13} aria-hidden /> {TXT.offline[lang]}</> : t.note === "online" ? <><Globe size={13} aria-hidden /> {TXT.online[lang]}</> : <><Globe size={13} aria-hidden /> {TXT.soon[lang]}</>}
            </span>
            {on && <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-accent-strong text-white"><Check size={16} aria-hidden /></span>}
          </button>
        );
      })}
    </div>
  );
}

/** Optional name field with quick picks (माँ, पापा...). */
export function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { lang } = useApp();
  return (
    <div>
      <label htmlFor="nickname" className="mb-1.5 flex items-baseline gap-2 text-[18px] font-bold text-ink">
        {NAME_TXT.q[lang]} <span className="text-[14px] font-medium text-muted">{NAME_TXT.opt[lang]}</span>
      </label>
      <input id="nickname" className={inputCls} value={value} maxLength={30} onChange={(e) => onChange(e.target.value)} placeholder={lang === "hi" ? "जैसे माँ" : "e.g. Maa"} data-testid="nickname-input" />
      <div className="mt-2 flex flex-wrap gap-2">
        {NAME_SUGGEST[lang].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} className={cx("min-h-12 rounded-full px-4 text-[16px] font-semibold ring-1", value === n ? "bg-accent-soft text-brand-900 ring-accent" : "bg-white text-brand-800 ring-line hover:ring-brand-300")}>{n}</button>
        ))}
      </div>
    </div>
  );
}

export function Welcome({ onDone }: { onDone: () => void }) {
  const { lang } = useApp();
  const [name, setName] = useState(getNickname);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper" role="dialog" aria-modal="true" aria-labelledby="welcome-title" data-testid="welcome">
      <div className="hero-brand px-6 pb-10 pt-[max(40px,env(safe-area-inset-top))] text-center text-white">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }} className="mx-auto grid h-24 w-24 place-items-center rounded-[28px] bg-white shadow-lift">
          <LogoMark size={64} />
        </motion.div>
        <h1 id="welcome-title" className="mt-5 text-[34px] font-bold leading-tight"><span lang="hi">नमस्ते</span> <span className="opacity-60">/</span> Welcome</h1>
        <p className="mt-1 text-[17px] text-white/85"><span lang="hi">दवा कवच</span> · DawaShield</p>
      </div>
      <div className="mx-auto -mt-5 max-w-[440px] px-4 pb-10">
        <div className="rounded-[24px] bg-white p-4 shadow-lift ring-1 ring-line">
          <h2 className="mb-3 text-[19px] font-bold text-ink">{lang === "hi" ? "अपनी भाषा चुनें · Choose language" : "Choose your language · भाषा चुनें"}</h2>
          <LanguageTiles />
          <p className="mt-3 text-[14px] text-muted">{TXT.change[lang]}</p>
        </div>
        <div className="mt-4 rounded-[24px] bg-white p-4 shadow-soft ring-1 ring-line">
          <NameField value={name} onChange={setName} />
        </div>
        <Button full className="mt-5 min-h-16 text-[20px]" icon={<ArrowRight size={22} />} onClick={() => { setNickname(name); onDone(); }} data-testid="welcome-next">{TXT.next[lang]}</Button>
      </div>
    </div>
  );
}
