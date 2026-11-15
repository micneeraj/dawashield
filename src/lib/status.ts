// Header status pill. Driven only by real state: navigator.onLine and the
// inferenceSource the Firebase AI SDK reported for the last AI answer.
import type { Source } from "./types";

export type StatusKind = "device" | "cloud" | "ready";

export function statusKind(online: boolean, lastAi: Source | null): StatusKind {
  if (!online || lastAi === "device") return "device";
  if (lastAi === "cloud") return "cloud";
  return "ready";
}

export const STATUS_LABEL: Record<StatusKind, { hi: string; en: string }> = {
  device: { hi: "ऑफ़लाइन तैयार · इसी फ़ोन पर", en: "Offline ready · On this device" },
  cloud: { hi: "क्लाउड AI", en: "Cloud AI" },
  ready: { hi: "ऑफ़लाइन तैयार", en: "Offline ready" },
};

/** Never a bare "unavailable": say what is needed and what is used instead. */
export function nanoText(text: string, image: string, lang: "hi" | "en"): string {
  if (text === "…") return "…";
  const ok = (s: string) => s === "available";
  const dl = (s: string) => s === "downloadable" || s === "downloading";
  if (ok(text)) {
    return lang === "hi"
      ? `Gemini Nano इस डिवाइस पर तैयार है${ok(image) ? " (लिखावट और फ़ोटो दोनों)" : " (लिखावट)"}। बिना इंटरनेट भी AI चलता है।`
      : `Gemini Nano is ready on this device${ok(image) ? " (text and photos)" : " (text)"}. AI works even offline.`;
  }
  if (dl(text)) {
    return lang === "hi" ? "Gemini Nano डाउनलोड हो रहा है। तब तक क्लाउड AI इस्तेमाल हो रहा है।" : "Gemini Nano is downloading. Using cloud AI for now.";
  }
  return lang === "hi"
    ? "फ़ोन पर AI के लिए Gemini Nano वाला डेस्कटॉप Chrome चाहिए। अभी क्लाउड AI इस्तेमाल हो रहा है।"
    : "On-device AI needs desktop Chrome with Gemini Nano. Using cloud AI for now.";
}

