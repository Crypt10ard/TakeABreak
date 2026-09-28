// Turns "5 minutes, with breathing + eyes + stretching" into a timed, guided sequence.
// Only ids and timings live here; the words come from the dictionary (step.<id>.title / .text).

export const BREATH = {
  calm: {
    phases: [
      ['in', 4],
      ['out', 6],
    ],
  },
  box: {
    phases: [
      ['in', 4],
      ['hold', 4],
      ['out', 4],
      ['rest', 4],
    ],
  },
  478: {
    phases: [
      ['in', 4],
      ['hold', 7],
      ['out', 8],
    ],
  },
};

const WEIGHT = { breath: 1.25, eyes: 1, stretch: 0.85, move: 0.7 };
// With "move" enabled, the other groups are capped and move soaks up the rest of long breaks.
const CAP = { breath: 150, eyes: 120, stretch: 100, move: Infinity };

function split(duration, parts) {
  return parts.map(([id, share]) => ({ id, duration: duration * share }));
}

/** Sub-steps of a group, scaled to the time it got. */
function expand(group, duration, pattern) {
  switch (group) {
    case 'breath': {
      // Whole breaths only (never cut an exhale short) – rounded down, the rest flows on.
      // Very short breaks simply get what fits.
      const cycle = BREATH[pattern].phases.reduce((s, [, d]) => s + d, 0);
      const whole = Math.floor(duration / cycle) * cycle;
      return [{ id: 'breath', duration: whole >= cycle ? whole : duration }];
    }
    case 'eyes':
      if (duration >= 50) return split(duration, [['far', 0.35], ['track', 0.3], ['palming', 0.2], ['blink', 0.15]]);
      if (duration >= 25) return split(duration, [['far', 0.6], ['blink', 0.4]]);
      return [{ id: 'far', duration }];
    case 'stretch':
      if (duration >= 45) return split(duration, [['shoulders', 0.3], ['neck', 0.45], ['reach', 0.25]]);
      if (duration >= 20) return split(duration, [['shoulders', 0.4], ['neck', 0.6]]);
      return [{ id: 'neck', duration }];
    default:
      return [{ id: 'move', duration }];
  }
}

/**
 * @returns {Array<{id, group, duration, start, pattern}>} steps whose durations add up to exactly totalSec.
 */
export function buildProgram(totalSec, activities, pattern = 'calm') {
  const total = Math.max(10, Math.round(totalSec));
  const breathPattern = BREATH[pattern] ? pattern : 'calm';
  const intro = total >= 90 ? 8 : total >= 40 ? 5 : 3;
  const groups = ['breath', 'eyes', 'stretch', 'move'].filter((g) => activities?.[g]);
  if (!groups.length) groups.push('breath');

  // Share the time by weight; capped groups hand their surplus to the others.
  const alloc = {};
  let pool = total - intro;
  let open = [...groups];
  const useCaps = groups.includes('move');
  while (open.length) {
    const sum = open.reduce((s, g) => s + WEIGHT[g], 0);
    const capped = useCaps && open.find((g) => (pool * WEIGHT[g]) / sum > CAP[g]);
    if (!capped) {
      for (const g of open) alloc[g] = (pool * WEIGHT[g]) / sum;
      break;
    }
    alloc[capped] = CAP[capped];
    pool -= CAP[capped];
    open = open.filter((g) => g !== capped);
  }

  const raw = [{ id: 'intro', group: null, duration: intro }];
  let carry = 0;
  for (const g of groups) {
    const parts = expand(g, alloc[g] + carry, breathPattern);
    const used = parts.reduce((s, p) => s + p.duration, 0);
    carry = alloc[g] + carry - used;
    raw.push(...parts.map((p) => ({ ...p, group: g })));
  }

  // Whole seconds; the last step absorbs rounding so the sum is exact.
  let start = 0;
  const steps = raw.map((s) => ({ ...s, duration: Math.max(1, Math.round(s.duration)) }));
  const diff = total - steps.reduce((s, x) => s + x.duration, 0);
  const last = steps[steps.length - 1];
  if (last.id === 'breath' && diff !== 0 && steps.length > 1) {
    // Keep breathing in whole cycles: move the difference to the step before if possible.
    const prev = steps[steps.length - 2];
    if (prev.duration + diff >= 3) prev.duration += diff;
    else last.duration += diff;
  } else {
    last.duration = Math.max(1, last.duration + diff);
  }

  return steps.map((s) => {
    const step = { ...s, start, pattern: breathPattern };
    start += s.duration;
    return step;
  });
}

export function microProgram(totalSec) {
  return [{ id: 'far', group: 'eyes', duration: Math.max(5, Math.round(totalSec)), start: 0, micro: true }];
}

/** Where in the breath are we? → { phase, progress (0..1), left (s), value (0..1 lung fullness) } */
export function breathAt(pattern, t) {
  const phases = BREATH[pattern].phases;
  const cycle = phases.reduce((s, [, d]) => s + d, 0);
  let x = t % cycle;
  for (const [phase, dur] of phases) {
    if (x < dur) {
      const p = x / dur;
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * p);
      const value = phase === 'in' ? ease : phase === 'hold' ? 1 : phase === 'out' ? 1 - ease : 0;
      return { phase, progress: p, left: dur - x, value };
    }
    x -= dur;
  }
  return { phase: 'rest', progress: 0, left: 0, value: 0 };
}
