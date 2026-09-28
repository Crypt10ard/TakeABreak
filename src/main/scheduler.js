'use strict';

const { EventEmitter } = require('events');
const { STRICTNESS } = require('./defaults');

const MIN = 60_000;
const TICK_MS = 1000;
/** A skipped long break still counts as taken once this share of it is done. */
const TAKEN_SHARE = 0.6;

/**
 * The break clock. Pure timing logic – no windows, no Electron APIs. Settings,
 * idle time and stats are injected, so the behaviour is easy to reason about.
 *
 * Modes:
 *   work   – counting down to the next break
 *   break  – a long or micro break is running (or finished, waiting for the user)
 *   idle   – the user is away; the clock is frozen
 *   paused – reminders are paused until `pausedUntil`
 *
 * Events: state, warn, warn-cancel, break-start, break-finished, break-end,
 *         idle-start, idle-end, paused, resumed
 */
class Scheduler extends EventEmitter {
  constructor({ getSettings, getIdleSeconds, stats, now = Date.now }) {
    super();
    this.getSettings = getSettings;
    this.getIdleSeconds = getIdleSeconds;
    this.stats = stats;
    this.now = now;

    this.mode = 'work';
    this.current = null;
    this.pausedUntil = null;
    this.idleSince = null;
    this.lockReasons = new Set();
    this.locked = false;
    this.focusAcc = 0;
    this.lastTick = now();
    this.#resetCycle(this.lastTick);
  }

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
    this.flushFocus();
  }

  get rules() {
    return STRICTNESS[this.getSettings().strictness];
  }

  get snoozesLeft() {
    return Math.max(0, this.rules.maxSnoozes - this.snoozesUsed);
  }

  /** Next long break. Derived from live settings, so interval changes apply instantly and reversibly. */
  get nextBreakAt() {
    const s = this.getSettings();
    return Math.max(this.workStart + s.work.intervalMin * MIN + this.breakOffset, this.minBreakAt);
  }

  get nextMicroAt() {
    const s = this.getSettings();
    return Math.max(this.microStart + s.micro.intervalMin * MIN, this.minMicroAt);
  }

  #resetCycle(now) {
    this.workStart = now;
    this.microStart = now;
    this.breakOffset = 0;
    this.minBreakAt = 0;
    this.minMicroAt = 0;
    this.snoozesUsed = 0;
    this.warned = false;
  }

  tick() {
    const now = this.now();
    const gap = now - this.lastTick;
    this.lastTick = now;
    const s = this.getSettings();

    // A long gap between two ticks means the machine slept: that was time away.
    if (gap > MIN && this.mode === 'work') this.#enterIdle(now - gap);

    switch (this.mode) {
      case 'paused':
        if (now >= this.pausedUntil) this.resume();
        break;
      case 'break':
        this.#tickBreak(now);
        break;
      case 'idle':
        this.#tickIdle(now, s);
        break;
      default:
        this.#tickWork(now, gap, s);
    }
    this.#emitState();
  }

  #tickWork(now, gap, s) {
    const idleSec = this.getIdleSeconds();
    if (s.idle.enabled && idleSec >= s.idle.thresholdMin * 60) {
      this.#enterIdle(now - idleSec * 1000);
      return;
    }

    // Focus time only counts while someone is actually at the machine.
    if (idleSec < 90) this.focusAcc += Math.min(gap, 5000) / 1000;
    if (this.focusAcc >= 60) this.flushFocus();

    const untilBreak = this.nextBreakAt - now;
    if (s.warning.enabled && !this.warned && untilBreak <= s.warning.seconds * 1000 && untilBreak > 2500) {
      this.warned = true;
      this.emit('warn', {
        breakAt: this.nextBreakAt,
        snoozesLeft: this.snoozesLeft,
        snoozeMin: s.snooze.minutes,
      });
    }

    if (untilBreak <= 0) {
      this.startBreak('long');
      return;
    }

    if (s.micro.enabled && now >= this.nextMicroAt) {
      // A micro break right before a long one is just noise: fold it into the long break.
      if (untilBreak < Math.max(3 * MIN, s.warning.seconds * 1000 + 30_000)) {
        this.microStart = this.nextBreakAt;
      } else {
        this.startBreak('micro');
      }
    }
  }

  #tickBreak(now) {
    const b = this.current;
    if (!b) {
      this.mode = 'work';
      return;
    }
    if (!b.finished && now >= b.endsAt) {
      b.finished = true;
      this.stats.bump(b.kind === 'long' ? 'taken' : 'micro');
      this.emit('break-finished', this.breakInfo());
      // Micro breaks end by themselves; long breaks wait until the user is back.
      if (b.kind === 'micro') this.#endBreak('done');
      return;
    }
    // Failsafe: never leave a finished overlay up forever.
    if (b.finished && now - b.endsAt > 30 * MIN) this.#endBreak('done');
  }

  #enterIdle(since) {
    this.flushFocus();
    this.mode = 'idle';
    this.idleSince = since;
    this.emit('idle-start');
  }

  #tickIdle(now, s) {
    if (this.locked || this.getIdleSeconds() >= 5) return;
    const awayMs = now - this.idleSince;
    const natural = awayMs >= s.rest.durationMin * MIN;
    this.mode = 'work';
    this.idleSince = null;
    if (natural) {
      // Long enough away to count as a real break.
      this.stats.bump('natural');
      this.#resetCycle(now);
    } else {
      // Time away is not work time: push the next break back by it.
      this.breakOffset += awayMs;
      this.microStart = now;
      this.warned = false;
    }
    this.emit('idle-end', { awayMs, natural });
  }

  startBreak(kind, { manual = false } = {}) {
    if (this.mode === 'break') return;
    const s = this.getSettings();
    const now = this.now();
    const duration = kind === 'long' ? s.rest.durationMin * MIN : s.micro.durationSec * 1000;
    this.flushFocus();
    this.mode = 'break';
    this.pausedUntil = null;
    this.idleSince = null;
    this.warned = false;
    this.current = {
      kind,
      manual,
      startedAt: now,
      endsAt: now + duration,
      duration,
      finished: false,
      fullscreen: kind === 'long' || s.micro.style === 'fullscreen',
    };
    this.emit('break-start', this.breakInfo());
    this.#emitState();
  }

  #endBreak(reason) {
    const b = this.current;
    const now = this.now();
    this.mode = 'work';
    this.current = null;
    this.lastTick = now;
    if (b?.kind === 'long') this.#resetCycle(now);
    else this.microStart = now;
    this.emit('break-end', { kind: b?.kind, reason });
  }

  /** The user dismissed the break screen. */
  completeBreak() {
    if (this.mode !== 'break') return;
    if (!this.current.finished) return this.skipBreak();
    this.#endBreak('done');
    this.#emitState();
  }

  skipBreak() {
    if (this.mode !== 'break') return;
    const b = this.current;
    if (!b.finished) {
      const share = (this.now() - b.startedAt) / b.duration;
      if (b.kind === 'long') this.stats.bump(share >= TAKEN_SHARE ? 'taken' : 'skipped');
      else this.stats.bump(share >= TAKEN_SHARE ? 'micro' : 'microSkipped');
    }
    this.#endBreak(b.finished ? 'done' : 'skipped');
    this.#emitState();
  }

  snooze() {
    const inLongBreak = this.mode === 'break' && this.current?.kind === 'long' && !this.current.finished;
    if (this.snoozesLeft <= 0 || !(this.mode === 'work' || inLongBreak)) return false;
    const now = this.now();
    const s = this.getSettings();
    this.snoozesUsed++;
    this.stats.bump('snoozed');
    if (inLongBreak) {
      this.mode = 'work';
      this.current = null;
      this.lastTick = now;
      this.emit('break-end', { kind: 'long', reason: 'snoozed' });
    }
    // Express "break in N minutes" as an offset, so later interval edits stay consistent.
    const target = now + s.snooze.minutes * MIN;
    this.breakOffset = target - (this.workStart + s.work.intervalMin * MIN);
    this.minBreakAt = 0;
    this.warned = false;
    this.#emitState();
    return true;
  }

  pause(ms) {
    this.pauseUntil(this.now() + ms);
  }

  pauseUntil(timestamp) {
    this.flushFocus();
    const b = this.current;
    this.mode = 'paused';
    this.current = null;
    this.idleSince = null;
    this.pausedUntil = timestamp;
    if (b) this.emit('break-end', { kind: b.kind, reason: 'paused' });
    this.emit('paused', { until: timestamp });
    this.#emitState();
  }

  resume() {
    if (this.mode !== 'paused') return;
    const now = this.now();
    this.mode = 'work';
    this.pausedUntil = null;
    this.lastTick = now;
    this.#resetCycle(now);
    this.emit('resumed');
    this.#emitState();
  }

  /** Screen lock and sleep freeze the clock until both are over. */
  setLocked(reason, locked) {
    if (locked) this.lockReasons.add(reason);
    else this.lockReasons.delete(reason);
    this.locked = this.lockReasons.size > 0;
    if (this.locked && this.mode === 'work') {
      this.#enterIdle(this.now());
      this.#emitState();
    }
  }

  /** Called after settings were saved. Timing getters read live settings; this only fixes edge cases. */
  settingsChanged(prev, next) {
    const now = this.now();
    if (prev.work.intervalMin !== next.work.intervalMin) {
      // Never schedule a break in the past because the interval got shorter.
      this.minBreakAt = now + MIN;
      if (this.warned && this.nextBreakAt - now > next.warning.seconds * 1000) {
        this.warned = false;
        this.emit('warn-cancel');
      }
    }
    if (prev.micro.intervalMin !== next.micro.intervalMin) this.minMicroAt = now + MIN;
    if (!prev.micro.enabled && next.micro.enabled) {
      this.microStart = now;
      this.minMicroAt = 0;
    }
    this.#emitState();
  }

  flushFocus() {
    const whole = Math.floor(this.focusAcc);
    if (whole > 0) {
      this.stats.addFocus(whole);
      this.focusAcc -= whole;
    }
  }

  breakInfo() {
    const b = this.current;
    if (!b) return null;
    const s = this.getSettings();
    const rules = this.rules;
    return {
      ...b,
      strictness: s.strictness,
      skip: rules.skip,
      holdMs: rules.holdMs,
      escSkips: rules.escSkips,
      snoozesLeft: b.kind === 'long' ? this.snoozesLeft : 0,
      snoozeMin: s.snooze.minutes,
    };
  }

  snapshot() {
    const s = this.getSettings();
    return {
      now: this.now(),
      mode: this.mode,
      workStart: this.workStart,
      nextBreakAt: this.nextBreakAt,
      nextMicroAt: s.micro.enabled ? this.nextMicroAt : null,
      pausedUntil: this.pausedUntil,
      idleSince: this.idleSince,
      snoozesLeft: this.snoozesLeft,
      break: this.breakInfo(),
    };
  }

  #emitState() {
    this.emit('state', this.snapshot());
  }
}

module.exports = { Scheduler, MIN };
