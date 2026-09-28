import './style.css';
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

import { api, inElectron } from '../shared/api.js';
import { createOrb } from '../shared/orb.js';
import { palette, applyPalette } from '../shared/palettes.js';
import { countdown } from '../shared/format.js';
import { chime, setVolume, createSea } from '../shared/sound.js';
import { holdButton } from '../shared/ui.js';
import { buildProgram, microProgram, breathAt, PHASE_WORD, GROUPS } from './program.js';

gsap.registerPlugin(SplitText);

const $ = (sel) => document.querySelector(sel);
const role = new URLSearchParams(location.search).get('role') || 'primary';
const primary = role === 'primary';
document.body.classList.add(`role-${role}`);

const ORDINALS = ['erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte', 'zehnte', 'elfte', 'zwölfte'];
const GROUP_ORDER = ['breath', 'eyes', 'stretch', 'move'];

let info;
let settings;
let program;
let orb;
let sea = null;
let current = -1;
let finished = false;
let closing = false;
let armedAt = Infinity; // input is ignored until the overlay has settled in
let segments = [];

const reveal = { k: 0 };
const target = { x: 0, y: 0.08, size: 0.3, amp: 0.085, halo: 0.6, opacity: 1, speed: 0.6, dust: 1 };
const armed = () => performance.now() > armedAt;
const sound = (kind) => primary && settings.sound.chime && chime(kind);

/* ------------------------------------------------------------------ copy */

let titleSplit = null;

function swapCopy(kicker, title, text, animate = true) {
  const apply = () => {
    titleSplit?.revert();
    $('#kicker').textContent = kicker;
    $('#title').textContent = title;
    $('#text').textContent = text;
    titleSplit = SplitText.create('#title', { type: 'lines,words', mask: 'lines', linesClass: 'line' });
    gsap.from(titleSplit.words, { yPercent: 118, duration: 1.3, ease: 'expo.out', stagger: 0.06 });
    gsap.fromTo('#kicker', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out', delay: 0.05 });
    gsap.fromTo(
      '#text',
      { autoAlpha: 0, y: 16, filter: 'blur(8px)' },
      { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.4, ease: 'expo.out', delay: 0.25 },
    );
  };
  if (!animate || !titleSplit) return apply();
  gsap.to(titleSplit.words, { yPercent: -118, duration: 0.5, ease: 'power3.in', stagger: 0.03 });
  gsap.to(['#text', '#kicker'], { autoAlpha: 0, y: -10, duration: 0.45, ease: 'power2.in', onComplete: apply });
}

function swapText(text) {
  gsap
    .timeline()
    .to('#text', { autoAlpha: 0, y: -8, filter: 'blur(6px)', duration: 0.4, ease: 'power2.in' })
    .call(() => ($('#text').textContent = text))
    .to('#text', { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out' });
}

let phaseWord = '';
function setPhase(word, count) {
  const wordEl = $('#phase-word');
  const countEl = $('#phase-count');
  if (word !== phaseWord) {
    phaseWord = word;
    gsap.killTweensOf(wordEl);
    gsap
      .timeline()
      .to(wordEl, { autoAlpha: 0, y: -12, filter: 'blur(6px)', duration: 0.3, ease: 'power2.in' })
      .call(() => (wordEl.textContent = word))
      .to(wordEl, { autoAlpha: word ? 1 : 0, y: 0, filter: 'blur(0px)', duration: 0.9, ease: 'expo.out' });
  }
  if (countEl.textContent !== count) countEl.textContent = count;
}

/* -------------------------------------------------------------- timeline */

function buildTimeline() {
  segments = [];
  for (const step of program) {
    if (!step.group) continue;
    const last = segments[segments.length - 1];
    if (last?.group === step.group) last.end = step.start + step.duration;
    else segments.push({ group: step.group, start: step.start, end: step.start + step.duration });
  }
  const list = $('#timeline');
  list.innerHTML = segments
    .map(
      (s) =>
        `<li style="flex:${s.end - s.start}"><span class="timeline__bar"><i></i></span>` +
        `<span class="timeline__label">${GROUPS[s.group]}</span></li>`,
    )
    .join('');
  segments.forEach((s, i) => {
    s.li = list.children[i];
    s.fill = s.li.querySelector('i');
  });
}

function updateTimeline(elapsed) {
  for (const s of segments) {
    const p = Math.min(1, Math.max(0, (elapsed - s.start) / (s.end - s.start)));
    s.fill.style.transform = `scaleX(${p})`;
    s.li.classList.toggle('is-current', elapsed >= s.start && elapsed < s.end);
    s.li.classList.toggle('is-past', elapsed >= s.end);
  }
}

/* ------------------------------------------------------------ the steps */

function enterStep(index) {
  const step = program[index];
  const first = current === -1;
  current = index;
  step.switched = false;

  const n = GROUP_ORDER.filter((g) => program.some((s) => s.group === g)).indexOf(step.group) + 1;
  const kicker = step.micro ? 'Mikropause' : step.group ? `${String(n).padStart(2, '0')} · ${GROUPS[step.group]}` : 'Pause';
  swapCopy(kicker, step.title, step.text, !first);
  if (!first) sound('step');

  if (step.id === 'breath' && primary && settings.sound.ambient) sea ??= createSea();
  else sea?.quiet();

  gsap.to('.dim', { opacity: step.id === 'palming' ? 0.72 : 0, duration: 2.4, ease: 'power2.inOut' });
}

/** Moves the orb for the current exercise. `t` = seconds into the step. */
function choreograph(step, t) {
  const left = step.duration - t;
  let word = '';
  let count = '';
  let follow = 0.06;
  Object.assign(target, { x: 0, y: 0.08, size: 0.28, amp: 0.085, halo: 0.6, opacity: 1, speed: 0.6, dust: 1 });
  orb.params.squash += (0 - orb.params.squash) * 0.25;
  orb.params.breath += (0 - orb.params.breath) * 0.05;

  switch (step.id) {
    case 'intro':
      target.size = 0.28 + 0.02 * Math.sin(t * 1.1);
      target.speed = 0.45;
      break;
    case 'breath': {
      const b = breathAt(step.pattern, t);
      target.size = 0.22 + 0.17 * b.value;
      target.halo = 0.4 + 0.6 * b.value;
      target.speed = 0.45;
      orb.params.breath = b.value * 0.4;
      word = PHASE_WORD[b.phase];
      count = String(Math.ceil(b.left));
      follow = 0.12;
      sea?.breathe(b.value);
      break;
    }
    case 'far':
      // The light recedes into the distance – the eyes follow it there.
      target.size = 0.055;
      target.amp = 0.03;
      target.halo = 1.2;
      target.dust = 1.4;
      follow = 0.03;
      break;
    case 'track': {
      const a = t * ((Math.PI * 2) / 7.5);
      target.size = 0.05;
      target.halo = 1.1;
      target.x = 0.27 * Math.sin(a);
      target.y = 0.08 + 0.34 * Math.sin(a) * Math.cos(a);
      follow = 0.2;
      break;
    }
    case 'palming':
      target.size = 0.15;
      target.opacity = 0.35;
      target.halo = 0.25;
      target.speed = 0.25;
      target.dust = 0.3;
      if (left < 5) {
        word = 'Augen auf';
        target.opacity = 1;
        target.halo = 0.8;
      }
      if (left < 5 && !step.switched) {
        step.switched = true;
        sound('soft');
        swapText('Öffne langsam die Augen und blinzle ein paar Mal.');
      }
      break;
    case 'blink': {
      target.size = 0.2;
      const phase = (t % 1.7) / 1.7;
      orb.params.squash = phase < 0.13 ? Math.sin((phase / 0.13) * Math.PI) : 0;
      break;
    }
    case 'shoulders': {
      const a = t * ((Math.PI * 2) / 5.5);
      target.size = 0.19;
      target.x = 0.05 * Math.cos(a);
      target.y = 0.08 + 0.09 * Math.sin(a);
      follow = 0.2;
      break;
    }
    case 'neck': {
      const right = t >= step.duration / 2;
      target.size = 0.19;
      target.x = right ? 0.13 : -0.13;
      target.y = 0.05;
      follow = 0.035;
      if (right && !step.switched) {
        step.switched = true;
        sound('soft');
        swapText('Und jetzt sanft zur rechten Schulter.');
      }
      break;
    }
    case 'reach': {
      const p = Math.min(1, t / Math.max(4, step.duration * 0.6));
      const e = 1 - Math.pow(1 - p, 3);
      target.y = 0.02 + 0.17 * e;
      target.size = 0.2 + 0.08 * e;
      target.halo = 0.6 + 0.4 * e;
      break;
    }
    case 'move':
      target.size = 0.26;
      target.y = 0.08 + 0.018 * Math.sin(t * 1.3);
      target.speed = 0.7;
      break;
  }

  setPhase(word, count);
  return follow;
}

function lerpOrb(k) {
  for (const key of Object.keys(target)) {
    let goal = target[key];
    if (key === 'size' || key === 'opacity') goal *= reveal.k;
    orb.params[key] += (goal - orb.params[key]) * k;
  }
}

/* ---------------------------------------------------------------- finish */

async function finish() {
  if (finished) return;
  finished = true;
  sound('end');
  sea?.stop(2.5);
  sea = null;
  setPhase('', '');
  gsap.to('.dim', { opacity: 0, duration: 1.5 });
  gsap.to(['#copy', '#bottom'], { autoAlpha: 0, y: -12, duration: 0.6, ease: 'power2.in' });
  Object.assign(target, { x: 0, y: 0.12, size: 0.3, amp: 0.1, halo: 1, opacity: 1, speed: 0.8, dust: 1.2 });

  if (info.kind === 'micro') {
    swapCopy('Mikropause', 'Danke.', 'Weiter geht es.', true);
    gsap.to('#copy', { autoAlpha: 1, y: 0, duration: 0.6, delay: 0.7 });
    if (info.preview) setTimeout(() => api.action('complete'), 2400);
    return;
  }

  const done = $('#done');
  done.hidden = false;
  gsap.from(done.children, { y: 30, autoAlpha: 0, duration: 1.3, ease: 'expo.out', stagger: 0.08, delay: 0.5 });
  if (info.preview) {
    $('#done-text').textContent = 'So fühlt sich eine Pause mit Atem an.';
    return;
  }
  // Give the scheduler a moment to count this break before we read the stats.
  await new Promise((r) => setTimeout(r, 1300));
  try {
    const stats = await api.getStats();
    const n = stats.today.taken + stats.today.natural;
    const nth = ORDINALS[n - 1] || `${n}.`;
    $('#done-text').textContent = n > 0 ? `Das war deine ${nth} Pause heute. Dein Kopf dankt es dir.` : 'Dein Kopf dankt es dir.';
  } catch {
    $('#done-text').textContent = 'Dein Kopf dankt es dir.';
  }
}

/* ---------------------------------------------------------------- frame */

let lastRemaining = '';
function frame() {
  if (!info || closing) return;
  const now = Date.now();
  const elapsed = (now - info.startedAt) / 1000;
  const total = info.duration / 1000;

  const remaining = finished ? 'fertig' : countdown(Math.max(0, info.endsAt - now));
  if (remaining !== lastRemaining) {
    lastRemaining = remaining;
    $('#remaining').textContent = remaining;
  }

  if (!finished && elapsed >= total) finish();
  if (finished) {
    orb.params.breath = 0.2 + 0.2 * Math.sin(now / 1400);
    lerpOrb(0.04);
    return;
  }

  let index = program.findIndex((s) => elapsed < s.start + s.duration);
  if (index === -1) index = program.length - 1;
  if (index !== current) enterStep(index);
  const step = program[index];
  const follow = choreograph(step, Math.max(0, elapsed - step.start));
  lerpOrb(follow);
  updateTimeline(elapsed);
}

/* -------------------------------------------------------------- controls */

function setupControls() {
  const skip = $('#skip');
  const label = $('#skip-label');
  let holdMs = info.holdMs;

  if (info.preview) {
    label.textContent = 'Vorschau beenden';
    holdMs = 0;
  } else if (info.skip === 'click') {
    label.textContent = 'Überspringen';
  } else if (info.skip === 'hold') {
    label.textContent = 'Zum Überspringen halten';
  } else {
    label.textContent = 'Notausstieg · 5 s halten';
    skip.classList.add('is-emergency');
  }
  const hold = holdButton(skip, {
    holdMs,
    onComplete: () => {
      if (!armed()) return hold.reset();
      api.action('skip');
    },
  });

  const snooze = $('#snooze');
  if (info.kind === 'long' && info.snoozesLeft > 0 && !info.preview) {
    snooze.hidden = false;
    const hint = info.snoozesLeft < 10 ? `<span class="btn__hint">noch ${info.snoozesLeft}×</span>` : '';
    snooze.innerHTML = `${info.snoozeMin} Min. später ${hint}`;
    snooze.addEventListener('click', () => armed() && api.action('snooze'));
  }

  $('#back').addEventListener('click', () => armed() && api.action('complete'));

  window.addEventListener('keydown', (e) => {
    if (!armed() || closing) return;
    if (finished && ['Enter', ' ', 'Escape'].includes(e.key)) {
      e.preventDefault();
      api.action('complete');
    } else if (!finished && e.key === 'Escape' && (info.escSkips || info.preview)) {
      api.action('skip');
    }
  });

  // The pointer fades away when you're not using it.
  let idleTimer = null;
  const wake = () => {
    document.body.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('is-idle'), 2600);
  };
  window.addEventListener('pointermove', wake);
  wake();
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  [info, settings] = await Promise.all([api.getBreak(), api.getSettings()]);
  if (!info) {
    // Nothing (left) to show – e.g. the break ended while this window was loading.
    api.action('complete');
    return;
  }
  applyPalette(settings.palette);
  setVolume(settings.sound.volume);
  document.body.classList.toggle('is-micro', info.kind === 'micro');
  $('#kind').textContent = info.preview ? 'Vorschau' : info.kind === 'micro' ? 'Mikropause' : 'Pause';

  program =
    info.kind === 'micro'
      ? microProgram(info.duration / 1000)
      : buildProgram(info.duration / 1000, settings.activities, settings.breathPattern);
  buildTimeline();

  orb = createOrb($('#gl'), { colors: palette(settings.palette).colors, particles: 560, pointer: false });
  Object.assign(orb.params, { size: 0, opacity: 0, y: 0.08, amp: 0.085, speed: 0.5 });

  if (primary) setupControls();
  await document.fonts?.ready;

  // Enter softly: the desktop dims, the light appears, then the words.
  gsap
    .timeline()
    .to('.backdrop', { opacity: 1, duration: 2.4, ease: 'power2.inOut' })
    .to(reveal, { k: 1, duration: 2.6, ease: 'expo.out' }, 0.5)
    .to('.stage', { opacity: 1, duration: 1.4, ease: 'power2.out' }, 1);
  armedAt = performance.now() + 1500;
  sound('start');

  gsap.ticker.add(frame);
  if (!inElectron) {
    gsap.ticker.lagSmoothing(0);
    window.__atem = { gsap, orb, program, info };
  }

  api.onEvent((e) => {
    if (e.type === 'break:finished') finish();
    if (e.type === 'break:closing' && !closing) {
      closing = true;
      sea?.stop(0.8);
      gsap.to(['.stage', '.gl', '.backdrop', '.dim', '.grain'], { opacity: 0, duration: 0.8, ease: 'power2.inOut' });
    }
  });
}

boot();
