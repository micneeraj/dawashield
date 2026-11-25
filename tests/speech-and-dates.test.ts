import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/firebase", () => ({ ai: {}, CLOUD_MODEL: "x", TRANSCRIBE_MODEL: "y" }));
const { transcribePrompt } = await import("../src/lib/ai");
const { LANG_NAMES } = await import("../src/lib/i18n");
const { monthLabel, dateLabel, setDisplayLocale, looksLikeWords } = await import("../src/lib/format");

const ALL = ["hi", "en", "pa", "gu", "mr", "kn", "ta"] as const;

describe("speech language codes", () => {
  it("each language uses its own recognition code", () => {
    expect(ALL.map((l) => LANG_NAMES[l].bcp)).toEqual(["hi-IN", "en-IN", "pa-IN", "gu-IN", "mr-IN", "kn-IN", "ta-IN"]);
  });
});

describe("transcription prompt names the right script", () => {
  it("Punjabi is asked for in Gurmukhi and told never to use Devanagari", () => {
    const p = transcribePrompt("pa");
    expect(p).toContain("Gurmukhi");
    expect(p).toContain("Never write Punjabi in Devanagari");
  });

  it("every language names its own script", () => {
    expect(transcribePrompt("gu")).toContain("Gujarati script");
    expect(transcribePrompt("kn")).toContain("Kannada script");
    expect(transcribePrompt("ta")).toContain("Tamil script");
    expect(transcribePrompt("hi")).toContain("Devanagari script");
  });
});

describe("month and date names are words in all seven languages", () => {
  afterEach(() => { setDisplayLocale(null); vi.restoreAllMocks(); });

  it("the real locale output has a month name (letters) and no numeric pattern, for each language", () => {
    const locales: Record<string, string> = { hi: "hi-IN", en: "en-IN", pa: "pa-IN", gu: "gu-IN", mr: "mr-IN", kn: "kn-IN", ta: "ta-IN" };
    for (const [code, loc] of Object.entries(locales)) {
      setDisplayLocale(loc);
      const out = monthLabel("2026-09", code === "hi" ? "hi" : "en");
      expect(out, code).toMatch(/\p{L}/u);
      expect(out, code).not.toMatch(/M\d/);
      expect(looksLikeWords(out), code).toBe(true);
    }
  });

  it("the Punjabi '2026 M09' bug: a locale that prints a numeric pattern falls back to English", () => {
    const original = Date.prototype.toLocaleDateString;
    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (this: Date, ...args: unknown[]) {
      if (args[0] === "pa-IN") return "2026 M09";
      return (original as (...a: unknown[]) => string).apply(this, args);
    });
    setDisplayLocale("pa-IN");
    expect(monthLabel("2026-09", "en")).toBe("September 2026");
    expect(dateLabel("2026-09-01T00:00:00Z", "en")).not.toMatch(/M\d/);
  });

  it("a real month name is kept as is (Punjabi with proper Gurmukhi data)", () => {
    setDisplayLocale("pa-IN");
    expect(monthLabel("2026-09", "en")).toBe("ਸਤੰਬਰ 2026");
  });

  it("looksLikeWords rejects numeric patterns and accepts month words", () => {
    expect(looksLikeWords("2026 M09")).toBe(false);
    expect(looksLikeWords("12/09/2026")).toBe(false);
    expect(looksLikeWords("September 2026")).toBe(true);
    expect(looksLikeWords("ਸਤੰਬਰ 2026")).toBe(true);
  });
});
