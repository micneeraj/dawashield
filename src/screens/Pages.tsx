import { useState } from "react";
import { motion } from "framer-motion";
import { BellRing, Check, CheckCircle2, Cloud, Code2, Cpu, Database, GitBranch, HelpCircle, Lock, Mic, Minus, ScanLine, ShieldCheck, Smartphone, Users, X } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Disclaimer, Page, cx } from "../components/ui";
import { DataFreshness } from "../components/ResultExtras";
import { COMPARISON, COMPARISON_NOTE, COMPETITORS, PILLARS, type Cell } from "../content/positioning";
import { FIRST_RUN } from "../content/messages";
import { acceptInvite } from "../lib/cloud";
import EVAL from "../content/eval-results.json";

const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

/** In-app "Why DawaShield". */
export function Why() {
  const { lang } = useApp();
  const hi = lang === "hi";
  const cell = (c: Cell) =>
    c === "yes" ? <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-brand-700 text-white" aria-label="yes"><Check size={16} /></span>
    : c === "no" ? <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-grey-soft text-grey-ink" aria-label="no"><X size={16} /></span>
    : <span className="text-[12px] font-semibold text-muted">{hi ? "जाँचा नहीं" : "Not verified"}</span>;
  return (
    <Page title={hi ? "दवा कवच क्यों" : "Why DawaShield"}>
      <div className="space-y-3">
        {PILLARS.map((p, i) => (
          <motion.div key={p.title.en} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="flex gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><CheckCircle2 size={22} /></span>
              <span><b className="block text-[17px] leading-snug">{p.title[lang]}</b><span className="text-[15.5px] leading-snug text-muted">{p.body[lang]}</span></span>
            </Card>
          </motion.div>
        ))}
      </div>
      <h2 className="mb-2 mt-6 px-1 text-[20px] font-bold">{hi ? "दूसरे ऐप से तुलना" : "How it compares"}</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[380px] text-left" data-testid="compare-table">
          <thead>
            <tr className="border-b border-line text-[12.5px] font-bold uppercase tracking-wide text-muted">
              <th className="p-3" />
              {COMPETITORS.map((c) => <th key={c} className={cx("p-2 text-center", c === "DawaShield" && "text-brand-800")}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((r) => (
              <tr key={r.row.en} className="border-b border-line/60 last:border-0">
                <td className="p-3 text-[14.5px] font-semibold leading-snug text-ink">{r.row[lang]}</td>
                {r.cells.map((c, i) => <td key={i} className={cx("p-2 text-center", i === 0 && "bg-brand-50/60")}>{cell(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 px-1 text-[14px] leading-snug text-muted">{COMPARISON_NOTE[lang]}</p>
      <Disclaimer className="mt-5" />
    </Page>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-line">
      <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="num mt-0.5 text-[26px] font-bold leading-none text-brand-800">{value}</p>
      {sub && <p className="mt-1 text-[12.5px] text-muted">{sub}</p>}
    </div>
  );
}

function Step({ icon, title, children, tone = "brand" }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "brand" | "sky" | "ink" }) {
  return (
    <li className="flex gap-3">
      <span className="flex flex-col items-center">
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full text-white", tone === "sky" ? "bg-sky-600" : tone === "ink" ? "bg-ink" : "bg-brand-700")}>{icon}</span>
        <span className="my-1 w-0.5 flex-1 bg-line" />
      </span>
      <div className="pb-4">
        <p className="text-[17px] font-bold leading-snug">{title}</p>
        <p className="mt-0.5 text-[15px] leading-snug text-muted">{children}</p>
      </div>
    </li>
  );
}

/** "How it works": the depth judges should see, with live eval numbers. */
export function How() {
  const { lang, dataMeta } = useApp();
  const hi = lang === "hi";
  const m = EVAL.matching as null | { precision: number; recall: number; falseGreyRate: number; cases: number };
  const s = EVAL.speech as null | { top1: number; top3: number; cases: number };
  const p = EVAL.photo as null | { images: number; fields: Record<string, number> | null };
  return (
    <Page title={hi ? "यह कैसे काम करता है" : "How it works"}>
      <section className="rounded-[28px] bg-gradient-to-br from-brand-800 to-brand-600 p-5 text-white">
        <p className="text-[14px] font-semibold text-brand-100">{hi ? "रंग AI तय नहीं करता" : "AI never decides the colour"}</p>
        <h2 className="mt-1 text-[23px] font-bold leading-tight">{hi ? "सरकारी डेटा + सादा कोड, AI सिर्फ़ मदद के लिए" : "Official data + plain code. AI only helps."}</h2>
      </section>

      <h3 className="mb-2 mt-5 px-1 text-[19px] font-bold">{hi ? "मापे गए नतीजे" : "Measured results"}</h3>
      <div className="grid grid-cols-2 gap-2" data-testid="eval-stats">
        <Stat label={hi ? "मिलान: precision" : "Matching precision"} value={pct(m?.precision)} sub={m ? `${m.cases} ${hi ? "केस" : "cases"}` : undefined} />
        <Stat label={hi ? "मिलान: recall" : "Matching recall"} value={pct(m?.recall)} />
        <Stat label={hi ? "गलत धूसर दर" : "False-GREY rate"} value={pct(m?.falseGreyRate)} sub={hi ? "जो पकड़ना था पर छूटा" : "flagged batches missed"} />
        <Stat label={hi ? "हिन्दी आवाज़ top-1 / top-3" : "Hindi voice top-1 / top-3"} value={s ? `${Math.round(s.top1 * 100)} / ${Math.round(s.top3 * 100)}%` : "—"} sub={s ? `${s.cases} ${hi ? "गड़बड़ ट्रांसक्रिप्ट" : "garbled transcripts"}` : undefined} />
      </div>
      <p className="mt-2 px-1 text-[13.5px] text-muted">
        {p && p.images > 0 ? (hi ? `फ़ोटो: ${p.images} तस्वीरों पर जाँचा गया।` : `Photo: evaluated on ${p.images} images.`) : (hi ? "फ़ोटो जाँच: अभी कोई असली पत्ते की तस्वीर eval फ़ोल्डर में नहीं है।" : "Photo eval: no real strip images in the eval folder yet.")}
        {" "}{hi ? "पूरा तरीका: docs/EVAL.md" : "Full method: docs/EVAL.md"}
      </p>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "एक जाँच के कदम" : "One check, step by step"}</h3>
      <Card className="p-5">
        <ol>
          <Step icon={<Mic size={19} />} title={hi ? "1. आप बोलते, लिखते या फ़ोटो लेते हैं" : "1. You speak, type or take a photo"}>
            {hi ? "हिन्दी आवाज़ को देवनागरी से रोमन में बदलकर, ध्वनि-कुंजी (phonetic key) और edit distance से 2,600+ दवा-नामों के शब्दकोश से मिलाया जाता है। बिना इंटरनेट।" : "Hindi speech is transliterated, reduced to Hindi-aware phonetic keys and matched by edit distance against a 2,600+ name dictionary. Offline."}
          </Step>
          <Step icon={<ScanLine size={19} />} title={hi ? "2. फ़ोटो: साफ़ करके पढ़ना" : "2. Photo: clean up, then read"} tone="sky">
            {hi ? "ऑटो-क्रॉप, ग्रेस्केल, चमक घटाना, CLAHE कंट्रास्ट, शार्पन। फिर Gemini दो बार पढ़ता है; हर फ़ील्ड पर भरोसे का अंक। कम भरोसा = पीला, आप पक्का करते हैं।" : "Auto-crop, grayscale, glare reduction, CLAHE contrast, sharpen. Gemini reads twice; every field gets a confidence score. Low confidence = amber, you confirm."}
          </Step>
          <Step icon={<Cpu size={19} />} title={hi ? "3. हाइब्रिड AI राउटर" : "3. Hybrid AI router"} tone="sky">
            {hi ? "ऑनलाइन: क्लाउड में Gemini Flash (Firebase AI Logic)। ऑफ़लाइन: फ़ोन पर Gemini Nano, अगर है। दोनों नहीं: सिर्फ़ सादा कोड, पूरी जाँच फिर भी चलती है।" : "Online: Gemini Flash in the cloud (Firebase AI Logic). Offline: Gemini Nano on the device if available. Neither: plain code only, the full check still works."}
          </Step>
          <Step icon={<GitBranch size={19} />} title={hi ? "4. कंपनी पहचान (entity resolution)" : "4. Company entity resolution"} tone="ink">
            {hi ? "Pvt/Ltd हटाना, वर्तनी एक करना, उपनाम तालिका, token-set ratio से भरोसा। बैच + पक्की कंपनी = लाल; बैच + आधी मिलती कंपनी = पीला, कभी धूसर नहीं।" : "Strip Pvt/Ltd, standardise spelling, alias table, token-set ratio confidence. Batch + confident company = RED; batch + partial company = AMBER, never GREY."}
          </Step>
          <Step icon={<Code2 size={19} />} title={hi ? "5. ऑफ़लाइन मिलान इंजन" : "5. Offline matching engine"} tone="ink">
            {hi ? `${(dataMeta?.records ?? 0).toLocaleString("en-IN")} सरकारी रिकॉर्ड IndexedDB में। सादे नियम, कुछ मिलीसेकंड में, किसी भी सस्ते Android ब्राउज़र पर।` : `${(dataMeta?.records ?? 0).toLocaleString("en-IN")} official records in IndexedDB. Plain rules, a few milliseconds, on any low-end Android browser.`}
          </Step>
          <Step icon={<BellRing size={19} />} title={hi ? "6. रोज़ दोबारा जाँच" : "6. Daily re-check loop"}>
            {hi ? "GitHub Actions रोज़ CDSCO से नया डेटा लाता है, जाँचता है, और सहमति देने वालों की सहेजी दवाएँ दोबारा मिलाकर push भेजता है।" : "GitHub Actions fetches CDSCO daily, validates it, re-checks opted-in saved medicines and sends a push if one is flagged."}
          </Step>
        </ol>
      </Card>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "निजता का डिज़ाइन" : "Privacy design"}</h3>
      <Card className="space-y-2 p-5 text-[15.5px] leading-snug">
        <p className="flex gap-2"><Smartphone size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "दवा पेटी और परिवार फ़ोन में ही।" : "Cabinet and family stay on the phone."}</p>
        <p className="flex gap-2"><Lock size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "Push चुनने पर ही: टोकन, भाषा, बैच, कंपनी, समाप्ति महीना। नाम/फ़ोन/बीमारी कभी नहीं।" : "Only with push opt-in: token, language, batch, company, expiry month. Never name, phone or illness."}</p>
        <p className="flex gap-2"><Cloud size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "हर AI जवाब पर लिखा: इसी फ़ोन पर या क्लाउड।" : "Every AI answer is labelled On this device or Cloud."}</p>
        <p className="flex gap-2"><Database size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "Firestore नियम: हर डिवाइस सिर्फ़ अपने दस्तावेज़ पढ़/लिख सकता है।" : "Firestore rules: each device can only read and write its own documents."}</p>
      </Card>
      <DataFreshness meta={dataMeta} className="mt-5" />
      <p className="mt-5 text-center text-[14px] text-muted">Built by Neeraj Kumar</p>
    </Page>
  );
}

/** Family member opens the invite link: accept to get push alerts on this phone. */
export function Invite() {
  const { lang, screen, go } = useApp();
  const code = screen.name === "invite" ? screen.code : "";
  const [state, setState] = useState<"idle" | "busy" | "ok" | "denied" | "unsupported" | "invalid" | "error">("idle");
  const hi = lang === "hi";
  const MSG: Record<string, string> = {
    ok: hi ? "हो गया। उनकी किसी सहेजी दवा पर चेतावनी आई तो इस फ़ोन पर सूचना आएगी।" : "Done. If any of their saved medicines is flagged, this phone gets a notification.",
    denied: hi ? "सूचना की इजाज़त नहीं मिली।" : "Notifications were blocked.",
    unsupported: hi ? "यह ब्राउज़र सूचनाएँ नहीं ले सकता। WhatsApp संदेश अब भी काम करेंगे।" : "This browser can't receive notifications. WhatsApp messages still work.",
    invalid: hi ? "यह लिंक सही नहीं है या हटा दिया गया है।" : "This link is invalid or was removed.",
    error: hi ? "अभी नहीं हो सका। इंटरनेट से जुड़कर फिर कोशिश कीजिए।" : "Couldn't do it right now. Connect to the internet and try again.",
  };
  return (
    <Page title={hi ? "परिवार का निमंत्रण" : "Family invite"} onBack={() => { history.replaceState(null, "", "/"); go({ name: "home" }); }}>
      <Card className="p-6 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-50 text-brand-700"><Users size={32} /></span>
        <h2 className="mt-3 text-[22px] font-bold leading-snug">{hi ? "परिवार के किसी सदस्य ने आपको जोड़ा है" : "A family member invited you"}</h2>
        <p className="mt-2 text-[16px] leading-snug text-muted">{hi ? "स्वीकार करने पर, उनकी सहेजी किसी दवा पर सरकारी चेतावनी आए तो इस फ़ोन पर सूचना आएगी। हम आपका नाम या नंबर नहीं रखते, सिर्फ़ सूचना भेजने का कोड।" : "If you accept, this phone gets a notification when one of their saved medicines appears in an official alert. We keep no name or number, only a notification code."}</p>
        {state !== "idle" && state !== "busy" && <p className={cx("mt-4 rounded-2xl p-3 text-[16px] font-semibold", state === "ok" ? "bg-brand-50 text-brand-900" : "bg-amber-soft text-amber-ink")} data-testid="invite-state">{MSG[state]}</p>}
        {state !== "ok" && <Button full className="mt-5" icon={<ShieldCheck size={21} />} disabled={state === "busy"} onClick={async () => { setState("busy"); setState(await acceptInvite(code, lang)); }} data-testid="invite-accept">{hi ? "स्वीकार करें" : "Accept"}</Button>}
      </Card>
    </Page>
  );
}

/** First-run disclaimer, Hindi + English, shown once. */
export function FirstRun({ onDone }: { onDone: () => void }) {
  const { lang, setLang } = useApp();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="fr-title" data-testid="first-run">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[32px] bg-paper p-6 sm:rounded-[32px]">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-brand-50 p-1">
          {(["hi", "en"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cx("min-h-12 rounded-xl text-[17px] font-bold", lang === l ? "bg-white text-brand-800 shadow-soft" : "text-brand-700")}>{l === "hi" ? "हिन्दी" : "English"}</button>
          ))}
        </div>
        <h2 id="fr-title" className="flex items-center gap-2 text-[24px] font-bold"><HelpCircle className="text-brand-600" /> {FIRST_RUN.title[lang]}</h2>
        <ul className="mt-4 space-y-3">
          {FIRST_RUN.points.map((p) => (
            <li key={p.en} className="flex gap-3 text-[17px] leading-snug text-ink">
              <Minus size={18} className="mt-1 shrink-0 text-brand-600" aria-hidden /> {p[lang]}
            </li>
          ))}
        </ul>
        <Button full className="mt-6 min-h-16 text-[19px]" icon={<Check size={22} />} onClick={onDone} data-testid="first-run-ok">{FIRST_RUN.ok[lang]}</Button>
      </motion.div>
    </div>
  );
}
