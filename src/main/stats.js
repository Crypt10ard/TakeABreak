'use strict';

const { JsonFile } = require('./store');

const KEEP_DAYS = 90;
const EMPTY_DAY = { taken: 0, skipped: 0, snoozed: 0, micro: 0, microSkipped: 0, natural: 0, focusSec: 0 };

const dayKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Per-day counters for breaks taken, skipped, snoozed and active focus time. */
class Stats {
  constructor(file) {
    this.store = new JsonFile(file, { days: {} });
    this.#prune();
  }

  #day(key = dayKey()) {
    const days = this.store.data.days;
    if (!days[key]) days[key] = { ...EMPTY_DAY };
    return days[key];
  }

  bump(field, amount = 1) {
    const day = this.#day();
    day[field] = (day[field] || 0) + amount;
    this.store.save();
  }

  addFocus(seconds) {
    this.bump('focusSec', seconds);
  }

  flush() {
    this.store.flush();
  }

  #prune() {
    const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
    for (const key of Object.keys(this.store.data.days)) {
      if (key < cutoff) delete this.store.data.days[key];
    }
  }

  summary() {
    const days = this.store.data.days;
    const today = { ...EMPTY_DAY, ...(days[dayKey()] || {}) };

    const week = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const key = dayKey(date);
      // Weekday names are formatted by the window, in its language.
      week.push({ key, isToday: i === 0, ...EMPTY_DAY, ...(days[key] || {}) });
    }

    // A day counts towards the streak when at least one break was taken and
    // no more breaks were skipped than taken. Today only extends a streak.
    let streak = 0;
    for (let i = 0; i < KEEP_DAYS; i++) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const d = days[dayKey(date)];
      const good = d && d.taken + d.natural > 0 && d.skipped <= d.taken + d.natural;
      if (good) streak++;
      else if (i > 0) break;
    }

    return { today, week, streak };
  }
}

module.exports = { Stats, dayKey };
