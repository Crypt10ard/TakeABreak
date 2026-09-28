import { gsap } from 'gsap';
import { reducedMotion } from '../shared/ui.js';

const INTERACTIVE = 'button, a, [role="switch"], [role="radio"], input, .swatch, .card, [data-cursor]';
const LABELS = { drag: 'Ziehen', blink: 'Blinzeln' };

/** A dot that sticks to the pointer and a ring that trails it; the ring reacts to what's below. */
export function createCursor() {
  const root = document.querySelector('.cursor');
  if (!root || reducedMotion || matchMedia('(pointer: coarse)').matches) {
    root?.remove();
    return;
  }
  document.documentElement.classList.add('has-cursor');
  const dot = root.querySelector('.cursor__dot');
  const ring = root.querySelector('.cursor__ring');
  const label = root.querySelector('.cursor__label');

  const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3.out' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3.out' });
  const ringX = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3.out' });
  const ringY = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3.out' });

  root.classList.add('is-hidden');
  window.addEventListener('pointermove', (e) => {
    root.classList.remove('is-hidden');
    dotX(e.clientX);
    dotY(e.clientY);
    ringX(e.clientX);
    ringY(e.clientY);
  });
  // Leaving the window (or entering the draggable title bar) hides it.
  document.documentElement.addEventListener('pointerleave', () => root.classList.add('is-hidden'));
  window.addEventListener('blur', () => root.classList.add('is-hidden'));

  document.addEventListener('pointerover', (e) => {
    const target = e.target.closest?.(INTERACTIVE);
    const kind = target?.closest('[data-cursor]')?.dataset.cursor;
    const text = kind && LABELS[kind];
    root.classList.toggle('is-hover', Boolean(target) && !text);
    root.classList.toggle('is-label', Boolean(text));
    if (text) label.textContent = text;
  });

  window.addEventListener('pointerdown', () => gsap.to(ring, { scale: 0.82, duration: 0.2, ease: 'power2.out' }));
  window.addEventListener('pointerup', () => gsap.to(ring, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' }));
}
