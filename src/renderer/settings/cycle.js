import { gsap } from 'gsap';

const NS = 'http://www.w3.org/2000/svg';
const C = 200; // centre of the 400×400 viewBox
const R = 166;
const CIRC = 2 * Math.PI * R;

const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const polar = (angleDeg, radius) => {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
};

/**
 * One work cycle as a clock: thin line = focus, glowing arc = break,
 * rings = micro breaks, pulsing dot = now.
 */
export function createCycle(root, initial) {
  const svg = el('svg', { viewBox: '0 0 400 400', 'aria-hidden': 'true' });
  svg.innerHTML = `
    <defs>
      <linearGradient id="cycleRest" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style="stop-color: var(--a1)"/>
        <stop offset="1" style="stop-color: var(--a2)"/>
      </linearGradient>
    </defs>`;
  const ticks = el('g');
  const track = el('circle', { class: 'cycle__track', cx: C, cy: C, r: R });
  const work = el('circle', { class: 'cycle__work', cx: C, cy: C, r: R, transform: `rotate(-90 ${C} ${C})` });
  const rest = el('circle', {
    class: 'cycle__rest',
    cx: C,
    cy: C,
    r: R,
    stroke: 'url(#cycleRest)',
    transform: `rotate(-90 ${C} ${C})`,
  });
  const micro = el('g');
  const now = el('g', { class: 'cycle__now' });
  now.append(el('circle', { class: 'cycle__now-halo', cx: C, cy: C - R, r: 9 }), el('circle', { class: 'cycle__now-dot', cx: C, cy: C - R, r: 4.5 }));
  const zero = el('text', { class: 'cycle__label', x: C, y: C - R - 22, 'text-anchor': 'middle' });
  zero.textContent = '0';
  svg.append(ticks, track, work, rest, micro, now, zero);
  root.append(svg);

  const state = { work: initial.work, rest: initial.rest };
  let microEvery = initial.micro;
  let microOn = initial.microEnabled;

  function drawTicks(cycle) {
    ticks.textContent = '';
    const step = cycle > 120 ? 10 : 5;
    for (let m = 0; m < cycle; m += step) {
      const major = m % (step * 3) === 0;
      const a = (m / cycle) * 360;
      const p1 = polar(a, R + 12);
      const p2 = polar(a, R + (major ? 22 : 17));
      ticks.append(el('line', { class: `cycle__tick${major ? ' is-major' : ''}`, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
    }
  }

  function draw() {
    const cycle = state.work + state.rest;
    const gap = 14; // leaves room for the round caps
    const workLen = (state.work / cycle) * CIRC;
    const restLen = (state.rest / cycle) * CIRC;
    work.setAttribute('stroke-dasharray', `${Math.max(0, workLen - gap)} ${CIRC}`);
    work.setAttribute('stroke-dashoffset', `${-gap / 2}`);
    rest.setAttribute('stroke-dasharray', `${Math.max(0.01, restLen - gap)} ${CIRC}`);
    rest.setAttribute('stroke-dashoffset', `${-(workLen + gap / 2)}`);

    const dots = [];
    // Same rule as the scheduler: no micro break in the last 3 minutes before a long one.
    if (microOn) for (let m = microEvery; m < state.work - 3; m += microEvery) dots.push(m);
    while (micro.children.length < dots.length) micro.append(el('circle', { class: 'cycle__microdot', r: 4.5 }));
    [...micro.children].forEach((dot, i) => {
      if (i >= dots.length) {
        dot.style.opacity = 0;
        return;
      }
      const p = polar((dots[i] / cycle) * 360, R);
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.style.opacity = 1;
    });
  }

  let lastCycle = 0;
  function update({ work: w, rest: r, micro: m, microEnabled }, animate = true) {
    microEvery = m;
    microOn = microEnabled;
    const cycle = Math.round(w + r);
    if (cycle !== lastCycle) {
      lastCycle = cycle;
      drawTicks(cycle);
    }
    gsap.to(state, { work: w, rest: r, duration: animate ? 0.9 : 0, ease: 'expo.out', overwrite: true, onUpdate: draw });
    draw();
  }

  /** @param {number} minutes position inside the cycle, @param {boolean} active */
  function setNow(minutes, active) {
    const cycle = state.work + state.rest;
    const angle = (Math.min(Math.max(minutes, 0), cycle) / cycle) * 360;
    gsap.to(now, { rotation: angle, svgOrigin: `${C} ${C}`, duration: 1, ease: 'power2.out', overwrite: true });
    now.style.opacity = active ? 1 : 0.35;
  }

  update(initial, false);
  return { update, setNow };
}
