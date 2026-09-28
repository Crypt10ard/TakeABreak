import './style.css';
import { gsap } from 'gsap';

import { api, inElectron } from '../shared/api.js';
import { applyPalette } from '../shared/palettes.js';
import { clock, countdown, hoursMinutes } from '../shared/format.js';
import { RollingText } from '../shared/ui.js';

const $ = (sel) => document.querySelector(sel);
const CIRC = 2 * Math.PI * 92;
document.documentElement.dataset.platform = new URLSearchParams(location.search).get('platform') || api.platform;

let snap = null;
let num;
let dialOffset = CIRC;
const cache = {};
const setText = (el, text) => {
  if (cache[el.id] === text) return;
  cache[el.id] = text;
  el.textContent = text;
};

function buildTicks() {
  const g = $('.dial__ticks');
  let html = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = i % 5 === 0 ? 102 : 104;
    const r2 = 107;
    html += `<line class="dial__tick" x1="${110 + Math.sin(a) * r1}" y1="${110 - Math.cos(a) * r1}" x2="${110 + Math.sin(a) * r2}" y2="${110 - Math.cos(a) * r2}"/>`;
  }
  g.innerHTML = html;
}

/** Big number + unit for a duration: minutes, or seconds in the last minute, or h:mm above 99 min. */
function amount(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return [String(s), 'Sek.'];
  const m = Math.ceil(s / 60);
  if (m <= 99) return [String(m), m === 1 ? 'Minute' : 'Minuten'];
  return [`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, 'Stunden'];
}

function render() {
  if (!snap) return;
  const now = Date.now();
  let mode = snap.mode;
  let progress = 0;
  let value = ['–', ''];
  let caption = '';
  let micro = '';
  let chip = 'Fokus';
  let primary = 'Jetzt Pause machen';
  let disabled = false;

  switch (snap.mode) {
    case 'paused':
      value = amount(snap.pausedUntil - now);
      caption = `pausiert bis ${clock(snap.pausedUntil)}`;
      chip = 'Pausiert';
      primary = 'Fortsetzen';
      progress = 1;
      break;
    case 'break': {
      const b = snap.break;
      value = amount((b?.endsAt ?? now) - now);
      caption = b?.kind === 'micro' ? 'Mikropause läuft' : 'Pause läuft';
      chip = 'Pause';
      primary = 'Pause läuft';
      disabled = true;
      progress = b ? Math.min(1, (now - b.startedAt) / b.duration) : 0;
      break;
    }
    case 'idle':
      caption = 'Du bist gerade weg. Die Uhr steht still.';
      chip = 'Abwesend';
      break;
    default: {
      const left = snap.nextBreakAt - now;
      const total = snap.nextBreakAt - snap.workStart;
      progress = total > 0 ? 1 - left / total : 0;
      value = amount(left);
      caption = 'bis zur nächsten Pause';
      if (snap.nextMicroAt && snap.nextMicroAt < snap.nextBreakAt - 60_000) {
        micro = `Mikropause in ${countdown(snap.nextMicroAt - now)}`;
      }
      if (left < 5 * 60_000) {
        mode = 'soon';
        chip = 'Gleich Pause';
      }
    }
  }

  num.set(value[0]);
  setText($('#unit'), value[1]);
  setText($('#caption'), caption);
  setText($('#micro'), micro || ' ');
  setText($('#chip-text'), chip);
  setText($('#primary-label'), primary);
  $('#chip').dataset.mode = mode;
  $('.dial').dataset.mode = mode;
  $('.dial').style.setProperty('--energy', mode === 'soon' ? 1 : Math.max(0, (progress - 0.6) / 0.4).toFixed(3));
  $('#primary').disabled = disabled;
  $('#pauserow').style.display = snap.mode === 'paused' ? 'none' : '';

  const p = Math.min(1, Math.max(0, progress));
  dialOffset = CIRC * (1 - p);
  if (!gsap.isTweening('#dial-fill')) $('#dial-fill').style.strokeDashoffset = String(dialOffset);
  $('#dial-knob').setAttribute('transform', `rotate(${p * 360} 110 110)`);
}

async function refreshToday() {
  try {
    const stats = await api.getStats();
    const t = stats.today;
    const { h, m } = hoursMinutes(t.focusSec);
    const breaks = t.taken + t.natural;
    $('#today').innerHTML = `Heute <b>${breaks}</b> ${breaks === 1 ? 'Pause' : 'Pausen'} · <b>${h > 0 ? `${h} h ${m}` : `${m} min`}</b> Fokus`;
  } catch {
    /* stats are a nice-to-have here */
  }
}

const ITEMS = ['.head', '.dial', '.caption', '.micro', '.actions > *', '.foot'];

/** Plays every time the popover opens. Explicit end values, so a restart can never freeze mid-way. */
function entrance() {
  gsap.killTweensOf(['#card', '#dial-fill', ...ITEMS]);
  gsap
    .timeline()
    .fromTo('#card', { opacity: 0, scale: 0.94, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: 'expo.out' })
    .fromTo(ITEMS, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.04 }, 0.06)
    .fromTo('#dial-fill', { strokeDashoffset: CIRC }, { strokeDashoffset: dialOffset, duration: 1.1, ease: 'expo.out' }, 0.1);
}

function setup() {
  buildTicks();
  num = new RollingText($('#num'), '0');

  $('#primary').addEventListener('click', () => {
    if (snap?.mode === 'paused') api.action('resume');
    else api.action('break-now');
  });
  document.querySelectorAll('[data-pause]').forEach((b) =>
    b.addEventListener('click', () => api.action('pause', b.dataset.pause === 'tomorrow' ? 'tomorrow' : Number(b.dataset.pause))),
  );
  $('#settings').addEventListener('click', () => api.action('open-settings'));

  const quit = $('#quit');
  let armed = null;
  quit.addEventListener('click', () => {
    if (armed) return api.action('quit');
    quit.classList.add('is-armed');
    quit.textContent = 'Sicher?';
    armed = setTimeout(() => {
      armed = null;
      quit.classList.remove('is-armed');
      quit.textContent = 'Beenden';
    }, 3000);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') api.action('popover-hide');
  });
}

async function boot() {
  const [settings, state] = await Promise.all([api.getSettings(), api.getState()]);
  applyPalette(settings.palette);
  snap = state;
  setup();
  render();
  refreshToday();
  // In the app the popover loads hidden and animates on 'popover:show'; the browser preview shows it right away.
  if (!inElectron) entrance();

  api.onState((s) => {
    snap = s;
    render();
  });
  api.onSettings((s) => applyPalette(s.palette));
  api.onEvent((e) => {
    if (e.type === 'popover:show') {
      render();
      refreshToday();
      entrance();
    }
  });
  if (!inElectron) gsap.ticker.lagSmoothing(0);
}

boot();
