import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative max-h-[85dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[32px] bg-paper px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-lift sm:rounded-[32px]"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-line sm:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[22px] font-bold">{title}</h2>
              <button onClick={onClose} className="grid h-12 w-12 place-items-center rounded-2xl hover:bg-brand-50" aria-label="Close"><X /></button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
