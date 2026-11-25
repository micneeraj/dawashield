import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, CheckCircle2, Grid3x3, ImagePlus, ImageUp, Lightbulb, RotateCcw, ScanLine } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, ErrorCard, Page, SourceChip, Spinner, inputCls, cx } from "../components/ui";
import { CloserPhotoNeeded, readStrip, traceStart, traceTake, type AiStep } from "../lib/ai";
import { expiryAsk, expiryForCheck, fieldConfidence, mergeLabels, needsCheck, photoUnreadable, type LabelKey, type LabelReading } from "../lib/label";
import { BatchKeypad } from "../components/Keypad";
import { photoErrorKey, type ErrorKey } from "../lib/errors";
import { useRunCheck } from "../useCheck";
import type { Source } from "../lib/types";

export const TIP = {
  hi: "Batch aur EXP wale hisse ki paas se saaf photo lijiye। ज़रूरत हो तो दूसरी तरफ़ की एक और फ़ोटो जोड़िए।",
  en: "Take a close, sharp photo of the part with the Batch and EXP. You can add a second photo of the other side.",
};
const TIP_EXAMPLE = { hi: "उदाहरण: फ़ोटो में यह साफ़ पढ़ा जाना चाहिए", en: "Example: this should be easy to read in the photo" };
export const CLOSER = {
  hi: "Batch / EXP साफ़ नहीं दिखा। अंदाज़ा नहीं लगाऊँगा — कृपया उस हिस्से की पास से, रोशनी में साफ़ फ़ोटो लीजिए।",
  en: "The Batch / EXP text is too small or blurry. I won't guess — please take a closer, sharper photo of that part in good light.",
};
export const EXPIRY_CHECK = { hi: "क्या समाप्ति तिथि सही है? कृपया पत्ते पर देखिए", en: "Is the expiry date correct? Please check the strip" };
const EXPIRY_YES = { hi: "हाँ, पत्ते पर यही तारीख़ है", en: "Yes, this date is on the strip" };
const CHECK_ON_STRIP = { hi: "कृपया इसे पत्ते पर देखकर मिलाइए", en: "Please check this on the strip" };
const CONFIRM_TITLE = { hi: "पत्ते से मिलाकर पक्का कीजिए", en: "Check these against the strip" };
const CONFIRM_BTN = { hi: "सही है, जाँचिए", en: "Confirm and check" };
const ADD_SIDE = { hi: "दूसरी तरफ़ की फ़ोटो जोड़ें", en: "Add photo of other side" };
const RETAKE = { hi: "फिर से फ़ोटो", en: "Retake" };
const SOURCE = { hi: "पत्ते पर लिखा", en: "On strip" };
const NOT_FOUND = { hi: "नहीं मिला", en: "Not found" };
const CONF = { hi: "भरोसा", en: "Confidence" };
const PLEASE_CONFIRM = { hi: "कृपया पक्का कीजिए: पत्ते से मिलाकर ठीक कीजिए", en: "Please confirm: check it against the strip and correct it" };
const KEYPAD = { hi: "बड़े बटन से बैच डालें", en: "Enter batch with big buttons" };
const YOU_SAID = { hi: "आपने कहा", en: "You said" };
const HEARD_BATCH = { hi: "बोले गए बैच को पत्ते से मिलाइए", en: "Check the spoken batch against the strip" };
const CHECK_CHARS = { hi: "इन अक्षरों को पत्ते पर देखिए (O या 0, I या 1, B या 8, S या 5)", en: "Check these characters on the strip (O or 0, I or 1, B or 8, S or 5)" };
const CANCEL = { hi: "रद्द करें", en: "Cancel" };

const LABELS: Record<LabelKey, { hi: string; en: string }> = {
  name: { hi: "दवा का नाम", en: "Medicine" },
  manufacturer: { hi: "कंपनी (निर्माता)", en: "Manufacturer" },
  batch: { hi: "बैच नंबर (B.No.)", en: "Batch number (B.No.)" },
  expiry: { hi: "समाप्ति तिथि (EXP)", en: "Expiry (EXP)" },
};

export default function Photo() {
  const { t, lang, online, screen, say, go, noteAi } = useApp();
  const prefill = screen.name === "photo" ? screen.prefill : undefined;
  // A batch heard by speech: an editable candidate on this confirm screen, never checked until Confirm.
  const spoken = prefill?.spoken;
  const runCheck = useRunCheck();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [errKey, setErrKey] = useState<ErrorKey>("photoUnreadable");
  const [closer, setCloser] = useState(false);
  const [expiryOk, setExpiryOk] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [steps, setSteps] = useState<AiStep[]>([]);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setSecs(0);
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [busy]);
  const [reading, setReading] = useState<LabelReading | null>(null);
  const [form, setForm] = useState<Record<LabelKey, string>>({ name: prefill?.name ?? "", manufacturer: "", batch: spoken?.candidate ?? "", expiry: "" });
  const [edited, setEdited] = useState<Partial<Record<LabelKey, boolean>>>({});
  const [keypad, setKeypad] = useState(false);

  async function onFile(f?: File) {
    if (!f) return;
    setPreviews((p) => [...p, URL.createObjectURL(f)].slice(-2));
    setBusy(true);
    setError(false);
    setCloser(false);
    setExpiryOk(false);
    traceStart();
    try {
      const r = await Promise.race([
        readStrip(f),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 90000)),
      ]);
      const merged = mergeLabels(reading, r.value)!;
      setReading(merged);
      setSources((s) => [...s, r.source]);
      const took = traceTake();
      setSteps((x) => [...x, ...took]);
      noteAi(r.source);
      setForm((old) => ({
        name: merged.name.value || old.name,
        manufacturer: merged.manufacturer.value || old.manufacturer,
        batch: merged.batch.value ?? "",
        expiry: merged.expiry.value ?? "",
      }));
      setEdited({});
    } catch (e) {
      if (e instanceof CloserPhotoNeeded) {
        setCloser(true);
        setPreviews((p) => p.slice(0, -1));
      } else { setErrKey(photoErrorKey(e)); setError(true); }
      say("error");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setPreviews([]); setReading(null); setSources([]); setSteps([]); setError(false); setCloser(false); setExpiryOk(false); setEdited({});
    setForm({ name: prefill?.name ?? "", manufacturer: "", batch: "", expiry: "" });
  }

  const showConfirm = (reading || error || spoken) && !busy;
  const lastSource = sources[sources.length - 1];
  const expAsk = expiryAsk(form.expiry, reading, { confirmed: expiryOk, edited: !!edited.expiry });

  return (
    <Page title={lang === "hi" ? "फ़ोटो से जाँच" : "Photo check"}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="photo-input" />

      {!spoken && <div className="mb-3 flex items-start gap-2.5 rounded-2xl bg-accent-soft px-4 py-3 text-[16px] font-medium leading-snug text-brand-900" data-testid="photo-tip">
        <Lightbulb size={20} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          {TIP[lang]}
          <p className="mt-1.5 text-[14px] font-normal">{TIP_EXAMPLE[lang]}:</p>
          <p className="num mt-1 inline-block rounded-lg bg-white px-2.5 py-1 text-[15px] font-bold tracking-wide text-ink" data-testid="photo-tip-example">B.No. E166L26 · EXP. JUN 2028</p>
        </div>
      </div>}

      {!spoken && <Card className="overflow-hidden">
        <div className={cx("relative grid aspect-[4/3] place-items-center bg-gradient-to-br from-brand-50 to-accent-soft", previews.length > 0 && "bg-ink")}>
          {previews.length ? (
            <div className={cx("grid h-full w-full gap-1", previews.length === 2 && "grid-cols-2")}>
              {previews.map((p) => <img key={p} src={p} alt="" className="h-full w-full object-contain" />)}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-8 text-center">
              <span className="grid h-20 w-20 place-items-center rounded-3xl bg-white text-brand-700 shadow-soft"><ScanLine size={40} /></span>
              <p className="text-[17px] font-medium text-brand-900">{t("photoTip")}</p>
            </div>
          )}
          {busy && (
            <motion.div className="absolute inset-x-6 h-1 rounded-full bg-accent shadow-accent" initial={{ top: "10%" }} animate={{ top: ["10%", "88%", "10%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
          )}
        </div>
      </Card>}

      {!busy && !reading && !closer && !spoken && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button icon={<Camera size={22} />} onClick={() => camRef.current?.click()}>{t("takePhoto")}</Button>
            <Button variant="secondary" icon={<ImageUp size={22} />} onClick={() => galRef.current?.click()}>{t("upload")}</Button>
          </div>
          <Button variant="ghost" full className="mt-2" icon={<Grid3x3 size={22} />} onClick={() => setKeypad(true)} data-testid="photo-keypad">{KEYPAD[lang]}</Button>
        </>
      )}

      {busy && (
        <div>
          <Spinner label={t("readingPhoto")} />
          {!online ? (
            <p className="-mt-6 text-center text-[16px] font-semibold text-brand-800" data-testid="device-progress">
              {lang === "hi" ? "इसी फ़ोन पर पढ़ रहा हूँ…" : "Reading on this device…"} <span className="num">{secs}s</span>
            </p>
          ) : (
            <p className="-mt-6 text-center text-[15px] text-muted"><span className="num">{secs}s</span></p>
          )}
        </div>
      )}

      {closer && !busy && (
        <div className="mt-4" data-testid="closer-photo"><ErrorCard k="closerPhoto" on={{ closer: () => camRef.current?.click(), type: () => go({ name: "type", prefill: { name: form.name } }) }} /></div>
      )}

      {error && !busy && (
        <div className="mt-4"><ErrorCard k={errKey} on={{ retry: () => galRef.current?.click(), closer: () => camRef.current?.click(), type: () => go({ name: "type", prefill: { name: form.name } }) }} /></div>
      )}

      {/* Confirm screen: nothing is checked until the user taps Confirm. */}
      {showConfirm && (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 space-y-4"
          data-testid="confirm-screen"
          onSubmit={(e) => {
            e.preventDefault();
            if (spoken) {
              runCheck({ name: form.name, batch: form.batch, unreadable: photoUnreadable(null, form, !!edited.batch), understood: { via: "speech", heard: spoken.transcript, items: [
                { label: { hi: "दवा", en: "Medicine" }, value: form.name },
                { label: { hi: "बैच", en: "Batch" }, value: form.batch },
              ] } });
              return;
            }
            runCheck({ name: form.name, manufacturer: form.manufacturer, batch: form.batch, expiry: expiryForCheck(form.expiry, { confirmed: expiryOk }), unreadable: photoUnreadable(reading, form, !!edited.batch), readSource: lastSource, aiSteps: steps, understood: { via: "photo", items: [
              ...(reading?.batch.value ? [{ label: { hi: "बैच", en: "Batch" }, value: reading.batch.value }] : []),
              ...(reading?.expiry.value ? [{ label: { hi: "EXP", en: "EXP" }, value: reading.expiry.value }] : []),
              ...(!reading?.batch.value && reading?.name.value ? [{ label: { hi: "दवा", en: "Medicine" }, value: reading.name.value }] : []),
            ] } });
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[21px] font-bold leading-tight">{CONFIRM_TITLE[lang]}</h2>
            {lastSource && <SourceChip source={lastSource} />}
          </div>

          {spoken && (
            <div className="rounded-3xl bg-white p-4 ring-1 ring-line" data-testid="spoken-transcript">
              <p className="text-[14px] font-semibold uppercase tracking-wide text-muted">{YOU_SAID[lang]}</p>
              <p className="mt-1 text-[20px] font-medium text-ink" translate="no">“{spoken.transcript}”</p>
              <p className="mt-2 text-[15px] text-muted">{HEARD_BATCH[lang]}</p>
            </div>
          )}

          {(["name", "manufacturer", "batch", "expiry"] as LabelKey[]).map((k) => {
            if (spoken && k === "manufacturer") return null;
            if (spoken && k === "expiry") return null;
            const f = reading?.[k] ?? {};
            const ask = k === "expiry" && expAsk;
            const spokenBatchCheck = !!spoken && k === "batch" && !edited.batch;
            const warn = ask || spokenBatchCheck || (!spoken && !edited[k] && !(k === "expiry" && expiryOk) && (needsCheck(f) || !form[k]));
            const big = k === "batch" || k === "expiry";
            return (
              <div key={k} className={cx("rounded-3xl border-2 p-4 transition", warn ? "border-amber-line bg-amber-soft" : "border-line bg-white")} data-testid={`field-${k}`} data-uncertain={warn ? "1" : "0"}>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[16px] font-semibold">
                    {warn ? <AlertTriangle size={17} className="text-amber-ink" aria-hidden /> : <CheckCircle2 size={17} className="text-brand-600" aria-hidden />}
                    {LABELS[k][lang]}
                    {reading && f.value && (
                      <span className={cx("ml-auto rounded-full px-2.5 py-0.5 text-[13px] font-bold", fieldConfidence(f) >= 0.75 ? "bg-brand-50 text-brand-800" : "bg-white text-amber-ink ring-1 ring-amber-line")} data-testid={`conf-${k}`}>
                        {CONF[lang]} {Math.round(fieldConfidence(f) * 100)}%
                      </span>
                    )}
                  </span>
                  <input
                    className={cx(inputCls, big && "num text-[26px] font-bold tracking-wider", k === "name" && "font-semibold")}
                    value={form[k]}
                    onChange={(e) => { setForm({ ...form, [k]: k === "batch" ? e.target.value.toUpperCase() : e.target.value }); setEdited({ ...edited, [k]: true }); if (k === "expiry") setExpiryOk(false); }}
                    placeholder={k === "expiry" ? "MM/YYYY" : ""}
                    autoCapitalize={k === "batch" ? "characters" : undefined}
                    data-testid={`input-${k}`}
                  />
                </label>
                {!spoken && (
                  <p className="mt-1.5 text-[14px] leading-snug text-muted">
                    {SOURCE[lang]}: <span className="font-medium text-ink/80">{f.source ? `“${f.source}”` : NOT_FOUND[lang]}</span>
                  </p>
                )}
                {spokenBatchCheck && spoken.ambiguous.length > 0 && (
                  <p className="mt-1 text-[15px] font-semibold text-amber-ink" data-testid="batch-ambiguous">
                    {CHECK_CHARS[lang]}: <span className="num">{spoken.ambiguous.map((a) => a.char).join(" ")}</span>
                  </p>
                )}
                {warn && <p className="mt-1 text-[15px] font-semibold text-amber-ink" data-testid={ask ? "expiry-check" : undefined}>{ask ? EXPIRY_CHECK[lang] : spokenBatchCheck ? CHECK_ON_STRIP[lang] : big && f.value ? PLEASE_CONFIRM[lang] : CHECK_ON_STRIP[lang]}</p>}
                {k === "batch" && (
                  <button type="button" onClick={() => setKeypad(true)} className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-white px-4 text-[16px] font-semibold text-brand-800"><Grid3x3 size={20} /> {KEYPAD[lang]}</button>
                )}
                {ask && (
                  <button type="button" className="mt-2 rounded-2xl border-2 border-amber-line bg-white px-4 py-2 text-[16px] font-semibold text-amber-ink" onClick={() => setExpiryOk(true)} data-testid="expiry-yes">{EXPIRY_YES[lang]}</button>
                )}
              </div>
            );
          })}

          <Button type="submit" full icon={<CheckCircle2 size={22} />} disabled={!form.batch && !form.name} data-testid="confirm-btn">{CONFIRM_BTN[lang]}</Button>
          {spoken ? (
            <Button type="button" variant="ghost" icon={<RotateCcw size={20} />} onClick={() => go({ name: "voice" })} data-testid="spoken-cancel">{CANCEL[lang]}</Button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {previews.length < 2 ? (
                <Button type="button" variant="secondary" icon={<ImagePlus size={21} />} onClick={() => camRef.current?.click()}>{ADD_SIDE[lang]}</Button>
              ) : <span />}
              <Button type="button" variant="ghost" icon={<RotateCcw size={20} />} onClick={retake}>{RETAKE[lang]}</Button>
            </div>
          )}
        </motion.form>
      )}
      <BatchKeypad open={keypad} value={form.batch} onClose={() => setKeypad(false)} onDone={(v) => {
        if (spoken) { setForm({ ...form, batch: v }); setEdited({ ...edited, batch: true }); return; }
        if (!reading) { go({ name: "type", prefill: { name: form.name, batch: v } }); return; }
        setForm({ ...form, batch: v }); setEdited({ ...edited, batch: true });
      }} />
    </Page>
  );
}
