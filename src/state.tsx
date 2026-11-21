import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "./content/messages";
import { UI, type UIKey } from "./content/ui";
import { loadDataset, syncIfNewer, recheckCabinet, expiryReminders, flushQueue, type Dataset } from "./lib/sync";
import { playClip, regionalVoiceAvailable } from "./lib/audio";
import { isRegional, loadDict, type AppLang } from "./lib/i18n";
import type { Regional } from "./lib/indic";
import { setDisplayLocale } from "./lib/format";
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
  | { name: "report" }
  | { name: "how" }
  | { name: "why" }
  | { name: "transparency" }
  | { name: "invite"; code: string };

export interface CheckInput extends StripReading {
  who?: string;
  /** Started from the labelled "Try a demo" button. */
  demo?: boolean;
  /** Photo fields that were low-confidence and not confirmed by the user. */
  uncertain?: boolean;
  /** Photo / voice confidence too low to match: shows "Can't read clearly", never GREY. */
  unreadable?: boolean;
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
  /** Content language for the app's own text: "hi" or "en". In a regional
   *  language this is "en" (online, translated on screen) or "hi" (offline fallback). */
  lang: Lang;
  setLang(l: Lang): void;
  /** The language the person picked: Hindi, English, or one of 5 online regional languages. */
  uiLang: AppLang;
  setUiLang(l: AppLang): void;
  /** A regional language is picked and its reviewed translation is on screen. */
  regionalActive: boolean;
  /** A regional language is picked but we are showing Hindi (offline, or not yet available). */
  regionalFallback: boolean;
  /** Regional languages whose reviewed translation is published (online manifest). */
  regionalAvailable: Partial<Record<Regional, boolean>>;
  /** Translation dictionary for the active regional language (for the screen layer). */
  regionalDict: Awaited<ReturnType<typeof loadDict>>;
  /** false when the device has no speech voice for the active regional language (text only). */
  regionalVoiceOk: boolean;
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
  /** Dataset download progress (bytes), while downloading. */
  download: { loaded: number; total: number } | null;
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
  const [uiLang, setUiLangS] = useState<AppLang>(() => {
    const v = read("ds-ui-lang", read("ds-lang", "hi"));
    return v === "en" || v === "hi" || isRegional(v) ? (v as AppLang) : "hi";
  });
  const [regionalDict, setRegionalDict] = useState<Awaited<ReturnType<typeof loadDict>>>(null);
  const [regionalAvailable, setRegionalAvailable] = useState<Partial<Record<Regional, boolean>>>({});
  const [regionalVoiceMode, setRegionalVoiceMode] = useState<Partial<Record<Regional, "sarvam" | "browser">>>({});
  const [regionalVoiceOk, setRegionalVoiceOk] = useState(true);
  const [voice, setVoiceS] = useState<"female" | "male">(() => (read("ds-voice", "female") === "male" ? "male" : "female"));
  const [muted, setMutedS] = useState(() => read("ds-muted", "0") === "1");
  const [online, setOnline] = useState(navigator.onLine);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [metaFirst, setMetaFirst] = useState<DatasetMeta | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [download, setDownload] = useState<{ loaded: number; total: number } | null>(null);
  const onProgress = useCallback((loaded: number, total: number) => setDownload(loaded >= total ? null : { loaded, total }), []);
  const [stack, setStack] = useState<Screen[]>(() => {
    try {
      const code = new URLSearchParams(location.search).get("invite");
      if (code) return [{ name: "home" }, { name: "invite", code }];
    } catch { /* ignore */ }
    return [{ name: "home" }];
  });
  const [check, setCheck] = useState<CheckState | null>(null);
  const [cabinetVersion, setCV] = useState(0);
  const [lastAi, setLastAi] = useState<Source | null>(null);

  const setUiLang = (l: AppLang) => { setUiLangS(l); write("ds-ui-lang", l); if (l === "hi" || l === "en") write("ds-lang", l); };
  const setLang = (l: Lang) => setUiLang(l);
  // Regional: reviewed translation, online only. Offline -> Hindi, back automatically when online.
  const regionalActive = isRegional(uiLang) && online && !!regionalDict && regionalDict.dict.lang === uiLang;
  const regionalFallback = isRegional(uiLang) && !regionalActive;
  const lang: Lang = uiLang === "hi" || uiLang === "en" ? uiLang : regionalActive ? "en" : "hi";
  const setVoice = (v: "female" | "male") => { setVoiceS(v); write("ds-voice", v); };
  const setMuted = (m: boolean) => { setMutedS(m); write("ds-muted", m ? "1" : "0"); };
  const t = useCallback((k: UIKey) => UI[k][lang], [lang]);
  const clipLang: AppLang = regionalActive ? uiLang : lang;
  const say = useCallback((clip: string) => void playClip(clip, clipLang, voice, muted, regionalActive ? { texts: regionalDict?.dict.clips, mode: isRegional(uiLang) ? regionalVoiceMode[uiLang] ?? "browser" : "browser" } : undefined), [clipLang, voice, muted, regionalActive, regionalDict, uiLang, regionalVoiceMode]);
  useEffect(() => {
    if (!regionalActive) { setRegionalVoiceOk(true); return; }
    if (isRegional(uiLang) && regionalVoiceMode[uiLang] === "sarvam") { setRegionalVoiceOk(true); return; }
    let live = true;
    void regionalVoiceAvailable(uiLang).then((ok) => { if (live) setRegionalVoiceOk(ok); });
    return () => { live = false; };
  }, [regionalActive, uiLang, regionalVoiceMode]);

  useEffect(() => {
    document.documentElement.lang = regionalActive ? uiLang : lang;
    setDisplayLocale(regionalActive ? `${uiLang}-IN` : null);
  }, [lang, uiLang, regionalActive]);

  // Load the picked regional language's reviewed translation whenever online.
  useEffect(() => {
    if (!isRegional(uiLang) || !online) return;
    let live = true;
    void loadDict(uiLang).then((d) => { if (live) setRegionalDict(d); });
    return () => { live = false; };
  }, [uiLang, online]);
  // Which regional languages are published (manifest is small, online only).
  useEffect(() => {
    if (!online) return;
    fetch("/i18n/index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((m: { langs?: Record<string, { available?: boolean; voice?: string }> } | null) => {
      if (m?.langs) {
        setRegionalAvailable(Object.fromEntries(Object.entries(m.langs).map(([k, v]) => [k, !!v.available])) as Partial<Record<Regional, boolean>>);
        setRegionalVoiceMode(Object.fromEntries(Object.entries(m.langs).map(([k, v]) => [k, v.voice === "sarvam" ? "sarvam" : "browser"])) as Partial<Record<Regional, "sarvam" | "browser">>);
      }
    }).catch(() => {});
  }, [online]);

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
      const fresh = await syncIfNewer(dataset, onProgress);
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
      const ds = await loadDataset(onProgress);
      setDownload(null);
      setDataset(ds);
      if (ds) { await recheckCabinet(ds); setCV((v) => v + 1); }
      const fresh = await syncIfNewer(ds, onProgress);
      setDownload(null);
      if (fresh) { setDataset(fresh); setCV((v) => v + 1); }
      await expiryReminders(lang);
      await flushQueue();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(() => ({
    lang, setLang, uiLang, setUiLang, regionalActive, regionalFallback, regionalAvailable, regionalDict, regionalVoiceOk, t, voice, setVoice, muted, setMuted, say, online, dataset, dataMeta: dataset?.meta ?? metaFirst, syncing, sync, download,
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
  }), [lang, uiLang, regionalActive, regionalFallback, regionalAvailable, regionalDict, regionalVoiceOk, t, voice, muted, say, online, dataset, metaFirst, syncing, sync, download, stack, check, cabinetVersion, lastAi]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
