// Personal, on-device settings: what to call the person, and the "My contacts"
// numbers used by the one-tap Call buttons. Stored only in this browser's
// localStorage (never sent anywhere: Firestore rules allow no phone numbers).
import type { Lang } from "../content/messages";
import { LANG_NAMES, REGIONAL, type AppLang } from "./i18n";
import type { Level } from "./types";

const KEY_NAME = "ds-nickname";
const KEY_CONTACTS = "ds-contacts";
export const WELCOME_KEY = "ds-welcome-v1";

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

// ---------- Name / greeting ----------
export const getNickname = () => (read(KEY_NAME) ?? "").trim();
export const PROFILE_EVENT = "ds-profile";
export const setNickname = (n: string) => {
  write(KEY_NAME, n.trim().slice(0, 30));
  try { dispatchEvent(new Event(PROFILE_EVENT)); } catch { /* not in a browser */ }
};

export type DayPart = "morning" | "afternoon" | "evening";
export function dayPart(hour: number): DayPart {
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

const HELLO: Record<DayPart, Record<Lang, string>> = {
  morning: { hi: "सुप्रभात", en: "Good morning" },
  afternoon: { hi: "नमस्कार", en: "Good afternoon" },
  evening: { hi: "शुभ संध्या", en: "Good evening" },
};

/** "सुप्रभात, माँ" / "Good morning, Maa". No name -> just the time-based greeting. */
export function greeting(lang: Lang, name: string, now = new Date()): string {
  const g = HELLO[dayPart(now.getHours())][lang];
  const n = name.trim();
  return n ? `${g}, ${n}` : g;
}

/** "रविवार, 22 नवंबर" / "Sunday, 22 November" in the chosen language. */
export function dateLine(lang: Lang, now = new Date(), locale?: string): string {
  return now.toLocaleDateString(locale ?? (lang === "hi" ? "hi-IN" : "en-IN"), { weekday: "long", day: "numeric", month: "long" });
}

export const NAME_SUGGEST: Record<Lang, string[]> = { hi: ["माँ", "पापा", "दादी", "दादा"], en: ["Maa", "Papa", "Dadi", "Dada"] };

// ---------- My contacts ----------
export type ContactKind = "family" | "doctor" | "chemist";
export const CONTACT_KINDS: ContactKind[] = ["family", "doctor", "chemist"];
export interface Contacts { familyName?: string; family?: string; doctor?: string; chemist?: string }

export function getContacts(): Contacts {
  try { const v = JSON.parse(read(KEY_CONTACTS) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export function saveContacts(c: Contacts): Contacts {
  const clean: Contacts = {};
  if (c.familyName?.trim()) clean.familyName = c.familyName.trim().slice(0, 30);
  for (const k of CONTACT_KINDS) { const n = cleanPhone(c[k]); if (n) clean[k] = n; }
  write(KEY_CONTACTS, JSON.stringify(clean));
  return clean;
}

/** Keep digits and a leading +. Returns "" if it is not a plausible phone number (6-15 digits). */
export function cleanPhone(raw?: string): string {
  if (!raw) return "";
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return "";
  return (t.startsWith("+") ? "+" : "") + digits;
}

/** tel: link for a saved number, or null so the button opens "Add number" instead. */
export function telHref(c: Contacts, kind: ContactKind): string | null {
  const n = cleanPhone(c[kind]);
  return n ? `tel:${n}` : null;
}

/** Call buttons appear only on RED and AMBER results, never on GREY or "can't read". */
export const showCallButtons = (level: Level) => level === "RED" || level === "AMBER";

export const CALL_LABEL: Record<ContactKind, Record<Lang, string>> = {
  family: { hi: "परिवार को कॉल करें", en: "Call family" },
  doctor: { hi: "डॉक्टर को कॉल करें", en: "Call doctor" },
  chemist: { hi: "केमिस्ट को कॉल करें", en: "Call chemist" },
};
export const CONTACT_LABEL: Record<ContactKind, Record<Lang, string>> = {
  family: { hi: "परिवार का नंबर", en: "Family number" },
  doctor: { hi: "डॉक्टर का नंबर", en: "Doctor's number" },
  chemist: { hi: "केमिस्ट का नंबर", en: "Chemist's number" },
};

// ---------- Welcome language tiles ----------
export interface LangTile { lang: AppLang; native: string; active: boolean; note: "offline" | "online" | "soon" }
/** Hindi and English always on. Regional tiles switch on from the online
 *  manifest (public/i18n/index.json "available"), never by a code change. */
export function languageTiles(available: Partial<Record<string, boolean>>): LangTile[] {
  return [
    { lang: "hi", native: LANG_NAMES.hi.native, active: true, note: "offline" },
    { lang: "en", native: LANG_NAMES.en.native, active: true, note: "offline" },
    ...REGIONAL.map((l): LangTile => ({ lang: l, native: LANG_NAMES[l].native, active: available[l] === true, note: available[l] === true ? "online" : "soon" })),
  ];
}
