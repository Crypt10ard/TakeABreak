'use strict';

/**
 * Default settings. Every key that exists here is guaranteed to exist at runtime:
 * stored settings are deep-merged on top of these and then sanitized.
 */
const DEFAULT_SETTINGS = {
  version: 1,
  work: { intervalMin: 55 },
  rest: { durationMin: 5 },
  micro: { enabled: true, intervalMin: 20, durationSec: 20, style: 'capsule' },
  activities: { breath: true, eyes: true, stretch: true, move: true },
  breathPattern: 'calm',
  strictness: 'balanced',
  warning: { enabled: true, seconds: 60 },
  snooze: { minutes: 5 },
  idle: { enabled: true, thresholdMin: 5 },
  sound: { chime: true, ambient: true, volume: 0.6 },
  autostart: true,
  trayCountdown: true,
  palette: 'salbei',
  theme: 'system',
  language: 'system',
  onboarded: false,
};

const THEMES = ['system', 'dark', 'light'];
const LANGUAGES = ['system', 'de', 'en'];

/** How much friction each strictness level puts in front of skipping a break. */
const STRICTNESS = {
  gentle: { skip: 'click', holdMs: 0, maxSnoozes: 99, escSkips: true },
  balanced: { skip: 'hold', holdMs: 1600, maxSnoozes: 2, escSkips: false },
  strict: { skip: 'emergency', holdMs: 5000, maxSnoozes: 1, escSkips: false },
};

const PALETTES = ['salbei', 'daemmerung', 'gletscher', 'glut'];
const BREATH_PATTERNS = ['calm', 'box', '478'];

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

/** Clamp every value into a safe range so a bad write can never break the scheduler. */
function sanitizeSettings(s) {
  const d = DEFAULT_SETTINGS;
  const out = {
    version: 1,
    work: { intervalMin: Math.round(clamp(s.work?.intervalMin, 5, 240, d.work.intervalMin)) },
    rest: { durationMin: Math.round(clamp(s.rest?.durationMin, 1, 60, d.rest.durationMin)) },
    micro: {
      enabled: bool(s.micro?.enabled, d.micro.enabled),
      intervalMin: Math.round(clamp(s.micro?.intervalMin, 5, 90, d.micro.intervalMin)),
      durationSec: Math.round(clamp(s.micro?.durationSec, 10, 120, d.micro.durationSec)),
      style: oneOf(s.micro?.style, ['capsule', 'fullscreen'], d.micro.style),
    },
    activities: {
      breath: bool(s.activities?.breath, d.activities.breath),
      eyes: bool(s.activities?.eyes, d.activities.eyes),
      stretch: bool(s.activities?.stretch, d.activities.stretch),
      move: bool(s.activities?.move, d.activities.move),
    },
    breathPattern: oneOf(s.breathPattern, BREATH_PATTERNS, d.breathPattern),
    strictness: oneOf(s.strictness, Object.keys(STRICTNESS), d.strictness),
    warning: {
      enabled: bool(s.warning?.enabled, d.warning.enabled),
      seconds: Math.round(clamp(s.warning?.seconds, 10, 300, d.warning.seconds)),
    },
    snooze: { minutes: Math.round(clamp(s.snooze?.minutes, 1, 30, d.snooze.minutes)) },
    idle: {
      enabled: bool(s.idle?.enabled, d.idle.enabled),
      thresholdMin: Math.round(clamp(s.idle?.thresholdMin, 1, 30, d.idle.thresholdMin)),
    },
    sound: {
      chime: bool(s.sound?.chime, d.sound.chime),
      ambient: bool(s.sound?.ambient, d.sound.ambient),
      volume: clamp(s.sound?.volume, 0, 1, d.sound.volume),
    },
    autostart: bool(s.autostart, d.autostart),
    trayCountdown: bool(s.trayCountdown, d.trayCountdown),
    palette: oneOf(s.palette, PALETTES, d.palette),
    theme: oneOf(s.theme, THEMES, d.theme),
    language: oneOf(s.language, LANGUAGES, d.language),
    onboarded: bool(s.onboarded, d.onboarded),
  };
  // A break program needs at least one activity.
  if (!Object.values(out.activities).some(Boolean)) out.activities.breath = true;
  return out;
}

module.exports = { DEFAULT_SETTINGS, STRICTNESS, sanitizeSettings };
