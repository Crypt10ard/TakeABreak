export const pad = (n) => String(n).padStart(2, '0');

/** 83_000 → "01:23", 3_723_000 → "1:02:03" */
export function countdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 83_000 → "1:23" (no leading zero, for compact spots) */
export function shortCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export const clock = (ts) => new Date(ts).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

/** 95 → "1 h 35 min" */
export function minutes(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** Seconds of focus → { h, m } */
export function hoursMinutes(sec) {
  const m = Math.floor(sec / 60);
  return { h: Math.floor(m / 60), m: m % 60 };
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
