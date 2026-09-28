// Stand-in for the Electron bridge so every page can be opened in a plain browser.
// Query parameters steer the fake state, e.g. /break/?kind=long&duration=90&skip=hold
// or /island/?kind=warn.

const MIN = 60_000;
const params = new URLSearchParams(location.search);

const DEFAULTS = {
  version: 1,
  work: { intervalMin: 55 },
  rest: { durationMin: 5 },
  micro: { enabled: true, intervalMin: 20, durationSec: 20, style: 'capsule' },
  activities: { breath: true, eyes: true, stretch: true, move: true },
  breathPattern: 'calm',
  strictness: 'balanced',
  warning: { enabled: true, seconds: 60 },
  snooze: { minutes: 5 },
  reception: { enabled: params.has('reception'), returnMin: 10 },
  idle: { enabled: true, thresholdMin: 5 },
  sound: { chime: true, ambient: true, volume: 0.6 },
  autostart: true,
  trayCountdown: true,
  palette: params.get('palette') || 'salbei',
  theme: params.get('theme') || 'dark',
  language: params.get('lang') || 'de',
  onboarded: false,
};

const STRICTNESS = {
  gentle: { skip: 'click', holdMs: 0, maxSnoozes: 99, escSkips: true },
  balanced: { skip: 'hold', holdMs: 1600, maxSnoozes: 2, escSkips: false },
  strict: { skip: 'emergency', holdMs: 5000, maxSnoozes: 1, escSkips: false },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return out;
};

export function createMock() {
  let settings;
  try {
    settings = merge(DEFAULTS, JSON.parse(localStorage.getItem('atem-mock-settings') || '{}'));
  } catch {
    settings = merge(DEFAULTS, {});
  }
  // Query parameters always win, so screenshots are reproducible.
  if (params.get('theme')) settings.theme = params.get('theme');
  if (params.get('lang')) settings.language = params.get('lang');
  if (params.has('reception')) settings.reception = { ...settings.reception, enabled: true };

  const listeners = { state: new Set(), settings: new Set(), event: new Set() };
  const emit = (channel, data) => listeners[channel].forEach((cb) => cb(data));

  // mode=aside: a break that waits aside (front desk mode).
  const asideMode = params.get('mode') === 'aside';
  let mode = asideMode ? 'break' : params.get('mode') || 'work';
  let workStart = Date.now() - Number(params.get('elapsed') ?? 32) * MIN;
  let pausedUntil = mode === 'paused' ? Date.now() + 42 * MIN : null;

  const breakInfo = () => {
    const kind = params.get('kind') === 'micro' ? 'micro' : 'long';
    const duration = Number(params.get('duration') || (kind === 'micro' ? 20 : 90)) * 1000;
    const offset = Number(params.get('t') || 0) * 1000;
    const strictness = params.get('strict') || settings.strictness;
    const rules = STRICTNESS[strictness];
    const startedAt = (breakInfo.start ??= Date.now() - offset);
    return {
      kind,
      manual: false,
      preview: params.has('preview'),
      startedAt,
      endsAt: startedAt + duration,
      duration,
      finished: false,
      fullscreen: true,
      strictness,
      skip: params.get('skip') || rules.skip,
      holdMs: rules.holdMs,
      escSkips: rules.escSkips,
      snoozesLeft: 2,
      snoozeMin: settings.snooze.minutes,
      reception: settings.reception.enabled,
      returnMin: settings.reception.returnMin,
      returning: params.has('returning'),
      aside: asideMode ? (breakInfo.aside ??= { since: Date.now() - 24_000, returnAt: Date.now() + 9.6 * MIN }) : null,
    };
  };

  const snapshot = () => {
    const now = Date.now();
    const nextBreakAt = workStart + settings.work.intervalMin * MIN;
    return {
      now,
      mode,
      workStart,
      nextBreakAt,
      nextMicroAt: settings.micro.enabled ? now + 7 * MIN + 12_000 : null,
      pausedUntil,
      idleSince: null,
      snoozesLeft: 2,
      break: mode === 'break' ? breakInfo() : null,
    };
  };

  setInterval(() => emit('state', snapshot()), 1000);

  if (params.get('kind') && location.pathname.includes('island')) {
    setTimeout(() => {
      const kind = params.get('kind');
      const now = Date.now();
      // kind=aside&back=12 shows a waiting break 12 s before it returns.
      const back = Number(params.get('back') || 598) * 1000;
      const payload =
        kind === 'micro'
          ? { ...breakInfo(), kind: 'micro' }
          : kind === 'warn'
            ? { breakAt: now + 58_000, snoozesLeft: 2, snoozeMin: 5 }
            : kind === 'paused'
              ? { until: now + 60 * MIN }
              : kind === 'aside'
                ? { since: now + back - 10 * MIN, returnAt: now + back, left: 192_000, returnMin: 10 }
                : { nextBreakAt: now + 55 * MIN, awayMs: 12 * MIN };
      emit('event', { type: 'island', kind, ...payload });
    }, 400);
  }

  const dayKey = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const day = (daysAgo, taken, skipped, micro, focusH) => ({
    key: dayKey(daysAgo),
    isToday: daysAgo === 0,
    taken,
    skipped,
    snoozed: 1,
    micro,
    microSkipped: 1,
    natural: 1,
    focusSec: focusH * 3600,
  });

  return {
    platform: params.get('platform') || (navigator.platform.startsWith('Mac') ? 'darwin' : 'win32'),
    getSettings: async () => settings,
    setSettings: async (patch) => {
      settings = merge(settings, patch);
      localStorage.setItem('atem-mock-settings', JSON.stringify(settings));
      emit('settings', settings);
      emit('state', snapshot());
      return settings;
    },
    getState: async () => snapshot(),
    getStats: async () => ({
      today: { taken: 4, skipped: 1, snoozed: 1, micro: 11, microSkipped: 2, natural: 1, focusSec: 3 * 3600 + 12 * 60 },
      week: [
        day(6, 5, 1, 12, 5.8),
        day(5, 6, 0, 14, 6.4),
        day(4, 1, 0, 2, 1.1),
        day(3, 0, 0, 0, 0),
        day(2, 7, 1, 15, 7.2),
        day(1, 6, 2, 13, 6.1),
        day(0, 4, 1, 11, 3.2),
      ],
      streak: 5,
    }),
    getBreak: async () => breakInfo(),
    getInfo: async () => ({ platform: 'win32', version: '1.0.0', dev: true, packaged: false, strictness: STRICTNESS }),
    action: async (name, payload) => {
      console.info('[mock] action', name, payload ?? '');
      if (name === 'pause') {
        mode = 'paused';
        pausedUntil = Date.now() + (payload === 'tomorrow' ? 14 * 60 : Number(payload)) * MIN;
      } else if (name === 'resume') {
        mode = 'work';
        pausedUntil = null;
        workStart = Date.now();
      } else if (name === 'break-now' || name === 'complete') {
        workStart = Date.now();
      } else if (name === 'aside' && settings.reception.enabled) {
        emit('event', { type: 'break:aside' });
      }
      emit('state', snapshot());
      return true;
    },
    onState: (cb) => (listeners.state.add(cb), () => listeners.state.delete(cb)),
    onSettings: (cb) => (listeners.settings.add(cb), () => listeners.settings.delete(cb)),
    onEvent: (cb) => (listeners.event.add(cb), () => listeners.event.delete(cb)),
  };
}
