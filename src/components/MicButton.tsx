import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { cx } from "./ui";

export function MicButton({ listening, onClick, label, size = 168 }: { listening: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 60, height: size + 60 }}>
      {listening && (
        <>
          <span className="ring-pulse absolute rounded-full bg-accent/35" style={{ width: size, height: size }} />
          <span className="ring-pulse delay absolute rounded-full bg-accent/25" style={{ width: size, height: size }} />
        </>
      )}
      <span className="absolute rounded-full bg-accent-soft/80" style={{ width: size + 36, height: size + 36 }} aria-hidden />
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        aria-label={label}
        aria-pressed={listening}
        data-testid="mic"
        className={cx(
          "relative grid place-items-center rounded-full text-white shadow-accent transition-colors",
          listening ? "mic-glow bg-accent-strong" : "bg-gradient-to-b from-accent to-accent-strong hover:to-brand-700",
        )}
        style={{ width: size, height: size }}
      >
        <span className="absolute inset-[6px] rounded-full ring-1 ring-white/25" aria-hidden />
        {listening ? <Square size={size * 0.28} fill="currentColor" /> : <Mic size={size * 0.38} strokeWidth={2.2} />}
      </motion.button>
    </div>
  );
}
