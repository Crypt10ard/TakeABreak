'use strict';

// The main process speaks one language at a time (tray tooltips, menus).
const core = require('../shared/i18n');

let lang = 'de';
let systemLocale = 'de-CH';

function setLanguage(setting, locale) {
  systemLocale = locale || systemLocale;
  const next = core.resolveLang(setting, systemLocale);
  const changed = next !== lang;
  lang = next;
  return changed;
}

module.exports = {
  setLanguage,
  getLang: () => lang,
  t: (key, vars) => core.translate(lang, key, vars),
  tn: (key, n, vars) => core.plural(lang, key, n, vars),
  clock: (ts) => new Date(ts).toLocaleTimeString(core.timeLocale(lang, systemLocale), { hour: '2-digit', minute: '2-digit' }),
};
