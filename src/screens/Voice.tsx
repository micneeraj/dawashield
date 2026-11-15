import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, Keyboard, Mic, Pill, RotateCcw, Search } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, ErrorCard, Field, Page, SourceChip, Spinner, inputCls, cx } from "../components/ui";
import { MicButton } from "../components/MicButton";
import { listen, speechSupported, type Listener } from "../lib/speech";
import { candidatesFromSpeech, traceStart, traceTake, type AiStep } from "../lib/ai";
import { searchNames } from "../lib/match";
import { transliterate } from "../lib/normalize";
import { COMMON_MEDICINES } from "../content/common-medicines";
import { VOICE } from "../content/messages";
import { speechErrorKey, type ErrorKey } from "../lib/errors";
import { useRunCheck } from "../useCheck";
import type { Source } from "../lib/types";

// Everyday words people say around a medicine name; never searched as names.
const STOP = new Set(["sar","dard","dawa","dawai","davai","davaa","hai","hain","ki","ka","ke","ko","mera","meri","mere","yeh","ye","wali","vali","waali","goli","tablet","medicine","the","for","my","this","is","it","its","headache","fever","bukhar","bukhaar","pet","khansi","ilaj","maa","papa","liye","lie","chahiye","naam","name"]);

type Step = "listen" | "think" | "pick" | "batch";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export default function Voice() {
  const { t, lang, go, dataset, say, noteAi } = useApp();
  const runCheck = useRunCheck();
  const [step, setStep] = useState<Step>("listen");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [aiSource, setAiSource] = useState<Source | null>(null);
  const [steps, setSteps] = useState<AiStep[]>([]);
  const [notUnderstood, setNotUnderstood] = useState(false);
  const [errKey, setErrKey] = useState<ErrorKey | null>(null);
  const [name, setName] = useState("");
  const [batch, setBatch] = useState("");
  const [batchListening, setBatchListening] = useState(false);
  const rec = useRef<Listener | null>(null);

  const startListening = async () => {
    setNotUnderstood(false);
    setErrKey(null);
    setTranscript("");
    setListening(true);
    rec.current = await listen(lang, (txt) => setTranscript(txt), (final, err) => {
      setListening(false);
      if (final) void understand(final);
      else if (err) { setErrKey(speechErrorKey(err)); say(VOICE.fallback.clip); }
    });
    if (!rec.current) setListening(false);
  };

  useEffect(() => {
    // Give the welcome clip a moment, then listen.
    const id = setTimeout(() => { if (speechSupported) void startListening(); }, 600);
    return () => { clearTimeout(id); rec.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function understand(text: string) {
    setStep("think");
    const latin = /[ऀ-ॿ]/.test(text) ? transliterate(text) : text;
    const records = dataset?.records ?? [];
    let aiNames: string[] = [];
    traceStart();
    try {
      const r = await withTimeout(candidatesFromSpeech(text), 12000);
      aiNames = r.value;
      setAiSource(r.source);
      noteAi(r.source);
    } catch {
      setAiSource(null);
    }
    setSteps(traceTake());
    // Local fuzzy search on every word, plus each AI candidate.
    const local = [
      ...aiNames.flatMap((n) => searchNames(n, records, COMMON_MEDICINES, 2)),
      ...latin.toLowerCase().split(/[\s,.!?]+/).flatMap((w) => (w.length >= 3 && !STOP.has(w) ? searchNames(w, records, COMMON_MEDICINES, 2) : [])),
    ];
    const seen = new Set<string>();
    const merged = [...aiNames, ...local].filter((n) => {
      const k = n.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 4);
    if (!merged.length) {
      setNotUnderstood(true);
      setStep("listen");
      say(VOICE.fallback.clip);
      return;
    }
    setOptions(merged);
    setStep("pick");
    say(VOICE.pickOption.clip);
  }

  /** What was heard and understood, for the result's pipeline strip. */
  const spoken = () => ({
    readSource: aiSource ?? undefined,
    understood: { via: "speech" as const, heard: transcript, items: [{ label: { hi: "दवा", en: "Medicine" }, value: name }] },
    aiSteps: steps,
  });

  function pick(n: string) {
    setName(n);
    setStep("batch");
    say(VOICE.askBatch.clip);
  }

  async function listenBatch() {
    if (batchListening) { rec.current?.stop(); return; }
    setBatchListening(true);
    // Batch numbers are letters and digits: English recognition handles them best.
    rec.current = await listen("en", (txt) => setBatch(txt.replace(/\s+/g, "").toUpperCase()), () => setBatchListening(false));
    if (!rec.current) setBatchListening(false);
  }

  return (
    <Page title={lang === "hi" ? "बोलकर जाँच" : "Voice check"}>
      <Stepper step={step} />
      <AnimatePresence mode="wait">
        {step === "listen" && (
          <motion.div key="listen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
            <p className="mt-2 text-center text-[22px] font-semibold text-ink">{VOICE.askName.text[lang]}</p>
            <MicButton listening={listening} onClick={() => (listening ? rec.current?.stop() : void startListening())} label={listening ? t("listening") : t("tapToSpeak")} size={150} />
            <div className="min-h-[88px] w-full" aria-live="polite">
              {listening && !transcript && <p className="text-center text-[18px] font-medium text-brand-700">{t("listening")}</p>}
              {transcript && (
                <Card className="px-5 py-4 text-center">
                  <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("youSaid")}</p>
                  <p className="mt-1 text-[22px] font-medium text-ink" data-testid="transcript">“{transcript}”</p>
                </Card>
              )}
              {notUnderstood && !listening && !errKey && (
                <ErrorCard k="micNoSpeech" on={{ retry: () => void startListening(), type: () => go({ name: "type" }) }} />
              )}
              {errKey && !listening && speechSupported && (
                <ErrorCard k={errKey} on={{ retry: () => void startListening(), type: () => go({ name: "type" }) }} />
              )}
              {!speechSupported && <ErrorCard k="micUnavailable" on={{ type: () => go({ name: "type" }) }} />}
            </div>
            <div className="mt-4 grid w-full grid-cols-2 gap-3">
              <Button variant="secondary" icon={<Keyboard size={22} />} onClick={() => go({ name: "type" })}>{t("type")}</Button>
              <Button variant="secondary" icon={<Camera size={22} />} onClick={() => go({ name: "photo" })}>{t("photo")}</Button>
            </div>
          </motion.div>
        )}

        {step === "think" && (
          <motion.div key="think" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="mt-2 px-5 py-4 text-center">
              <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("youSaid")}</p>
              <p className="mt-1 text-[22px] font-medium">“{transcript}”</p>
            </Card>
            <Spinner label={t("thinking")} />
          </motion.div>
        )}

        {step === "pick" && (
          <motion.div key="pick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="text-[15px] text-muted">{t("youSaid")}: “{transcript}”</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <h2 className="text-[22px] font-bold text-ink">{VOICE.pickOption.text[lang]}</h2>
              {aiSource && <SourceChip source={aiSource} />}
            </div>
            <ul className="mt-3 space-y-3">
              {options.map((o, i) => (
                <motion.li key={o} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <button onClick={() => pick(o)} className="flex min-h-[76px] w-full items-center gap-4 rounded-3xl border-2 border-line bg-white px-5 text-left shadow-soft transition hover:border-brand-400 focus-visible:border-brand-500" data-testid="option">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Pill size={24} /></span>
                    <span className="flex-1 text-[24px] font-bold tracking-tight text-ink">{o}</span>
                    <Check className="text-brand-300" />
                  </button>
                </motion.li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="ghost" icon={<RotateCcw size={20} />} onClick={() => { setStep("listen"); void startListening(); }}>{t("sayAgain")}</Button>
              <Button variant="ghost" icon={<Keyboard size={20} />} onClick={() => go({ name: "type", prefill: { name: transcript && latinOr(transcript) } })}>{t("noneOfThese")}</Button>
            </div>
          </motion.div>
        )}

        {step === "batch" && (
          <motion.div key="batch" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Pill size={22} /></span>
              <span className="flex-1">
                <span className="block text-[14px] font-semibold uppercase tracking-wide text-muted">{t("understood")}</span>
                <span className="block text-[24px] font-bold leading-tight">{name}</span>
              </span>
              <button className="tap rounded-2xl px-3 text-[15px] font-semibold text-brand-700 hover:bg-brand-50" onClick={() => setStep("pick")}>{lang === "hi" ? "बदलें" : "Change"}</button>
            </Card>
            <p className="mt-5 text-[19px] font-medium leading-snug text-ink">{VOICE.askBatch.text[lang]}</p>
            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); runCheck({ name, batch, ...spoken() }); }}>
              <Field label={t("batchNo")} hint={t("batchHint")}>
                <div className="flex gap-2">
                  <input value={batch} onChange={(e) => setBatch(e.target.value.toUpperCase())} className={cx(inputCls, "num text-[26px] font-bold tracking-wider")} placeholder="B.No." autoCapitalize="characters" autoComplete="off" data-testid="batch-input" />
                  <button type="button" onClick={listenBatch} aria-label={t("tapToSpeak")} className={cx("tap grid w-16 shrink-0 place-items-center rounded-2xl text-white", batchListening ? "bg-brand-900" : "bg-brand-700")}>
                    <Mic size={26} />
                  </button>
                </div>
              </Field>
              <Button type="submit" full className="mt-4" icon={<Search size={22} />} disabled={!batch.trim()}>{t("check")}</Button>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Button type="button" variant="secondary" icon={<Camera size={22} />} onClick={() => go({ name: "photo", prefill: { name } })}>{t("photo")}</Button>
                <Button type="button" variant="ghost" onClick={() => runCheck({ name, ...spoken() })}>{lang === "hi" ? "बैच नहीं मिल रहा" : "Can't find batch"}</Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}

function latinOr(s: string) {
  return /[ऀ-ॿ]/.test(s) ? transliterate(s) : s;
}

function Stepper({ step }: { step: Step }) {
  const idx = { listen: 0, think: 0, pick: 1, batch: 2 }[step];
  return (
    <div className="mb-4 flex gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= idx ? "bg-brand-600" : "bg-line")} />
      ))}
    </div>
  );
}
