/** Colour moods. Three colours feed the orb shader and the UI accents. */
export const PALETTES = {
  salbei: { name: 'Salbei', colors: ['#9BE7C4', '#6FB7FF', '#C9A8FF'] },
  daemmerung: { name: 'Dämmerung', colors: ['#FFB38A', '#FF7EB3', '#8C7CFF'] },
  gletscher: { name: 'Gletscher', colors: ['#A8E6FF', '#6C8CFF', '#DCE6FF'] },
  glut: { name: 'Glut', colors: ['#FFD27A', '#FF8A5C', '#FF5C8A'] },
};

/** Colour the orb drifts towards when a break is overdue. */
export const WARM = '#FFB27A';

export const palette = (key) => PALETTES[key] || PALETTES.salbei;

export function applyPalette(key, root = document.documentElement) {
  const [a1, a2, a3] = palette(key).colors;
  root.style.setProperty('--a1', a1);
  root.style.setProperty('--a2', a2);
  root.style.setProperty('--a3', a3);
  root.dataset.palette = key;
}
