import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { cx } from "./ui";

export function MicButton({ listening, onClick, label, size = 168 }: { listening: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 60, height: size + 60 }}>
      {listening && (
        <>
          <span className="ring-pulse absolute rounded-full bg-brand-400/40" style={{ width: size, height: size }} />
          <span className="ring-pulse delay absolute rounded-full bg-brand-400/30" style={{ width: size, height: size }} />
        </>
      )}
      <span className="absolute rounded-full bg-brand-100/70" style={{ width: size + 36, height: size + 36 }} aria-hidden />
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        aria-label={label}
        aria-pressed={listening}
        data-testid="mic"
        className={cx(
          "relative grid place-items-center rounded-full text-white shadow-[0_18px_40px_-12px_rgba(15,94,87,0.65)] transition-colors",
          listening ? "bg-brand-800" : "bg-gradient-to-b from-brand-500 to-brand-700 hover:to-brand-800",
        )}
        style={{ width: size, height: size }}
      >
        <span className="absolute inset-[6px] rounded-full ring-1 ring-white/25" aria-hidden />
        {listening ? <Square size={size * 0.28} fill="currentColor" /> : <Mic size={size * 0.38} strokeWidth={2.2} />}
      </motion.button>
    </div>
  );
}
