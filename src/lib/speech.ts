// Speech to text with the browser Web Speech API (hi-IN / en-IN). With the
// language pack installed Chrome recognises on the device, so it works offline.

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SRCtor = { new (): SR; available?: (o: object) => Promise<string> };

const Ctor = (self as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ||
  (self as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition;

export const speechSupported = !!Ctor;

export interface Listener {
  stop(): void;
}

export async function listen(
  lang: "hi" | "en",
  onText: (text: string, final: boolean) => void,
  onEnd: (finalText: string, error?: string) => void,
): Promise<Listener | null> {
  if (!Ctor) {
    onEnd("", "unsupported");
    return null;
  }
  const code = lang === "hi" ? "hi-IN" : "en-IN";
  const rec = new Ctor();
  rec.lang = code;
  rec.interimResults = true;
  rec.continuous = false;
  // Prefer on-device recognition when the language pack is present.
  if ("processLocally" in rec && typeof Ctor.available === "function") {
    try {
      const st = await Ctor.available({ langs: [code], processLocally: true });
      if (st === "available") rec.processLocally = true;
    } catch {
      /* use default */
    }
  }
  let text = "";
  let err: string | undefined;
  rec.onresult = (e) => {
    let t = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      t += e.results[i][0].transcript;
      final = e.results[i].isFinal;
    }
    text = t;
    onText(t, final);
  };
  rec.onerror = (e) => {
    err = e.error;
  };
  rec.onend = () => onEnd(text.trim(), text ? undefined : err || "no-speech");
  try {
    rec.start();
  } catch {
    onEnd("", "start-failed");
    return null;
  }
  return { stop: () => rec.stop() };
}
