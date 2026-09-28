// Renders the app icons from SVG:  npm run icons
//   build/icon.png      1024², macOS style (squircle with the standard safe margin)
//   build/icon-win.png  1024², Windows style (full bleed)
import { Resvg } from '@resvg/resvg-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function icon({ inset, radius }) {
  const size = 1024 - inset * 2;
  const c = 512;
  const r = size * 0.285;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#171a20"/>
      <stop offset="1" stop-color="#06070a"/>
    </linearGradient>
    <radialGradient id="aura" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8fdcc0" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="#6fb7ff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#6fb7ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb" cx="0.34" cy="0.3" r="0.78" fx="0.32" fy="0.26">
      <stop offset="0" stop-color="#f1fff8"/>
      <stop offset="0.2" stop-color="#a9ecd0"/>
      <stop offset="0.55" stop-color="#6fb2f5"/>
      <stop offset="0.85" stop-color="#9c8cf0"/>
      <stop offset="1" stop-color="#c9a8ff"/>
    </radialGradient>
    <radialGradient id="shade" cx="0.62" cy="0.7" r="0.62">
      <stop offset="0" stop-color="#0b1020" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#0b1020" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rim" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.82" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.97" stop-color="#e6f6ff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="tile"><rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}"/></clipPath>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.028}"/></filter>
    <filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.06}"/></filter>
  </defs>
  <g clip-path="url(#tile)">
    <rect x="${inset}" y="${inset}" width="${size}" height="${size}" fill="url(#bg)"/>
    <circle cx="${c}" cy="${c}" r="${r * 1.9}" fill="url(#aura)"/>
    <circle cx="${c}" cy="${c + r * 0.08}" r="${r * 1.02}" fill="#9be7c4" opacity="0.35" filter="url(#haze)"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="url(#orb)"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="url(#shade)"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="url(#rim)"/>
    <ellipse cx="${c - r * 0.32}" cy="${c - r * 0.4}" rx="${r * 0.3}" ry="${r * 0.17}" fill="#ffffff" opacity="0.55" filter="url(#soft)" transform="rotate(-24 ${c - r * 0.32} ${c - r * 0.4})"/>
    <circle cx="${c}" cy="${c}" r="${r * 1.42}" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="${size * 0.006}"/>
  </g>
  <rect x="${inset + 1}" y="${inset + 1}" width="${size - 2}" height="${size - 2}" rx="${radius}" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="3"/>
</svg>`;
}

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

await mkdir(path.join(root, 'build'), { recursive: true });
const mac = icon({ inset: 100, radius: 186 });
const win = icon({ inset: 24, radius: 210 });
await writeFile(path.join(root, 'build', 'icon.png'), render(mac, 1024));
await writeFile(path.join(root, 'build', 'icon-win.png'), render(win, 1024));
await writeFile(path.join(root, 'build', 'icon.svg'), mac);
console.log('icons written to build/');
