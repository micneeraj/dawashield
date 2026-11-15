import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ImageUp, ScanLine, Search } from "lucide-react";
import { useApp } from "../state";
import { Button, Card, Field, Page, SourceChip, Spinner, inputCls, cx } from "../components/ui";
import { readStrip } from "../lib/ai";
import { ERRORS } from "../content/messages";
import { useRunCheck } from "../useCheck";
import type { StripReading } from "../lib/json";
import type { Source } from "../lib/types";

/** Shrink big camera photos before sending them to a model. */
async function shrink(file: File, max = 1280): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.88));
  } catch {
    return file;
  }
}

export default function Photo() {
  const { t, lang, online, screen, say } = useApp();
  const prefill = screen.name === "photo" ? screen.prefill : undefined;
  const runCheck = useRunCheck();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [form, setForm] = useState<StripReading>({ name: prefill?.name });
  const [read, setRead] = useState(false);

  async function onFile(f?: File) {
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setBusy(true);
    setError(false);
    setRead(false);
    try {
      const img = await shrink(f);
      const r = await Promise.race([
        readStrip(img),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 90000)),
      ]);
      setSource(r.source);
      setForm((old) => ({ ...r.value, name: r.value.name || old.name }));
      setRead(true);
    } catch {
      setError(true);
      say("error");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof StripReading) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Page title={lang === "hi" ? "फ़ोटो से जाँच" : "Photo check"}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="photo-input" />

      <Card className="overflow-hidden">
        <div className={cx("relative grid aspect-[4/3] place-items-center bg-gradient-to-br from-brand-50 to-[#f3efe6]", preview && "bg-ink")}>
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-contain" />
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

      {!busy && (
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

      {error && <p className="mt-4 rounded-2xl bg-amber-soft px-4 py-3 text-[17px] font-medium text-amber-ink" role="alert">{ERRORS.photoUnreadable[lang]}</p>}

      {(read || error || prefill) && !busy && (
        <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); runCheck({ ...form, readSource: source ?? undefined }); }}>
          {read && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-medium text-muted">{t("readFromPhoto")}</p>
              {source && <SourceChip source={source} />}
            </div>
          )}
          <Field label={t("medicineName")}>
            <input className={cx(inputCls, "font-semibold")} value={form.name ?? ""} onChange={set("name")} />
          </Field>
          <Field label={t("batchNo")} hint={t("batchHint")}>
            <input className={cx(inputCls, "num text-[26px] font-bold tracking-wider")} value={form.batch ?? ""} onChange={set("batch")} autoCapitalize="characters" data-testid="photo-batch" />
          </Field>
          <div className="grid grid-cols-[1fr_8.5rem] gap-3">
            <Field label={t("manufacturer")}>
              <input className={inputCls} value={form.manufacturer ?? ""} onChange={set("manufacturer")} />
            </Field>
            <Field label={t("expiry")}>
              <input className={cx(inputCls, "num")} value={form.expiry ?? ""} onChange={set("expiry")} placeholder="MM/YYYY" />
            </Field>
          </div>
          <Button type="submit" full icon={<Search size={22} />} disabled={!form.batch && !form.name}>{t("check")}</Button>
        </motion.form>
      )}
    </Page>
  );
}
