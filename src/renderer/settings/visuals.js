import { gsap } from 'gsap';

/** Breath patterns shared by the card preview: [phase, seconds]. Mirrors break/program.js. */
export const PATTERNS = {
  calm: [
    ['ein', 4],
    ['aus', 6],
  ],
  box: [
    ['ein', 4],
    ['halten', 4],
    ['aus', 4],
    ['halten', 4],
  ],
  478: [
    ['ein', 4],
    ['halten', 7],
    ['aus', 8],
  ],
};

/**
 * Tiny looping illustrations for the program cards. Each returns
 * { play(), pause(), update?(arg) } so offscreen cards cost nothing.
 */
export function breathVisual(root, pattern) {
  root.innerHTML = '<div class="bv"><span class="bv__ring"></span><span class="bv__core"></span><span class="bv__label">ein</span></div>';
  const core = root.querySelector('.bv__core');
  const label = root.querySelector('.bv__label');
  let tl;

  function build(key) {
    tl?.kill();
    tl = gsap.timeline({ repeat: -1, paused: true });
    let scale = 0.5;
    for (const [phase, sec] of PATTERNS[key] || PATTERNS.calm) {
      tl.call(() => (label.textContent = phase));
      if (phase === 'ein') scale = 1;
      else if (phase === 'aus') scale = 0.5;
      tl.to(core, { scale, duration: sec, ease: phase === 'halten' ? 'none' : 'sine.inOut' });
    }
  }
  build(pattern);

  let playing = false;
  return {
    play() {
      playing = true;
      tl.play();
    },
    pause() {
      playing = false;
      tl.pause();
    },
    update(key) {
      build(key);
      gsap.set(core, { scale: 0.5 });
      if (playing) tl.play(0);
    },
  };
}

export function eyesVisual(root) {
  // Lemniscate of Gerono: the path the eyes follow in the "Augen kreisen" exercise.
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    pts.push(`${(125 + Math.sin(t) * 95).toFixed(1)},${(75 + Math.sin(t) * Math.cos(t) * 90).toFixed(1)}`);
  }
  root.innerHTML = `
    <svg class="ev" viewBox="0 0 250 150">
      <polyline class="ev__path" points="${pts.join(' ')}"/>
      <circle class="ev__dot" r="7" cx="125" cy="75"/>
    </svg>`;
  const dot = root.querySelector('.ev__dot');
  const proxy = { t: 0 };
  const tween = gsap.to(proxy, {
    t: Math.PI * 2,
    duration: 7,
    ease: 'none',
    repeat: -1,
    paused: true,
    onUpdate() {
      const t = proxy.t;
      dot.setAttribute('cx', 125 + Math.sin(t) * 95);
      dot.setAttribute('cy', 75 + Math.sin(t) * Math.cos(t) * 90);
    },
  });
  return { play: () => tween.play(), pause: () => tween.pause() };
}

export function stretchVisual(root) {
  root.innerHTML = `
    <svg class="sv" viewBox="0 0 250 160">
      <path class="sv__arc" d="M88 38 A 50 50 0 0 1 162 38"/>
      <path class="sv__shoulders" d="M52 152 C 60 118, 88 112, 125 112 C 162 112, 190 118, 198 152"/>
      <g class="sv__neckhead">
        <line x1="125" y1="112" x2="125" y2="92"/>
        <circle class="sv__head" cx="125" cy="66" r="24"/>
      </g>
    </svg>`;
  const head = root.querySelector('.sv__neckhead');
  const shoulders = root.querySelector('.sv__shoulders');
  const tl = gsap
    .timeline({ repeat: -1, paused: true, defaults: { ease: 'sine.inOut' } })
    .to(head, { rotation: -24, svgOrigin: '125 112', duration: 1.8 })
    .to(head, { rotation: 0, svgOrigin: '125 112', duration: 1.4 })
    .to(head, { rotation: 24, svgOrigin: '125 112', duration: 1.8 })
    .to(head, { rotation: 0, svgOrigin: '125 112', duration: 1.4 })
    .to(shoulders, { y: -8, duration: 0.9 })
    .to(shoulders, { y: 0, duration: 1.1 });
  return { play: () => tl.play(), pause: () => tl.pause() };
}

export function moveVisual(root) {
  // A wide wave, clipped by the glass; sliding it sideways makes the water move.
  let wave = 'M0 0';
  for (let x = 0; x <= 480; x += 10) wave += ` L${x} ${Math.sin((x / 60) * Math.PI) * 5}`;
  wave += ' L480 200 L0 200 Z';
  root.innerHTML = `
    <svg class="mv" viewBox="0 0 250 160">
      <defs>
        <clipPath id="mvClip"><path d="M88 22 L162 22 L152 146 Q151 152 145 152 L105 152 Q99 152 98 146 Z"/></clipPath>
        <linearGradient id="mvGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color: var(--a1)"/>
          <stop offset="1" style="stop-color: var(--a2)"/>
        </linearGradient>
      </defs>
      <g clip-path="url(#mvClip)">
        <g class="mv__level" transform="translate(0 140)">
          <path class="mv__water" d="${wave}"/>
        </g>
      </g>
      <path class="mv__glass" d="M88 22 L162 22 L152 146 Q151 152 145 152 L105 152 Q99 152 98 146 Z"/>
      <circle class="mv__drop" cx="125" cy="-10" r="4"/>
    </svg>`;
  const level = root.querySelector('.mv__level');
  const water = root.querySelector('.mv__water');
  const drop = root.querySelector('.mv__drop');
  const waveTween = gsap.to(water, { x: -120, duration: 2.4, ease: 'none', repeat: -1, paused: true });
  const tl = gsap
    .timeline({ repeat: -1, paused: true, repeatDelay: 0.4 })
    .fromTo(drop, { attr: { cy: -10 }, opacity: 1 }, { attr: { cy: 60 }, duration: 0.5, ease: 'power2.in' })
    .set(drop, { opacity: 0 })
    .fromTo(level, { y: 140 }, { y: 48, duration: 2.6, ease: 'power2.out' }, '<')
    .to(level, { y: 140, duration: 1.8, ease: 'power2.in', delay: 1.2 });
  return {
    play() {
      waveTween.play();
      tl.play();
    },
    pause() {
      waveTween.pause();
      tl.pause();
    },
  };
}
