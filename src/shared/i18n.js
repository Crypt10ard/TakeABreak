'use strict';

// Language logic shared by the main process and the renderer bundles.
const STRINGS = require('./strings');

const LANGS = ['de', 'en'];
const ORDINALS = {
  de: ['erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte', 'zehnte', 'elfte', 'zwölfte'],
  en: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'],
};

/** 'de' | 'en' | 'system' → 'de' | 'en'. "system" follows the OS language (German → de, else en). */
function resolveLang(setting, systemLocale = '') {
  if (LANGS.includes(setting)) return setting;
  return String(systemLocale).toLowerCase().startsWith('de') ? 'de' : 'en';
}

function translate(lang, key, vars) {
  let text = STRINGS[lang]?.[key] ?? STRINGS.de[key] ?? key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
  return text;
}

/** Picks key_one / key_other and passes n along as {n}. */
function plural(lang, key, n, vars = {}) {
  return translate(lang, `${key}_${n === 1 ? 'one' : 'other'}`, { n, ...vars });
}

function ordinal(lang, n) {
  const word = ORDINALS[lang]?.[n - 1];
  if (word) return word;
  if (lang === 'de') return `${n}.`;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}

/** Locale for clocks and dates: Swiss German, or the system's English variant (12 h in the US). */
function timeLocale(lang, systemLocale = '') {
  if (lang === 'de') return 'de-CH';
  return String(systemLocale).toLowerCase().startsWith('en') ? systemLocale : 'en-GB';
}

module.exports = { STRINGS, LANGS, resolveLang, translate, plural, ordinal, timeLocale };
