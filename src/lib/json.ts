// Model output is never trusted. Strip ```json fences, find the JSON object,
// parse it, and keep only fields that pass a schema check.

export function stripFences(raw: string): string {
  let s = String(raw ?? "").trim();
  const fenced = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  return s.replace(/^`+|`+$/g, "").trim();
}

/** Parse the first JSON object or array in a model reply. Returns null on failure. */
export function parseModelJson(raw: string): unknown {
  const s = stripFences(raw);
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  const end = s.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s || /^(null|none|n\/a|unknown|not visible|-)$/i.test(s)) return undefined;
  return s.slice(0, max);
};

export interface StripReading {
  name?: string;
  manufacturer?: string;
  batch?: string;
  expiry?: string;
}

/** Schema: {name?, manufacturer?, batch?, expiry?} all short strings. */
export function parseStripReading(raw: string): StripReading | null {
  const o = parseModelJson(raw);
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const out: StripReading = {
    name: str(r.name ?? r.medicine ?? r.product),
    manufacturer: str(r.manufacturer ?? r.company ?? r.mfr),
    batch: str(r.batch ?? r.batch_no ?? r.batchNo, 40),
    expiry: str(r.expiry ?? r.exp ?? r.expiry_date, 20),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

/** Schema: {candidates: string[]} (or a bare array). Max 4 short names. */
export function parseCandidates(raw: string): string[] | null {
  const o = parseModelJson(raw);
  const list = Array.isArray(o) ? o : o && typeof o === "object" ? (o as Record<string, unknown>).candidates : null;
  if (!Array.isArray(list)) return null;
  const names = list.map((x) => str(x, 60)).filter((x): x is string => !!x);
  return [...new Set(names)].slice(0, 4);
}
