// The guided break program must always fill the break exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgram, breathAt, BREATH } from '../src/renderer/break/program.js';

const ALL = { breath: true, eyes: true, stretch: true, move: true };
const combos = [
  ALL,
  { breath: true, eyes: false, stretch: false, move: false },
  { breath: false, eyes: true, stretch: true, move: false },
  { breath: true, eyes: true, stretch: false, move: false },
  { breath: false, eyes: false, stretch: false, move: true },
];

test('steps add up to the exact break length', () => {
  for (const seconds of [10, 20, 45, 60, 120, 180, 300, 600, 900, 1800]) {
    for (const activities of combos) {
      for (const pattern of Object.keys(BREATH)) {
        const steps = buildProgram(seconds, activities, pattern);
        const sum = steps.reduce((s, x) => s + x.duration, 0);
        assert.equal(sum, Math.max(10, seconds), `${seconds}s ${JSON.stringify(activities)} ${pattern}`);
        steps.forEach((s, i) => {
          assert.ok(s.duration >= 1, 'no empty steps');
          if (i > 0) assert.equal(s.start, steps[i - 1].start + steps[i - 1].duration, 'contiguous');
        });
      }
    }
  }
});

test('only enabled activities appear', () => {
  const steps = buildProgram(300, { breath: false, eyes: true, stretch: false, move: false });
  assert.deepEqual([...new Set(steps.map((s) => s.group).filter(Boolean))], ['eyes']);
});

test('breathing lasts whole breaths in a 5 minute break', () => {
  for (const pattern of Object.keys(BREATH)) {
    const cycle = BREATH[pattern].phases.reduce((s, [, d]) => s + d, 0);
    const breath = buildProgram(300, ALL, pattern).find((s) => s.id === 'breath');
    assert.equal(breath.duration % cycle, 0, pattern);
  }
});

test('long breaks cap the exercises and leave the rest for moving', () => {
  const steps = buildProgram(900, ALL, 'calm');
  const move = steps.find((s) => s.id === 'move');
  assert.ok(move.duration > 400);
});

test('breathAt follows the pattern', () => {
  assert.equal(breathAt('box', 1).phase, 'in');
  assert.equal(breathAt('box', 5).phase, 'hold');
  assert.equal(breathAt('box', 9).phase, 'out');
  assert.equal(breathAt('box', 13).phase, 'rest');
  assert.ok(breathAt('calm', 3.99).value > 0.99);
  assert.ok(breathAt('calm', 9.99).value < 0.01);
});
