import { useEffect, useState } from "react";
import { ChevronRight, Cpu, Database, Info, Languages, Lock, RefreshCw, CheckCircle2, Sparkles, Volume2, WifiOff, HardDriveDownload } from "lucide-react";
import { PushOffer } from "../components/PushOffer";
import { useApp } from "../state";
import { Button, Card, Page, cx } from "../components/ui";
import { Facts } from "../components/ui";
import { monthLabel } from "../lib/format";
import { nanoAvailability } from "../lib/ai";
import { nanoText } from "../lib/status";

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-flow-col rounded-2xl bg-brand-50 p-1" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cx("min-h-12 rounded-xl px-4 text-[16px] font-semibold transition", value === o.v ? "bg-white text-brand-800 shadow-soft" : "text-brand-700")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const { t, lang, setLang, voice, setVoice, muted, setMuted, dataset, sync, syncing, online, go } = useApp();
  const [nano, setNano] = useState("…");
  const [nanoImg, setNanoImg] = useState("…");
  const [syncMsg, setSyncMsg] = useState("");
  useEffect(() => { nanoAvailability().then(setNano); nanoAvailability(true).then(setNanoImg); }, []);
  const m = dataset?.meta;

  return (
    <Page title={t("settings")} onBack={() => go({ name: "home" })}>
      {/* Dataset box */}
      <Card className="overflow-hidden" >
        <div className="flex items-center gap-3 bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-4 text-white">
          <Database size={24} />
          <span className="whitespace-nowrap text-[19px] font-bold">{t("dataset")}</span>
          <span className={cx("ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold", dataset ? "bg-white/15" : "bg-amber-ink")}>
            {dataset ? <><CheckCircle2 size={15} /> {t("availableOffline")}</> : t("notOffline")}
          </span>
        </div>
        {m && (
          <dl className="grid grid-cols-2 gap-px bg-line" data-testid="dataset-box">
            {[
              [t("records"), m.records.toLocaleString("en-IN") + (m.duplicatesMerged ? (lang === "hi" ? ` (${m.duplicatesMerged} दोहराव मिलाए)` : ` (${m.duplicatesMerged} repeats merged)`) : "")],
              [t("lastSynced"), m.lastSynced],
              [t("coverage"), `${monthLabel(m.earliestMonth, lang)} – ${monthLabel(m.latestMonth, lang)}`],
              ["NSQ / Spurious", `${m.nsq.toLocaleString("en-IN")} / ${m.spurious}`],
              ...(m.gzipBytes ? [[lang === "hi" ? "डाउनलोड का आकार" : "Download size", `${(m.gzipBytes / 1e6).toFixed(1)} MB${m.bytes ? (lang === "hi" ? ` (खुलकर ${(m.bytes / 1e6).toFixed(1)} MB)` : ` (${(m.bytes / 1e6).toFixed(1)} MB unpacked)`) : ""}`]] : []),
              ...(m.lastChecked ? [[lang === "hi" ? "आख़िरी जाँच" : "Last checked", m.lastChecked]] : []),
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-4 py-3">
                <dt className="text-[13px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
                <dd className="num text-[17px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="space-y-3 p-4">
          {m && m.statesPendingLatestMonth.length > 0 && (
            <p className="text-[14px] leading-snug text-muted">
              <b className="text-ink">{t("missingStates")} ({monthLabel(m.latestMonth, lang)}):</b> {m.statesPendingLatestMonth.join(", ")}
            </p>
          )}
          <p className="text-[13px] text-muted">{lang === "hi" ? "स्रोत: CDSCO, भारत सरकार" : "Source: CDSCO, Government of India"} · v{m?.version.slice(0, 8)}</p>
          <Button variant="secondary" full disabled={!online || syncing} icon={<RefreshCw size={20} className={cx(syncing && "animate-spin")} />}
            onClick={async () => { const changed = await sync(); setSyncMsg(changed ? "✓" : t("upToDate")); }}>
            {syncMsg || t("syncNow")}
          </Button>
        </div>
      </Card>

      <Card className="mt-4 divide-y divide-line/70">
        <div className="flex flex-col gap-2 p-4">
          <span className="flex items-center gap-2 text-[17px] font-semibold"><Languages size={20} className="text-brand-600" /> {t("language")}</span>
          <Seg value={lang} onChange={setLang} options={[{ v: "hi", l: "हिन्दी" }, { v: "en", l: "English" }]} />
        </div>
        <div className="flex flex-col gap-2 p-4">
          <span className="flex items-center gap-2 text-[17px] font-semibold"><Volume2 size={20} className="text-brand-600" /> {t("voice")}</span>
          <Seg value={muted ? "off" : voice} onChange={(v) => { if (v === "off") setMuted(true); else { setMuted(false); setVoice(v); } }}
            options={[{ v: "female", l: lang === "hi" ? "चालू" : "On" }, { v: "off", l: lang === "hi" ? "बंद" : "Off" }]} />
        </div>
        <div className="flex items-start gap-3 p-4">
          <Cpu size={20} className="mt-0.5 text-brand-600" />
          <span className="flex-1">
            <span className="block text-[17px] font-semibold">{t("onDeviceAi")}</span>
            <span className="block text-[15px] leading-snug text-muted" data-testid="nano-status">{nanoText(nano, nanoImg, lang)}</span>
            <span className="mt-1 block text-[14px] text-brand-700">{lang === "hi" ? "दवा का मिलान हमेशा पूरी तरह बिना इंटरनेट इसी फ़ोन पर होता है।" : "Medicine matching always works fully offline on this phone."}</span>
          </span>
        </div>
        <div className="flex items-start gap-3 p-4">
          <WifiOff size={20} className="mt-0.5 text-brand-600" />
          <span className="flex-1">
            <span className="mb-2 block text-[17px] font-semibold">{lang === "hi" ? "बिना इंटरनेट क्या चलता है" : "What works offline"}</span>
            <Facts nano={nano} />
          </span>
        </div>
      </Card>

      <PushOffer settings className="mt-4" />
      <p className="mt-2 flex items-center gap-1.5 px-1 text-[14px] text-muted"><HardDriveDownload size={15} aria-hidden /> {lang === "hi" ? "सूचना नहीं चाहिए? हर दवा पर 'कैलेंडर में जोड़ें' भी है।" : "Prefer no notifications? Every medicine also has 'Add expiry to my calendar'."}</p>

      <Card className="mt-4 divide-y divide-line/70">
        {([["how", Cpu, lang === "hi" ? "यह कैसे काम करता है" : "How it works"], ["why", Sparkles, lang === "hi" ? "दवा कवच क्यों" : "Why DawaShield"]] as const).map(([k, Icon, label]) => (
          <button key={k} onClick={() => go({ name: k })} className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left">
            <Icon size={20} className="text-brand-600" />
            <span className="flex-1 text-[17px] font-semibold">{label}</span>
            <ChevronRight className="text-muted" />
          </button>
        ))}
        {([["privacy", Lock], ["about", Info]] as const).map(([k, Icon]) => (
          <button key={k} onClick={() => go({ name: k })} className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left">
            <Icon size={20} className="text-brand-600" />
            <span className="flex-1 text-[17px] font-semibold">{t(k)}</span>
            <ChevronRight className="text-muted" />
          </button>
        ))}
      </Card>
    </Page>
  );
}
