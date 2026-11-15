import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "./content/messages";
import { UI, type UIKey } from "./content/ui";
import { loadDataset, syncIfNewer, recheckCabinet, expiryReminders, flushQueue, type Dataset } from "./lib/sync";
import { playClip } from "./lib/audio";
import type { DatasetMeta, MatchResult, Source } from "./lib/types";
import type { StripReading } from "./lib/json";
import type { AiStep } from "./lib/ai";

export type Screen =
  | { name: "home" }
  | { name: "voice" }
  | { name: "photo"; prefill?: Partial<CheckInput> }
  | { name: "type"; prefill?: Partial<CheckInput> }
  | { name: "result" }
  | { name: "cabinet" }
  | { name: "family" }
  | { name: "settings" }
  | { name: "privacy" }
  | { name: "about" }
  | { name: "report" };

export interface CheckInput extends StripReading {
  who?: string;
  readSource?: Source; // who read the photo / understood speech (SDK inferenceSource)
  /** What the AI understood, shown in the result's pipeline strip. */
  understood?: { via: "speech" | "photo"; heard?: string; items: { label: { hi: string; en: string }; value: string }[] };
  /** Every AI call behind this answer, with its real source and time. */
  aiSteps?: AiStep[];
}

export interface CheckState {
  input: CheckInput;
  result: MatchResult;
  at: string;
  matchMs?: number; // plain-code matching time
  searched?: number; // records searched
  cabinetId?: number;
}

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

interface Ctx {
  lang: Lang;
  setLang(l: Lang): void;
  t(k: UIKey): string;
  voice: "female" | "male";
  setVoice(v: "female" | "male"): void;
  muted: boolean;
  setMuted(m: boolean): void;
  say(clip: string): void;
  online: boolean;
  dataset: Dataset | null;
  /** Dataset meta, available before the full record list (small file, loaded first). */
  dataMeta: DatasetMeta | null;
  syncing: boolean;
  sync(): Promise<boolean>;
  screen: Screen;
  go(s: Screen): void;
  back(): void;
  check: CheckState | null;
  setCheck(c: CheckState | null): void;
  cabinetVersion: number;
  bumpCabinet(): void;
  /** Where the last AI answer came from, as reported by the SDK's inferenceSource. */
  lastAi: Source | null;
  noteAi(s: Source): void;
}

const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangS] = useState<Lang>(() => (read("ds-lang", "hi") === "en" ? "en" : "hi"));
  const [voice, setVoiceS] = useState<"female" | "male">(() => (read("ds-voice", "female") === "male" ? "male" : "female"));
  const [muted, setMutedS] = useState(() => read("ds-muted", "0") === "1");
  const [online, setOnline] = useState(navigator.onLine);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [metaFirst, setMetaFirst] = useState<DatasetMeta | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);
  const [check, setCheck] = useState<CheckState | null>(null);
  const [cabinetVersion, setCV] = useState(0);
  const [lastAi, setLastAi] = useState<Source | null>(null);

  const setLang = (l: Lang) => { setLangS(l); write("ds-lang", l); document.documentElement.lang = l; };
  const setVoice = (v: "female" | "male") => { setVoiceS(v); write("ds-voice", v); };
  const setMuted = (m: boolean) => { setMutedS(m); write("ds-muted", m ? "1" : "0"); };
  const t = useCallback((k: UIKey) => UI[k][lang], [lang]);
  const say = useCallback((clip: string) => void playClip(clip, lang, voice, muted), [lang, voice, muted]);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  useEffect(() => {
    const on = () => { setOnline(true); void flushQueue(); };
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const fresh = await syncIfNewer(dataset);
      if (fresh) { setDataset(fresh); setCV((v) => v + 1); return true; }
      return false;
    } finally {
      setSyncing(false);
    }
  }, [dataset]);

  // Start-up: local dataset, then sync if online, monthly re-check, reminders.
  useEffect(() => {
    fetch("/data/meta.json").then((r) => r.json()).then((m: DatasetMeta) => setMetaFirst((x) => x ?? m)).catch(() => {});
    (async () => {
      const ds = await loadDataset();
      setDataset(ds);
      if (ds) { await recheckCabinet(ds); setCV((v) => v + 1); }
      const fresh = await syncIfNewer(ds);
      if (fresh) { setDataset(fresh); setCV((v) => v + 1); }
      await expiryReminders(lang);
      await flushQueue();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(() => ({
    lang, setLang, t, voice, setVoice, muted, setMuted, say, online, dataset, dataMeta: dataset?.meta ?? metaFirst, syncing, sync,
    screen: stack[stack.length - 1],
    go: (s) => {
      setStack((st) => (s.name === "home" ? [s] : [...st, s]));
      window.scrollTo(0, 0);
      document.getElementById("scroller")?.scrollTo(0, 0);
    },
    back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    check, setCheck,
    cabinetVersion, bumpCabinet: () => setCV((v) => v + 1),
    lastAi, noteAi: setLastAi,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lang, t, voice, muted, say, online, dataset, metaFirst, syncing, sync, stack, check, cabinetVersion, lastAi]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
