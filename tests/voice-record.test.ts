import { describe, expect, it } from "vitest";
import { geminiAudioMime, pickMime } from "../src/lib/recorder";
import { browserFailed } from "../src/lib/speech";
import { speechErrorKey } from "../src/lib/errors";

describe("recording path", () => {
  it("picks webm on Chrome and mp4 on iOS Safari", () => {
    expect(pickMime((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickMime((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickMime(() => false)).toBe("");
    expect(pickMime(() => { throw new Error("x"); })).toBe("");
  });
  it("sends a base MIME type Gemini accepts", () => {
    expect(geminiAudioMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(geminiAudioMime("audio/mp4")).toBe("audio/mp4");
    expect(geminiAudioMime("audio/x-m4a")).toBe("audio/mp4");
    expect(geminiAudioMime("")).toBe("audio/mp4");
  });
  it("switches to recording only when browser recognition can't work", () => {
    for (const e of ["unsupported", "start-failed", "service-not-allowed", "network", "language-not-supported"]) expect(browserFailed(e)).toBe(true);
    for (const e of ["not-allowed", "no-speech", "aborted"]) expect(browserFailed(e)).toBe(false);
  });
  it("maps recorder errors to existing messages", () => {
    expect(speechErrorKey("not-allowed")).toBe("micDenied");
    expect(speechErrorKey("audio-capture")).toBe("micUnavailable");
    expect(speechErrorKey("too-large")).toBe("micNoSpeech");
  });
});
