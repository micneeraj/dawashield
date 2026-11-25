// Batch number from speech. Plain code, no AI, no CDSCO lookup.
//
// The extractor never corrects, guesses or transliterates. It only:
//   - finds the batch words that follow a "batch" keyword (English, Hindi or Punjabi),
//   - turns spelled-out digits ("zero", "शून्य") and single letters into characters,
//   - flags characters that speech recognition often confuses (O/0, I/1, B/8, S/5),
//   - reports "incomplete" when the batch cannot be read with certainty.
// The user always sees the transcript and an editable candidate, and must confirm
// before any check runs. Matching never happens here.

export type SpokenBatchStatus = "ok" | "ambiguous" | "incomplete" | "none";

export interface SpokenBatch {
  /** The speech transcript exactly as heard. */
  transcript: string;
  /** Candidate batch number (editable by the user). Empty when none was heard. */
  candidate: string;
  /** Characters the user must check against the strip (index in candidate). */
  ambiguous: { index: number; char: string }[];
  status: SpokenBatchStatus;
}

/** Characters that speech recognition often mixes up with one another. */
export const AMBIGUOUS = new Set(["O", "0", "I", "1", "B", "8", "S", "5"]);

const KEYWORD = /(?:^|[\s,.;:!?])(batch|b\s*\.?\s*no\.?|lot|बैच|बी\s*\.?\s*एन\s*\.?|ਬੈਚ|ਲਾਟ)(?=$|[\s,.;:!?])/i;
const FILLER = new Set(["number", "no", "num", "is", "hai", "है", "नंबर", "नम्बर", "ਨੰਬਰ", "ਹੈ"]);

const WORD_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", शून्य: "0",
  one: "1", won: "1", एक: "1",
  two: "2", to: "2", too: "2", दो: "2",
  three: "3", तीन: "3",
  four: "4", for: "4", चार: "4",
  five: "5", पाँच: "5", पांच: "5",
  six: "6", छह: "6", छः: "6",
  seven: "7", सात: "7",
  eight: "8", आठ: "8",
  nine: "9", नौ: "9",
};

/** The medicine part of an utterance: everything before the batch keyword ("Dolo batch 251TTF014" -> "Dolo").
 *  Without a keyword, or when the keyword starts the utterance, the whole transcript is the medicine part. */
export function medicinePhrase(transcript: string): string {
  const m = transcript.match(KEYWORD);
  if (!m || m.index === undefined || m.index === 0) return transcript;
  return transcript.slice(0, m.index).trim() || transcript;
}

/** One spoken token -> the characters it stands for, or null when it cannot be part of a batch.
 *  Accepted: spelled digits ("two"), codes with a digit ("251TTF014"), a single letter ("T"),
 *  or an uppercase acronym of up to 4 letters ("TTF"). A lowercase word ("expiry", "tee")
 *  is never turned into batch characters: it ends the batch, so the result is incomplete. */
function tokenChars(tok: string): { chars: string; fromSpeech: boolean } | null {
  const word = WORD_DIGITS[tok] ?? WORD_DIGITS[tok.toLowerCase()];
  if (word !== undefined) return { chars: word, fromSpeech: false };
  if (!/^[A-Za-z0-9]+$/.test(tok)) return null;
  const acronym = tok === tok.toUpperCase() && tok.length <= 4;
  if (!/[0-9]/.test(tok) && !acronym && tok.length !== 1) return null;
  return { chars: tok.toUpperCase(), fromSpeech: true };
}

/**
 * Extract the batch from one speech transcript.
 * `requireKeyword` true: the batch must follow "batch" (used for a full sentence like "Dolo batch 251TTF014").
 * `requireKeyword` false: the whole utterance is the batch (used when the app asks for the batch).
 */
export function extractSpokenBatch(transcript: string, requireKeyword = true): SpokenBatch {
  const text = transcript.trim();
  const base = { transcript: text, candidate: "", ambiguous: [] as { index: number; char: string }[] };
  if (!text) return { ...base, status: "none" };

  let tail: string;
  if (requireKeyword) {
    const m = text.match(KEYWORD);
    if (!m || m.index === undefined) return { ...base, status: "none" };
    tail = text.slice(m.index + m[0].length);
  } else {
    tail = text;
  }

  // Read tokens after the keyword, stopping at the first word that cannot be part of a batch.
  const tokens = tail.split(/[\s,.;:!?\-/]+/).filter(Boolean);
  const used: string[] = [];
  for (const tok of tokens) {
    if (!used.length && FILLER.has(tok)) continue; // "batch number is 251..."
    if (!tokenChars(tok)) break; // first non-batch word ends the batch
    used.push(tok);
  }

  if (!used.length) return { ...base, status: requireKeyword ? "incomplete" : "none" };
  // Letters spoken as words ("tee tee ef") stop the batch early; the candidate is then incomplete, never guessed.
  const out = used.map((t) => tokenChars(t)!.chars).join("");

  const candidate = out;
  const digits = (candidate.match(/[0-9]/g) ?? []).length;
  if (candidate.length < 4 || digits < 1) return { ...base, candidate, status: "incomplete" };

  // Flag characters that could be confused. Spelled digit words are exact and are not flagged.
  const ambiguous: { index: number; char: string }[] = [];
  let pos = 0;
  for (const tok of used) {
    const tc = tokenChars(tok)!;
    for (const ch of tc.chars) {
      if (tc.fromSpeech && AMBIGUOUS.has(ch)) ambiguous.push({ index: pos, char: ch });
      pos++;
    }
  }

  return { transcript: text, candidate, ambiguous, status: ambiguous.length ? "ambiguous" : "ok" };
}
