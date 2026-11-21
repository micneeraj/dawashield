// Month and date names follow the language on screen (pa-IN, ta-IN... when a
// regional translation is active). Set by the app state.
let displayLocale: string | null = null;
export function setDisplayLocale(l: string | null) { displayLocale = l; }
const loc = (lang: "hi" | "en") => displayLocale ?? (lang === "hi" ? "hi-IN" : "en-IN");

export function monthLabel(key: string | null | undefined, lang: "hi" | "en"): string {
  if (!key) return "—";
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(loc(lang), { month: "long", year: "numeric" });
}

export function dateLabel(iso: string | null | undefined, lang: "hi" | "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString(loc(lang), { day: "numeric", month: "short", year: "numeric" });
}

/** CDSCO alerts page: used when the exact monthly PDF of an alert is not known. */
export const CDSCO_ALERTS_PAGE = "https://cdsco.gov.in/opencms/opencms/en/Notifications/Alerts/";

/** The official link for one alert: the exact monthly CDSCO PDF when its URL is known, else the alerts page. */
export function officialLink(r: { pdfUrl?: string }): { url: string; kind: "pdf" | "alerts" } {
  return r.pdfUrl && /^https:\/\/cdsco\.gov\.in\//.test(r.pdfUrl) ? { url: r.pdfUrl, kind: "pdf" } : { url: CDSCO_ALERTS_PAGE, kind: "alerts" };
}

/** When the next official list is expected. CDSCO publishes each month's alerts
 *  about 4–8 weeks after the month ends, so we expect month M+1 by the end of
 *  month M+3 (Sep data -> Oct list expected by 31 Dec). The pipeline checks daily;
 *  if that date has passed, the next check is tomorrow. Plain rule, documented in docs/ARCHITECTURE.md. */
export function nextUpdateExpected(latestMonth: string | null | undefined, today = new Date()): Date | null {
  if (!latestMonth) return null;
  const [y, m] = latestMonth.split("-").map(Number);
  if (!y || !m) return null;
  const expected = new Date(y, m + 3, 0); // last day of month M+3
  if (expected.getTime() > today.getTime()) return expected;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return t;
}
