// Collects every English UI string in src/ for build-time translation.
// Pure function, used by scripts/i18n-build.mjs and tests.
//
// Sources:
//   - every string / template literal in src/**/*.ts(x) that reads like UI text
//     (the app keeps its English text in `en:` fields and in the English branch
//     of `lang === "hi" ? ... : ...`), and
//   - JSX text between tags.
// Template literals become patterns: `Batch ${b} was not found` -> "Batch {0} was not found".
// Safety strings (results, actions, templates, errors) are marked so their
// back-translation is checked strictly.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface UIString { text: string; safety: boolean; files: string[] }

// Files whose English is never shown to people (AI prompts, Firestore, tests).
const SKIP_FILES = new Set([
  "src/lib/ai.ts", "src/lib/cloud.ts", "src/vite-env.d.ts", "src/main.tsx",
  // Medicine names are never translated; matching code holds no UI text.
  "src/content/common-medicines.ts", "src/lib/normalize.ts", "src/lib/entity.ts", "src/lib/phonetic.ts", "src/lib/match.ts",
  "src/lib/label.ts", "src/lib/json.ts", "src/lib/enhance.ts", "src/lib/image.ts", "src/lib/indic.ts", "src/lib/db.ts",
  "src/lib/demo.ts", "src/lib/i18n.ts", "src/lib/reminders.ts",
]);
// Files holding safety wording: checked strictly after back-translation.
const SAFETY_FILES = new Set(["src/content/messages.ts", "src/content/templates.ts", "src/components/ResultHead.tsx", "src/lib/why.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

const CLASSY = /\b(rounded|text-\[|px-|py-|flex|grid|bg-|ring-|border-|items-|justify-|gap-|font-|shadow|tracking|leading|min-h|w-full|h-\d|mt-\d|mb-\d|ml-|mr-|pb-|pt-|space-y|hover:|sm:|lg:)/;
/** Does this literal read like text a person sees? */
export function looksLikeUi(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 600) return false;
  if (/[ऀ-ൿ]/.test(t)) return false; // Hindi / Indic text is not a source string
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (CLASSY.test(t)) return false;
  if (/^(https?:|\/|\.\/|\.\.\/|#|data:|mailto:|tel:)/.test(t)) return false;
  if (/^[a-z0-9_.:\-/]+$/.test(t)) return false; // identifiers, keys, test ids, paths
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 4) return false; // CONSTANTS
  if (/[{};]\s*$/.test(t) && /[=(]/.test(t)) return false; // code
  if (/^(application|image|text|audio)\//.test(t)) return false;
  if (/^\w+\(/.test(t)) return false;
  if (/^[a-z]+[A-Z]\w*$/.test(t)) return false; // camelCase keys
  if (/^[A-Z]+:/.test(t) || /[`$]/.test(t) || /^[,.;:)\]}]/.test(t)) return false; // ics lines, code fragments
  // Needs a word with a capital or a space: "Batch number", "Try again", "records".
  return /\s/.test(t) || /^[A-Z][a-z]/.test(t) || t.length >= 4;
}

/** Template literal body -> pattern text with numbered placeholders. */
export function toPattern(body: string): string {
  let n = 0;
  let out = "";
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (depth === 0 && body[i] === "$" && body[i + 1] === "{") { depth = 1; i++; out += `{${n++}}`; continue; }
    if (depth > 0) { if (body[i] === "{") depth++; else if (body[i] === "}") depth--; continue; }
    out += body[i];
  }
  return out.replace(/\\n/g, "\n").replace(/\\`/g, "`");
}

/** All literals in one source file. */
export function literals(src: string, tsx: boolean): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  // Drop comments first (keeps line structure).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (c, p) => p + " ".repeat(c.length - p.length));
  while ((m = re.exec(code))) {
    if (m[1] !== undefined) out.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n"));
    else if (m[2] !== undefined) out.push(m[2].replace(/\\'/g, "'"));
    else if (m[3] !== undefined) out.push(toPattern(m[3]));
  }
  if (tsx) {
    // JSX text between tags: >Some words<
    const jsx = /> *([^<>{}\n]*[A-Za-z][^<>{}\n]*?) *(?=[<{])/g;
    while ((m = jsx.exec(code))) {
      const t = m[1].trim();
      if (t && !/[=;()]/.test(t) && !/^\w+$/.test(t)) out.push(t);
    }
  }
  return out;
}

/** Placeholder pieces of a pattern must not be all of it: "{0}" alone is not UI text. */
const pieceText = (s: string) => s.replace(/\{\d+\}/g, "").trim();

export function collectStrings(root = "src"): UIString[] {
  const map = new Map<string, UIString>();
  for (const file of walk(root)) {
    if (SKIP_FILES.has(file)) continue;
    const src = readFileSync(file, "utf8");
    for (const raw of literals(src, file.endsWith(".tsx"))) {
      // Long template literals of mixed text are split by line so each rendered paragraph is a key.
      for (const part of raw.split(/\n+/)) {
        const t = part.trim();
        if (!looksLikeUi(t) || !looksLikeUi(pieceText(t) || "x")) continue;
        if (!pieceText(t) || pieceText(t).replace(/[^A-Za-z]/g, "").length < 2) continue;
        const e = map.get(t) ?? { text: t, safety: false, files: [] };
        if (SAFETY_FILES.has(file)) e.safety = true;
        if (!e.files.includes(file)) e.files.push(file);
        map.set(t, e);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.text.localeCompare(b.text));
}
