import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Home as HomeIcon, Package, Settings as SettingsIcon, Users, Volume2, VolumeX } from "lucide-react";
import { useApp, type Screen } from "./state";
import { StatusPill, cx } from "./components/ui";
import { LogoMark } from "./components/Logo";
import Home from "./screens/Home";
import Voice from "./screens/Voice";
import Photo from "./screens/Photo";
import TypeCheck from "./screens/TypeCheck";
import Result from "./screens/Result";
import Cabinet from "./screens/Cabinet";
import Family from "./screens/Family";
import Settings from "./screens/Settings";
import { About, Privacy } from "./screens/Info";
import Report from "./screens/Report";
import { FirstRun, How, Invite, Transparency, Why } from "./screens/Pages";
import { LanguageButton, RegionalFallbackBanner, RegionalNoVoiceNote, TranslationLayer } from "./components/Language";

function Header() {
  const { t, lang, muted, setMuted, go } = useApp();
  return (
    <header className="sticky top-0 z-20 bg-paper/90 px-4 pb-2.5 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-md">
     <div className="flex items-center gap-2">
      <button onClick={() => go({ name: "home" })} className="flex min-h-14 items-center gap-2.5 rounded-2xl pr-2" aria-label={t("home")}>
        <LogoMark size={38} />
        <span className="flex flex-col items-start leading-none">
          <span className="text-[19px] font-bold tracking-tight text-brand-900">{lang === "hi" ? "दवा कवच" : "DawaShield"}</span>
          <span className="mt-1 text-[12px] font-medium text-brand-600">{lang === "hi" ? "सरकारी चेतावनी जाँच" : "CDSCO alert check"}</span>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => setMuted(!muted)}
          className="grid h-12 w-12 place-items-center rounded-2xl text-brand-800 hover:bg-brand-50"
          aria-label={t("sound")}
          aria-pressed={!muted}
        >
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
        <LanguageButton />
      </div>
     </div>
     <div className="mt-1.5 flex"><StatusPill /></div>
    </header>
  );
}

const TABS: { name: Screen["name"]; icon: typeof HomeIcon; key: "home" | "cabinetShort" | "family" | "settings" }[] = [
  { name: "home", icon: HomeIcon, key: "home" },
  { name: "cabinet", icon: Package, key: "cabinetShort" },
  { name: "family", icon: Users, key: "family" },
  { name: "settings", icon: SettingsIcon, key: "settings" },
];

function BottomNav() {
  const { screen, go, t } = useApp();
  return (
    <nav className="sticky bottom-0 z-20 border-t border-line bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md" aria-label="Main">
      <ul className="grid grid-cols-4">
        {TABS.map(({ name, icon: Icon, key }) => {
          const active = screen.name === name;
          return (
            <li key={name}>
              <button
                onClick={() => go(name === "home" ? { name: "home" } : ({ name } as Screen))}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-[13px] font-semibold transition",
                  active ? "text-brand-700" : "text-muted hover:text-brand-700",
                )}
              >
                <span className={cx("grid h-8 w-14 place-items-center rounded-full transition", active && "bg-brand-50")}>
                  <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                </span>
                {t(key)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Wide screens only: what DawaShield is, beside the phone frame. */
function DesktopAside() {
  const { lang, dataMeta } = useApp();
  const hi = lang === "hi";
  const points = hi
    ? ["बोलकर, लिखकर या पत्ते की फ़ोटो से जाँच", "हिन्दी और अंग्रेज़ी बिना इंटरनेट, 5 और भारतीय भाषाएँ इंटरनेट के साथ", "सरकारी सूची फ़ोन में, बिना इंटरनेट भी", "रंग सादे कोड से तय होता है, AI से नहीं"]
    : ["Speak, type or photograph the strip", "Hindi and English offline, 5 more Indian languages online", "The official list lives on the phone, works offline", "The colour is decided by plain code, never by AI"];
  return (
    <aside className="hidden w-[400px] shrink-0 lg:block" aria-label="About DawaShield">
      <div className="flex items-center gap-3">
        <LogoMark size={52} />
        <span className="text-[30px] font-bold tracking-tight text-brand-900">{hi ? "दवा कवच" : "DawaShield"}</span>
      </div>
      <h2 className="mt-6 text-[36px] font-bold leading-[1.12] tracking-tight text-ink">
        {hi ? "अपने परिवार की दवाएँ सरकारी CDSCO चेतावनियों से जाँचिए" : "Check your family's medicines against official CDSCO alerts"}
      </h2>
      <ul className="mt-6 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3 text-[17px] text-ink/85">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" aria-hidden />{p}
          </li>
        ))}
      </ul>
      {dataMeta && (
        <p className="mt-6 text-[15px] font-semibold text-muted">Built by Neeraj Kumar</p>
      )}
      {dataMeta && (
        <p className="mt-3 inline-flex rounded-2xl bg-white px-4 py-3 text-[15px] font-semibold text-brand-900 shadow-soft ring-1 ring-line">
          {dataMeta.records.toLocaleString("en-IN")} {hi ? "सरकारी रिकॉर्ड" : "official records"} · {dataMeta.earliestMonth} → {dataMeta.latestMonth}
        </p>
      )}
    </aside>
  );
}

function CurrentScreen() {
  const { screen } = useApp();
  switch (screen.name) {
    case "voice": return <Voice key="voice" />;
    case "photo": return <Photo key="photo" />;
    case "type": return <TypeCheck key="type" />;
    case "result": return <Result key="result" />;
    case "cabinet": return <Cabinet key="cabinet" />;
    case "family": return <Family key="family" />;
    case "settings": return <Settings key="settings" />;
    case "privacy": return <Privacy key="privacy" />;
    case "about": return <About key="about" />;
    case "report": return <Report key="report" />;
    case "how": return <How key="how" />;
    case "why": return <Why key="why" />;
    case "transparency": return <Transparency key="transparency" />;
    case "invite": return <Invite key="invite" />;
    default: return <Home key="home" />;
  }
}

const FR_KEY = "ds-first-run-v2";
function useFirstRun(): [boolean, () => void] {
  const [show, setShow] = useState(() => { try { return localStorage.getItem(FR_KEY) !== "1"; } catch { return true; } });
  return [show, () => { try { localStorage.setItem(FR_KEY, "1"); } catch { /* ignore */ } setShow(false); }];
}

export default function App() {
  const [firstRun, doneFirstRun] = useFirstRun();
  return (
    <div className="min-h-dvh sm:flex sm:items-center sm:justify-center sm:gap-16 sm:py-8">
      <DesktopAside />
      {/* On wide screens the app sits in a phone-width frame. */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col sm:mx-0 sm:w-[440px] sm:shrink-0 bg-paper sm:h-[min(900px,calc(100dvh-64px))] sm:min-h-0 sm:overflow-hidden sm:rounded-[44px] sm:border-[10px] sm:border-[#13201e] sm:shadow-[0_40px_80px_-20px_rgba(12,40,36,0.45)]">
        <div id="scroller" className="no-scrollbar flex flex-1 flex-col sm:overflow-y-auto">
          <Header />
          <RegionalFallbackBanner />
          <RegionalNoVoiceNote />
          <main className="flex-1">
            <AnimatePresence mode="wait">
              <CurrentScreen />
            </AnimatePresence>
          </main>
          <BottomNav />
        </div>
      </div>
      {firstRun && <FirstRun onDone={doneFirstRun} />}
      <TranslationLayer />
    </div>
  );
}
