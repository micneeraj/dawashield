// Spoken replies come ONLY from pre-recorded clips (public/audio/*). Browser
// speech output is never used: it read Hindi in an American English voice.
import type { Lang } from "../content/messages";

let current: HTMLAudioElement | null = null;

export function clipDir(lang: Lang, voice: "female" | "male"): string {
  if (lang === "en") return "en";
  return voice === "male" ? "hi-m" : "hi";
}

export async function playClip(clip: string, lang: Lang, voice: "female" | "male", muted: boolean): Promise<void> {
  if (muted) return;
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
