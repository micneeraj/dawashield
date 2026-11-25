// Spoken replies.
//   hi / en: pre-recorded Sarvam clips (public/audio/*), precached, work offline.
//            Browser speech is never used for these (it read Hindi in an American voice).
//   pa / gu / mr / kn / ta: the reviewed translated text (dict.clips) is read by the
//            browser's built-in speech synthesis, ONLY with a voice for that exact
//            language. No matching voice on the device = text only (never a wrong voice).
//            Optional upgrade path: if the build made Sarvam clips (index.json
//            voice: "sarvam" or "gemini"), those mp3s are played instead.
//            Gemini TTS clips are made at build time (scripts/make-gemini-audio.mjs),
//            lazy-loaded per clip, never precached for offline.
import type { AppLang } from "./i18n";

let current: HTMLAudioElement | null = null;

export function clipDir(lang: AppLang, _voice?: "female" | "male"): string {
  return lang;
}

const BCP: Record<string, string> = { pa: "pa-IN", gu: "gu-IN", mr: "mr-IN", kn: "kn-IN", ta: "ta-IN" };

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

/** Voices load asynchronously on Chrome; wait briefly for them. */
function voices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      s.removeEventListener?.("voiceschanged", done);
      resolve(s.getVoices());
    };
    s.addEventListener?.("voiceschanged", done);
    setTimeout(done, 1500);
  });
}

/** Pure: pick a voice whose language is exactly this language (pa-IN, pa_IN or pa). Never another language. */
export function pickVoice<V extends { lang: string; localService?: boolean }>(list: V[], lang: string): V | null {
  const code = lang.slice(0, 2).toLowerCase();
  const ok = list.filter((v) => v.lang.replace("_", "-").toLowerCase().split("-")[0] === code);
  const india = ok.filter((v) => /-in$/i.test(v.lang.replace("_", "-")));
  const pool = india.length ? india : ok;
  return pool.find((v) => v.localService) ?? pool[0] ?? null;
}

/** Does this device have a voice for the regional language? */
export async function regionalVoiceAvailable(lang: AppLang): Promise<boolean> {
  if (!BCP[lang]) return true;
  return !!pickVoice(await voices(), lang);
}

export interface RegionalVoice { texts?: Record<string, string>; mode?: "sarvam" | "gemini" | "browser" }

export async function playClip(clip: string, lang: AppLang, voice: "female" | "male", muted: boolean, regional?: RegionalVoice): Promise<void> {
  if (muted) return;
  stopClip();
  // grey_company audio still has the old wording; playback is off until it is re-recorded. The file is kept.
  if (clip === "grey_company") return;
  if (lang === "hi" || lang === "en" || ((regional?.mode === "sarvam" || regional?.mode === "gemini") && regional.texts?.[clip])) {
    try {
      current = new Audio(`/audio/${clipDir(lang, voice)}/${clip}.mp3`);
      await current.play();
      return;
    } catch {
      // Missing clip or autoplay blocked: the same text is always on screen.
      // Regional clip failed to load: try the device voice below.
      if (lang === "hi" || lang === "en") return;
    }
  }
  const text = regional?.texts?.[clip];
  const s = synth();
  if (!text || !s) return;
  const v = pickVoice(await voices(), lang);
  if (!v) return; // no voice for this language: text only
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  u.rate = 0.9;
  s.speak(u);
}

export function stopClip() {
  current?.pause();
  current = null;
  synth()?.cancel();
}
