import { describe, expect, it } from "vitest";
import { extractSpokenBatch, medicinePhrase } from "../src/lib/spokenBatch";

describe("the medicine phrase is matched without the batch words", () => {
  it("keeps only the words before the batch keyword", () => {
    expect(medicinePhrase("Dolo batch 251TTF014")).toBe("Dolo");
    expect(medicinePhrase("सर दर्द की दवा है डोलो बैच 251TTF014")).toBe("सर दर्द की दवा है डोलो");
  });

  it("keeps the whole transcript when there is no keyword or it starts the utterance", () => {
    expect(medicinePhrase("Dolo 650")).toBe("Dolo 650");
    expect(medicinePhrase("batch 251TTF014")).toBe("batch 251TTF014");
  });
});

describe("spoken batch: Hindi, Punjabi and English", () => {
  it("English: 'batch 251TTF014' gives the candidate, flagged for the ambiguous digits", () => {
    const sb = extractSpokenBatch("Dolo batch 251TTF014");
    expect(sb.candidate).toBe("251TTF014");
    expect(sb.status).toBe("ambiguous");
    expect(sb.ambiguous.map((a) => a.char)).toEqual(["5", "1", "0", "1"]);
  });

  it("Hindi keyword बैच with spelled digits gives an exact batch (no flags)", () => {
    const sb = extractSpokenBatch("पैरासिटामोल बैच दो पाँच एक शून्य एक चार");
    expect(sb.candidate).toBe("251014");
    expect(sb.status).toBe("ok");
  });

  it("Punjabi keyword ਬੈਚ keeps the Gurmukhi transcript and reads the batch", () => {
    const sb = extractSpokenBatch("ਡੋਲੋ ਬੈਚ two five one T T F zero one four");
    expect(sb.transcript).toBe("ਡੋਲੋ ਬੈਚ two five one T T F zero one four");
    expect(sb.candidate).toBe("251TTF014");
    expect(sb.status).toBe("ok");
  });

  it("English with spelled digits and letters gives an exact batch", () => {
    const sb = extractSpokenBatch("batch two five one T T F zero one four");
    expect(sb.candidate).toBe("251TTF014");
    expect(sb.status).toBe("ok");
  });
});

describe("mixed-language speech and characters spoken one by one", () => {
  it("mixed digits and words with a short acronym", () => {
    const sb = extractSpokenBatch("dolo batch 2 5 1 TTF 0 1 4");
    expect(sb.candidate).toBe("251TTF014");
  });

  it("a Hindi sentence around an English batch code", () => {
    const sb = extractSpokenBatch("यह दवा है batch 251TTF014 है");
    expect(sb.candidate).toBe("251TTF014");
  });

  it("characters spoken one by one with B and I are flagged, not converted", () => {
    const sb = extractSpokenBatch("batch B I 4 5 6", true);
    expect(sb.candidate).toBe("BI456");
    expect(sb.status).toBe("ambiguous");
    expect(sb.ambiguous.map((a) => a.char)).toEqual(["B", "I", "5"]);
  });

  it("a plain English word after the batch ends it and is never added", () => {
    const sb = extractSpokenBatch("batch 251TTF014 expiry june");
    expect(sb.candidate).toBe("251TTF014");
  });

  it("a lowercase spoken word is never turned into batch letters: incomplete", () => {
    const sb = extractSpokenBatch("batch 251 tee tee ef");
    expect(sb.candidate).toBe("251");
    expect(sb.status).toBe("incomplete");
  });
});

describe("ambiguous characters and incomplete batch numbers", () => {
  it("O (letter) versus 0 (zero) is flagged, never silently chosen", () => {
    const sb = extractSpokenBatch("batch E166O26");
    expect(sb.candidate).toBe("E166O26");
    expect(sb.status).toBe("ambiguous");
    expect(sb.ambiguous.map((a) => a.char)).toEqual(["1", "O"]);
  });

  it("too short to be a batch is incomplete (manual entry)", () => {
    expect(extractSpokenBatch("batch 25").status).toBe("incomplete");
  });

  it("no digit at all is incomplete", () => {
    const sb = extractSpokenBatch("batch TTF");
    expect(sb.candidate).toBe("TTF");
    expect(sb.status).toBe("incomplete");
  });

  it("the keyword with nothing after it is incomplete", () => {
    expect(extractSpokenBatch("Dolo batch").status).toBe("incomplete");
    expect(extractSpokenBatch("batch number is").status).toBe("incomplete");
  });

  it("a keyword in the middle of a word is not a batch keyword", () => {
    expect(extractSpokenBatch("batchwise thing").status).toBe("none");
  });

  it("the whole utterance is the batch when the app asks for one (no keyword)", () => {
    const sb = extractSpokenBatch("251TTF014", false);
    expect(sb.candidate).toBe("251TTF014");
    expect(sb.status).toBe("ambiguous");
  });
});

describe("speech with only a medicine name (no batch)", () => {
  it("no batch keyword gives none, so the app asks for the batch as before", () => {
    const sb = extractSpokenBatch("Dolo 650");
    expect(sb.status).toBe("none");
    expect(sb.candidate).toBe("");
  });

  it("an empty transcript gives none", () => {
    expect(extractSpokenBatch("   ").status).toBe("none");
  });
});

describe("the transcript is always kept as heard", () => {
  it("returns the exact speech text, untouched", () => {
    const text = "Dolo batch 251TTF014";
    expect(extractSpokenBatch(text).transcript).toBe(text);
  });
});
