import { motion } from "framer-motion";
import { useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, ArrowLeft, Camera, Cloud, ImageUp, Info, Keyboard, RotateCcw, ScanSearch, ShieldCheck, Smartphone } from "lucide-react";
import { useApp } from "../state";
import { DISCLAIMER, ERRORS, RECOVERY_LABEL } from "../content/messages";
import { STATUS_LABEL, offlineFacts, statusKind } from "../lib/status";
import { nanoAvailability } from "../lib/ai";
import { RECOVERY, type ErrorKey, type Recovery } from "../lib/errors";
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
    primary: "bg-accent-strong text-white hover:bg-brand-700 shadow-soft",
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

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return <div {...rest} className={cx("rounded-card bg-white shadow-soft border border-line", className)}>{children}</div>;
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
        device ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200" : "bg-accent-soft text-brand-900 ring-1 ring-brand-300",
      )}
      data-testid="source-chip"
    >
      {device ? <Smartphone size={15} /> : <Cloud size={15} />}
      {sourceLabel(source, lang)}
    </span>
  );
}

export const LEVEL_STYLE: Record<Level, { bg: string; line: string; ink: string; icon: typeof Info; dot: string; bar: string }> = {
  RED: { bg: "bg-red-soft", line: "border-red-line", ink: "text-red-ink", icon: AlertOctagon, dot: "bg-red-bar", bar: "bg-red-bar" },
  AMBER: { bg: "bg-amber-soft", line: "border-amber-line", ink: "text-amber-ink", icon: AlertTriangle, dot: "bg-amber-bar", bar: "bg-amber-bar" },
  GREY: { bg: "bg-grey-soft", line: "border-grey-line", ink: "text-grey-ink", icon: Info, dot: "bg-grey-bar", bar: "bg-grey-bar" },
  UNREADABLE: { bg: "bg-brand-50", line: "border-brand-200", ink: "text-brand-900", icon: ScanSearch, dot: "bg-brand-800", bar: "bg-brand-700" },
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
  "tap w-full rounded-2xl border border-line bg-white px-4 text-[20px] text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100";

export function Spinner({ label }: { label: string }) {
  return (
    <div className="py-6" role="status" aria-live="polite" aria-busy="true" data-testid="skeleton">
      <p className="mb-4 text-center text-[18px] font-semibold text-brand-800">{label}</p>
      <div className="rounded-card border border-line bg-white p-5 shadow-soft">
        <div className="flex items-center gap-3"><div className="skeleton h-12 w-12 rounded-2xl" /><div className="skeleton h-4 w-1/2" /></div>
        <div className="skeleton mt-5 h-6 w-4/5" />
        <div className="skeleton mt-3 h-4 w-full" />
        <div className="skeleton mt-2 h-4 w-2/3" />
      </div>
    </div>
  );
}

export function Facts({ nano }: { nano: string }) {
  const { lang } = useApp();
  return (
    <ul className="space-y-2" data-testid="offline-facts">
      {offlineFacts(nano, lang).map((f) => (
        <li key={f.key} className="flex items-start gap-2 text-[14.5px] leading-snug text-ink" data-key={f.key} data-ok={String(f.ok)}>
          <span className={cx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", f.ok === true ? "bg-accent-strong" : f.ok === false ? "bg-grey-ink" : "bg-brand-300")} aria-hidden />
          {f.text}
        </li>
      ))}
    </ul>
  );
}

/** Permanent header pill: real network state + the SDK's inferenceSource of the last AI answer. */
export function StatusPill() {
  const { lang, online, lastAi } = useApp();
  const kind = statusKind(online, lastAi);
  const [nano, setNano] = useState("…");
  const [open, setOpen] = useState(false);
  useEffect(() => { nanoAvailability().then(setNano).catch(() => setNano("unavailable")); }, []);
  const tip = offlineFacts(nano, lang).map((f) => f.text).join("\n");
  const Icon = kind === "cloud" ? Cloud : kind === "device" ? Smartphone : ShieldCheck;
  return (
    <span className="relative">
    <button
      type="button"
      onClick={() => setOpen(!open)}
      title={tip}
      aria-expanded={open}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-[13px] font-semibold ring-1",
        kind === "cloud" ? "bg-accent-soft text-brand-900 ring-brand-300" : "bg-brand-50 text-brand-800 ring-brand-200",
      )}
      role="status"
      aria-live="polite"
      data-testid="status-pill"
      data-kind={kind}
      data-online={online ? "1" : "0"}
    >
      <span className={cx("h-2 w-2 rounded-full", online ? "bg-accent ring-[3px] ring-accent/25" : "bg-grey-ink")} aria-label={online ? "online" : "offline"} />
      <Icon size={14} aria-hidden />
      {STATUS_LABEL[kind][lang]}
      <Info size={13} className="opacity-60" aria-hidden />
    </button>
    {open && (
      <span className="absolute left-0 top-full z-30 mt-2 block w-[300px] rounded-2xl bg-white p-4 shadow-lift ring-1 ring-line" data-testid="status-popover">
        <Facts nano={nano} />
      </span>
    )}
    </span>
  );
}

/** Human error message with recovery buttons. */
export function ErrorCard({ k, on, testId }: { k: ErrorKey; on: Partial<Record<Recovery, () => void>>; testId?: string }) {
  const { lang } = useApp();
  const actions = RECOVERY[k].filter((a) => on[a]);
  const ICON: Record<Recovery, ReactNode> = { retry: <RotateCcw size={20} />, type: <Keyboard size={20} />, closer: <Camera size={20} />, gallery: <ImageUp size={20} /> };
  return (
    <div className="rounded-card border-2 border-brand-200 bg-brand-50 p-4" role="alert" data-testid={testId ?? "error-card"} data-error={k}>
      <p className="flex items-start gap-2 text-[17px] font-medium leading-snug text-brand-900">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
        {ERRORS[k][lang]}
      </p>
      {actions.length > 0 && (
        <div className={cx("mt-3 grid gap-2", actions.length > 1 && "grid-cols-2")}>
          {actions.map((a, i) => (
            <Button key={a} variant={i === 0 ? "primary" : "secondary"} icon={ICON[a]} onClick={on[a]} data-testid={`recover-${a}`}>
              {RECOVERY_LABEL[a][lang]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
