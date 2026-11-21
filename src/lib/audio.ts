// Spoken replies come ONLY from pre-recorded clips (public/audio/*). Browser
// speech output is never used: it read Hindi in an American English voice.
//   hi / en: recorded clips, precached, work offline.
//   pa / gu / mr / kn / ta: Sarvam clips made at build time from the reviewed
//   translation, fetched only when needed and only online (never precached).
import type { AppLang } from "./i18n";

let current: HTMLAudioElement | null = null;

export function clipDir(lang: AppLang, _voice?: "female" | "male"): string {
  return lang;
}

export async function playClip(clip: string, lang: AppLang, voice: "female" | "male", muted: boolean, regionalClips?: Record<string, string>): Promise<void> {
  if (muted) return;
  // A regional clip is played only if its reviewed translation exists; otherwise the text is on screen.
  if (lang !== "hi" && lang !== "en" && !regionalClips?.[clip]) return;
  try {
    current?.pause();
    current = new Audio(`/audio/${clipDir(lang, voice)}/${clip}.mp3`);
    await current.play();
  } catch {
    // Missing clip or autoplay blocked: the same text is always on screen.
  }
}

export function stopClip() {
  current?.pause();
  current = null;
}
