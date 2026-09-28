import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

gsap.registerPlugin(Draggable, InertiaPlugin);

/**
 * A horizontal ruler you can throw: drag with inertia, snaps to steps,
 * ticks swell as they pass the needle. Keyboard and trackpad friendly.
 */
export function createRuler(root, { min, max, step, value, spacing = 14, major = (v) => v % (step * 5) === 0, label, onInput, onChange }) {
  const majorEvery = 5;
  const count = Math.round((max - min) / step) + 1;
  root.classList.add('ruler');
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-label', label);
  root.setAttribute('aria-valuemin', min);
  root.setAttribute('aria-valuemax', max);
  root.dataset.cursor = 'drag';

  const track = document.createElement('div');
  track.className = 'ruler__track';
  const ticks = [];
  for (let i = 0; i < count; i++) {
    const v = min + i * step;
    const tick = document.createElement('span');
    tick.className = 'ruler__tick';
    tick.innerHTML = '<b></b>';
    if (major(v)) {
      tick.classList.add('is-major');
      tick.innerHTML += `<i>${v}</i>`;
    }
    tick.style.left = `${i * spacing}px`;
    tick.dataset.index = i;
    track.append(tick);
    ticks.push(tick);
  }
  const needle = document.createElement('span');
  needle.className = 'ruler__needle';
  root.append(track, needle);

  let center = 0;
  let current = value;
  const indexOf = (v) => Math.round((v - min) / step);
  const xFor = (v) => center - indexOf(v) * spacing;
  const valueAt = (x) => min + Math.min(count - 1, Math.max(0, Math.round((center - x) / spacing))) * step;

  // Ticks near the needle grow and brighten.
  const paint = () => {
    const x = Number(gsap.getProperty(track, 'x'));
    for (const tick of ticks) {
      const d = Math.abs(x + Number(tick.dataset.index) * spacing - center) / (spacing * 7);
      const k = Math.max(0, 1 - d);
      tick.style.setProperty('--k', (k * k).toFixed(3));
    }
  };

  const report = (x, final) => {
    const v = valueAt(x);
    if (v !== current) {
      current = v;
      root.setAttribute('aria-valuenow', v);
      onInput?.(v);
    }
    if (final) onChange?.(current);
  };

  const drag = Draggable.create(track, {
    type: 'x',
    trigger: root,
    inertia: true,
    edgeResistance: 0.8,
    dragResistance: 0,
    throwResistance: 2600,
    maxDuration: 1.2,
    cursor: 'grab',
    activeCursor: 'grabbing',
    snap: (x) => center - Math.round((center - x) / spacing) * spacing,
    onPress() {
      root.classList.add('is-active');
    },
    onDrag() {
      paint();
      report(this.x, false);
    },
    onThrowUpdate() {
      paint();
      report(this.x, false);
    },
    onRelease() {
      root.classList.remove('is-active');
    },
    onDragEnd() {
      if (!this.tween) report(this.endX, true);
    },
    onThrowComplete() {
      report(this.x, true);
    },
    onClick(e) {
      const tick = e.target.closest?.('.ruler__tick');
      if (tick) set(min + Number(tick.dataset.index) * step, true);
    },
  })[0];

  function layout() {
    center = root.clientWidth / 2;
    drag.applyBounds({ minX: center - (count - 1) * spacing, maxX: center });
    gsap.set(track, { x: xFor(current) });
    paint();
  }

  function set(v, fire = false) {
    const next = Math.min(max, Math.max(min, v));
    gsap.to(track, {
      x: xFor(next),
      duration: 0.9,
      ease: 'expo.out',
      overwrite: true,
      onUpdate: paint,
    });
    if (next !== current) {
      current = next;
      root.setAttribute('aria-valuenow', next);
      onInput?.(next);
      if (fire) onChange?.(next);
    }
    drag.update();
  }

  root.addEventListener('keydown', (e) => {
    const big = step * majorEvery;
    const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big }[e.key];
    if (delta) set(current + delta, true);
    else if (e.key === 'Home') set(min, true);
    else if (e.key === 'End') set(max, true);
    else return;
    e.preventDefault();
  });

  // Sideways trackpad swipes (or shift + wheel) move the ruler; vertical wheel keeps scrolling the page.
  let wheelAcc = 0;
  let wheelTimer = null;
  root.addEventListener(
    'wheel',
    (e) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      wheelAcc += dx;
      const steps = Math.trunc(wheelAcc / 24);
      if (steps) {
        wheelAcc -= steps * 24;
        set(current + steps * step);
      }
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => onChange?.(current), 250);
    },
    { passive: false },
  );

  new ResizeObserver(layout).observe(root);
  layout();

  return {
    set: (v) => set(v, false),
    get value() {
      return current;
    },
  };
}
