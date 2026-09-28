// German and English must always say the same things – just in their own words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { de, en } = require('../src/shared/strings.js');
const { resolveLang, translate, plural, ordinal } = require('../src/shared/i18n.js');

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('both languages have exactly the same keys', () => {
  const missingInEn = Object.keys(de).filter((k) => !(k in en));
  const missingInDe = Object.keys(en).filter((k) => !(k in de));
  assert.deepEqual(missingInEn, [], 'missing in English');
  assert.deepEqual(missingInDe, [], 'missing in German');
});

test('placeholders match between languages', () => {
  for (const key of Object.keys(de)) {
    assert.deepEqual(placeholders(en[key]), placeholders(de[key]), key);
  }
});

test('plural keys come in pairs', () => {
  for (const key of Object.keys(de)) {
    const base = key.replace(/_(one|other)$/, '');
    if (base === key) continue;
    assert.ok(`${base}_one` in de && `${base}_other` in de, key);
  }
});

test('every key the code uses exists', () => {
  // Static t('…') / tn('…') / data-i18n="…" references in the sources.
  const root = path.resolve(import.meta.dirname, '..', 'src');
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(entry.name) && !full.includes(`${path.sep}shared${path.sep}strings.js`)) files.push(full);
    }
  };
  walk(root);
  const used = new Set();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-i18n(?:-html|-aria)?="([\w.]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\btn\(\s*'([\w.]+)'/g)) used.add(`${m[1]}_one`);
  }
  const missing = [...used].filter((k) => !(k in de));
  assert.deepEqual(missing, []);
});

test('keys built at runtime exist', () => {
  const steps = ['intro', 'far', 'track', 'palming', 'blink', 'shoulders', 'neck', 'reach', 'move', 'micro'];
  const keys = [
    ...steps.flatMap((s) => [`step.${s}.title`, `step.${s}.text`]),
    'step.breath.text',
    ...['breath', 'eyes', 'stretch', 'move'].map((g) => `group.${g}`),
    ...['calm', 'box', '478'].map((p) => `breath.${p}`),
    ...['in', 'hold', 'out', 'rest'].map((p) => `phase.${p}`),
    ...['in', 'hold', 'out'].map((p) => `visual.${p}`),
    ...['salbei', 'daemmerung', 'gletscher', 'glut'].map((p) => `palette.${p}`),
    ...['long', 'micro', 'preview'].map((k) => `break.kind.${k}`),
    ...['gentle', 'balanced', 'strict'].flatMap((m) => ['quote', 'button', 'hint', 'skip', 'snooze'].map((f) => `strict.${m}.${f}`)),
    'strict.gentle.esc',
    'strict.balanced.esc',
    'strict.strict.emergency',
    ...['skip', 'snooze', 'esc', 'emergency'].map((f) => `strict.fact.${f}`),
    ...['status.focus', 'status.soon', 'status.break', 'status.paused', 'status.away'],
  ];
  assert.deepEqual(keys.filter((k) => !(k in de)), []);
});

test('language resolution and helpers', () => {
  assert.equal(resolveLang('system', 'de-CH'), 'de');
  assert.equal(resolveLang('system', 'en-US'), 'en');
  assert.equal(resolveLang('system', 'fr-CH'), 'en');
  assert.equal(resolveLang('de', 'en-US'), 'de');
  assert.equal(translate('en', 'hero.focusedFor', { time: '5 min' }), 'Focused for 5 min');
  assert.equal(plural('de', 'n.breaks', 1), '1 Pause');
  assert.equal(plural('en', 'n.breaks', 8), '8 breaks');
  assert.equal(ordinal('de', 5), 'fünfte');
  assert.equal(ordinal('en', 22), '22nd');
  assert.equal(ordinal('en', 13), '13th');
});
