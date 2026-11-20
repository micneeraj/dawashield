import { useEffect, useState } from "react";
import { BellRing, BellOff, Check, ShieldCheck } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, cx } from "./ui";
import { disablePush, enablePush, pushEnabled, pushSupported } from "../lib/cloud";

export const PUSH_TXT = {
  title: { hi: "ऐप बंद हो तब भी ख़बर पाएँ?", en: "Get alerts even when the app is closed?" },
  body: {
    hi: "रोज़ नई सरकारी सूची से आपकी सहेजी दवाएँ जाँची जाएँगी। कोई बैच चेतावनी में आया, या दवा की तारीख़ 5 दिन में ख़त्म होने वाली हो, तो आपके फ़ोन पर सूचना आएगी।",
    en: "Every day your saved medicines are re-checked against the new official list. If a batch is flagged, or a medicine expires in 5 days, you get a notification on this phone.",
  },
  stored: {
    hi: "इसके लिए हमारे सर्वर पर सिर्फ़ यह रखा जाता है: सूचना भेजने का कोड, भाषा, और हर दवा का बैच नंबर, कंपनी और समाप्ति महीना। आपका नाम, फ़ोन नंबर, बीमारी या दवा किसके लिए है, यह कभी नहीं। आप कभी भी बंद कर सकते हैं, तब यह सब मिटा दिया जाता है।",
    en: "For this, our server keeps only: a notification code, your language, and for each medicine its batch number, company and expiry month. Never your name, phone number, illness or who the medicine is for. Turn it off any time and all of it is deleted.",
  },
  yes: { hi: "हाँ, सूचना भेजें", en: "Yes, alert me" },
  no: { hi: "अभी नहीं", en: "Not now" },
  on: { hi: "सूचनाएँ चालू हैं", en: "Alerts are on" },
  off: { hi: "सूचनाएँ बंद करें और डेटा मिटाएँ", en: "Turn off alerts and delete data" },
  denied: { hi: "सूचना की इजाज़त नहीं मिली। आप 'कैलेंडर में जोड़ें' से तारीख़ याद रख सकते हैं।", en: "Notifications were blocked. You can still use 'Add expiry to my calendar'." },
  unsupported: { hi: "यह ब्राउज़र सूचनाएँ नहीं भेज सकता। 'कैलेंडर में जोड़ें' इस्तेमाल कीजिए।", en: "This browser can't receive notifications. Use 'Add expiry to my calendar' instead." },
  error: { hi: "अभी चालू नहीं हो सका। इंटरनेट से जुड़कर फिर कोशिश कीजिए।", en: "Couldn't turn on right now. Connect to the internet and try again." },
};

/** Opt-in only, with clear consent. Shown after saving a medicine and in Settings. */
export function PushOffer({ className, settings }: { className?: string; settings?: boolean }) {
  const { lang, online } = useApp();
  const [on, setOn] = useState(pushEnabled());
  const [hidden, setHidden] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => { pushSupported().then(setSupported); }, []);
  if (hidden || (!settings && on)) return null;

  async function turnOn() {
    setBusy(true);
    const r = await enablePush(lang);
    setBusy(false);
    if (r === "ok") { setOn(true); setMsg(null); }
    else setMsg(PUSH_TXT[r][lang]);
  }
  async function turnOff() {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setOn(false);
  }

  return (
    <Card className={cx("p-5", className)} >
      <div className="flex items-start gap-3" data-testid="push-offer">
        <span className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", on ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-700")}><BellRing size={24} aria-hidden /></span>
        <div className="flex-1">
          <h3 className="text-[18px] font-bold leading-snug">{on ? PUSH_TXT.on[lang] : PUSH_TXT.title[lang]}</h3>
          <p className="mt-1 text-[16px] leading-snug text-ink/85">{PUSH_TXT.body[lang]}</p>
        </div>
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-2xl bg-paper px-3.5 py-3 text-[14.5px] leading-snug text-muted" data-testid="push-consent">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-600" aria-hidden /> {PUSH_TXT.stored[lang]}
      </p>
      {supported === false && <p className="mt-3 text-[15px] font-semibold text-amber-ink">{PUSH_TXT.unsupported[lang]}</p>}
      {msg && <p className="mt-3 text-[15px] font-semibold text-amber-ink" role="alert">{msg}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {on ? (
          <Button variant="secondary" className="col-span-2" icon={<BellOff size={20} />} disabled={busy} onClick={turnOff} data-testid="push-off">{PUSH_TXT.off[lang]}</Button>
        ) : (
          <>
            <Button icon={busy ? undefined : <Check size={20} />} disabled={busy || !online || supported === false} onClick={turnOn} data-testid="push-yes">{PUSH_TXT.yes[lang]}</Button>
            {!settings && <Button variant="ghost" onClick={() => setHidden(true)}>{PUSH_TXT.no[lang]}</Button>}
          </>
        )}
      </div>
    </Card>
  );
}
