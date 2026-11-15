import { AnimatePresence } from "framer-motion";
import { Home as HomeIcon, Package, Settings as SettingsIcon, Users, WifiOff, Volume2, VolumeX } from "lucide-react";
import { useApp, type Screen } from "./state";
import { cx } from "./components/ui";
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

function Header() {
  const { t, lang, setLang, online, muted, setMuted, go } = useApp();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-paper/90 px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-md">
      <button onClick={() => go({ name: "home" })} className="flex min-h-14 items-center gap-2.5 rounded-2xl pr-2" aria-label={t("home")}>
        <LogoMark size={38} />
        <span className="flex flex-col items-start leading-none">
          <span className="text-[19px] font-bold tracking-tight text-brand-900">{lang === "hi" ? "दवा कवच" : "DawaShield"}</span>
          <span className={cx("mt-1 text-[12px] font-medium text-brand-600", lang === "hi" && "uppercase tracking-[0.12em]")}>{lang === "hi" ? "DawaShield" : "दवा कवच"}</span>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        {!online && (
          <span className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-white" role="status" data-testid="offline-badge">
            <WifiOff size={15} aria-hidden />
            {t("offline")}
          </span>
        )}
        <button
          onClick={() => setMuted(!muted)}
          className="grid h-12 w-12 place-items-center rounded-2xl text-brand-800 hover:bg-brand-50"
          aria-label={t("sound")}
          aria-pressed={!muted}
        >
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
        <button
          onClick={() => setLang(lang === "hi" ? "en" : "hi")}
          className="h-12 rounded-2xl border border-line bg-white px-3.5 text-[16px] font-bold text-brand-800 shadow-soft"
          aria-label={lang === "hi" ? "Switch to English" : "हिन्दी में बदलें"}
        >
          {lang === "hi" ? "EN" : "हिं"}
        </button>
      </div>
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
    default: return <Home key="home" />;
  }
}

export default function App() {
  return (
    <div className="min-h-dvh sm:flex sm:items-center sm:justify-center sm:py-8">
      {/* On wide screens the app sits in a phone-width frame. */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-paper sm:h-[min(900px,calc(100dvh-64px))] sm:min-h-0 sm:overflow-hidden sm:rounded-[44px] sm:border-[10px] sm:border-[#13201e] sm:shadow-[0_40px_80px_-20px_rgba(12,40,36,0.45)]">
        <div id="scroller" className="no-scrollbar flex flex-1 flex-col sm:overflow-y-auto">
          <Header />
          <main className="flex-1">
            <AnimatePresence mode="wait">
              <CurrentScreen />
            </AnimatePresence>
          </main>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
