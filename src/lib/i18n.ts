// Regional languages (online only): Punjabi, Gujarati, Marathi, Kannada, Tamil.
//
// Hindi and English are built into the app and work offline, exactly as before.
// The 5 regional languages were translated at BUILD time with Sarvam AI
// (scripts/i18n-build.ts, back-translated and reviewed in i18n/review/*.csv).
// The browser only downloads a static JSON file per language, from our own
// hosting; no API key is ever in the browser, and Sarvam is never called from it.
//
// How it is applied: the app renders its English text, and this layer swaps each
// English text node / placeholder / aria-label for its reviewed translation by
// exact lookup (or a pattern with {0} placeholders for runtime values such as a
// batch number). Anything without a reviewed translation stays in English.
// Elements marked translate="no" (medicine names, batch numbers, companies) are
// never touched. Safety decisions are unaffected: they are made before display.
import type { Regional } from "./indic";

export type AppLang = "hi" | "en" | Regional;
export const REGIONAL: Regional[] = ["pa", "gu", "mr", "kn", "ta"];
export const isRegional = (l: string): l is Regional => (REGIONAL as string[]).includes(l);

/** Each language in its own script, for the picker. */
export const LANG_NAMES: Record<AppLang, { native: string; english: string; bcp: string }> = {
  hi: { native: "हिन्दी", english: "Hindi", bcp: "hi-IN" },
  en: { native: "English", english: "English", bcp: "en-IN" },
  pa: { native: "ਪੰਜਾਬੀ", english: "Punjabi", bcp: "pa-IN" },
  gu: { native: "ગુજરાતી", english: "Gujarati", bcp: "gu-IN" },
  mr: { native: "मराठी", english: "Marathi", bcp: "mr-IN" },
  kn: { native: "ಕನ್ನಡ", english: "Kannada", bcp: "kn-IN" },
  ta: { native: "தமிழ்", english: "Tamil", bcp: "ta-IN" },
};

export interface Dict { lang: Regional; exact: Record<string, string>; patterns: [string, string][]; clips?: Record<string, string> }
interface Compiled { dict: Dict; pats: { re: RegExp; tr: string }[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function compile(dict: Dict): Compiled {
  const pats = dict.patterns
    .map(([en, tr]) => ({ re: new RegExp("^" + esc(en).replace(/\\\{(\d+)\\\}/g, "(.+?)") + "$", "s"), tr, len: en.length }))
    .sort((a, b) => b.len - a.len);
  return { dict, pats };
}

/** Translate one rendered English string. Unknown text is returned unchanged. */
export function translateText(text: string, c: Compiled | null): string {
  if (!c) return text;
  const t = text.trim();
  if (!t || !/[A-Za-z]/.test(t)) return text;
  const hit = c.dict.exact[t];
  if (hit !== undefined) return text.replace(t, hit);
  for (const p of c.pats) {
    const m = t.match(p.re);
    if (m) return text.replace(t, p.tr.replace(/\{(\d+)\}/g, (_, i) => m[+i + 1] ?? ""));
  }
  return text;
}

const cache = new Map<Regional, Promise<Compiled | null>>();
/** Fetch the reviewed translation file (online only; not part of the offline download). */
export function loadDict(lang: Regional): Promise<Compiled | null> {
  let p = cache.get(lang);
  if (!p) {
    p = fetch(`/i18n/${lang}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Dict | null) => (d ? compile(d) : null))
      .catch(() => null);
    p.then((x) => { if (!x) cache.delete(lang); });
    cache.set(lang, p);
  }
  return p;
}

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const original = new WeakMap<Node, string>(); // text node -> English it was rendered with
const shown = new WeakMap<Node, string>(); // text node -> translation we wrote

function skip(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (e.getAttribute?.("translate") === "no" || e.tagName === "SCRIPT" || e.tagName === "STYLE" || e.tagName === "TEXTAREA") return true;
  }
  return false;
}

function doText(node: Text, c: Compiled) {
  const cur = node.nodeValue ?? "";
  if (shown.get(node) === cur) return; // our own write
  if (skip(node.parentElement)) return;
  const tr = translateText(cur, c);
  original.set(node, cur);
  if (tr !== cur) { shown.set(node, tr); node.nodeValue = tr; }
}

function doAttrs(el: Element, c: Compiled) {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const src = el.getAttribute(`data-en-${a}`);
    const base = src && translateText(src, c) === v ? src : v;
    const tr = translateText(base, c);
    if (tr !== v) { el.setAttribute(`data-en-${a}`, base); el.setAttribute(a, tr); }
  }
}

function walk(root: Node, c: Compiled) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text, c); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  doAttrs(el, c);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text, c);
    else doAttrs(n as Element, c);
  }
}

/** Translate the page and keep translating as React updates it. Returns a stop function
 *  that puts every English text back (used when going offline or switching language). */
export function startTranslating(root: HTMLElement, c: Compiled): () => void {
  walk(root, c);
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") doText(m.target as Text, c);
      else if (m.type === "attributes" && m.target.nodeType === Node.ELEMENT_NODE) doAttrs(m.target as Element, c);
      else m.addedNodes.forEach((n) => walk(n, c));
    }
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => {
    obs.disconnect();
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const en = original.get(n);
        if (en !== undefined && shown.get(n) === n.nodeValue) n.nodeValue = en;
      } else {
        const el = n as Element;
        for (const a of ATTRS) { const en = el.getAttribute(`data-en-${a}`); if (en) { el.setAttribute(a, en); el.removeAttribute(`data-en-${a}`); } }
      }
    }
  };
}

/** Is the browser's speech recognition likely to support this locale? (Chrome supports all 7.) */
export function speechLocale(lang: AppLang): string {
  return LANG_NAMES[lang].bcp;
}
