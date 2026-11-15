import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, ImageUp, Lightbulb, RotateCcw, ScanLine } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Page, SourceChip, Spinner, inputCls, cx } from "../components/ui";
import { readStrip } from "../lib/ai";
import { mergeLabels, needsCheck, type LabelKey, type LabelReading } from "../lib/label";
import { ERRORS } from "../content/messages";
import { useRunCheck } from "../useCheck";
import type { Source } from "../lib/types";

/** Shrink big camera photos before sending them to a model. */
async function shrink(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.9));
  } catch {
    return file;
  }
}

const TIP = {
  hi: "Batch aur Expiry wali side ki photo lijiye। ज़रूरत हो तो दूसरी तरफ़ की एक और फ़ोटो जोड़िए।",
  en: "Take a photo of the side that shows the Batch and Expiry. You can add a second photo of the other side.",
};
const CHECK_ON_STRIP = { hi: "कृपया इसे पत्ते पर देखकर मिलाइए", en: "Please check this on the strip" };
const CONFIRM_TITLE = { hi: "पत्ते से मिलाकर पक्का कीजिए", en: "Check these against the strip" };
const CONFIRM_BTN = { hi: "सही है, जाँचिए", en: "Confirm and check" };
const ADD_SIDE = { hi: "दूसरी तरफ़ की फ़ोटो जोड़ें", en: "Add photo of other side" };
const RETAKE = { hi: "फिर से फ़ोटो", en: "Retake" };
const SOURCE = { hi: "पत्ते पर लिखा", en: "On strip" };
const NOT_FOUND = { hi: "नहीं मिला", en: "Not found" };

const LABELS: Record<LabelKey, { hi: string; en: string }> = {
  name: { hi: "दवा का नाम", en: "Medicine" },
  manufacturer: { hi: "कंपनी (निर्माता)", en: "Manufacturer" },
  batch: { hi: "बैच नंबर (B.No.)", en: "Batch number (B.No.)" },
  expiry: { hi: "समाप्ति तिथि (EXP)", en: "Expiry (EXP)" },
};

export default function Photo() {
  const { t, lang, online, screen, say } = useApp();
  const prefill = screen.name === "photo" ? screen.prefill : undefined;
  const runCheck = useRunCheck();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [reading, setReading] = useState<LabelReading | null>(null);
  const [form, setForm] = useState<Record<LabelKey, string>>({ name: prefill?.name ?? "", manufacturer: "", batch: "", expiry: "" });
  const [edited, setEdited] = useState<Partial<Record<LabelKey, boolean>>>({});

  async function onFile(f?: File) {
    if (!f) return;
    setPreviews((p) => [...p, URL.createObjectURL(f)].slice(-2));
    setBusy(true);
    setError(false);
    try {
      const r = await Promise.race([
        readStrip(await shrink(f)),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 90000)),
      ]);
      const merged = mergeLabels(reading, r.value)!;
      setReading(merged);
      setSources((s) => [...s, r.source]);
      setForm((old) => ({
        name: merged.name.value || old.name,
        manufacturer: merged.manufacturer.value || old.manufacturer,
        batch: merged.batch.value ?? "",
        expiry: merged.expiry.value ?? "",
      }));
      setEdited({});
    } catch {
      setError(true);
      say("error");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setPreviews([]); setReading(null); setSources([]); setError(false); setEdited({});
    setForm({ name: prefill?.name ?? "", manufacturer: "", batch: "", expiry: "" });
  }

  const showConfirm = (reading || error) && !busy;
  const lastSource = sources[sources.length - 1];

  return (
    <Page title={lang === "hi" ? "फ़ोटो से जाँच" : "Photo check"}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="photo-input" />

      <div className="mb-3 flex items-start gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-[16px] font-medium leading-snug text-amber-ink" data-testid="photo-tip">
        <Lightbulb size={20} className="mt-0.5 shrink-0" aria-hidden />
        {TIP[lang]}
      </div>

      <Card className="overflow-hidden">
        <div className={cx("relative grid aspect-[4/3] place-items-center bg-gradient-to-br from-brand-50 to-[#f3efe6]", previews.length > 0 && "bg-ink")}>
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
            <motion.div className="absolute inset-x-6 h-1 rounded-full bg-brand-300 shadow-[0_0_24px_4px_rgba(63,156,142,0.7)]" initial={{ top: "10%" }} animate={{ top: ["10%", "88%", "10%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
          )}
        </div>
      </Card>

      {!busy && !reading && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button icon={<Camera size={22} />} onClick={() => camRef.current?.click()}>{t("takePhoto")}</Button>
          <Button variant="secondary" icon={<ImageUp size={22} />} onClick={() => galRef.current?.click()}>{t("upload")}</Button>
        </div>
      )}

      {busy && (
        <div>
          <Spinner label={t("readingPhoto")} />
          {!online && <p className="-mt-6 text-center text-[15px] text-muted">{t("readingPhotoSlow")}</p>}
        </div>
      )}

      {error && !busy && <p className="mt-4 rounded-2xl bg-amber-soft px-4 py-3 text-[17px] font-medium text-amber-ink" role="alert">{ERRORS.photoUnreadable[lang]}</p>}

      {/* Confirm screen: nothing is checked until the user taps Confirm. */}
      {showConfirm && (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 space-y-4"
          data-testid="confirm-screen"
          onSubmit={(e) => {
            e.preventDefault();
            runCheck({ name: form.name, manufacturer: form.manufacturer, batch: form.batch, expiry: form.expiry, readSource: lastSource });
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[21px] font-bold leading-tight">{CONFIRM_TITLE[lang]}</h2>
            {lastSource && <SourceChip source={lastSource} />}
          </div>

          {(["name", "manufacturer", "batch", "expiry"] as LabelKey[]).map((k) => {
            const f = reading?.[k] ?? {};
            const warn = !edited[k] && (needsCheck(f) || !form[k]);
            const big = k === "batch" || k === "expiry";
            return (
              <div key={k} className={cx("rounded-3xl border-2 p-4 transition", warn ? "border-amber-line bg-amber-soft" : "border-line bg-white")} data-testid={`field-${k}`} data-uncertain={warn ? "1" : "0"}>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[16px] font-semibold">
                    {warn ? <AlertTriangle size={17} className="text-amber-ink" aria-hidden /> : <CheckCircle2 size={17} className="text-brand-600" aria-hidden />}
                    {LABELS[k][lang]}
                  </span>
                  <input
                    className={cx(inputCls, big && "num text-[26px] font-bold tracking-wider", k === "name" && "font-semibold")}
                    value={form[k]}
                    onChange={(e) => { setForm({ ...form, [k]: k === "batch" ? e.target.value.toUpperCase() : e.target.value }); setEdited({ ...edited, [k]: true }); }}
                    placeholder={k === "expiry" ? "MM/YYYY" : ""}
                    autoCapitalize={k === "batch" ? "characters" : undefined}
                    data-testid={`input-${k}`}
                  />
                </label>
                <p className="mt-1.5 text-[14px] leading-snug text-muted">
                  {SOURCE[lang]}: <span className="font-medium text-ink/80">{f.source ? `“${f.source}”` : NOT_FOUND[lang]}</span>
                </p>
                {warn && <p className="mt-1 text-[15px] font-semibold text-amber-ink">{CHECK_ON_STRIP[lang]}</p>}
              </div>
            );
          })}

          <Button type="submit" full icon={<CheckCircle2 size={22} />} disabled={!form.batch && !form.name} data-testid="confirm-btn">{CONFIRM_BTN[lang]}</Button>
          <div className="grid grid-cols-2 gap-3">
            {previews.length < 2 ? (
              <Button type="button" variant="secondary" icon={<ImagePlus size={21} />} onClick={() => camRef.current?.click()}>{ADD_SIDE[lang]}</Button>
            ) : <span />}
            <Button type="button" variant="ghost" icon={<RotateCcw size={20} />} onClick={retake}>{RETAKE[lang]}</Button>
          </div>
        </motion.form>
      )}
    </Page>
  );
}
