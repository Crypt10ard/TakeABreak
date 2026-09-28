import { gsap } from 'gsap';

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ rolling text */

/** Odometer-style text: every digit rolls to its new value, other characters stay put. */
export class RollingText {
  constructor(el, text = '') {
    this.el = el;
    this.el.classList.add('roll');
    this.cols = [];
    this.text = null;
    this.set(text, false);
  }

  set(value, animate = true) {
    const text = String(value);
    if (text === this.text) return;
    const shape = (s) => s.replace(/\d/g, '0');
    if (this.text === null || shape(text) !== shape(this.text)) this.#build(text);
    this.el.classList.toggle('roll--instant', !animate);
    [...text].forEach((ch, i) => {
      const col = this.cols[i];
      if (col) col.style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
    if (!animate) {
      void this.el.offsetWidth; // commit without transition
      this.el.classList.remove('roll--instant');
    }
    this.text = text;
    this.el.setAttribute('aria-label', text);
  }

  #build(text) {
    this.el.textContent = '';
    this.cols = [...text].map((ch) => {
      if (/\d/.test(ch)) {
        const slot = document.createElement('span');
        slot.className = 'roll__slot';
        slot.setAttribute('aria-hidden', 'true');
        const col = document.createElement('span');
        col.className = 'roll__col';
        for (let d = 0; d < 10; d++) {
          const digit = document.createElement('span');
          digit.textContent = d;
          col.append(digit);
        }
        slot.append(col);
        this.el.append(slot);
        return col;
      }
      const char = document.createElement('span');
      char.className = 'roll__char';
      char.setAttribute('aria-hidden', 'true');
      char.textContent = ch;
      this.el.append(char);
      return null;
    });
  }
}

/* --------------------------------------------------------------- magnetic */

/** The element leans towards the pointer and springs back when it leaves. */
export function magnetic(el, strength = 0.3) {
  if (reducedMotion) return;
  const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 - gsap.getProperty(el, 'x');
    const cy = r.top + r.height / 2 - gsap.getProperty(el, 'y');
    xTo((e.clientX - cx) * strength);
    yTo((e.clientY - cy) * strength);
  });
  el.addEventListener('pointerleave', () => {
    gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)', overwrite: true });
  });
}

/* ----------------------------------------------------------- hold button */

/**
 * Press-and-hold to confirm. With holdMs = 0 it behaves like a normal button.
 * Releasing early springs the fill back with a tiny shake.
 */
export function holdButton(el, { holdMs = 1600, onComplete }) {
  const fill = el.querySelector('.hold__fill');
  let tween = null;
  let done = false;
  let ms = holdMs;

  const finish = () => {
    if (done) return;
    done = true;
    el.classList.remove('is-holding');
    el.classList.add('is-done');
    onComplete?.();
  };

  const start = () => {
    if (done || ms <= 0) return;
    el.classList.add('is-holding');
    tween?.kill();
    const progress = Number(gsap.getProperty(fill, 'scaleX')) || 0;
    tween = gsap.to(fill, { scaleX: 1, duration: (ms / 1000) * (1 - progress), ease: 'none', onComplete: finish });
  };

  const cancel = () => {
    if (done || ms <= 0 || !el.classList.contains('is-holding')) return;
    el.classList.remove('is-holding');
    tween?.kill();
    tween = gsap.to(fill, { scaleX: 0, duration: 0.5, ease: 'expo.out' });
    if (!reducedMotion) gsap.fromTo(el, { x: -4 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.25)' });
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button === 0) start();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('click', () => {
    if (ms <= 0) finish();
  });
  el.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && ms > 0) {
      e.preventDefault();
      start();
    }
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') cancel();
  });

  return {
    reset() {
      done = false;
      tween?.kill();
      el.classList.remove('is-done', 'is-holding');
      gsap.set(fill, { scaleX: 0 });
    },
    setHold(value) {
      ms = value;
    },
  };
}

/* ------------------------------------------------------------ form parts */

export function bindToggle(el, { value, onChange }) {
  const set = (v) => el.setAttribute('aria-checked', String(Boolean(v)));
  el.setAttribute('role', 'switch');
  if (!el.querySelector('.toggle__knob')) el.innerHTML = '<span class="toggle__knob"></span>';
  set(value);
  el.addEventListener('click', () => {
    const next = el.getAttribute('aria-checked') !== 'true';
    set(next);
    onChange?.(next);
  });
  return { set };
}

/** Segmented control with a gliding pill. Buttons need data-value. */
export function bindSegmented(el, { value, onChange }) {
  const buttons = [...el.querySelectorAll('button[data-value]')];
  let glider = el.querySelector('.seg__glider');
  if (!glider) {
    glider = document.createElement('span');
    glider.className = 'seg__glider';
    el.prepend(glider);
  }
  el.setAttribute('role', 'radiogroup');
  let current = value;

  const place = (animate) => {
    const btn = buttons.find((b) => b.dataset.value === current) || buttons[0];
    buttons.forEach((b) => {
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(b === btn));
      b.tabIndex = b === btn ? 0 : -1;
    });
    const props = { x: btn.offsetLeft, width: btn.offsetWidth, height: btn.offsetHeight, y: btn.offsetTop };
    if (animate && !reducedMotion) gsap.to(glider, { ...props, duration: 0.7, ease: 'expo.out' });
    else gsap.set(glider, props);
  };

  const select = (v, fire = true) => {
    if (v === current) return;
    current = v;
    place(true);
    if (fire) onChange?.(v);
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(b.dataset.value));
    b.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = buttons[(i + dir + buttons.length) % buttons.length];
      select(next.dataset.value);
      next.focus();
    });
  });
  new ResizeObserver(() => place(false)).observe(el);
  document.fonts?.ready.then(() => place(false));
  place(false);

  return {
    set: (v) => select(v, false),
    get value() {
      return current;
    },
  };
}

/** − value + with press-and-hold auto repeat and horizontal scrubbing on the number. */
export function bindStepper(el, { value, min, max, step = 1, format = (v) => v, onChange }) {
  el.classList.add('stepper');
  el.innerHTML = `
    <button class="stepper__btn" data-dir="-1" aria-label="Weniger"><svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg></button>
    <span class="stepper__value tabular" tabindex="0" role="spinbutton"></span>
    <button class="stepper__btn" data-dir="1" aria-label="Mehr"><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg></button>`;
  const out = el.querySelector('.stepper__value');
  const roll = new RollingText(out, format(value));
  let current = value;

  const set = (v, fire = true) => {
    const next = Math.min(max, Math.max(min, Math.round(v / step) * step));
    if (next === current) {
      if (fire && (v < min || v > max)) gsap.fromTo(out, { x: v < min ? -3 : 3 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      return;
    }
    current = next;
    roll.set(format(next));
    out.setAttribute('aria-valuenow', next);
    if (fire) onChange?.(next);
  };

  out.setAttribute('aria-valuemin', min);
  out.setAttribute('aria-valuemax', max);
  out.setAttribute('aria-valuenow', value);

  el.querySelectorAll('.stepper__btn').forEach((btn) => {
    let timer = null;
    let delay = 380;
    const dir = Number(btn.dataset.dir);
    const tick = () => {
      set(current + dir * step);
      delay = Math.max(60, delay * 0.78);
      timer = setTimeout(tick, delay);
    };
    const stop = () => {
      clearTimeout(timer);
      delay = 380;
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      set(current + dir * step);
      timer = setTimeout(tick, delay);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        set(current + dir * step);
      }
    });
  });

  out.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(current + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(current - step);
    else return;
    e.preventDefault();
  });

  // Drag the number sideways to scrub.
  out.addEventListener('pointerdown', (e) => {
    const startX = e.clientX;
    const startValue = current;
    out.setPointerCapture(e.pointerId);
    el.classList.add('is-scrubbing');
    const move = (ev) => set(startValue + Math.round((ev.clientX - startX) / 10) * step);
    const up = () => {
      el.classList.remove('is-scrubbing');
      out.removeEventListener('pointermove', move);
      out.removeEventListener('pointerup', up);
    };
    out.addEventListener('pointermove', move);
    out.addEventListener('pointerup', up);
  });

  return { set: (v) => set(v, false) };
}
