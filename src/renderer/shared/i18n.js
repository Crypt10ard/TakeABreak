// Current language for a window, plus helpers to translate the DOM in place.
import core from '../../shared/i18n.js';

let lang = 'de';
const listeners = new Set();

export const getLang = () => lang;
export const t = (key, vars) => core.translate(lang, key, vars);
export const tn = (key, n, vars) => core.plural(lang, key, n, vars);
export const ordinal = (n) => core.ordinal(lang, n);
export const locale = () => core.timeLocale(lang, navigator.language);

/** Applies a language setting ('de' | 'en' | 'system'). Returns true if the language changed. */
export function setLang(setting) {
  const next = core.resolveLang(setting, navigator.language);
  document.documentElement.lang = next === 'de' ? 'de-CH' : 'en';
  if (next === lang) return false;
  lang = next;
  listeners.forEach((fn) => fn(lang));
  return true;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fills [data-i18n] (text), [data-i18n-html] (markup from our own dictionary)
 * and [data-i18n-aria] (aria-label) inside root.
 */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}
