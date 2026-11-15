import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertOctagon, AlertTriangle, ArrowLeft, Cloud, Info, Smartphone } from "lucide-react";
import { useApp } from "../state";
import { DISCLAIMER } from "../content/messages";
import { sourceLabel } from "../lib/source";
import type { Level, Source } from "../lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  icon?: ReactNode;
  full?: boolean;
};
export function Button({ variant = "primary", icon, full, className, children, ...p }: BtnProps) {
  const v = {
    primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-soft",
    secondary: "bg-white text-brand-800 border border-line hover:border-brand-300 shadow-soft",
    soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
    ghost: "text-brand-800 hover:bg-brand-50",
    danger: "bg-red-ink text-white hover:brightness-110",
  }[variant];
  return (
    <button
      {...p}
      className={cx(
        "tap inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-center font-semibold leading-tight text-[17px] transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        v, full && "w-full", className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-3xl bg-white shadow-soft border border-line/70", className)}>{children}</div>;
}

export function Page({ title, children, onBack }: { title?: string; children: ReactNode; onBack?: () => void }) {
  const { back, t } = useApp();
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="px-4 pb-6"
    >
      {title && (
        <div className="flex items-center gap-2 pt-1 pb-4">
          <button
            onClick={onBack ?? back}
            aria-label={t("back")}
            className="tap grid w-14 place-items-center rounded-2xl text-brand-800 hover:bg-brand-50 -ml-2"
          >
            <ArrowLeft size={26} />
          </button>
          <h1 className="text-[24px] font-bold tracking-tight text-ink">{title}</h1>
        </div>
      )}
      {children}
    </motion.div>
  );
}

/** Visible chip on every AI output: "On this device" or "Cloud". */
export function SourceChip({ source }: { source: Source }) {
  const { lang } = useApp();
  const device = source === "device";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-semibold",
        device ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200" : "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
      )}
      data-testid="source-chip"
    >
      {device ? <Smartphone size={15} /> : <Cloud size={15} />}
      {sourceLabel(source, lang)}
    </span>
  );
}

export const LEVEL_STYLE: Record<Level, { bg: string; line: string; ink: string; icon: typeof Info; dot: string }> = {
  RED: { bg: "bg-red-soft", line: "border-red-line", ink: "text-red-ink", icon: AlertOctagon, dot: "bg-red-ink" },
  AMBER: { bg: "bg-amber-soft", line: "border-amber-line", ink: "text-amber-ink", icon: AlertTriangle, dot: "bg-amber-ink" },
  GREY: { bg: "bg-grey-soft", line: "border-grey-line", ink: "text-grey-ink", icon: Info, dot: "bg-grey-ink" },
};

export function LevelPill({ level, label }: { level: Level; label: string }) {
  const s = LEVEL_STYLE[level];
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[14px] font-semibold", s.bg, s.line, s.ink)}>
      <Icon size={15} aria-hidden />
      {label}
    </span>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  const { lang } = useApp();
  return (
    <p className={cx("flex items-start gap-2 text-[15px] leading-snug text-muted", className)} role="note">
      <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
      {DISCLAIMER[lang]}
    </p>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[16px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[14px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "tap w-full rounded-2xl border border-line bg-white px-4 text-[20px] text-ink placeholder:text-muted/60 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100";

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10" role="status" aria-live="polite">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-brand-600" />
      </div>
      <p className="text-[18px] font-medium text-brand-800">{label}</p>
    </div>
  );
}
