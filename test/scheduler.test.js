'use strict';

// Scheduler behaviour with a simulated clock:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler, MIN } = require('../src/main/scheduler');
const { DEFAULT_SETTINGS, sanitizeSettings } = require('../src/main/defaults');

function setup(overrides = {}) {
  let now = Date.UTC(2026, 8, 28, 8, 0, 0);
  let idle = 0;
  let settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...overrides });
  const counts = {};
  const events = [];
  const stats = {
    bump: (k, n = 1) => (counts[k] = (counts[k] || 0) + n),
    addFocus: (s) => (counts.focusSec = (counts.focusSec || 0) + s),
  };
  const s = new Scheduler({ getSettings: () => settings, getIdleSeconds: () => idle, stats, now: () => now });
  for (const name of ['warn', 'warn-cancel', 'break-start', 'break-finished', 'break-end', 'aside', 'aside-end', 'idle-start', 'idle-end', 'paused', 'resumed']) {
    s.on(name, (payload) => events.push({ name, payload, at: now }));
  }
  /** Advance the clock second by second, ticking like the real app. */
  const advance = (ms, { idleGrows = false } = {}) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 1000);
      if (idleGrows) idle += 1;
      s.tick();
    }
  };
  return {
    s,
    counts,
    events,
    advance,
    names: () => events.map((e) => e.name),
    get now() {
      return now;
    },
    jump: (ms) => {
      now += ms; // no ticks in between: the machine slept
      s.tick();
    },
    setIdle: (v) => (idle = v),
    setSettings: (patch) => {
      const prev = settings;
      settings = sanitizeSettings({ ...settings, ...patch });
      s.settingsChanged(prev, settings);
    },
  };
}

test('a long break starts after the work interval, with a warning first', () => {
  const t = setup({ micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(54 * MIN);
  assert.equal(t.s.mode, 'work');
  assert.ok(t.names().includes('warn'), 'warning 60 s before');
  t.advance(1 * MIN);
  assert.equal(t.s.mode, 'break');
  assert.equal(t.s.current.kind, 'long');
});

test('a finished long break waits for the user, then a new cycle starts', () => {
  const t = setup({ micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(55 * MIN);
  t.advance(5 * MIN + 2000);
  assert.equal(t.s.mode, 'break');
  assert.equal(t.s.current.finished, true);
  assert.equal(t.counts.taken, 1);
  t.s.completeBreak();
  assert.equal(t.s.mode, 'work');
  assert.equal(t.s.nextBreakAt, t.now + 55 * MIN);
});

test('micro breaks run every 20 minutes of work', () => {
  const t = setup();
  t.advance(20 * MIN);
  assert.equal(t.s.mode, 'break');
  assert.equal(t.s.current.kind, 'micro');
  t.advance(21 * 1000);
  assert.equal(t.s.mode, 'work');
  assert.equal(t.counts.micro, 1);
  // The next one counts from the end of the previous one.
  t.advance(20 * MIN);
  assert.equal(t.s.current?.kind, 'micro');
  t.advance(21 * 1000);
  t.advance(15 * MIN);
  assert.equal(t.s.current?.kind, 'long');
  assert.equal(t.counts.micro, 2);
});

test('a micro break due right before a long one is folded into it', () => {
  const t = setup({ micro: { enabled: true, intervalMin: 26, durationSec: 20, style: 'capsule' } });
  t.advance(26 * MIN + 21_000); // first micro done at ~26:21
  assert.equal(t.counts.micro, 1);
  t.advance(26 * MIN); // the next would be due at ~52:21, under 3 min before 55:00
  assert.notEqual(t.s.current?.kind, 'micro');
  t.advance(3 * MIN);
  assert.equal(t.s.current?.kind, 'long');
  assert.equal(t.counts.micro, 1);
});

test('snoozing is limited by strictness', () => {
  const t = setup({ strictness: 'strict', micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(55 * MIN);
  assert.equal(t.s.mode, 'break');
  assert.equal(t.s.snooze(), true);
  assert.equal(t.s.mode, 'work');
  assert.equal(t.s.nextBreakAt, t.now + 5 * MIN);
  t.advance(5 * MIN);
  assert.equal(t.s.mode, 'break');
  assert.equal(t.s.snooze(), false, 'strict allows one snooze');
  assert.equal(t.counts.snoozed, 1);
});

test('skipping counts as skipped, unless most of the break was done', () => {
  const t = setup({ micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(55 * MIN);
  t.advance(30 * 1000);
  t.s.skipBreak();
  assert.equal(t.counts.skipped, 1);
  t.advance(55 * MIN);
  t.advance(4 * MIN);
  t.s.skipBreak();
  assert.equal(t.counts.taken, 1, '80 % done counts as taken');
});

test('being away longer than the break counts as a natural break', () => {
  const t = setup({ micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(30 * MIN);
  t.advance(6 * MIN, { idleGrows: true });
  assert.equal(t.s.mode, 'idle');
  t.setIdle(0);
  t.advance(1000);
  assert.equal(t.s.mode, 'work');
  assert.equal(t.counts.natural, 1);
  assert.equal(t.s.nextBreakAt, t.now + 55 * MIN - 1000 + 1000);
});

test('a short absence pushes the break back instead of resetting it', () => {
  const t = setup({ rest: { durationMin: 10 }, micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(30 * MIN);
  const before = t.s.nextBreakAt;
  t.advance(6 * MIN, { idleGrows: true }); // detected at 5 min, away 6 min < 10 min break
  t.setIdle(0);
  t.advance(1000);
  assert.equal(t.s.mode, 'work');
  assert.equal(t.counts.natural, undefined);
  assert.ok(t.s.nextBreakAt > before, 'break moved back');
});

test('sleeping the machine is treated as time away', () => {
  const t = setup({ micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(20 * MIN);
  t.jump(2 * 60 * MIN);
  t.advance(1000);
  assert.equal(t.s.mode, 'work');
  assert.equal(t.counts.natural, 1);
  assert.ok(t.s.nextBreakAt - t.now > 50 * MIN);
});

test('pausing stops reminders until the pause is over', () => {
  const t = setup();
  t.s.pause(60 * MIN);
  t.advance(59 * MIN);
  assert.equal(t.s.mode, 'paused');
  assert.ok(!t.names().includes('break-start'));
  t.advance(2 * MIN);
  assert.equal(t.s.mode, 'work');
  assert.ok(t.names().includes('resumed'));
});

test('shortening the interval never schedules a break in the past, and is reversible', () => {
  const t = setup({ micro: { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' } });
  t.advance(30 * MIN);
  t.setSettings({ work: { intervalMin: 10 } });
  assert.ok(t.s.nextBreakAt >= t.now + MIN - 1, 'at least one minute of grace');
  t.setSettings({ work: { intervalMin: 55 } });
  assert.equal(t.s.nextBreakAt, t.s.workStart + 55 * MIN);
});

const NO_MICRO = { enabled: false, intervalMin: 20, durationSec: 20, style: 'capsule' };
const FRONT_DESK = { enabled: true, returnMin: 10 };

test('front desk mode: a break set aside waits, then continues exactly where it stopped', () => {
  const t = setup({ reception: FRONT_DESK, micro: NO_MICRO });
  t.advance(55 * MIN);
  t.advance(2 * MIN); // 2 of 5 minutes done
  assert.equal(t.s.setAside(), true);
  assert.ok(t.s.current.aside);
  assert.equal(t.s.snapshot().break.aside.returnAt, t.now + 10 * MIN);
  t.advance(9 * MIN); // busy at the desk – but active, so not away
  assert.equal(t.s.mode, 'break');
  assert.ok(t.s.current.aside, 'still waiting');
  assert.equal(t.s.current.finished, false, 'the break clock stood still');
  t.advance(1 * MIN);
  assert.equal(t.s.current.aside, null, 'back after 10 minutes');
  assert.ok(t.names().includes('aside-end'));
  assert.equal(t.s.current.endsAt - t.now, 3 * MIN, 'the remaining 3 minutes are still there');
  t.advance(3 * MIN + 1000);
  assert.equal(t.s.current.finished, true);
  assert.equal(t.counts.taken, 1);
});

test('without front desk mode a break cannot be set aside', () => {
  const t = setup({ micro: NO_MICRO });
  t.advance(55 * MIN);
  assert.equal(t.s.setAside(), false);
  assert.equal(t.s.current.aside, undefined);
});

test('a waiting break can be called back early, or pushed back once more', () => {
  const t = setup({ reception: FRONT_DESK, micro: NO_MICRO });
  t.advance(55 * MIN);
  t.s.setAside();
  t.advance(3 * MIN);
  assert.equal(t.s.extendAside(), true);
  assert.equal(t.s.current.aside.returnAt, t.now + 10 * MIN, 'another full round');
  t.advance(1 * MIN);
  assert.equal(t.s.resumeAside(), true);
  assert.equal(t.s.current.aside, null);
  assert.equal(t.s.current.endsAt - t.now, 5 * MIN, 'nothing of the break was used up');
});

test('a waiting break never comes back onto a locked screen', () => {
  const t = setup({ reception: FRONT_DESK, micro: NO_MICRO, idle: { enabled: false, thresholdMin: 5 } });
  t.advance(55 * MIN);
  t.s.setAside();
  t.s.setLocked('screen', true);
  t.advance(12 * MIN);
  assert.ok(t.s.current.aside, 'still waiting while locked');
  t.s.setLocked('screen', false);
  t.advance(1000);
  assert.equal(t.s.current.aside, null);
});

test('if nobody is at the desk while a break waits, that becomes time away', () => {
  const t = setup({ reception: FRONT_DESK, micro: NO_MICRO });
  t.advance(55 * MIN);
  t.advance(1 * MIN);
  t.s.setAside();
  t.advance(6 * MIN, { idleGrows: true }); // counts as away after 5 minutes
  assert.equal(t.s.mode, 'idle');
  assert.equal(t.events.find((e) => e.name === 'break-end').payload.reason, 'away');
  t.setIdle(0);
  t.advance(1000);
  assert.equal(t.s.mode, 'work');
  assert.equal(t.counts.natural, 1, 'the time away counts as the break');
  assert.equal(t.counts.skipped, undefined);
  assert.equal(t.counts.taken, undefined);
});

test('skipping a waiting break only counts the time really spent on it', () => {
  const t = setup({ reception: FRONT_DESK, micro: NO_MICRO });
  t.advance(55 * MIN);
  t.advance(1 * MIN); // 20 % done
  t.s.setAside();
  t.advance(8 * MIN); // waiting is not break time
  t.s.skipBreak();
  assert.equal(t.counts.skipped, 1);
  assert.equal(t.counts.taken, undefined);
});

test('a micro break set aside simply makes way', () => {
  const t = setup({ reception: FRONT_DESK });
  t.advance(20 * MIN);
  assert.equal(t.s.current.kind, 'micro');
  assert.equal(t.s.setAside(), true);
  assert.equal(t.s.mode, 'work');
  assert.equal(t.counts.microSkipped, 1);
});

test('sanitizeSettings clamps nonsense and keeps at least one activity', () => {
  const s = sanitizeSettings({
    work: { intervalMin: -3 },
    rest: { durationMin: 'x' },
    activities: { breath: false, eyes: false, stretch: false, move: false },
    strictness: 'extreme',
  });
  assert.equal(s.work.intervalMin, 5);
  assert.equal(s.rest.durationMin, 5);
  assert.equal(s.activities.breath, true);
  assert.equal(s.strictness, 'balanced');
});
