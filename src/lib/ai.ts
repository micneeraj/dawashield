// Hybrid AI with Firebase AI Logic. AI only:
//   - turns what the user said into candidate medicine names,
//   - reads the text printed on a strip photo,
//   - explains an official record in simple words / answers follow-up questions.
// AI never decides a result colour and never writes a safety message.
import { getGenerativeModel, InferenceMode, type ChatSession } from "firebase/ai";
import { ai, CLOUD_MODEL } from "./firebase";
import { parseCandidates } from "./json";
import { parseLabel, validateLabel, type LabelReading } from "./label";
import { toSource } from "./source";
import { transliterate } from "./normalize";
import type { AlertRecord, Source } from "./types";

type Mode = (typeof InferenceMode)[keyof typeof InferenceMode];
const EN = [{ type: "text" as const, languages: ["en"] }];
const IMG = [...EN, { type: "image" as const }];

function model(mode: Mode, opts: { image?: boolean; system?: string; json?: boolean } = {}) {
  return getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      model: CLOUD_MODEL,
      systemInstruction: opts.system,
      generationConfig: { temperature: 0.2, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
    },
    onDeviceParams: {
      createOptions: { expectedInputs: opts.image ? IMG : EN, expectedOutputs: EN },
      promptOptions: undefined,
    },
  });
}

const fallbackFor = (mode: Mode): Source =>
  mode === InferenceMode.ONLY_IN_CLOUD || mode === InferenceMode.PREFER_IN_CLOUD ? "cloud" : "device";

export interface AiText<T> {
  value: T;
  source: Source;
  ms: number;
}

async function run<T>(mode: Mode, m: ReturnType<typeof model>, parts: Parameters<ReturnType<typeof model>["generateContent"]>[0], parse: (s: string) => T | null): Promise<AiText<T>> {
  const t0 = performance.now();
  const res = await m.generateContent(parts);
  const text = res.response.text();
  const value = parse(text);
  if (value === null) throw new Error("unreadable-model-output");
  return { value, source: toSource(res.response.inferenceSource, fallbackFor(mode)), ms: Math.round(performance.now() - t0) };
}

/** On-device first: transcript -> up to 4 candidate medicine names (English spelling). */
export async function candidatesFromSpeech(transcript: string): Promise<AiText<string[]>> {
  const latin = /[ऀ-ॿ]/.test(transcript) ? transliterate(transcript) : transcript;
  const prompt =
    `A person in India said this while holding a medicine (speech-to-text, may be Hindi, garbled or misspelt):\n` +
    `"${transcript}"\nRomanised: "${latin}"\n` +
    `Which medicine brand or generic names did they most likely mean? Use standard English spelling as printed on Indian strips. ` +
    `Ignore words about symptoms. Reply ONLY with JSON: {"candidates":["name1","name2"]} with at most 4 names, most likely first. ` +
    `If no medicine is mentioned reply {"candidates":[]}.`;
  const mode = InferenceMode.PREFER_ON_DEVICE;
  return run(mode, model(mode, { json: true }), prompt, parseCandidates);
}

async function filePart(file: Blob) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return { type: "inlineData" as const, inlineData: { data, mimeType: file.type || "image/jpeg" } };
}

export const LABEL_PROMPT =
  "This is a photo of an Indian medicine strip, bottle or box. Some text may be printed sideways (rotated 90 degrees) " +
  "along an edge; read it too. Copy printed text exactly. Never guess.\n" +
  "Rules:\n" +
  '- batch: ONLY the text right after "B.No", "B. No.", "Batch No", "Batch" or "Lot". ' +
  "NEVER use the Mfg. Lic. No. / licence number (e.g. JK/01/08-09/156), MRP, barcode, QR or any date.\n" +
  '- expiry: ONLY the date right after "EXP", "Exp. Date", "Expiry" or "Use before". NEVER the MFD / Mfg. date.\n' +
  '- mfd: the date after "MFD" / "Mfg. Date" (only used to cross-check; never put it in expiry).\n' +
  '- manufacturer: company after "Mfd. by" / "Manufactured by" / "Mkd. by".\n' +
  "For every field return the exact source text it came from (label + value as printed) and your confidence 0 to 1. " +
  "If a field is not clearly visible return null for it.\n" +
  'Reply ONLY with JSON: {"name":{"value":"","source":"","confidence":0},"manufacturer":{...},"batch":{...},"expiry":{...},"mfd":{...}}';

/** Cloud Gemini Flash first when online; on-device Nano when offline or if the cloud call fails.
 *  The returned reading has already passed the plain-code checks in validateLabel. */
export async function readStrip(file: Blob): Promise<AiText<LabelReading>> {
  const part = await filePart(file);
  const parse = (s: string) => {
    const r = parseLabel(s);
    return r ? validateLabel(r) : null;
  };
  if (navigator.onLine) {
    try {
      const mode = InferenceMode.ONLY_IN_CLOUD;
      return await run(mode, model(mode, { image: true, json: true }), [LABEL_PROMPT, part], parse);
    } catch {
      /* fall back to the on-device model below */
    }
  }
  const mode = InferenceMode.ONLY_ON_DEVICE;
  return run(mode, model(mode, { image: true, json: true }), [LABEL_PROMPT, part], parse);
}

const EXPLAIN_RULES =
  "You explain official Indian drug-regulator (CDSCO) quality alert records to elderly people. " +
  "Rules: explain ONLY what the record says, in very simple words, at most 3 short sentences. " +
  "Explain the failure reason in plain language (for example what 'dissolution' or 'assay' means). " +
  "Never say a medicine is safe or unsafe for the person. Never suggest another medicine, a dose, home remedies, " +
  "or any medical or first-aid advice. Never tell anyone to stop a medicine. If asked for advice, say a pharmacist or doctor should answer that.";

function recordText(r: AlertRecord) {
  return [
    `Type: ${r.type === "SPURIOUS" ? "Spurious (fake / not made by the stated company)" : "Not of Standard Quality (NSQ)"}`,
    `Medicine: ${r.name}${r.brand ? ` (brand ${r.brand})` : ""}`,
    `Batch: ${r.batch}`,
    `Manufacturer as stated: ${r.manufacturerName || r.manufacturer}`,
    `Failure reason: ${r.reason}`,
    r.remarks ? `Remarks: ${r.remarks}` : "",
    `Tested by: ${r.lab}`,
    `Alert month: ${r.month}`,
  ].filter(Boolean).join("\n");
}

/** Cloud when online; Nano single-turn short explanation offline (English only on device). */
export async function explainRecord(r: AlertRecord, lang: "hi" | "en"): Promise<AiText<string>> {
  const online = navigator.onLine;
  const mode = online ? InferenceMode.PREFER_IN_CLOUD : InferenceMode.ONLY_ON_DEVICE;
  const outLang = lang === "hi" && online ? "simple Hindi (Devanagari)" : "simple English";
  const prompt = `${online ? "" : EXPLAIN_RULES + "\n\n"}Explain this record in ${outLang}:\n${recordText(r)}`;
  return run(mode, model(mode, { system: EXPLAIN_RULES }), prompt, (s) => s.trim() || null);
}

/** Follow-up questions about the record (cloud only, multi-turn). */
export function startRecordChat(r: AlertRecord, lang: "hi" | "en"): ChatSession {
  const m = model(InferenceMode.ONLY_IN_CLOUD, {
    system: `${EXPLAIN_RULES} Answer in ${lang === "hi" ? "simple Hindi (Devanagari)" : "simple English"}. The record:\n${recordText(r)}`,
  });
  return m.startChat();
}

export async function askChat(chat: ChatSession, q: string): Promise<AiText<string>> {
  const t0 = performance.now();
  const res = await chat.sendMessage(q);
  return { value: res.response.text().trim(), source: toSource(res.response.inferenceSource, "cloud"), ms: Math.round(performance.now() - t0) };
}

/** On-device model availability, for the Settings screen. */
export async function nanoAvailability(image = false): Promise<string> {
  const LM = (self as unknown as { LanguageModel?: { availability(o: object): Promise<string> } }).LanguageModel;
  if (!LM) return "unavailable";
  try {
    return await LM.availability({ expectedInputs: image ? IMG : EN, expectedOutputs: EN });
  } catch {
    return "unavailable";
  }
}
