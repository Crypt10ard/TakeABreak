import './style.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';

import { api, inElectron } from '../shared/api.js';
import { createOrb } from '../shared/orb.js';
import { PALETTES, palette, applyPalette } from '../shared/palettes.js';
import { countdown, clock, minutes as fmtMinutes, hoursMinutes } from '../shared/format.js';
import { chime, setVolume } from '../shared/sound.js';
import { RollingText, magnetic, holdButton, bindToggle, bindSegmented, bindStepper, reducedMotion } from '../shared/ui.js';
import { createRuler } from './ruler.js';
import { createCycle } from './cycle.js';
import { createEye } from './eye.js';
import { breathVisual, eyesVisual, stretchVisual, moveVisual } from './visuals.js';
import { createCursor } from './cursor.js';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v;
  return out;
};

const query = new URLSearchParams(location.search);
document.documentElement.dataset.platform = query.get('platform') || api.platform || 'win32';

let settings;
let snap;
let info;
let orb;
let smoother;
let cycle;
let eye;
const rhythm = { work: 55, rest: 5 };

/* ---------------------------------------------------------------- saving */

let pending = {};
let saveTimer = null;

function save(patch) {
  pending = merge(pending, patch);
  settings = merge(settings, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const batch = pending;
    pending = {};
    try {
      const stored = await api.setSettings(batch);
      if (!Object.keys(pending).length) settings = stored;
      flashSaved();
    } catch (err) {
      console.error('saving failed', err);
    }
  }, 240);
}

function flashSaved() {
  const el = $('#saved');
  gsap.killTweensOf(el);
  gsap
    .timeline()
    .to(el, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' })
    .fromTo('#saved svg', { strokeDashoffset: 16 }, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, '<0.05')
    .to(el, { opacity: 0, y: -6, duration: 0.5, ease: 'power2.in' }, '+=1.3');
}

/* ------------------------------------------------------------------ bar */

function setupBar() {
  $$('#win-controls [data-win]').forEach((btn) =>
    btn.addEventListener('click', () => api.action(`window-${btn.dataset.win}`)),
  );
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      api.action('window-close');
    }
  });
}

/* ------------------------------------------------------------------ orb */

function setupOrb() {
  orb = createOrb($('#gl'), { colors: palette(settings.palette).colors });
  const p = orb.params;
  p.opacity = 0;
  p.size = 0.02;
  if (reducedMotion) p.speed = 0.35;

  const anchors = {
    hero: $('.hero__anchor'),
    rhythm: $('.cycle__core'),
    system: $('.mood__anchor'),
    outro: $('.outro__anchor'),
  };
  let anchor = anchors.hero;
  const intro = { k: 0 };
  gsap.to(intro, { k: 1, duration: 2.4, ease: 'expo.out', delay: 0.15 });

  for (const section of $$('[data-section]')) {
    const name = section.dataset.section;
    ScrollTrigger.create({
      trigger: sectionTrigger(section),
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => {
        if (self.isActive) anchor = anchors[name] || null;
      },
    });
  }

  const target = { x: 0.2, y: 0, size: 0.5, opacity: 1 };
  gsap.ticker.add((time, delta) => {
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      target.x = (r.left + r.width / 2) / window.innerWidth - 0.5;
      target.y = 0.5 - (r.top + r.height / 2) / window.innerHeight;
      target.size = r.height / window.innerHeight;
      target.opacity = 1;
    } else {
      target.opacity = 0;
    }
    const k = 1 - Math.pow(1 - 0.07, delta / 16.67);
    if (intro.k < 0.02) {
      p.x = target.x;
      p.y = target.y;
    }
    p.x += (target.x - p.x) * k;
    p.y += (target.y - p.y) * k;
    p.size += (target.size * intro.k - p.size) * k;
    p.opacity += (target.opacity * Math.min(1, intro.k * 1.6) - p.opacity) * k * 0.9;
    // A slow, calm breath – about 6.5 breaths a minute.
    p.breath = 0.35 + 0.35 * Math.sin(time * ((Math.PI * 2) / 9.2));
  });
}

/* ------------------------------------------------------------ sections */

/** A pinned section is represented by its pin spacer, which spans the whole pinned distance. */
function sectionTrigger(section) {
  return section.parentElement?.classList.contains('pin-spacer') ? section.parentElement : section;
}

function setupSections() {
  const links = $$('#rail a');
  for (const section of $$('[data-section]')) {
    ScrollTrigger.create({
      trigger: sectionTrigger(section),
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive) return;
        const name = section.dataset.section === 'outro' ? 'system' : section.dataset.section;
        links.forEach((a) => a.classList.toggle('is-active', a.dataset.goto === name));
      },
    });
  }
  $$('[data-goto]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      goto(a.dataset.goto);
    }),
  );
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => gsap.set('#progress', { scaleY: self.progress }),
  });
}

function goto(name) {
  const el = document.getElementById(name);
  if (!el) return;
  if (smoother) smoother.scrollTo(el, true, 'top top');
  else el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
}

function setupReveals() {
  for (const el of $$('[data-split]')) {
    SplitText.create(el, {
      type: 'lines,words',
      mask: 'lines',
      linesClass: 'line',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.words, {
          yPercent: 115,
          rotate: 3,
          duration: 1.25,
          ease: 'expo.out',
          stagger: 0.055,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        }),
    });
  }
  for (const el of $$('[data-reveal]')) {
    gsap.from(el, {
      y: 50,
      autoAlpha: 0,
      duration: 1.25,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    });
  }
  for (const el of $$('[data-reveal-stagger]')) {
    gsap.from(el.children, {
      y: 60,
      autoAlpha: 0,
      duration: 1.2,
      ease: 'expo.out',
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  }

  // The hero drifts away as you scroll into the page.
  gsap.to('.hero__title', {
    yPercent: -18,
    opacity: 0.15,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.hero__bottom, .hero__top', {
    y: -80,
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: '20% top', end: '70% top', scrub: true },
  });
}

function setupMarquee() {
  const track = $('.marquee__track');
  const loop = gsap.to(track, { xPercent: -50, duration: 42, ease: 'none', repeat: -1 });
  const skew = gsap.quickTo(track, 'skewX', { duration: 0.5, ease: 'power3.out' });
  ScrollTrigger.create({
    trigger: '.marquee',
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const v = self.getVelocity();
      const dir = self.direction;
      const boost = 1 + Math.min(7, Math.abs(v) / 260);
      gsap.to(loop, {
        timeScale: dir * boost,
        duration: 0.25,
        overwrite: true,
        onComplete: () => gsap.to(loop, { timeScale: dir, duration: 1.4, ease: 'power2.out' }),
      });
      skew(gsap.utils.clamp(-10, 10, v / -260));
      gsap.delayedCall(0.18, () => skew(0));
    },
  });
}

/* ----------------------------------------------------------------- hero */

let heroTime;
const heroCache = {};

function setText(key, el, text) {
  if (heroCache[key] === text) return;
  heroCache[key] = text;
  el.textContent = text;
}

function setupHero() {
  heroTime = new RollingText($('#hero-time'), '00:00');
  const breakBtn = $('#hero-break');
  const pauseBtn = $('#hero-pause');
  const menu = $('#pausemenu');
  magnetic(breakBtn, 0.22);
  magnetic(pauseBtn, 0.22);

  breakBtn.addEventListener('click', () => {
    if (snap?.mode === 'paused') api.action('resume');
    else if (snap?.mode !== 'break') api.action('break-now');
  });

  const close = () => {
    menu.classList.remove('is-open');
    pauseBtn.setAttribute('aria-expanded', 'false');
  };
  pauseBtn.addEventListener('click', () => {
    const open = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    pauseBtn.setAttribute('aria-expanded', String(open));
    if (open) gsap.from('.pausemenu__list button', { y: 8, autoAlpha: 0, duration: 0.5, stagger: 0.04, ease: 'expo.out' });
  });
  $$('[data-pause]').forEach((b) =>
    b.addEventListener('click', () => {
      api.action('pause', b.dataset.pause === 'tomorrow' ? 'tomorrow' : Number(b.dataset.pause));
      close();
    }),
  );
  document.addEventListener('pointerdown', (e) => {
    if (!menu.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());

  const date = new Date();
  $('#hero-date').textContent = date.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  gsap.ticker.add(renderHero);
}

function renderHero() {
  if (!snap) return;
  const now = Date.now();
  let label = 'Nächste Pause in';
  let time;
  let sub;
  let meter = 0;
  let status = 'Fokus';
  let mode = snap.mode;
  let action = 'Jetzt Pause machen';

  switch (snap.mode) {
    case 'paused':
      label = 'Pausiert bis';
      time = clock(snap.pausedUntil);
      sub = `Noch ${fmtMinutes(Math.ceil((snap.pausedUntil - now) / 60000))}. Atem wartet still.`;
      status = 'Pausiert';
      action = 'Fortsetzen';
      break;
    case 'break': {
      const b = snap.break;
      label = b?.kind === 'micro' ? 'Mikropause' : 'Pause läuft';
      time = countdown((b?.endsAt ?? now) - now);
      meter = b ? (now - b.startedAt) / b.duration : 0;
      sub = 'Schön, dass du sie machst.';
      status = 'Pause';
      action = 'Pause läuft';
      break;
    }
    case 'idle':
      label = 'Du bist gerade weg';
      time = '00:00';
      sub = 'Die Uhr steht still, bis du zurück bist.';
      status = 'Abwesend';
      break;
    default: {
      const left = snap.nextBreakAt - now;
      const total = snap.nextBreakAt - snap.workStart;
      time = countdown(left);
      meter = total > 0 ? 1 - left / total : 0;
      const focus = Math.max(0, Math.floor((now - snap.workStart) / 60000));
      sub = focus < 1 ? 'Frisch im Fokus' : `Seit ${fmtMinutes(focus)} im Fokus`;
      if (snap.nextMicroAt && snap.nextMicroAt < snap.nextBreakAt - 60_000) {
        sub += ` · Mikropause in ${countdown(snap.nextMicroAt - now)}`;
      }
      if (left < 5 * 60_000) {
        status = 'Gleich Pause';
        mode = 'soon';
      }
      if (orb) orb.params.energy = gsap.utils.clamp(0, 1, (meter - 0.62) / 0.38);
    }
  }
  if (snap.mode !== 'work' && orb) orb.params.energy += (0 - orb.params.energy) * 0.05;

  heroTime.set(time);
  setText('label', $('#hero-label'), label);
  setText('sub', $('#hero-sub'), sub);
  setText('status', $('#bar-status-text'), status);
  setText('action', $('#hero-break-label'), action);
  $('#bar-status').dataset.mode = mode;
  $('#hero-pause').style.display = snap.mode === 'paused' ? 'none' : '';
  gsap.set('#hero-meter', { scaleX: gsap.utils.clamp(0, 1, meter), backgroundPosition: `${-meter * 200}px 0` });
}

/* --------------------------------------------------------------- rhythm */

function microCount(work) {
  if (!settings.micro.enabled) return 0;
  let n = 0;
  for (let m = settings.micro.intervalMin; m < work - 3; m += settings.micro.intervalMin) n++;
  return n;
}

function cycleArgs() {
  return { work: rhythm.work, rest: rhythm.rest, micro: settings.micro.intervalMin, microEnabled: settings.micro.enabled };
}

function refreshRhythm() {
  cycle.update(cycleArgs());
  $('#legend-work').textContent = rhythm.work;
  $('#legend-rest').textContent = rhythm.rest;
  $('#legend-micro').textContent = microCount(rhythm.work);
  $('#legend-micro-wrap').style.display = settings.micro.enabled ? '' : 'none';
  $('#cycle-total').textContent = rhythm.work + rhythm.rest;

  const perDay = Math.max(1, Math.floor(480 / (rhythm.work + rhythm.rest)));
  const micro = microCount(rhythm.work) * perDay;
  $('#insight').innerHTML =
    `An einem 8‑Stunden‑Tag sind das <b>${perDay} ${perDay === 1 ? 'Pause' : 'Pausen'}</b> ` +
    `und <b>${perDay * rhythm.rest} Minuten</b> nur für dich` +
    (micro ? `, dazu <b>${micro} Mikropausen</b> für die Augen.` : '.');

  $$('#presets button').forEach((b) => {
    const [w, r] = b.dataset.preset.split(',').map(Number);
    b.classList.toggle('is-active', w === rhythm.work && r === rhythm.rest);
  });
}

function setupRhythm() {
  rhythm.work = settings.work.intervalMin;
  rhythm.rest = settings.rest.durationMin;
  const workNum = new RollingText($('#work-num'), rhythm.work);
  const restNum = new RollingText($('#rest-num'), rhythm.rest);
  cycle = createCycle($('#cycle'), cycleArgs());

  const rulerWork = createRuler($('#ruler-work'), {
    min: 10,
    max: 180,
    step: 5,
    value: rhythm.work,
    spacing: 17,
    major: (v) => v % 30 === 0,
    label: 'Fokuszeit in Minuten',
    onInput: (v) => {
      rhythm.work = v;
      workNum.set(v);
      refreshRhythm();
    },
    onChange: (v) => save({ work: { intervalMin: v } }),
  });
  const rulerRest = createRuler($('#ruler-rest'), {
    min: 1,
    max: 30,
    step: 1,
    value: rhythm.rest,
    spacing: 16,
    major: (v) => v % 5 === 0 || v === 1,
    label: 'Pausenlänge in Minuten',
    onInput: (v) => {
      rhythm.rest = v;
      restNum.set(v);
      refreshRhythm();
    },
    onChange: (v) => save({ rest: { durationMin: v } }),
  });

  $$('#presets button').forEach((b) =>
    b.addEventListener('click', () => {
      const [w, r] = b.dataset.preset.split(',').map(Number);
      rulerWork.set(w);
      rulerRest.set(r);
      save({ work: { intervalMin: w }, rest: { durationMin: r } });
    }),
  );
  refreshRhythm();
}

function updateCycleNow() {
  if (!snap || !cycle) return;
  const now = Date.now();
  if (snap.mode === 'work') {
    const total = snap.nextBreakAt - snap.workStart;
    cycle.setNow(total > 0 ? ((now - snap.workStart) / total) * rhythm.work : 0, true);
  } else if (snap.mode === 'break' && snap.break?.kind === 'long') {
    cycle.setNow(rhythm.work + ((now - snap.break.startedAt) / snap.break.duration) * rhythm.rest, true);
  } else {
    cycle.setNow(0, false);
  }
}

/* ----------------------------------------------------------------- eyes */

function setupEyes() {
  eye = createEye($('#eye'));
  const interval = new RollingText($('#rule-interval'), settings.micro.intervalMin);
  const duration = new RollingText($('#rule-duration'), settings.micro.durationSec);
  const syncRows = () => {
    $$('[data-needs-micro]').forEach((row) => row.classList.toggle('is-disabled', !settings.micro.enabled));
    $('#legend-interval').textContent = `alle ${settings.micro.intervalMin} Min.`;
    $('#legend-duration').textContent = `${settings.micro.durationSec} Sekunden`;
  };

  bindToggle($('#micro-enabled'), {
    value: settings.micro.enabled,
    onChange: (v) => {
      save({ micro: { enabled: v } });
      eye.setAwake(v);
      syncRows();
      refreshRhythm();
    },
  });
  bindStepper($('#micro-interval'), {
    value: settings.micro.intervalMin,
    min: 10,
    max: 60,
    step: 5,
    format: (v) => `alle ${v} Min.`,
    onChange: (v) => {
      save({ micro: { intervalMin: v } });
      interval.set(v);
      syncRows();
      refreshRhythm();
    },
  });
  bindStepper($('#micro-duration'), {
    value: settings.micro.durationSec,
    min: 10,
    max: 60,
    step: 5,
    format: (v) => `${v} Sek.`,
    onChange: (v) => {
      save({ micro: { durationSec: v } });
      duration.set(v);
      syncRows();
    },
  });
  bindSegmented($('#micro-style'), { value: settings.micro.style, onChange: (v) => save({ micro: { style: v } }) });
  syncRows();
  eye.setAwake(settings.micro.enabled);
}

/* -------------------------------------------------------------- program */

function setupProgram() {
  const track = $('#program-track');
  const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

  const horizontal = gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: '#program',
      start: 'top top',
      end: () => `+=${distance()}`,
      pin: true,
      scrub: 0.8,
      invalidateOnRefresh: true,
      onUpdate: (self) => gsap.set('#program-bar', { scaleX: self.progress }),
    },
  });

  const visuals = {
    breath: breathVisual($('[data-visual="breath"]'), settings.breathPattern),
    eyes: eyesVisual($('[data-visual="eyes"]')),
    stretch: stretchVisual($('[data-visual="stretch"]')),
    move: moveVisual($('[data-visual="move"]')),
  };

  for (const card of $$('.card')) {
    const key = card.dataset.activity;
    if (key) {
      // Only animate what can be seen.
      ScrollTrigger.create({
        trigger: card,
        containerAnimation: horizontal,
        start: 'left 110%',
        end: 'right -10%',
        onToggle: (self) => (self.isActive ? visuals[key].play() : visuals[key].pause()),
      });

      const toggle = bindToggle(card.querySelector('.toggle'), {
        value: settings.activities[key],
        onChange: (v) => {
          const next = { ...settings.activities, [key]: v };
          if (!Object.values(next).some(Boolean)) {
            // At least one activity has to stay – the break needs something to do.
            toggle.set(true);
            gsap.fromTo(card, { x: -6 }, { x: 0, duration: 0.7, ease: 'elastic.out(1, 0.25)' });
            return;
          }
          card.classList.toggle('is-off', !v);
          save({ activities: { [key]: v } });
        },
      });
      card.classList.toggle('is-off', !settings.activities[key]);
    }

    if (!reducedMotion) {
      gsap.set(card, { transformPerspective: 900 });
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
        rx((0.5 - py) * 8);
        ry((px - 0.5) * 10);
      });
      card.addEventListener('pointerleave', () => {
        rx(0);
        ry(0);
      });
    }
  }

  bindSegmented($('#breath-pattern'), {
    value: settings.breathPattern,
    onChange: (v) => {
      save({ breathPattern: v });
      visuals.breath.update(v);
    },
  });

  magnetic($('#try-break'), 0.2);
  $('#try-break').addEventListener('click', () => api.action('preview-break', 60));
  $('#try-micro').addEventListener('click', () => api.action('preview-micro'));
}

/* ----------------------------------------------------------- strictness */

const STRICT_COPY = {
  gentle: {
    quote: 'Ich erinnere dich. <em>Du</em> entscheidest.',
    facts: [
      ['Überspringen', 'ein Klick'],
      ['Verschieben', 'so oft du willst'],
      ['Esc-Taste', 'beendet die Pause'],
    ],
    button: 'Überspringen',
    hint: 'Ein Klick genügt.',
  },
  balanced: {
    quote: 'Gerade genug Reibung, damit du nicht <em>aus Reflex</em> wegklickst.',
    facts: [
      ['Überspringen', 'kurz gedrückt halten'],
      ['Verschieben', 'höchstens 2×'],
      ['Esc-Taste', 'wirkungslos'],
    ],
    button: 'Zum Überspringen halten',
    hint: 'Halte gedrückt, bis sich der Knopf füllt.',
  },
  strict: {
    quote: 'Für Tage, an denen du dich <em>selbst</em> nicht bremsen kannst.',
    facts: [
      ['Überspringen', 'nicht vorgesehen'],
      ['Verschieben', 'genau einmal'],
      ['Notausstieg', '5 Sekunden halten'],
    ],
    button: 'Notausstieg · 5 s halten',
    hint: 'Nur für echte Notfälle.',
  },
};
const HOLD_MS = { gentle: 0, balanced: 1600, strict: 5000 };

function setupStrictness() {
  const quote = $('#strict-quote');
  const facts = $('#strict-facts');
  const label = $('#demo-hold-label');
  const hint = $('#demo-hint');
  let split = null;

  const hold = holdButton($('#demo-hold'), {
    holdMs: HOLD_MS[settings.strictness],
    onComplete: () => {
      label.textContent = 'Übersprungen ✓';
      hint.textContent = 'Genau so. Im Ernstfall geht es zurück an die Arbeit.';
      gsap.delayedCall(1.8, () => {
        hold.reset();
        render(settings.strictness, false);
      });
    },
  });

  function render(mode, animate = true) {
    const copy = STRICT_COPY[mode];
    const apply = () => {
      split?.revert();
      quote.innerHTML = copy.quote;
      facts.innerHTML = copy.facts.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
      label.textContent = copy.button;
      hint.textContent = copy.hint;
      hold.setHold(HOLD_MS[mode]);
      if (!animate) return;
      split = SplitText.create(quote, { type: 'lines,words', mask: 'lines', linesClass: 'line' });
      gsap.from(split.words, { yPercent: 110, duration: 0.9, ease: 'expo.out', stagger: 0.03 });
      gsap.from(facts.children, { x: -16, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06, delay: 0.1 });
    };
    if (!animate || !split) return apply();
    gsap.to(split.words, { yPercent: -110, duration: 0.35, ease: 'power2.in', stagger: 0.012, onComplete: apply });
  }

  bindSegmented($('#strictness'), {
    value: settings.strictness,
    onChange: (v) => {
      save({ strictness: v });
      render(v);
    },
  });
  render(settings.strictness, false);
  split = SplitText.create(quote, { type: 'lines,words', mask: 'lines', linesClass: 'line' });

  const syncWarn = () =>
    $$('[data-needs-warn]').forEach((row) => row.classList.toggle('is-disabled', !settings.warning.enabled));
  bindToggle($('#warn-enabled'), {
    value: settings.warning.enabled,
    onChange: (v) => {
      save({ warning: { enabled: v } });
      syncWarn();
    },
  });
  bindStepper($('#warn-seconds'), {
    value: settings.warning.seconds,
    min: 15,
    max: 180,
    step: 15,
    format: (v) => `${v} Sek.`,
    onChange: (v) => save({ warning: { seconds: v } }),
  });
  bindStepper($('#snooze-minutes'), {
    value: settings.snooze.minutes,
    min: 1,
    max: 30,
    step: 1,
    format: (v) => `${v} Min.`,
    onChange: (v) => save({ snooze: { minutes: v } }),
  });
  syncWarn();
}

/* ---------------------------------------------------------------- stats */

let statsShown = false;

function countTo(el, value) {
  const obj = { v: Number(el.textContent) || 0 };
  gsap.to(obj, {
    v: value,
    duration: statsShown ? 0.8 : 1.8,
    ease: 'expo.out',
    onUpdate: () => (el.textContent = Math.round(obj.v)),
  });
}

function renderStats(data, animate) {
  const t = data.today;
  const taken = t.taken + t.natural;
  const due = taken + t.skipped;
  const rate = due ? taken / due : 0;
  const { h, m } = hoursMinutes(t.focusSec);

  const values = { '#stat-taken': taken, '#stat-focus-h': h, '#stat-focus-m': m, '#stat-micro': t.micro, '#stat-streak': data.streak };
  for (const [sel, v] of Object.entries(values)) {
    if (animate) countTo($(sel), v);
    else $(sel).textContent = v;
  }
  $('#stat-due').textContent = due;
  $('#stat-streak-unit').textContent = data.streak === 1 ? 'Tag' : 'Tage';
  gsap.to('#compliance-ring', { strokeDashoffset: 326.73 * (1 - rate), duration: animate ? 1.8 : 0, ease: 'expo.out' });

  let sentence = 'Noch keine Pause heute. Die erste kommt bestimmt.';
  if (due > 0) {
    const tail = rate >= 0.9 ? 'Stark.' : rate >= 0.6 ? 'Da geht noch was.' : 'Morgen wird ruhiger.';
    sentence = `${taken} von ${due} Pausen genommen. ${tail}`;
  }
  $('#stats-sentence').textContent = sentence;

  const max = Math.max(4, ...data.week.map((d) => d.taken + d.natural + d.skipped));
  $('#week').innerHTML = data.week
    .map((d) => {
      const done = d.taken + d.natural;
      return `
      <div class="wbar${d.isToday ? ' is-today' : ''}">
        <span class="wbar__num">${done}</span>
        <div class="wbar__col">
          <span class="wbar__skip" style="height:${(d.skipped / max) * 100}%"></span>
          <span class="wbar__fill" style="height:${(done / max) * 100}%"></span>
        </div>
        <span class="wbar__day">${d.label}</span>
      </div>`;
    })
    .join('');
  if (animate) {
    gsap.from('#week .wbar__fill, #week .wbar__skip', { scaleY: 0, duration: 1.2, ease: 'expo.out', stagger: 0.04 });
  }
}

async function setupStats() {
  let data = await api.getStats();
  renderStats({ ...data, today: { ...data.today, taken: 0, natural: 0, skipped: 0, focusSec: 0, micro: 0 }, streak: 0 }, false);
  ScrollTrigger.create({
    trigger: '#stats',
    start: 'top 70%',
    once: true,
    onEnter: () => {
      renderStats(data, true);
      statsShown = true;
    },
  });
  // Keep the numbers fresh while the window is open.
  setInterval(async () => {
    if (!statsShown || document.hidden) return;
    data = await api.getStats();
    renderStats(data, false);
  }, 30_000);
}

/* --------------------------------------------------------------- system */

function setupSystem() {
  bindToggle($('#autostart'), { value: settings.autostart, onChange: (v) => save({ autostart: v }) });
  if (info && !info.packaged) $('#autostart-note').textContent = 'Wird aktiv, sobald Atem installiert ist (Entwicklungsmodus).';

  const syncIdle = () => $$('[data-needs-idle]').forEach((row) => row.classList.toggle('is-disabled', !settings.idle.enabled));
  bindToggle($('#idle-enabled'), {
    value: settings.idle.enabled,
    onChange: (v) => {
      save({ idle: { enabled: v } });
      syncIdle();
    },
  });
  bindStepper($('#idle-threshold'), {
    value: settings.idle.thresholdMin,
    min: 1,
    max: 30,
    step: 1,
    format: (v) => `${v} Min.`,
    onChange: (v) => save({ idle: { thresholdMin: v } }),
  });
  syncIdle();

  bindToggle($('#sound-chime'), {
    value: settings.sound.chime,
    onChange: (v) => {
      save({ sound: { chime: v } });
      if (v) chime('soft');
    },
  });
  bindToggle($('#sound-ambient'), { value: settings.sound.ambient, onChange: (v) => save({ sound: { ambient: v } }) });
  bindToggle($('#tray-countdown'), { value: settings.trayCountdown, onChange: (v) => save({ trayCountdown: v }) });

  const range = $('#volume input');
  const out = $('#volume .slider__value');
  const paint = () => {
    range.style.setProperty('--p', `${range.value}%`);
    out.textContent = `${range.value} %`;
  };
  range.value = Math.round(settings.sound.volume * 100);
  paint();
  range.addEventListener('input', () => {
    paint();
    save({ sound: { volume: Number(range.value) / 100 } });
  });
  range.addEventListener('change', () => {
    setVolume(Number(range.value) / 100);
    chime('soft');
  });

  // Colour moods: the orb, the UI accents and every future break take the new palette.
  const wrap = $('#palettes');
  const name = $('#palette-name');
  wrap.innerHTML = Object.entries(PALETTES)
    .map(
      ([key, p]) =>
        `<button class="swatch" role="radio" aria-label="${p.name}" data-palette="${key}" ` +
        `style="--c1:${p.colors[0]};--c2:${p.colors[1]};--c3:${p.colors[2]}"></button>`,
    )
    .join('');
  const mark = (key) =>
    $$('.swatch', wrap).forEach((s) => s.setAttribute('aria-checked', String(s.dataset.palette === key)));
  mark(settings.palette);
  name.textContent = palette(settings.palette).name;
  $$('.swatch', wrap).forEach((s) =>
    s.addEventListener('click', () => {
      const key = s.dataset.palette;
      if (key === settings.palette) return;
      mark(key);
      applyPalette(key);
      orb.setColors(palette(key).colors);
      save({ palette: key });
      gsap
        .timeline()
        .to(name, { yPercent: -60, autoAlpha: 0, duration: 0.25, ease: 'power2.in' })
        .call(() => (name.textContent = palette(key).name))
        .fromTo(name, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.7, ease: 'expo.out' });
    }),
  );

  $('#version').textContent = `Atem ${info?.version ?? ''} · Mit Ruhe gebaut`;
  const quit = $('#quit');
  let armed = false;
  quit.addEventListener('click', () => {
    if (armed) return api.action('quit');
    armed = true;
    quit.textContent = 'Wirklich beenden? Nochmals klicken';
    setTimeout(() => {
      armed = false;
      quit.textContent = 'Atem beenden';
    }, 3500);
  });
}

/* ---------------------------------------------------------------- intro */

function intro() {
  document.body.classList.remove('is-intro');
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('.bar', { autoAlpha: 0, y: -14, duration: 1.1 }, 0.25)
    .from('.hero__line > *', { yPercent: 118, rotate: 5, duration: 1.5, stagger: 0.12 }, 0.1)
    .from('.hero__top > *', { autoAlpha: 0, y: 16, duration: 1, stagger: 0.08 }, 0.45)
    .from('.hero__bottom > *', { autoAlpha: 0, y: 34, duration: 1.3, stagger: 0.1 }, 0.55)
    .from('.rail a', { autoAlpha: 0, x: -14, duration: 1, stagger: 0.05 }, 0.7)
    .from('.progress', { autoAlpha: 0, duration: 1 }, 0.9);
  return tl;
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  [settings, snap, info] = await Promise.all([api.getSettings(), api.getState(), api.getInfo()]);
  applyPalette(settings.palette);
  setVolume(settings.sound.volume);
  await document.fonts?.ready;

  if (!reducedMotion) {
    smoother = ScrollSmoother.create({ wrapper: '#smooth-wrapper', content: '#smooth-content', smooth: 1.15, effects: true });
  }

  setupBar();
  setupHero();
  setupRhythm();
  setupEyes();
  setupProgram(); // creates the pin – everything below measures after it
  setupOrb();
  setupStrictness();
  setupStats();
  setupSystem();
  setupSections();
  setupReveals();
  setupMarquee();
  createCursor();
  intro();

  api.onState((s) => {
    snap = s;
    updateCycleNow();
  });
  api.onSettings((s) => {
    if (!Object.keys(pending).length) settings = s;
  });
  api.onEvent((e) => {
    if (e.type === 'goto') goto(e.section);
  });
  updateCycleNow();

  if (!inElectron) {
    // Browser preview: background tabs throttle rAF, don't let GSAP stretch time.
    gsap.ticker.lagSmoothing(0);
    window.__atem = { gsap, ScrollTrigger, smoother, orb, goto };
  }

  const section = query.get('section');
  if (section) gsap.delayedCall(0.6, () => goto(section));
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
}

boot();
