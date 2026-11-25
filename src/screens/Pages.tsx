import { useState } from "react";
import { motion } from "framer-motion";
import { BellRing, Check, CheckCircle2, Cloud, Code2, Cpu, Database, GitBranch, HelpCircle, Lock, Mic, Minus, ScanLine, ShieldCheck, Smartphone, Users, X } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Disclaimer, LEVEL_STYLE, Page, cx } from "../components/ui";
import { InfoToolNote } from "../components/ResultHead";
import { dateLabel, monthLabel } from "../lib/format";
import { DataFreshness } from "../components/ResultExtras";
import { COMPARISON, COMPARISON_NOTE, COMPETITORS, PILLARS, type Cell } from "../content/positioning";
import { FIRST_RUN, INFO_TOOL } from "../content/messages";
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
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full text-white", tone === "sky" ? "bg-brand-800" : tone === "ink" ? "bg-ink" : "bg-brand-700")}>{icon}</span>
        <span className="my-1 w-0.5 flex-1 bg-line" />
      </span>
      <div className="pb-4">
        <p className="text-[17px] font-bold leading-snug">{title}</p>
        <p className="mt-0.5 text-[15px] leading-snug text-muted">{children}</p>
      </div>
    </li>
  );
}

type EvalMatching = { cases: number; real: number; generated: number; falseRedRate: number; falseGreyRate: number; falseRed: number; notRed: number; falseGrey: number; shouldFlag: number; accuracy: number; confusion: Record<string, Record<string, number>> };
type EvalSpeech = { perLanguage: { lang: string; label: string; cases: number; top1: number; top3: number; generated: boolean }[] };
type EvalPhoto = { images: number; fields: Record<string, number> | null; refused: { ok: number; of: number } | null; caught: { ok: number; of: number } | null };
const EM = EVAL.matching as unknown as EvalMatching;
const ES = EVAL.speech as unknown as EvalSpeech;
const EP = EVAL.photo as unknown as EvalPhoto;
const ET = (EVAL as unknown as { tests: { passed: number; total: number } | null }).tests;

/** The decision table, as it is in src/lib/match.ts. */
function DecisionTable() {
  const { lang } = useApp();
  const hi = lang === "hi";
  const rows: { level: "RED" | "AMBER" | "GREY" | "UNREADABLE"; when: string }[] = hi
    ? [
        { level: "RED", when: "बैच पूरा मिलता है और कंपनी पक्के भरोसे से मिलती है (रिकॉर्ड में कंपनी न हो, जैसे नकली दवा, तो दवा का नाम)।" },
        { level: "AMBER", when: "संभावित मेल: बैच पूरा मिलता है पर कंपनी पक्की नहीं; या बैच एक अक्षर अलग / अधूरा।" },
        { level: "AMBER", when: "दूसरे बैच चेतावनी में: वही कंपनी और वही दवा, बैच अलग।" },
        { level: "GREY", when: "वही कंपनी, अलग दवा: छोटी सूचना, 'आपकी दवा पर असर नहीं'।" },
        { level: "GREY", when: "कोई रिकॉर्ड नहीं।" },
        { level: "UNREADABLE", when: "फ़ोटो या आवाज़ इतनी साफ़ नहीं कि मिलान हो: बटन से बैच डालें या दोबारा फ़ोटो लें। कभी धूसर नहीं।" },
      ]
    : [
        { level: "RED", when: "Exact batch AND company matched with high confidence (or the medicine name, when the record names no company, as with spurious drugs)." },
        { level: "AMBER", when: "Possible match: exact batch but the company is uncertain; or a batch one character off / incomplete." },
        { level: "AMBER", when: "Other batches flagged: same company AND same medicine, different batch." },
        { level: "GREY", when: "Same company, different medicine: small note, \"Your medicine is not affected.\"" },
        { level: "GREY", when: "No record." },
        { level: "UNREADABLE", when: "Photo or voice too unclear to match: keypad or retake. Never shown as GREY." },
      ];
  const word = { RED: hi ? "लाल" : "RED", AMBER: hi ? "पीला" : "AMBER", GREY: hi ? "धूसर" : "GREY", UNREADABLE: hi ? "साफ़ नहीं" : "CAN'T READ" };
  return (
    <Card className="p-4" data-testid="decision-table">
      <ul className="space-y-2.5">
        {rows.map((r, i) => {
          const S = LEVEL_STYLE[r.level];
          return (
            <li key={i} className="flex gap-3">
              <span className={cx("mt-0.5 inline-flex h-7 min-w-[88px] shrink-0 items-center justify-center rounded-full border px-2 text-[12.5px] font-bold", S.bg, S.line, S.ink)}>{word[r.level]}</span>
              <span className="text-[15px] leading-snug text-ink">{r.when}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 rounded-2xl bg-paper px-3.5 py-3 text-[14.5px] leading-snug text-ink">
        <b>{hi ? "असली उदाहरण:" : "Real example:"}</b>{" "}
        {hi
          ? "Dolo-650 (Micro Labs, बैच DOBS4518) सूची में नहीं है। Micro Labs की दूसरी दवा Amlodipine (बैच AMAS0249) सूची में है। पहले यह पीला दिखता था — अब धूसर, साथ में छोटी सूचना कि आपकी दवा पर असर नहीं।"
          : "Dolo-650 (Micro Labs, batch DOBS4518) is not listed. A different Micro Labs medicine, Amlodipine (batch AMAS0249), is. This used to show AMBER; now it is GREY with a small note that your medicine is not affected."}
      </p>
    </Card>
  );
}

/** "How it works": the depth judges should see, with live eval numbers. */
export function How() {
  const { lang, dataMeta, go } = useApp();
  const hi = lang === "hi";
  const reg = ES.perLanguage.filter((s) => s.generated);
  return (
    <Page title={hi ? "यह कैसे काम करता है" : "How it works"}>
      <section className="rounded-[28px] bg-gradient-to-br from-brand-800 to-brand-600 p-5 text-white">
        <p className="text-[14px] font-semibold text-brand-100">{hi ? "रंग AI तय नहीं करता" : "AI never decides the colour"}</p>
        <h2 className="mt-1 text-[23px] font-bold leading-tight">{hi ? "सरकारी डेटा + सादा कोड, AI सिर्फ़ मदद के लिए" : "Official data + plain code. AI only helps."}</h2>
      </section>

      <h3 className="mb-2 mt-5 px-1 text-[19px] font-bold">{hi ? "नतीजे का रंग कैसे तय होता है" : "How the result colour is decided"}</h3>
      <DecisionTable />

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "मापे गए नतीजे" : "Measured results"}</h3>
      <div className="grid grid-cols-2 gap-2" data-testid="eval-stats">
        <Stat label={hi ? "गलत लाल दर" : "False-RED rate"} value={pct(EM.falseRedRate)} sub={`${EM.falseRed} / ${EM.notRed}`} />
        <Stat label={hi ? "गलत धूसर दर" : "False-GREY rate"} value={pct(EM.falseGreyRate)} sub={`${EM.falseGrey} / ${EM.shouldFlag}`} />
        <Stat label={hi ? "मिलान के केस" : "Matching cases"} value={String(EM.cases)} sub={hi ? `${EM.real} असली · ${EM.generated} बनाए गए` : `${EM.real} real · ${EM.generated} generated`} />
        <Stat label={hi ? "टेस्ट पास" : "Tests passed"} value={ET ? `${ET.passed}/${ET.total}` : "—"} />
        <Stat label={hi ? "हिन्दी/अंग्रेज़ी आवाज़ top-3" : "Hindi/English voice top-3"} value={pct(ES.perLanguage[0]?.top3)} sub={`${ES.perLanguage[0]?.cases ?? 0} ${hi ? "ट्रांसक्रिप्ट" : "transcripts"}`} />
        <Stat label={hi ? "5 भाषाएँ, आवाज़ top-3" : "5 languages, voice top-3"} value={reg.length ? pct(reg.reduce((n, s) => n + s.top3, 0) / reg.length) : "—"} sub={hi ? "बनाए गए ट्रांसक्रिप्ट" : "generated transcripts"} />
      </div>
      <button onClick={() => go({ name: "transparency" })} className="mt-2 px-1 text-[15px] font-semibold text-brand-800 underline underline-offset-4">{hi ? "सारे आँकड़े और सीमाएँ देखें" : "See all numbers and limits"}</button>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "एक जाँच के कदम" : "One check, step by step"}</h3>
      <Card className="p-5">
        <ol>
          <Step icon={<Mic size={19} />} title={hi ? "1. आप बोलते, लिखते या फ़ोटो लेते हैं" : "1. You speak, type or take a photo"}>
            {hi ? "आवाज़ को रोमन में बदलकर, ध्वनि-कुंजी और edit distance से दवा-नामों के शब्दकोश से मिलाया जाता है। हिन्दी/अंग्रेज़ी बिना इंटरनेट (Chrome में भाषा पैक हो तो); पंजाबी, गुजराती, मराठी, कन्नड़, तमिल इंटरनेट के साथ।" : "Speech is transliterated, reduced to phonetic keys and matched by edit distance against the medicine-name dictionary. Hindi/English offline (with Chrome's language pack); Punjabi, Gujarati, Marathi, Kannada and Tamil online."}
          </Step>
          <Step icon={<ScanLine size={19} />} title={hi ? "2. फ़ोटो: साफ़ करके पढ़ना" : "2. Photo: clean up, then read"} tone="sky">
            {hi ? "ऑटो-क्रॉप, चमक घटाना, कंट्रास्ट, शार्पन; फिर Gemini दो बार पढ़ता है, हर फ़ील्ड पर भरोसे का अंक। बहुत कम भरोसा = 'साफ़ नहीं पढ़ा गया', कभी अंदाज़ा नहीं। फ़ोन पर फ़ोटो पढ़ने के लिए इंटरनेट चाहिए; बिना इंटरनेट सिर्फ़ Gemini Nano वाले डेस्कटॉप Chrome पर।" : "Auto-crop, glare reduction, contrast, sharpen; Gemini reads twice and scores every field. Very low confidence = \"Can't read clearly\", never a guess. On phones, photo reading needs internet; offline photo reading works only on desktop Chrome with Gemini Nano."}
          </Step>
          <Step icon={<GitBranch size={19} />} title={hi ? "3. कंपनी और दवा की पहचान" : "3. Company and medicine resolution"} tone="ink">
            {hi ? "Pvt/Ltd हटाना, वर्तनी एक करना, उपनाम तालिका, token-set ratio से भरोसा। दवा: जेनेरिक/ब्रांड नाम, जैसे Dolo = Paracetamol।" : "Strip Pvt/Ltd, standardise spelling, alias table, token-set ratio confidence. Medicine: generic or brand name, e.g. Dolo = Paracetamol."}
          </Step>
          <Step icon={<Code2 size={19} />} title={hi ? "4. ऑफ़लाइन मिलान इंजन" : "4. Offline matching engine"} tone="ink">
            {hi ? `${(dataMeta?.records ?? 0).toLocaleString("en-IN")} सरकारी रिकॉर्ड फ़ोन में। ऊपर की तालिका वाले सादे नियम, कुछ मिलीसेकंड में, किसी भी फ़ोन के ब्राउज़र पर।` : `${(dataMeta?.records ?? 0).toLocaleString("en-IN")} official records on the phone. The plain rules in the table above, in a few milliseconds, in any phone's browser.`}
          </Step>
          <Step icon={<Cpu size={19} />} title={hi ? "5. AI कहाँ मदद करता है" : "5. Where AI helps"} tone="sky">
            {hi ? "ऑनलाइन: क्लाउड में Gemini Flash (Firebase AI Logic)। Gemini Nano सिर्फ़ उन डेस्कटॉप Chrome पर जो इसे सपोर्ट करते हैं। AI सिर्फ़ पढ़ने/समझाने में; रंग कभी नहीं।" : "Online: Gemini Flash in the cloud (Firebase AI Logic). Gemini Nano only on supported desktop Chrome. AI only reads and explains; it never picks the colour."}
          </Step>
          <Step icon={<BellRing size={19} />} title={hi ? "6. रोज़ दोबारा जाँच" : "6. Daily re-check loop"}>
            {hi ? "GitHub Actions रोज़ CDSCO से नया डेटा लाता है, जाँचता है, और सहमति देने वालों की सहेजी दवाएँ दोबारा मिलाकर push भेजता है। iPhone पर push तभी, जब ऐप होम स्क्रीन पर जोड़ा गया हो।" : "GitHub Actions fetches CDSCO daily, validates it, re-checks opted-in saved medicines and sends a push if one is flagged. On iPhone, push works only when the app is added to the home screen."}
          </Step>
        </ol>
      </Card>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "निजता का डिज़ाइन" : "Privacy design"}</h3>
      <Card className="space-y-2 p-5 text-[15.5px] leading-snug">
        <p className="flex gap-2"><Smartphone size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "दवा पेटी और परिवार फ़ोन में ही।" : "Cabinet and family stay on the phone."}</p>
        <p className="flex gap-2"><Lock size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "Push चुनने पर ही: टोकन, भाषा, बैच, कंपनी, समाप्ति महीना। नाम/फ़ोन/बीमारी कभी नहीं।" : "Only with push opt-in: token, language, batch, company, expiry month. Never name, phone or illness."}</p>
        <p className="flex gap-2"><Cloud size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "हर AI जवाब पर लिखा: इसी फ़ोन पर या क्लाउड। अनुवाद पहले से बने हैं; ब्राउज़र किसी अनुवाद सेवा को नहीं बुलाता।" : "Every AI answer is labelled On this device or Cloud. Translations are made in advance; the browser never calls a translation service."}</p>
        <p className="flex gap-2"><Database size={18} className="mt-0.5 shrink-0 text-brand-600" /> {hi ? "Firestore नियम: हर डिवाइस सिर्फ़ अपने दस्तावेज़ पढ़/लिख सकता है।" : "Firestore rules: each device can only read and write its own documents."}</p>
      </Card>
      <InfoToolNote className="mt-5" />
      <DataFreshness meta={dataMeta} className="mt-4" />
      <p className="mt-5 text-center text-[14px] text-muted">Built by Neeraj Kumar</p>
    </Page>
  );
}

/** In-app Transparency page: what we have measured, and what we cannot yet prove. */
export function Transparency() {
  const { lang, dataMeta } = useApp();
  const hi = lang === "hi";
  const LEVELS = ["RED", "AMBER", "GREY", "UNREADABLE"] as const;
  const head = { RED: hi ? "लाल" : "RED", AMBER: hi ? "पीला" : "AMBER", GREY: hi ? "धूसर" : "GREY", UNREADABLE: hi ? "साफ़ नहीं" : "CAN'T READ" };
  return (
    <Page title={hi ? "पारदर्शिता" : "Transparency"}>
      <div className="grid grid-cols-2 gap-2" data-testid="transparency-stats">
        <Stat label={hi ? "सरकारी रिकॉर्ड" : "Records indexed"} value={(dataMeta?.records ?? EVAL.records).toLocaleString("en-IN")} />
        <Stat label={hi ? "सबसे नई चेतावनी" : "Latest alert month"} value={monthLabel(dataMeta?.latestMonth ?? (EVAL as { latestMonth?: string }).latestMonth, lang)} />
        <Stat label={hi ? "डेटा आख़िरी बार बदला" : "Dataset last updated"} value={dateLabel(dataMeta?.lastSynced, lang)} />
        <Stat label={hi ? "CDSCO की आख़िरी सफल जाँच" : "Last successful source check"} value={dataMeta?.lastChecked ? dateLabel(dataMeta.lastChecked, lang) : "—"} />
        <Stat label={hi ? "हाथ से जाँचे रिकॉर्ड" : "Hand-verified records"} value={String(dataMeta?.verified ?? (EVAL as { verified?: number }).verified ?? "—")} />
        <Stat label={hi ? "टेस्ट पास" : "Tests passed"} value={ET ? `${ET.passed}/${ET.total}` : "—"} />
        <Stat label={hi ? "eval की तारीख़" : "Eval run"} value={dateLabel(EVAL.generatedAt, lang)} />
      </div>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "मिलान (सादा कोड)" : "Matching (plain code)"}</h3>
      <div className="grid grid-cols-2 gap-2">
        <Stat label={hi ? "गलत लाल दर" : "False-RED rate"} value={pct(EM.falseRedRate)} sub={`${EM.falseRed} / ${EM.notRed}`} />
        <Stat label={hi ? "गलत धूसर दर" : "False-GREY rate"} value={pct(EM.falseGreyRate)} sub={`${EM.falseGrey} / ${EM.shouldFlag}`} />
      </div>
      <Card className="mt-2 overflow-x-auto p-0">
        <table className="w-full min-w-[340px] text-center text-[14px]" data-testid="confusion-table">
          <caption className="px-3 pt-3 text-left text-[13px] font-semibold text-muted">{hi ? "पंक्ति = अपेक्षित, कॉलम = ऐप ने दिखाया" : "Rows = expected, columns = what the app showed"}</caption>
          <thead><tr className="text-[12px] font-bold uppercase text-muted"><th className="p-2" />{LEVELS.map((l) => <th key={l} className="p-2">{head[l]}</th>)}</tr></thead>
          <tbody>
            {LEVELS.map((e) => (
              <tr key={e} className="border-t border-line/60">
                <th className="p-2 text-left text-[12.5px] font-bold uppercase text-muted">{head[e]}</th>
                {LEVELS.map((g) => <td key={g} className={cx("num p-2", e === g ? "font-bold text-brand-800" : EM.confusion[e]?.[g] ? "font-bold text-red-ink" : "text-muted")}>{EM.confusion[e]?.[g] ?? 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 px-1 text-[13.5px] leading-snug text-muted">{hi ? `${EM.cases} केस: ${EM.real} असली (सरकारी रिकॉर्ड, असली Dolo पत्ता), ${EM.generated} असली रिकॉर्ड से बनाए गए। पूरा तरीका: docs/EVAL.md` : `${EM.cases} cases: ${EM.real} real (official records, the real Dolo strip), ${EM.generated} generated from real records. Full method: docs/EVAL.md`}</p>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "आवाज़ से नाम पहचानना" : "Voice: medicine name"}</h3>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-[14.5px]" data-testid="speech-table">
          <thead><tr className="text-[12px] font-bold uppercase text-muted"><th className="p-3">{hi ? "भाषा" : "Language"}</th><th className="p-2">Top-1</th><th className="p-2">Top-3</th><th className="p-2">{hi ? "केस" : "Cases"}</th></tr></thead>
          <tbody>
            {ES.perLanguage.map((s) => (
              <tr key={s.lang} className="border-t border-line/60">
                <td className="p-3 font-semibold">{s.label}{s.generated && <span className="ml-1.5 rounded-full bg-grey-soft px-2 py-0.5 text-[11px] font-bold uppercase text-grey-ink">{hi ? "बनाए गए" : "generated"}</span>}</td>
                <td className="num p-2">{pct(s.top1)}</td><td className="num p-2 font-bold">{pct(s.top3)}</td><td className="num p-2">{s.cases}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "फ़ोटो पढ़ना" : "Photo reading"}</h3>
      <Card className="p-4 text-[15px] leading-snug" data-testid="photo-eval">
        {EP.images > 0 && EP.fields ? (
          <ul className="space-y-1">
            {Object.entries(EP.fields).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><b className="num">{pct(v)}</b></li>)}
            <li className="flex justify-between"><span>{hi ? "सही ढंग से पढ़ने से मना किया" : "Correctly refused to read"}</span><b className="num">{EP.refused ? `${EP.refused.ok}/${EP.refused.of}` : "—"}</b></li>
            <li className="flex justify-between"><span>{hi ? "चेतावनी वाले बैच, बिना सुधार पकड़े" : "Flagged batches caught, no correction"}</span><b className="num">{EP.caught ? `${EP.caught.ok}/${EP.caught.of}` : "—"}</b></li>
          </ul>
        ) : (
          <p>{hi ? "अभी असली पत्तों की लेबल वाली तस्वीरें नहीं हैं, इसलिए फ़ोटो की सटीकता मापी नहीं गई।" : "No labelled real strip photos yet, so photo accuracy has not been measured."}</p>
        )}
      </Card>

      <h3 className="mb-2 mt-6 px-1 text-[19px] font-bold">{hi ? "जो हम अभी साबित नहीं कर सकते" : "What we cannot yet prove"}</h3>
      <Card className="space-y-2.5 p-5 text-[15.5px] leading-snug" data-testid="known-limits">
        {(hi
          ? ["असली पत्तों की फ़ोटो पर सटीकता।", "असली लोगों की आवाज़ पर सटीकता (सारे आवाज़ केस लिखे या बनाए गए हैं)।", "पंजाबी, गुजराती, मराठी, कन्नड़, तमिल में असली बोलने वालों पर सटीकता।", "CDSCO की सूची देर से आती है; बीच के समय की चेतावनियाँ हमें नहीं दिखतीं।", "नकली दवा असली बैच नंबर छाप सकती है, इसलिए धूसर उसे नहीं नकार सकता।"]
          : ["Accuracy on real strip photos.", "Accuracy on real users' voices (all voice cases are written or generated).", "Accuracy with real Punjabi, Gujarati, Marathi, Kannada and Tamil speakers.", "CDSCO lists arrive late; alerts in between are not visible to us.", "A counterfeit can copy a real batch number, so GREY cannot rule it out."]
        ).map((x) => <p key={x} className="flex gap-2"><Minus size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden /> {x}</p>)}
      </Card>
      <InfoToolNote className="mt-5" />
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
        {state !== "idle" && state !== "busy" && <p className={cx("mt-4 rounded-2xl p-3 text-[16px] font-semibold", state === "ok" ? "bg-brand-50 text-brand-900" : "bg-grey-soft text-ink")} data-testid="invite-state">{MSG[state]}</p>}
        {state !== "ok" && <Button full className="mt-5" icon={<ShieldCheck size={21} />} disabled={state === "busy"} onClick={async () => { setState("busy"); setState(await acceptInvite(code, lang)); }} data-testid="invite-accept">{hi ? "स्वीकार करें" : "Accept"}</Button>}
      </Card>
    </Page>
  );
}

/** First-run disclaimer, Hindi + English, shown once. */
export function FirstRun({ onDone }: { onDone: () => void }) {
  const { lang } = useApp();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="fr-title" data-testid="first-run">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[32px] bg-paper p-6 sm:rounded-[32px]">
        <h2 id="fr-title" className="flex items-center gap-2 text-[24px] font-bold"><HelpCircle className="text-brand-600" /> {FIRST_RUN.title[lang]}</h2>
        <ul className="mt-4 space-y-3">
          {FIRST_RUN.points.map((p) => (
            <li key={p.en} className="flex gap-3 text-[17px] leading-snug text-ink">
              <Minus size={18} className="mt-1 shrink-0 text-brand-600" aria-hidden /> {p[lang]}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-[15px] leading-snug text-muted ring-1 ring-line" data-testid="first-run-info">{INFO_TOOL[lang]}</p>
        <Button full className="mt-6 min-h-16 text-[19px]" icon={<Check size={22} />} onClick={onDone} data-testid="first-run-ok">{FIRST_RUN.ok[lang]}</Button>
      </motion.div>
    </div>
  );
}
