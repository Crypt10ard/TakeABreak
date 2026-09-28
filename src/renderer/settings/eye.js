import { gsap } from 'gsap';
import { reducedMotion } from '../shared/ui.js';

// Upper and lower lid as cubic curves. Opening = pulling the control points apart.
const shape = (u, l) => `M24 130 C 120 ${u}, 300 ${u}, 396 130 C 300 ${l}, 120 ${l}, 24 130 Z`;
const upperLid = (u) => `M24 130 C 120 ${u}, 300 ${u}, 396 130`;
const OPEN = { u: 18, l: 238 };
const CLOSED = { u: 200, l: 200 };

/** An eye that follows the pointer, blinks on its own and sleeps when micro breaks are off. */
export function createEye(root) {
  root.innerHTML = `
    <svg viewBox="0 0 420 260">
      <defs>
        <clipPath id="eyeClip"><path class="eye__clip"/></clipPath>
        <radialGradient id="irisGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0.28" style="stop-color: var(--a2)"/>
          <stop offset="0.62" style="stop-color: var(--a1)"/>
          <stop offset="1" style="stop-color: var(--a3)"/>
        </radialGradient>
      </defs>
      <g class="eye__lashes"></g>
      <path class="eye__white"/>
      <g clip-path="url(#eyeClip)">
        <g class="eye__ball">
          <circle class="eye__iris" cx="210" cy="130" r="66" fill="url(#irisGrad)"/>
          <circle class="eye__pupil" cx="210" cy="130" r="27"/>
          <circle class="eye__glint" cx="229" cy="110" r="8"/>
          <circle class="eye__glint" cx="194" cy="150" r="3" opacity=".5"/>
        </g>
      </g>
      <path class="eye__outline"/>
      <path class="eye__lid"/>
      <text class="eye__zz" x="330" y="70">z</text>
      <text class="eye__zz" x="350" y="46">z</text>
    </svg>`;

  const clip = root.querySelector('.eye__clip');
  const white = root.querySelector('.eye__white');
  const outline = root.querySelector('.eye__outline');
  const lid = root.querySelector('.eye__lid');
  const ball = root.querySelector('.eye__ball');
  const pupil = root.querySelector('.eye__pupil');
  const lashes = root.querySelector('.eye__lashes');
  const zz = root.querySelectorAll('.eye__zz');

  // Lashes sit on the upper lid and follow it.
  const lashLines = [0.22, 0.36, 0.5, 0.64, 0.78].map(() => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'eye__lash');
    lashes.append(line);
    return line;
  });

  const lids = { ...OPEN };
  const bezier = (t, p0, p1, p2, p3) =>
    (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;

  function draw() {
    const d = shape(lids.u, lids.l);
    clip.setAttribute('d', d);
    white.setAttribute('d', d);
    outline.setAttribute('d', d);
    lid.setAttribute('d', upperLid(lids.u));
    const openness = (lids.l - lids.u) / (OPEN.l - OPEN.u);
    lashLines.forEach((line, i) => {
      const t = [0.22, 0.36, 0.5, 0.64, 0.78][i];
      const x = bezier(t, 24, 120, 300, 396);
      const y = bezier(t, 130, lids.u, lids.u, 130);
      const spread = (t - 0.5) * 34;
      const len = 14 + 6 * (1 - Math.abs(t - 0.5) * 2);
      line.setAttribute('x1', x);
      line.setAttribute('y1', y - 4);
      line.setAttribute('x2', x + spread * 0.5);
      line.setAttribute('y2', y - 4 - len * (0.35 + 0.65 * openness));
    });
  }
  draw();

  let asleep = false;
  let blinkTimer = null;

  function blink() {
    if (asleep) return;
    gsap
      .timeline({ onUpdate: draw })
      .to(lids, { ...CLOSED, duration: 0.09, ease: 'power2.in' })
      .to(lids, { ...OPEN, duration: 0.22, ease: 'power2.out' });
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (reducedMotion) return;
    blinkTimer = setTimeout(
      () => {
        blink();
        if (Math.random() < 0.25) setTimeout(blink, 260); // the occasional double blink
        scheduleBlink();
      },
      2200 + Math.random() * 4200,
    );
  }
  scheduleBlink();

  // The pupil follows the pointer.
  const xTo = gsap.quickTo(ball, 'x', { duration: 0.5, ease: 'power3.out' });
  const yTo = gsap.quickTo(ball, 'y', { duration: 0.5, ease: 'power3.out' });
  window.addEventListener('pointermove', (e) => {
    if (asleep) return;
    const r = root.getBoundingClientRect();
    if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, dist / 420);
    xTo((dx / dist) * reach * 74);
    yTo((dy / dist) * reach * 34);
  });

  root.addEventListener('pointerenter', () => gsap.to(pupil, { attr: { r: 33 }, duration: 0.6, ease: 'power3.out' }));
  root.addEventListener('pointerleave', () => gsap.to(pupil, { attr: { r: 27 }, duration: 0.6, ease: 'power3.out' }));
  root.addEventListener('click', blink);

  let zzTween = null;
  function setAwake(awake) {
    if (awake === !asleep) return;
    asleep = !awake;
    gsap.to(lids, { ...(awake ? OPEN : CLOSED), duration: awake ? 0.9 : 1.2, ease: awake ? 'expo.out' : 'power2.inOut', onUpdate: draw });
    zzTween?.kill();
    if (asleep) {
      xTo(0);
      yTo(0);
      zzTween = gsap.fromTo(
        zz,
        { opacity: 0, y: 10 },
        { opacity: 0.9, y: -8, duration: 1.6, stagger: 0.5, repeat: -1, repeatDelay: 0.6, ease: 'sine.inOut', yoyo: true },
      );
    } else {
      gsap.to(zz, { opacity: 0, duration: 0.3 });
      scheduleBlink();
    }
  }

  return { setAwake, blink };
}
