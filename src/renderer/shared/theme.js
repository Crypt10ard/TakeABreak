// Dark / light / system. The resolved theme lives on <html data-theme>, which the CSS tokens key off.
import { reducedMotion } from './ui.js';

const media = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();
let setting = 'dark';
let current = null;

export const resolveTheme = (value) => (value === 'dark' || value === 'light' ? value : media.matches ? 'dark' : 'light');
export const getTheme = () => current ?? resolveTheme(setting);

function apply() {
  const next = resolveTheme(setting);
  if (next === current) return false;
  current = next;
  document.documentElement.dataset.theme = next;
  listeners.forEach((fn) => fn(next));
  return true;
}

/** Applies a theme setting ('dark' | 'light' | 'system'). Returns true if the look changed. */
export function setTheme(value) {
  setting = value || 'dark';
  return apply();
}

// "System" follows the OS live.
media.addEventListener('change', () => setting === 'system' && apply());

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Runs `update` inside a view transition. With an origin point the new theme is revealed
 * as a growing circle from there; without one it is a soft crossfade.
 */
export async function withTransition(update, origin) {
  if (!document.startViewTransition || reducedMotion || document.hidden) {
    update();
    return;
  }
  const html = document.documentElement;
  if (origin) html.classList.add('vt-reveal');
  const transition = document.startViewTransition(update);
  try {
    await transition.ready;
    if (origin) {
      const { x, y } = origin;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      html.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 950, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }
    await transition.finished;
  } catch {
    /* a newer transition took over */
  } finally {
    html.classList.remove('vt-reveal');
  }
}
