// Regional languages (online only) and Indic script helpers.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, isRegional, LANG_NAMES, REGIONAL, translateText } from "../src/lib/i18n";
import { devanagariTo, indicToDevanagari, scriptOf, transliterateName } from "../src/lib/indic";
import { transliterate } from "../src/lib/normalize";
import { buildDictionary, matchSpoken } from "../src/lib/phonetic";
import { COMMON_300, COMMON_MEDICINES } from "../src/content/common-medicines";
import { collectStrings, looksLikeUi, toPattern } from "../scripts/i18n-strings";
import { pickVoice } from "../src/lib/audio";

describe("screen translation lookup", () => {
  const c = compile({
    lang: "pa",
    exact: { "No official alert for this exact batch": "ਇਸ ਬੈਚ ਲਈ ਕੋਈ ਅਧਿਕਾਰਤ ਚੇਤਾਵਨੀ ਨਹੀਂ" },
    patterns: [["Batch {0} was not found in our official list.", "ਸਾਡੀ ਅਧਿਕਾਰਤ ਸੂਚੀ ਵਿੱਚ ਬੈਚ {0} ਨਹੀਂ ਮਿਲਿਆ।"]],
  });
  it("exact match, keeping surrounding spaces", () => {
    expect(translateText("  No official alert for this exact batch ", c)).toBe("  ਇਸ ਬੈਚ ਲਈ ਕੋਈ ਅਧਿਕਾਰਤ ਚੇਤਾਵਨੀ ਨਹੀਂ ");
  });
  it("pattern keeps the batch number untranslated", () => {
    expect(translateText("Batch DOBS4518 was not found in our official list.", c)).toBe("ਸਾਡੀ ਅਧਿਕਾਰਤ ਸੂਚੀ ਵਿੱਚ ਬੈਚ DOBS4518 ਨਹੀਂ ਮਿਲਿਆ।");
  });
  it("unknown text, numbers and medicine names are left alone", () => {
    expect(translateText("Dolo 650", c)).toBe("Dolo 650");
    expect(translateText("4,158", c)).toBe("4,158");
    expect(translateText("anything", null)).toBe("anything");
  });
});

describe("languages", () => {
  it("5 regional languages, each named in its own script", () => {
    expect(REGIONAL).toEqual(["pa", "gu", "mr", "kn", "ta"]);
    expect(LANG_NAMES.pa.native).toBe("ਪੰਜਾਬੀ");
    expect(LANG_NAMES.ta.bcp).toBe("ta-IN");
    expect(isRegional("hi")).toBe(false);
    expect(isRegional("kn")).toBe(true);
  });
  it("regional files are never part of the offline download", () => {
    const cfg = readFileSync("vite.config.ts", "utf8");
    for (const g of ["i18n/**", "audio/pa/**", "audio/gu/**", "audio/mr/**", "audio/kn/**", "audio/ta/**"]) expect(cfg).toContain(`"${g}"`);
  });
  it("the Sarvam key is never in browser code", () => {
    for (const f of ["src/lib/i18n.ts", "src/state.tsx", "src/lib/audio.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/SARVAM_API_KEY|api-subscription-key|apiSubscriptionKey|from "sarvamai"/);
  });
  it("a published translation keeps every placeholder", () => {
    for (const l of REGIONAL) {
      const f = `public/i18n/${l}.json`;
      if (!existsSync(f)) continue;
      const d = JSON.parse(readFileSync(f, "utf8")) as { patterns: [string, string][] };
      for (const [en, tr] of d.patterns) for (const p of en.match(/\{\d+\}/g) ?? []) expect(tr).toContain(p);
    }
  });
});

describe("Indic scripts", () => {
  it("detects the script", () => {
    expect(scriptOf("ਡੋਲੋ")).toBe("pa");
    expect(scriptOf("ડોલો")).toBe("gu");
    expect(scriptOf("டோலோ")).toBe("ta");
    expect(scriptOf("ಡೋಲೋ")).toBe("kn");
    expect(scriptOf("डोलो")).toBeNull();
  });
  it("reads Gurmukhi addak and tippi", () => {
    expect(transliterate(indicToDevanagari("ਗੋਲੀ"))).toBe("goli");
    expect(indicToDevanagari("ਪੱਕਾ")).toBe("पक्का");
  });
  it("transliterates a medicine name for display", () => {
    expect(transliterateName("Dolo", "gu")).toBe("ડોલો");
    expect(transliterateName("Dolo", "kn")).toBe("ಡೋಲೋ");
    expect(transliterateName("Dolo", "ta")).toBe("டோலோ");
    expect(devanagariTo("बी", "ta")).toBe("பீ"); // Tamil has no separate b
  });
});

describe("regional speech -> medicine name (offline matcher)", () => {
  const dict = buildDictionary([], [...COMMON_MEDICINES, ...COMMON_300]);
  it.each([
    ["ਪੈਰਾਸੀਟਾਮੋਲ ਦੀ ਗੋਲੀ", "Paracetamol"],
    ["ડોલો 650", "Dolo 650"],
    ["पॅन्टोप्राझोल", "Pantoprazole"],
    ["ಅಜಿಥ್ರೋಮೈಸಿನ್", "Azithromycin"],
    ["டோலோ", "Dolo 650"],
    ["பாராசிட்டமால்", "Paracetamol"],
  ])("%s -> %s in top 3", (heard, want) => {
    expect(matchSpoken(heard, dict, 3).map((m) => m.entry.name)).toContain(want);
  });
});

describe("string extraction for build-time translation", () => {
  it("keeps UI text, drops code", () => {
    expect(looksLikeUi("No official alert for this exact batch")).toBe(true);
    expect(looksLikeUi("rounded-2xl bg-white px-4")).toBe(false);
    expect(looksLikeUi("result-word")).toBe(false);
    expect(looksLikeUi("alertMonth")).toBe(false);
    expect(looksLikeUi("जाँच")).toBe(false);
  });
  it("template literals become placeholders", () => {
    expect(toPattern("Batch ${batch} was not found")).toBe("Batch {0} was not found");
    expect(toPattern("${a} and ${f(b, { x: 1 })}")).toBe("{0} and {1}");
  });
  it("collects the new Part A result strings and no medicine names", () => {
    const all = collectStrings().map((s) => s.text);
    expect(all).toContain("No official alert for this exact batch");
    expect(all).toContain("Keep the strip and the bill. Don't use it. Report it to the chemist and CDSCO.");
    expect(all).toContain("What should I do?");
    expect(all).not.toContain("Crocin");
    const safety = collectStrings().filter((s) => s.safety).map((s) => s.text);
    expect(safety).toContain("An official alert matches this exact batch.");
  });
});

describe("regional browser voice", () => {
  const list = [{ lang: "en-US" }, { lang: "hi-IN" }, { lang: "ta-IN", localService: true }, { lang: "kn_IN" }, { lang: "pa" }];
  it("picks only a voice for that exact language", () => {
    expect(pickVoice(list, "ta-IN")?.lang).toBe("ta-IN");
    expect(pickVoice(list, "kn")?.lang).toBe("kn_IN");
    expect(pickVoice(list, "pa")?.lang).toBe("pa");
  });
  it("never falls back to another language's voice", () => {
    expect(pickVoice(list, "gu")).toBeNull();
    expect(pickVoice([{ lang: "hi-IN" }, { lang: "en-IN" }], "mr")).toBeNull();
  });
  it("all 5 languages are published with every safety string and a voice mode", () => {
    const m = JSON.parse(readFileSync("public/i18n/index.json", "utf8")) as { langs: Record<string, { available: boolean; voice: string }> };
    for (const l of REGIONAL) {
      expect(m.langs[l].available).toBe(true);
      expect(["browser", "sarvam"]).toContain(m.langs[l].voice);
    }
    const sum = JSON.parse(readFileSync("i18n/review/SUMMARY.json", "utf8")) as Record<string, { flagged: string[] }>;
    for (const l of REGIONAL) expect(sum[l].flagged).toEqual([]);
  });
});
