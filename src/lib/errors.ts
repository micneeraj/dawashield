// Maps raw mic / camera / network / parsing failures to one pre-written message
// key and the recovery actions to offer. Plain code; messages live in messages.ts.
export type ErrorKey = "micDenied" | "micNoSpeech" | "micNetwork" | "micUnavailable" | "cameraDenied" | "network" | "photoUnreadable" | "closerPhoto" | "aiUnavailable" | "timeout";
export type Recovery = "retry" | "type" | "closer" | "gallery";

export function speechErrorKey(code?: string): ErrorKey {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed": return "micDenied";
    case "network": return "micNetwork";
    case "audio-capture":
    case "unsupported":
    case "start-failed": return "micUnavailable";
    default: return "micNoSpeech";
  }
}

export function photoErrorKey(e: unknown, online = typeof navigator === "undefined" ? true : navigator.onLine): ErrorKey {
  const m = String((e as Error)?.message ?? e ?? "").toLowerCase();
  if (m.includes("closer-photo")) return "closerPhoto";
  if (m.includes("timeout")) return "timeout";
  if (m.includes("unreadable") || m.includes("json") || m.includes("parse")) return "photoUnreadable";
  if (!online || m.includes("fetch") || m.includes("network") || m.includes("failed to")) return "network";
  if (m.includes("notallowed") || m.includes("permission")) return "cameraDenied";
  return "photoUnreadable";
}

export const RECOVERY: Record<ErrorKey, Recovery[]> = {
  micDenied: ["type", "retry"],
  micNoSpeech: ["retry", "type"],
  micNetwork: ["type", "retry"],
  micUnavailable: ["type"],
  cameraDenied: ["gallery", "type"],
  network: ["retry", "type"],
  photoUnreadable: ["closer", "type"],
  closerPhoto: ["closer", "type"],
  aiUnavailable: ["retry", "type"],
  timeout: ["retry", "type"],
};
