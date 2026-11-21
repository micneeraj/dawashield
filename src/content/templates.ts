// Pre-written explanations for every result type, in Hindi and English,
// filled only with fields from the official record and what the user entered.
// These work fully offline on any phone: no AI, no Gemini Nano (Nano cannot
// write Hindi). Medicine names are shown on screen, never spoken.
import type { AlertRecord, MatchResult } from "../lib/types";
import type { Lang } from "./messages";
import { monthLabel } from "../lib/format";

export type TemplateKind = "red" | "amber-company" | "amber-possible" | "grey" | "grey-company" | "expired" | "uncertain";

export interface TemplateInput {
  name?: string;
  batch?: string;
  manufacturer?: string;
  expiry?: string;
}

/** Which template fits this result. Expired / uncertain are extra notes, added by explain(). */
export function templateKind(result: MatchResult): TemplateKind {
  if (result.level === "RED") return "red";
  if (result.level === "AMBER") return result.reason === "other-batches" ? "amber-company" : "amber-possible";
  if (result.reason === "company-other-medicine" || result.reason === "company-batch-unlisted") return "grey-company";
  return "grey";
}

const typeWord = (r: AlertRecord, lang: Lang) =>
  r.type === "SPURIOUS"
    ? lang === "hi" ? "नकली (स्प्यूरियस) होने का शक" : "suspected spurious (fake)"
    : lang === "hi" ? "मानक गुणवत्ता से कम (NSQ)" : "not of standard quality (NSQ)";

const company = (r: AlertRecord) => r.manufacturerName || r.manufacturer || "";

/** Paragraphs for one template. Every sentence is fixed text plus record fields. */
export function fillTemplate(kind: TemplateKind, lang: Lang, r: AlertRecord | undefined, input: TemplateInput): string[] {
  const hi = lang === "hi";
  const batch = input.batch || r?.batch || "";
  const month = r ? monthLabel(r.month, lang) : "";
  switch (kind) {
    case "red":
      if (!r) return [];
      return hi
        ? [
            `CDSCO की ${month} की सूची में बैच ${r.batch} को ${typeWord(r, lang)} बताया गया है।`,
            `यह जाँच ${r.lab || "सरकारी लैब"} ने की थी। कमी: ${r.reason || "सूची में लिखी नहीं"}।`,
            company(r) ? `सूची में कंपनी का नाम: ${company(r)}।` : "",
            "इसका मतलब यह है कि सरकारी जाँच में यही बैच किसी मानक पर खरा नहीं उतरा। दूसरी दवाओं या दूसरे बैचों पर यह चेतावनी लागू नहीं होती।",
            r.type === "SPURIOUS"
              ? "पत्ता और बिल संभालकर रखें। इसे इस्तेमाल न करें। केमिस्ट और CDSCO को इसकी शिकायत करें।"
              : "अगली खुराक से पहले अपने डॉक्टर या केमिस्ट से बात कीजिए। ज़रूरी दवा अपने-आप बंद न करें। पत्ता और बिल संभालकर रखें।",
          ].filter(Boolean)
        : [
            `CDSCO's list for ${month} names batch ${r.batch} as ${typeWord(r, lang)}.`,
            `It was tested by ${r.lab || "a government lab"}. Problem found: ${r.reason || "not stated in the list"}.`,
            company(r) ? `Company named in the list: ${company(r)}.` : "",
            "This means this exact batch failed a government test. The alert does not apply to other medicines or other batches.",
            r.type === "SPURIOUS"
              ? "Keep the strip and the bill. Don't use it. Report it to the chemist and CDSCO."
              : "Talk to your doctor or chemist before your next dose. Don't stop an essential medicine on your own. Keep the strip and the bill.",
          ].filter(Boolean);
    case "amber-company":
      if (!r) return [];
      return hi
        ? [
            `${company(r)} की इसी दवा के कुछ खास बैच CDSCO की सूची में हैं (जैसे ${month} में बैच ${r.batch})।`,
            batch ? `आपका बैच ${batch} उस सूची में नहीं है।` : "आपने बैच नंबर नहीं डाला।",
            "चेतावनी सिर्फ़ सूची में लिखे बैचों पर है, इस कंपनी के सभी बैचों पर नहीं। पक्का करने के लिए पत्ते पर बैच नंबर मिलाइए और केमिस्ट से पूछिए।",
          ]
        : [
            `Some specific batches of this medicine from ${company(r)} are on CDSCO's list (for example batch ${r.batch} in ${month}).`,
            batch ? `Your batch ${batch} is not on that list.` : "You did not enter a batch number.",
            "The alert covers only the listed batches, not every batch from this company. Check the batch number on the strip and ask your chemist to be sure.",
          ];
    case "amber-possible":
      if (!r) return [];
      return hi
        ? [
            `आपकी दवा CDSCO की ${month} की सूची के बैच ${r.batch} (${r.name}) से मिलती-जुलती है, पर पूरी तरह नहीं।`,
            "हो सकता है बैच नंबर पढ़ने या लिखने में एक अक्षर का फ़र्क हो, या कंपनी का नाम अलग तरह से लिखा हो।",
            "पत्ते पर बैच नंबर और कंपनी का नाम दोबारा ध्यान से मिलाइए। केमिस्ट से जाँच करवाइए। तब तक इसे 'सुरक्षित' न मानें और न ही 'खराब'।",
          ]
        : [
            `Your medicine looks similar to batch ${r.batch} (${r.name}) on CDSCO's ${month} list, but not exactly.`,
            "The batch number may differ by one character from a reading or typing slip, or the company name may be written differently.",
            "Check the batch number and company name on the strip carefully, and ask your chemist. Until then treat it as neither 'safe' nor 'bad'.",
          ];
    case "grey":
      return hi
        ? [
            batch ? `बैच ${batch} हमारी सरकारी सूची में नहीं मिला।` : "यह दवा हमारी सरकारी सूची में नहीं मिली।",
            "इससे यह साबित नहीं होता कि दवा सुरक्षित है। सरकारी चेतावनियाँ देर से आ सकती हैं, और हर दवा की जाँच नहीं होती। नकली दवाएँ असली बैच नंबर छाप सकती हैं।",
            "दवा पेटी में सहेजिए। नई सूची में यह बैच आया तो हम अपने-आप बताएँगे।",
          ]
        : [
            batch ? `Batch ${batch} was not found in our official list.` : "This medicine was not found in our official list.",
            "This does not prove the medicine is safe. Official alerts can be delayed, and not every medicine is tested. Counterfeits can copy real batch numbers.",
            "Save it to your cabinet. If a new list includes this batch, we will tell you automatically.",
          ];
    case "grey-company":
      return hi
        ? [
            batch ? `बैच ${batch} हमारी सरकारी सूची में नहीं मिला।` : "आपका बैच हमारी सरकारी सूची में नहीं मिला।",
            r ? `इस कंपनी की सूची वाली चेतावनी दूसरी दवा (${r.brand || r.name}) के खास बैच पर है। चेतावनी सिर्फ़ उसी बैच पर लागू होती है।` : "",
            "इससे यह साबित नहीं होता कि आपकी दवा सुरक्षित है। सरकारी चेतावनियाँ देर से आ सकती हैं।",
          ].filter(Boolean)
        : [
            batch ? `Batch ${batch} was not found in our official list.` : "Your batch was not found in our official list.",
            r ? `This company's listed alert is for a different medicine (${r.brand || r.name}), and only for that specific batch.` : "",
            "This does not prove your medicine is safe. Official alerts can be delayed.",
          ].filter(Boolean);
    case "expired":
      return hi
        ? [`पत्ते पर लिखी समाप्ति तिथि (${input.expiry}) निकल चुकी है। इसे न लें, केमिस्ट को दिखाइए।`]
        : [`The expiry date on the strip (${input.expiry}) has passed. Don't take it; show it to your chemist.`];
    case "uncertain":
      return hi
        ? ["फ़ोटो से पढ़ा गया बैच नंबर या तारीख़ पक्का नहीं था। ऊपर पीले रंग वाले खाने पत्ते से मिलाकर ठीक कीजिए, फिर दोबारा जाँचिए।"]
        : ["The batch number or date read from the photo was not certain. Check the fields marked in amber against the strip, correct them, and check again."];
  }
}

/** Full offline explanation for a result: main template plus expiry / uncertainty notes. */
export function explain(result: MatchResult, input: TemplateInput, lang: Lang, opts: { expired?: boolean; uncertain?: boolean } = {}): string[] {
  const out = fillTemplate(templateKind(result), lang, result.records[0], input);
  if (opts.expired) out.push(...fillTemplate("expired", lang, undefined, input));
  if (opts.uncertain) out.push(...fillTemplate("uncertain", lang, undefined, input));
  return out;
}
