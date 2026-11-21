// Record a short spoken medicine name with MediaRecorder, for phones whose browser
// has no speech recognition for the language (iPhone Safari for pa/gu/mr/kn/ta,
// and Hindi/English when Web Speech is missing or fails). The clip is sent to
// Gemini Flash only to be transcribed (see ai.ts transcribeAudio).

/** Hard limits: a medicine name is a few seconds. */
export const MAX_RECORD_MS = 8000;
export const MAX_RECORD_BYTES = 1_500_000;

// iOS Safari records audio/mp4 (AAC); Chrome/Firefox record webm/ogg opus.
const PREFERRED = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/ogg;codecs=opus", "audio/ogg"];

/** Pure: first MIME type this recorder supports, or "" to let the browser choose. */
export function pickMime(isSupported: (t: string) => boolean): string {
  return PREFERRED.find((t) => { try { return isSupported(t); } catch { return false; } }) ?? "";
}

/** Pure: the base MIME type Gemini accepts for an inline audio part. */
export function geminiAudioMime(type: string): string {
  const base = (type || "").split(";")[0].trim().toLowerCase();
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  return base || "audio/mp4";
}

export const recordingSupported = (): boolean =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

export type RecordError = "unsupported" | "not-allowed" | "audio-capture" | "no-speech" | "too-large";

export interface Recording {
  /** Stop early; the clip so far is delivered to onDone. */
  stop(): void;
  /** Stop and discard. */
  cancel(): void;
}

export async function record(onDone: (clip: Blob | null, error?: RecordError) => void, maxMs = MAX_RECORD_MS): Promise<Recording | null> {
  if (!recordingSupported()) { onDone(null, "unsupported"); return null; }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  } catch (e) {
    const n = (e as DOMException)?.name;
    onDone(null, n === "NotAllowedError" || n === "SecurityError" ? "not-allowed" : "audio-capture");
    return null;
  }
  const mimeType = pickMime((t) => MediaRecorder.isTypeSupported(t));
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    onDone(null, "unsupported");
    return null;
  }
  const chunks: Blob[] = [];
  let cancelled = false;
  let finished = false;
  const timer = setTimeout(() => stop(), maxMs);
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    if (finished) return;
    finished = true;
    if (cancelled) { onDone(null); return; }
    const clip = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/mp4" });
    if (clip.size < 800) onDone(null, "no-speech");
    else if (clip.size > MAX_RECORD_BYTES) onDone(null, "too-large");
    else onDone(clip);
  };
  function stop() { if (rec.state !== "inactive") rec.stop(); }
  rec.start(250);
  return { stop, cancel: () => { cancelled = true; stop(); } };
}
