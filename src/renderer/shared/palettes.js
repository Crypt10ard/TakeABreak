/**
 * Colour moods. Three colours feed the orb shader and the UI accents;
 * `deep` is the accent on light backgrounds, where the pastels would be too faint.
 * Names are translated via the key `palette.<id>`.
 */
export const PALETTES = {
  salbei: { colors: ['#9BE7C4', '#6FB7FF', '#C9A8FF'], deep: '#1F9A6C' },
  daemmerung: { colors: ['#FFB38A', '#FF7EB3', '#8C7CFF'], deep: '#D4552E' },
  gletscher: { colors: ['#A8E6FF', '#6C8CFF', '#DCE6FF'], deep: '#2F6FD6' },
  glut: { colors: ['#FFD27A', '#FF8A5C', '#FF5C8A'], deep: '#C9700A' },
};

/** Colour the orb drifts towards when a break is overdue. */
export const WARM = '#FFB27A';

export const palette = (key) => PALETTES[key] || PALETTES.salbei;

export function applyPalette(key, root = document.documentElement) {
  const p = palette(key);
  const [a1, a2, a3] = p.colors;
  root.style.setProperty('--a1', a1);
  root.style.setProperty('--a2', a2);
  root.style.setProperty('--a3', a3);
  root.style.setProperty('--a-deep', p.deep);
  root.dataset.palette = key;
}
