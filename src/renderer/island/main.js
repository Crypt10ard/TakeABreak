import './style.css';
import { gsap } from 'gsap';

import { api, inElectron } from '../shared/api.js';
import { applyPalette } from '../shared/palettes.js';
import { clock, shortCountdown } from '../shared/format.js';
import { chime, setVolume } from '../shared/sound.js';
import { t, setLang } from '../shared/i18n.js';
import { setTheme } from '../shared/theme.js';

const $ = (sel, root = document) => root.querySelector(sel);
const island = $('#island');
const body = $('#body');
const RING = 2 * Math.PI * 20;
const COLLAPSED = 66;

let settings = null;
let payload = null;
let visible = false;
let exiting = false;
let hovering = false;
let hideTimer = null;
let microDone = false;
let shownAt = 0;
let exitTimeline = null;

const ICON = {
  ring: (warm) =>
    `<svg class="ring${warm ? ' ring--warm' : ''}" viewBox="0 0 44 44" aria-hidden="true">` +
    '<circle class="ring__track" cx="22" cy="22" r="20"/><circle class="ring__fill" cx="22" cy="22" r="20"/></svg>',
  eye:
    '<svg class="icon-eye" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle class="pupil" cx="12" cy="12" r="3.2"/></svg>',
  check: '<svg class="icon-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  orb: '<span class="mini-orb" aria-hidden="true"></span>',
  pause: '<span class="icon-pause" aria-hidden="true"><i></i><i></i></span>',
  close: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2L2 10"/></svg>',
};

// Live countdowns are written into this span by tick().
const LEFT = '<span data-left></span>';

function template(p) {
  switch (p.kind) {
    case 'warn':
      return {
        icon: ICON.ring(true) + '<span class="icon-count" data-count></span>',
        title: t('island.warn.title'),
        sub: t('island.warn.sub', { time: LEFT }),
        actions:
          `<button class="btn btn--accent" data-act="now">${t('island.now')}</button>` +
          (p.snoozesLeft > 0 ? `<button class="btn" data-act="snooze">${t('island.plus', { n: p.snoozeMin })}</button>` : ''),
      };
    case 'micro':
      return {
        icon: ICON.ring(false) + ICON.eye,
        title: t('island.micro.title'),
        sub: t('island.micro.sub', { time: LEFT }),
        actions: `<button class="island__close" data-act="skip-micro" aria-label="${t('island.skip')}">${ICON.close}</button>`,
      };
    case 'micro-done':
      return { icon: ICON.check, title: t('island.microDone.title'), sub: t('island.microDone.sub'), autoHide: 2000 };
    case 'hello':
      return {
        icon: ICON.orb,
        title: t('island.hello.title'),
        sub: t('island.nextAt', { time: clock(p.nextBreakAt) }),
        actions: `<button class="btn" data-act="settings">${t('island.settings')}</button>`,
        autoHide: 5200,
      };
    case 'welcome':
      return { icon: ICON.check, title: t('island.welcome.title'), sub: t('island.welcome.sub'), autoHide: 5000 };
    case 'paused':
      return {
        icon: ICON.pause,
        title: t('island.paused.title'),
        sub: t('island.paused.sub', { time: clock(p.until) }),
        actions: `<button class="btn" data-act="resume">${t('island.resume')}</button>`,
        autoHide: 4200,
      };
    case 'resumed':
      return { icon: ICON.orb, title: t('island.resumed.title'), sub: t('island.nextAt', { time: clock(p.nextBreakAt) }), autoHide: 3600 };
    case 'tray-hint':
      return {
        icon: ICON.orb,
        title: t('island.hint.title'),
        sub: p.platform === 'darwin' ? t('island.hint.mac') : t('island.hint.win'),
        autoHide: 7500,
      };
    default:
      return { icon: ICON.orb, title: 'Atem', sub: '', autoHide: 2500 };
  }
}

function render(p) {
  const tpl = template(p);
  body.innerHTML =
    `<div class="island__icon">${tpl.icon}</div>` +
    `<div class="island__text"><span class="island__title">${tpl.title}</span><span class="island__sub">${tpl.sub}</span></div>` +
    (tpl.actions ? `<div class="island__actions">${tpl.actions}</div>` : '');
  body.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => act(btn.dataset.act)));
  if (p.kind === 'micro') {
    const eye = $('.icon-eye', body);
    gsap.set(eye, { transformOrigin: '50% 50%' });
    gsap
      .timeline({ repeat: -1, repeatDelay: 2.6, delay: 1.2 })
      .to(eye, { scaleY: 0.08, duration: 0.08, ease: 'power2.in' })
      .to(eye, { scaleY: 1, duration: 0.16, ease: 'power2.out' });
  }
  if (p.kind === 'micro-done' || p.kind === 'welcome') {
    gsap.fromTo($('.icon-check path', body), { strokeDashoffset: 24 }, { strokeDashoffset: 0, duration: 0.7, ease: 'power3.out', delay: 0.2 });
  }
  return tpl;
}

function measure() {
  const previous = island.style.width;
  island.style.width = 'auto';
  const width = Math.ceil(island.getBoundingClientRect().width);
  island.style.width = previous;
  return width;
}

function show(p) {
  const from = island.getBoundingClientRect().width;
  const wasVisible = visible && !exiting;
  // A new message cancels a running exit – its onComplete would otherwise close the window.
  exitTimeline?.kill();
  exitTimeline = null;
  gsap.killTweensOf([island, ...body.children]);
  exiting = false;
  payload = p;
  microDone = false;
  shownAt = Date.now();
  clearTimeout(hideTimer);

  const tpl = render(p);
  tick();
  const width = measure();
  const kids = [...body.children];

  if (!wasVisible) {
    visible = true;
    gsap.set(island, { width: COLLAPSED, y: -80, opacity: 0 });
    gsap.set(kids, { autoAlpha: 0, y: 8 });
    gsap
      .timeline()
      .to(island, { y: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' })
      .to(island, { width, duration: 0.8, ease: 'expo.out' }, 0.2)
      .to(kids, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'expo.out', stagger: 0.06 }, 0.38);
  } else {
    gsap.set(island, { y: 0, opacity: 1 });
    gsap.fromTo(island, { width: from }, { width, duration: 0.7, ease: 'expo.out' });
    gsap.from(kids, { autoAlpha: 0, y: 8, filter: 'blur(4px)', duration: 0.6, ease: 'expo.out', stagger: 0.05 });
  }

  if (settings?.sound.chime && (p.kind === 'warn' || p.kind === 'micro')) chime('soft');
  if (tpl.autoHide) scheduleHide(tpl.autoHide);
}

function hide() {
  if (!visible || exiting) return;
  exiting = true;
  clearTimeout(hideTimer);
  exitTimeline = gsap
    .timeline({
      onComplete: () => {
        visible = false;
        exiting = false;
        payload = null;
        api.action('island-done');
      },
    })
    .to(body.children, { autoAlpha: 0, y: -6, duration: 0.25, ease: 'power2.in', stagger: 0.03 })
    .to(island, { width: COLLAPSED, duration: 0.5, ease: 'expo.inOut' }, 0.12)
    .to(island, { y: -80, opacity: 0, duration: 0.45, ease: 'power3.in' }, 0.5);
}

function scheduleHide(ms) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => (hovering ? scheduleHide(1200) : hide()), ms);
}

function act(name) {
  switch (name) {
    case 'now':
      api.action('break-now');
      break;
    case 'snooze':
      api.action('snooze');
      hide();
      break;
    case 'skip-micro':
      microDone = true;
      api.action('skip-micro', { preview: Boolean(payload?.preview) });
      hide();
      break;
    case 'settings':
      api.action('open-settings');
      hide();
      break;
    case 'resume':
      api.action('resume');
      break;
  }
}

function setRing(fraction) {
  const fill = $('.ring__fill', body);
  if (fill) fill.style.strokeDashoffset = String(RING * (1 - Math.min(1, Math.max(0, fraction))));
}

function tick() {
  if (!payload || exiting) return;
  const now = Date.now();
  const left = $('[data-left]', body);
  if (payload.kind === 'warn') {
    const ms = Math.max(0, payload.breakAt - now);
    const total = Math.max(1, payload.breakAt - shownAt);
    if (left) left.textContent = shortCountdown(ms);
    const count = $('[data-count]', body);
    if (count) count.textContent = Math.ceil(ms / 1000);
    setRing(ms / total);
  } else if (payload.kind === 'micro') {
    const ms = Math.max(0, payload.endsAt - now);
    if (left) left.textContent = t('island.sec', { n: Math.ceil(ms / 1000) });
    setRing(1 - ms / payload.duration);
    if (ms <= 0 && !microDone) {
      microDone = true;
      if (settings?.sound.chime) chime('step');
      show({ kind: 'micro-done' });
    }
  }
}

// The window lets clicks through everywhere except over the capsule.
let interactive = false;
function setInteractive(value) {
  if (value === interactive) return;
  interactive = value;
  hovering = value;
  api.action('island-mouse', value);
}
document.addEventListener('mousemove', (e) => setInteractive(Boolean(e.target.closest?.('.island'))));
document.addEventListener('mouseleave', () => setInteractive(false));

async function boot() {
  settings = await api.getSettings();
  applyPalette(settings.palette);
  setTheme(settings.theme);
  setLang(settings.language);
  setVolume(settings.sound.volume);
  api.onSettings((s) => {
    settings = s;
    applyPalette(s.palette);
    setTheme(s.theme);
    // Re-render the current message in the new language.
    if (setLang(s.language) && payload && !exiting) show(payload);
  });
  api.onEvent((e) => {
    if (e.type === 'island') show(e);
  });
  setInterval(tick, 200);
  if (!inElectron) window.__atem = { show, hide };
}

boot();
