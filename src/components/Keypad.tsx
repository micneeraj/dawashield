import { useEffect, useState } from "react";
import { Check, Delete } from "lucide-react";
import { useApp } from "../state";
import { Sheet } from "./Sheet";
import { cx } from "./ui";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const TXT = {
  title: { hi: "बैच नंबर डालिए", en: "Enter batch number" },
  hint: { hi: "पत्ते पर B.No. या Batch के आगे जो लिखा है, वही दबाइए", en: "Tap what is printed after B.No. or Batch on the strip" },
  digits: { hi: "123", en: "123" },
  letters: { hi: "ABC", en: "ABC" },
  done: { hi: "हो गया", en: "Done" },
  clear: { hi: "सब मिटाएँ", en: "Clear" },
};

/** Big-button keypad for batch numbers: one-tap fallback when typing or the photo fails. */
export function BatchKeypad({ open, value, onClose, onDone }: { open: boolean; value: string; onClose: () => void; onDone: (v: string) => void }) {
  const { lang } = useApp();
  const [v, setV] = useState(value);
  const [abc, setAbc] = useState(false);
  useEffect(() => { if (open) setV(value); }, [open, value]);
  const keys = abc ? LETTERS : DIGITS;
  const press = (k: string) => setV((x) => (x + k).slice(0, 20));
  return (
    <Sheet open={open} onClose={onClose} title={TXT.title[lang]}>
      <p className="mb-3 text-[15px] text-muted">{TXT.hint[lang]}</p>
      <div className="num mb-3 flex min-h-[68px] items-center justify-center rounded-2xl border-2 border-brand-300 bg-white px-4 text-[32px] font-bold tracking-[0.12em] text-ink" data-testid="keypad-display" aria-live="polite">
        {v || <span className="text-muted/50">—</span>}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2" role="tablist">
        {([false, true] as const).map((isAbc) => (
          <button key={String(isAbc)} role="tab" aria-selected={abc === isAbc} onClick={() => setAbc(isAbc)}
            className={cx("min-h-12 rounded-2xl text-[18px] font-bold", abc === isAbc ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-800")}>
            {isAbc ? TXT.letters[lang] : TXT.digits[lang]}
          </button>
        ))}
      </div>
      <div className={cx("grid gap-2", abc ? "grid-cols-6" : "grid-cols-3")} data-testid="keypad">
        {keys.map((k) => (
          <button key={k} onClick={() => press(k)} className={cx("num rounded-2xl border border-line bg-white font-bold text-ink shadow-soft active:scale-95 active:bg-brand-50", abc ? "min-h-14 text-[22px]" : "min-h-16 text-[28px]", !abc && k === "0" && "col-start-2")}>
            {k}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => setV("")} className="min-h-14 rounded-2xl bg-grey-soft text-[16px] font-semibold text-grey-ink">{TXT.clear[lang]}</button>
        <button onClick={() => setV((x) => x.slice(0, -1))} aria-label="Backspace" className="grid min-h-14 place-items-center rounded-2xl bg-grey-soft text-grey-ink"><Delete size={26} /></button>
        <button onClick={() => { onDone(v); onClose(); }} className="inline-flex min-h-14 items-center justify-center gap-1.5 rounded-2xl bg-brand-700 text-[18px] font-bold text-white" data-testid="keypad-done">
          <Check size={22} /> {TXT.done[lang]}
        </button>
      </div>
    </Sheet>
  );
}
