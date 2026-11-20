import { FlaskConical } from "lucide-react";
import { useApp } from "../state";
import { useRunCheck } from "../useCheck";
import { cx } from "./ui";
import { DEMO_BATCHES, demoInputs } from "../lib/demo";

const TXT = {
  title: { hi: "डेमो आज़माएँ", en: "Try a demo" },
  sub: { hi: "असली CDSCO चेतावनी वाले बैच (सरकारी सूची से)", en: "Real batches from official CDSCO alerts" },
};

/** Clearly labelled demo: real RED batches from the official list, filled exactly as on the record. */
export function DemoButtons({ compact, className }: { compact?: boolean; className?: string }) {
  const { lang, dataset } = useApp();
  const runCheck = useRunCheck();
  const demos = demoInputs(dataset?.records ?? []);
  if (!demos.length) return null;
  return (
    <section className={cx("rounded-3xl border border-dashed border-red-line bg-white/70 p-4", className)} data-testid="demo">
      <p className="flex items-center gap-2 text-[16px] font-bold text-red-ink">
        <FlaskConical size={19} aria-hidden /> {TXT.title[lang]}
        <span className="rounded-full bg-red-soft px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide">Demo</span>
      </p>
      {!compact && <p className="mt-0.5 text-[14px] text-muted">{TXT.sub[lang]}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {demos.map((d) => (
          <button key={d.batch} onClick={() => runCheck({ ...d, demo: true })} data-testid="demo-btn" data-batch={d.batch}
            className="tap flex flex-col items-center justify-center rounded-2xl border border-red-line bg-red-soft px-1 py-2 text-red-ink transition hover:brightness-95 active:scale-[0.98]">
            <span className="num text-[16px] font-bold leading-tight">{d.batch}</span>
            <span className="mt-0.5 line-clamp-1 text-[12px] font-medium">{d.short}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export { DEMO_BATCHES };
