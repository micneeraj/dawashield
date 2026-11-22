// Language picker, offline fallback banner, and the screen translation layer.
import { useEffect, useState } from "react";
import { Globe, WifiOff } from "lucide-react";
import { LanguageTiles } from "./Welcome";
import { useApp } from "../state";
import { Sheet } from "./Sheet";
import { LANG_NAMES, isRegional, startTranslating } from "../lib/i18n";

const TXT = {
  title: { hi: "भाषा चुनें", en: "Choose language" },
  sub: { hi: "हिन्दी और अंग्रेज़ी बिना इंटरनेट चलती हैं। बाकी भाषाओं के लिए इंटरनेट चाहिए।", en: "Hindi and English work offline. The other languages need internet." },
};

/** Big buttons, each language in its own script (shared with the welcome screen). */
export function LanguagePicker({ onPicked, className }: { onPicked?: () => void; className?: string }) {
  const { lang } = useApp();
  return (
    <div className={className}>
      <p className="mb-3 text-[15px] leading-snug text-muted">{TXT.sub[lang]}</p>
      <LanguageTiles onPicked={onPicked} />
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
    <div className="mx-4 mb-2 flex items-start gap-2.5 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900" role="status" data-testid="regional-fallback">
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

const NO_VOICE: Record<string, string> = {
  pa: "ਇਸ ਫ਼ੋਨ ਵਿੱਚ ਪੰਜਾਬੀ ਆਵਾਜ਼ ਨਹੀਂ ਹੈ, ਇਸ ਲਈ ਸਿਰਫ਼ ਲਿਖਤ ਦਿਖਾਈ ਜਾਵੇਗੀ।",
  gu: "આ ફોનમાં ગુજરાતી અવાજ નથી, તેથી ફક્ત લખાણ બતાવીશું.",
  mr: "या फोनमध्ये मराठी आवाज नाही, म्हणून फक्त मजकूर दाखवू.",
  kn: "ಈ ಫೋನಿನಲ್ಲಿ ಕನ್ನಡ ಧ್ವನಿ ಇಲ್ಲ, ಆದ್ದರಿಂದ ಪಠ್ಯ ಮಾತ್ರ ತೋರಿಸುತ್ತೇವೆ.",
  ta: "இந்த போனில் தமிழ் குரல் இல்லை, எனவே எழுத்து மட்டும் காட்டப்படும்.",
};

/** Regional language active but the device has no speech voice for it: small text-only note. */
export function RegionalNoVoiceNote() {
  const { uiLang, regionalActive, regionalVoiceOk, muted } = useApp();
  if (!regionalActive || regionalVoiceOk || muted || !NO_VOICE[uiLang]) return null;
  return (
    <p className="mx-4 mb-2 rounded-xl bg-white/70 px-3 py-2 text-[14px] text-muted" role="note" translate="no" data-testid="regional-no-voice">
      {NO_VOICE[uiLang]} · Text only
    </p>
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
