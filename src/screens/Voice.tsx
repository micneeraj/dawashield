import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, Grid3x3, Keyboard, Mic, Pill, RotateCcw, Search } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, ErrorCard, Field, Page, SourceChip, Spinner, inputCls, cx } from "../components/ui";
import { MicButton } from "../components/MicButton";
import { BatchKeypad } from "../components/Keypad";
import { browserFailed, listen, speechSupported as browserSpeech, type Listener } from "../lib/speech";
import { record, recordingSupported, type Recording } from "../lib/recorder";
import { transliterateName } from "../lib/indic";
import { isRegional } from "../lib/i18n";
import { candidatesFromSpeech, transcribeAudio, traceStart, traceTake, type AiStep } from "../lib/ai";
import { transliterate } from "../lib/normalize";
import { matchSpoken, toDevanagari } from "../lib/phonetic";
import { getDictionary } from "../lib/dictionary";
import { VOICE } from "../content/messages";
import { speechErrorKey, type ErrorKey } from "../lib/errors";
import { useRunCheck } from "../useCheck";
import { spokenBatchUnreadable } from "../lib/label";
import type { Source } from "../lib/types";

type Step = "listen" | "think" | "pick" | "batch";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export default function Voice() {
  const { t, lang, uiLang, regionalActive, go, dataset, say, noteAi, online } = useApp();
  // Speech locale: the picked regional language while it is active, else Hindi / English.
  const speechLang = regionalActive ? uiLang : lang;
  // How we hear: regional languages always record + Gemini transcript (browser
  // recognition for them is missing on iPhone and unreliable elsewhere).
  // Hindi / English use browser recognition, and switch to recording when it is
  // unavailable or fails. Mic is hidden only when neither path exists.
  const [hearing, setHearing] = useState<"browser" | "record">(isRegional(speechLang) || !browserSpeech ? "record" : "browser");
  const hearingRef = useRef(hearing);
  hearingRef.current = hearing;
  const speechSupported = hearing === "browser" || recordingSupported();
  const [processing, setProcessing] = useState(false);
  const [offlineVoice, setOfflineVoice] = useState(false);
  const clipRec = useRef<Recording | null>(null);
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
  const [keypad, setKeypad] = useState(false);
  const [batchHeard, setBatchHeard] = useState(false);
  const rec = useRef<Listener | null>(null);

  const startListening = async () => {
    setNotUnderstood(false);
    setErrKey(null);
    setOfflineVoice(false);
    setTranscript("");
    if (hearingRef.current === "record") return startRecording();
    setListening(true);
    rec.current = await listen(speechLang, (txt) => setTranscript(txt), (final, err) => {
      setListening(false);
      if (final) void understand(final);
      else if (err && browserFailed(err) && recordingSupported()) {
        // Browser recognition is unavailable here: record and transcribe instead.
        setHearing("record");
        hearingRef.current = "record";
        void startRecording();
      } else if (err) { setErrKey(speechErrorKey(err)); say(VOICE.fallback.clip); }
    });
    if (!rec.current) setListening(false);
  };

  async function startRecording() {
    if (!navigator.onLine) { setOfflineVoice(true); return; }
    setListening(true);
    clipRec.current = await record(async (clip, err) => {
      clipRec.current = null;
      setListening(false);
      if (err) { setErrKey(speechErrorKey(err)); say(VOICE.fallback.clip); return; }
      if (!clip) return;
      if (!navigator.onLine) { setOfflineVoice(true); return; }
      setProcessing(true);
      try {
        const r = await withTimeout(transcribeAudio(clip, speechLang), 20000);
        noteAi(r.source);
        if (!r.value) { setNotUnderstood(true); say(VOICE.fallback.clip); return; }
        setTranscript(r.value);
        await understand(r.value, true);
      } catch (e) {
        setErrKey(navigator.onLine ? (String((e as Error)?.message).includes("timeout") ? "timeout" : "aiUnavailable") : "network");
        say(VOICE.fallback.clip);
      } finally {
        setProcessing(false);
      }
    });
    if (!clipRec.current) setListening(false);
  }

  const stopListening = () => { rec.current?.stop(); clipRec.current?.stop(); };

  useEffect(() => {
    // Give the welcome clip time to play, then listen (longer when recording, so the clip is not captured).
    const id = setTimeout(() => { if (speechSupported) void startListening(); }, hearing === "record" ? 2500 : 600);
    return () => { clearTimeout(id); rec.current?.stop(); clipRec.current?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function understand(text: string, transcribed = false) {
    setStep("think");
    const records = dataset?.records ?? [];
    // 1. Rule-based, offline: fuzzy + phonetic match against the medicine dictionary.
    const dict = getDictionary(records);
    const local = matchSpoken(text, dict, 4).map((m) => m.entry.name);
    // 2. Extra, only when available: AI candidates (Nano on device, else Flash in cloud).
    let aiNames: string[] = [];
    if (!transcribed) traceStart(); // keep the transcription step in the trace
    if (online) {
      try {
        const r = await withTimeout(candidatesFromSpeech(text), local.length ? 6000 : 12000);
        aiNames = r.value.flatMap((n) => matchSpoken(n, dict, 1).map((m) => m.entry.name));
        setAiSource(r.source);
        noteAi(r.source);
      } catch {
        setAiSource(null);
      }
    }
    setSteps(traceTake());
    const seen = new Set<string>();
    // Names both methods agree on first, then the rule-based list, then AI-only names.
    const agreed = local.filter((n) => aiNames.includes(n));
    const merged = [...agreed, ...local, ...aiNames].filter((n) => {
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
    rec.current = await listen("en", (txt) => { setBatch(txt.replace(/\s+/g, "").toUpperCase()); setBatchHeard(true); }, () => setBatchListening(false));
    if (!rec.current) setBatchListening(false);
  }

  return (
    <Page title={lang === "hi" ? "बोलकर जाँच" : "Voice check"}>
      <Stepper step={step} />
      <AnimatePresence mode="wait">
        {step === "listen" && (
          <motion.div key="listen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
            <p className="mt-2 text-center text-[22px] font-semibold text-ink">{VOICE.askName.text[lang]}</p>
            {speechSupported && <MicButton listening={listening} onClick={() => (listening ? stopListening() : processing ? undefined : void startListening())} label={listening ? t("listening") : t("tapToSpeak")} size={150} />}
            <div className="min-h-[88px] w-full" aria-live="polite">
              {listening && !transcript && <p className="text-center text-[18px] font-medium text-brand-700" data-testid="voice-state">{t("listening")}</p>}
              {listening && hearing === "record" && <p className="mt-1 text-center text-[15px] text-muted">{t("recordHint")}</p>}
              {processing && <div data-testid="voice-processing"><Spinner label={t("processingSpeech")} /></div>}
              {offlineVoice && <Card className="px-5 py-4 text-center text-[18px] font-medium text-ink" data-testid="voice-offline">{t("voiceOffline")}</Card>}
              {transcript && (
                <Card className="px-5 py-4 text-center">
                  <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{t("youSaid")}</p>
                  <p className="mt-1 text-[22px] font-medium text-ink" data-testid="transcript">“{transcript}”</p>
                </Card>
              )}
              {notUnderstood && !listening && !processing && !errKey && (
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
              {aiSource ? <SourceChip source={aiSource} /> : <SourceChip source="device" />}
            </div>
            <ul className="mt-3 space-y-3">
              {options.map((o, i) => (
                <motion.li key={o} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <button onClick={() => pick(o)} className="flex min-h-[76px] w-full items-center gap-4 rounded-3xl border-2 border-line bg-white px-5 text-left shadow-soft transition hover:border-brand-400 focus-visible:border-brand-500" data-testid="option">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Pill size={24} /></span>
                    <span className="flex-1">
                      <span className="block text-[24px] font-bold leading-tight tracking-tight text-ink" translate="no">{o}</span>
                      {lang === "hi" && !regionalActive && <span className="block text-[18px] font-medium text-brand-800" lang="hi" translate="no">{toDevanagari(o)}</span>}
                      {regionalActive && isRegional(uiLang) && <span className="block text-[18px] font-medium text-brand-800" lang={uiLang} translate="no" data-testid="option-translit">{transliterateName(o, uiLang)}</span>}
                    </span>
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
            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); runCheck({ name, batch, unreadable: batchHeard && spokenBatchUnreadable(batch), ...spoken() }); }}>
              <Field label={t("batchNo")} hint={t("batchHint")}>
                <div className="flex gap-2">
                  <input value={batch} onChange={(e) => { setBatch(e.target.value.toUpperCase()); setBatchHeard(false); }} className={cx(inputCls, "num text-[26px] font-bold tracking-wider")} placeholder="B.No." autoCapitalize="characters" autoComplete="off" data-testid="batch-input" />
                  <button type="button" onClick={listenBatch} aria-label={t("tapToSpeak")} className={cx("tap grid w-16 shrink-0 place-items-center rounded-2xl text-white", batchListening ? "bg-brand-900" : "bg-brand-700")}>
                    <Mic size={26} />
                  </button>
                  <button type="button" onClick={() => setKeypad(true)} aria-label={lang === "hi" ? "बड़े बटन वाला कीपैड" : "Big-button keypad"} className="tap grid w-16 shrink-0 place-items-center rounded-2xl border border-line bg-white text-brand-800 shadow-soft" data-testid="keypad-open">
                    <Grid3x3 size={26} />
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
      <BatchKeypad open={keypad} value={batch} onClose={() => setKeypad(false)} onDone={(v) => { setBatch(v); setBatchHeard(false); }} />
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
