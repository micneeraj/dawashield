// Hybrid AI with Firebase AI Logic. AI only:
//   - turns what the user said into candidate medicine names,
//   - reads the text printed on a strip photo,
//   - explains an official record in simple words / answers follow-up questions.
// AI never decides a result colour and never writes a safety message.
import { getGenerativeModel, InferenceMode, type ChatSession } from "firebase/ai";
import { ai, CLOUD_MODEL, TRANSCRIBE_MODEL } from "./firebase";
import { parseCandidates } from "./json";
import { compareReads, mergeLabels, needsCheck, needsCloserPhoto, parseStripRead, preferCrop, type LabelReading, type StripRead } from "./label";
import { isSmallBox, preparePhoto } from "./image";
import { toSource } from "./source";
import { transliterate } from "./normalize";
import { geminiAudioMime } from "./recorder";
import { afterCloudFailure, nanoStatusFrom, photoRoute } from "./photoRoute";
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

/** One AI call as it actually ran: what it did, where (SDK inferenceSource) and how long. */
export interface AiStep {
  task: "speech" | "transcribe" | "photo-full" | "photo-crop" | "photo-enhanced" | "explain" | "chat";
  source: Source;
  ms: number;
}
let trace: AiStep[] = [];
/** Start collecting AI calls for one user action. */
export function traceStart(): void { trace = []; }
/** The AI calls made since traceStart(). */
export function traceTake(): AiStep[] { const t = trace; trace = []; return t; }

export interface AiText<T> {
  value: T;
  source: Source;
  ms: number;
}

async function run<T>(mode: Mode, m: ReturnType<typeof model>, parts: Parameters<ReturnType<typeof model>["generateContent"]>[0], parse: (s: string) => T | null, task: AiStep["task"] = "speech"): Promise<AiText<T>> {
  const t0 = performance.now();
  const res = await m.generateContent(parts);
  const source = toSource(res.response.inferenceSource, fallbackFor(mode));
  const ms = Math.round(performance.now() - t0);
  trace.push({ task, source, ms });
  const text = res.response.text();
  const value = parse(text);
  if (value === null) throw new Error("unreadable-model-output");
  return { value, source, ms };
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

const SPEECH_LANG: Record<string, string> = { hi: "Hindi", en: "English (Indian)", pa: "Punjabi", gu: "Gujarati", mr: "Marathi", kn: "Kannada", ta: "Tamil" };

/** The script each language must be written in. Punjabi is Gurmukhi, never Devanagari. */
const SPEECH_SCRIPT: Record<string, string> = {
  hi: "Devanagari", en: "Latin", pa: "Gurmukhi", gu: "Gujarati", mr: "Devanagari", kn: "Kannada", ta: "Tamil",
};

/** Pure: the transcription-only prompt. The model never picks a medicine or a result. */
export function transcribePrompt(lang: string): string {
  const name = SPEECH_LANG[lang] ?? "the spoken language";
  const script = SPEECH_SCRIPT[lang] ?? "its native";
  const never = lang === "pa" ? " Never write Punjabi in Devanagari." : "";
  return (
    `Transcribe this short audio clip exactly as spoken. The speaker is in India and is most likely saying a medicine name, ` +
    `possibly with a few ${name} words around it. Write ${name} words in ${script} script.${never} Write medicine brand or generic ` +
    `names as they sound (Latin or native script, whichever fits). Do not translate, correct, explain or add anything. ` +
    `Reply with only the transcript text. If there is no speech, reply with nothing.`
  );
}

/** Cloud Gemini Flash (App Check protected): recorded speech -> plain transcript in that language.
 *  The transcript then goes through the same deterministic matcher as browser speech. */
export async function transcribeAudio(clip: Blob, lang: string): Promise<AiText<string>> {
  const t0 = performance.now();
  const part = await filePart(clip, geminiAudioMime(clip.type));
  const ask = (model: string) => getGenerativeModel(ai, { model, generationConfig: { temperature: 0 } }).generateContent([transcribePrompt(lang), part]);
  // Flash-Lite: plain transcription needs no reasoning and answers in ~2 s; Flash if it fails.
  let res;
  try { res = await ask(TRANSCRIBE_MODEL); } catch { res = await ask(CLOUD_MODEL); }
  const ms = Math.round(performance.now() - t0);
  trace.push({ task: "transcribe", source: "cloud", ms });
  return { value: res.response.text().replace(/^["“”']+|["“”']+$/g, "").trim(), source: "cloud", ms };
}

async function filePart(file: Blob, mimeType?: string) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return { type: "inlineData" as const, inlineData: { data, mimeType: mimeType || file.type || "image/jpeg" } };
}

export const LABEL_PROMPT =
  "This is a photo of an Indian medicine strip, bottle or box. Some text may be printed sideways (rotated 90 degrees) " +
  "along an edge; read it too. Copy printed text exactly. Never guess.\n" +
  "Rules:\n" +
  '- batch: ONLY the text right after "B.No", "B. No.", "Batch No", "Batch" or "Lot". ' +
  "NEVER use the Mfg. Lic. No. / licence number (e.g. JK/01/08-09/156), MRP, barcode, QR or any date.\n" +
  '- expiry: ONLY the date right after "EXP", "Exp. Date", "Expiry" or "Use before". NEVER the MFD / Mfg. date.\n' +
  '- mfd: ALWAYS look for the date after "MFD" / "Mfg. Date" / "Mfg." (often printed right above or below EXP, e.g. "MFD.JUL.2026") ' +
  "and return it whenever visible; it is used to cross-check expiry. Never put it in expiry. Expiry is normally years AFTER mfd.\n" +
  '- manufacturer: company after "Mfd. by" / "Manufactured by" / "Mkd. by".\n' +
  "For every field return the exact source text it came from (label + value as printed) and your confidence 0 to 1. " +
  "If a field is not clearly visible return null for it. If the B.No / EXP text is blurred or too small to read with certainty, " +
  "do NOT guess digits: return null for that field and set image_quality.\n" +
  'image_quality: "ok", "blurry" or "too_small" (the batch/expiry text is too small or out of focus to read reliably).\n' +
  "batch_expiry_box: the box around the B.No / EXP / MFD text as [ymin, xmin, ymax, xmax] scaled 0-1000, or null.\n" +
  'Reply ONLY with JSON: {"name":{"value":"","source":"","confidence":0},"manufacturer":{...},"batch":{...},"expiry":{...},"mfd":{...},' +
  '"image_quality":"ok","batch_expiry_box":[0,0,0,0]}';

export const CROP_NOTE =
  "This image is a zoomed crop of the batch / expiry area of the same strip. Read B.No, EXP and MFD from it character by character.\n";

export const ENHANCED_NOTE =
  "This is the same strip, contrast-enhanced in grayscale to reduce glare. Read B.No, EXP and MFD character by character.\n";

export class CloserPhotoNeeded extends Error {
  constructor() { super("closer-photo-needed"); }
}

/** Reads of one image. Cloud: two independent reads compared field by field.
 *  On device (slow): one read only; the zoomed read below covers small text. */
async function readImage(mode: Mode, image: Blob, prompt: string, task: AiStep["task"]): Promise<{ s: StripRead; source: Source }> {
  const part = await filePart(image);
  const m = model(mode, { image: true, json: true });
  const one = () => run(mode, m, [prompt, part], parseStripRead, task);
  if (mode === InferenceMode.ONLY_ON_DEVICE) {
    const r = await one();
    return { s: r.value, source: r.source };
  }
  const reads = await Promise.all([one().catch(() => null), one().catch(() => null)]);
  const ok = reads.filter((r): r is AiText<StripRead> => !!r);
  if (!ok.length) throw new Error("unreadable-model-output");
  const reading = compareReads(reads[0]?.value.reading ?? null, reads[1]?.value.reading ?? null);
  const quality = ok.some((r) => r.value.quality === "blurry") ? "blurry" : ok.some((r) => r.value.quality === "too_small") ? "too_small" : "ok";
  return { s: { reading, quality, box: ok.find((r) => r.value.box)?.value.box }, source: ok[0].source };
}

async function readWith(mode: Mode, file: Blob): Promise<AiText<LabelReading>> {
  const t0 = performance.now();
  const photo = await preparePhoto(file);
  const full = await readImage(mode, photo.full, LABEL_PROMPT, "photo-full");
  let s = full.s;
  // Small label text: zoom into the B.No / EXP area and use that read for those fields (only if needed).
  let zoomed = false;
  if (s.box && (isSmallBox(s.box) || s.quality !== "ok")) {
    try {
      const crop = await readImage(mode, await photo.crop(s.box), CROP_NOTE + LABEL_PROMPT, "photo-crop");
      if (crop.s.reading) { s = { reading: preferCrop(s.reading, crop.s.reading), quality: crop.s.quality, box: s.box }; zoomed = true; }
    } catch { /* keep the full-image read */ }
  }
  // Batch / expiry still unsure: one more read of the enhanced image (glare reduced,
  // contrast boosted, sharpened), merged field by field. Cloud only (Nano is slow).
  const unsure = !s.reading || needsCheck(s.reading.batch) || needsCheck(s.reading.expiry);
  if (unsure && !zoomed && mode !== InferenceMode.ONLY_ON_DEVICE) {
    try {
      const enh = await readImage(mode, await photo.enhanced(), ENHANCED_NOTE + LABEL_PROMPT, "photo-enhanced");
      if (enh.s.reading) s = { reading: mergeLabels(s.reading, enh.s.reading), quality: enh.s.quality === "ok" ? "ok" : s.quality, box: s.box };
    } catch { /* keep what we have */ }
  }
  if (needsCloserPhoto(s)) throw new CloserPhotoNeeded();
  return { value: s.reading!, source: full.source, ms: Math.round(performance.now() - t0) };
}

/** Cloud Gemini Flash first when online; on-device Nano when offline or if the cloud call fails.
 *  Full-resolution photo, two independent reads, zoomed crop when the text is small.
 *  Throws CloserPhotoNeeded instead of guessing when the text is blurry or too small. */
export class OnDeviceUnavailable extends Error {
  constructor() { super("on-device-unavailable"); }
}
export class OnDeviceFailed extends Error {
  constructor() { super("on-device-failed"); }
}

export async function readStrip(file: Blob): Promise<AiText<LabelReading>> {
  const nano = nanoStatusFrom(await nanoAvailability(true));
  const route = photoRoute(navigator.onLine, nano);
  if (route === "cloud") {
    try {
      return await readWith(InferenceMode.ONLY_IN_CLOUD, file);
    } catch (e) {
      if (e instanceof CloserPhotoNeeded) throw e;
      if (afterCloudFailure(nano) === "rethrow") throw e;
      /* Nano is available here: fall back to it below */
    }
  }
  if (route === "unavailable") throw new OnDeviceUnavailable();
  try {
    return await readWith(InferenceMode.ONLY_ON_DEVICE, file);
  } catch (e) {
    if (e instanceof CloserPhotoNeeded) throw e;
    throw new OnDeviceFailed();
  }
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
  return run(mode, model(mode, { system: EXPLAIN_RULES }), prompt, (s) => s.trim() || null, "explain");
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
  const source = toSource(res.response.inferenceSource, "cloud");
  const ms = Math.round(performance.now() - t0);
  trace.push({ task: "chat", source, ms });
  return { value: res.response.text().trim(), source, ms };
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
