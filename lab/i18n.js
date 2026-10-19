// The pages' language: the app says it (?lang=ja|en); in a browser without it, the browser's own. t(s, vars) is the
// English s in that language (from ja.js for Japanese, s itself when it has none), its {name}s filled from vars.
// tn(n, one, many, vars) picks the English by n, {n} filled; Japanese has a single form, the one for `many`.
import JA from './ja.js';
const asked = new URLSearchParams(location.search).get('lang');
export let LANG = asked === 'ja' || asked === 'en' ? asked : /^ja\b/i.test(navigator.language || '') ? 'ja' : 'en';
document.documentElement.lang = LANG;            // so Japanese text takes Japanese glyphs
// Another language from now on, for a page that changes in place (the bubble's: text drawn after this follows it).
export function setLang(code) { if (code === 'ja' || code === 'en') { LANG = code; document.documentElement.lang = code; } }
const fill = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : s;
export const t = (s, vars) => fill(LANG === 'ja' ? JA[s] ?? s : s, vars);
export const tn = (n, one, many, vars) => t(LANG === 'ja' || n !== 1 ? many : one, { n, ...vars });
// The fonts after the pages' own, for the Japanese glyphs they don't have.
export const JA_FONTS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN"';
