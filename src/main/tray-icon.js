'use strict';

/**
 * Renders the tray icon at runtime: a ring that fills up towards the next break.
 * Tiny dependency-free rasterizer (supersampled for anti-aliasing) + PNG encoder.
 */

const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * @param {number} size   pixel size of the square icon
 * @param {object} o
 * @param {'work'|'soon'|'break'|'paused'|'idle'} o.state
 * @param {number} o.progress 0..1 of the current work cycle
 * @param {string} o.ink   main colour (hex)
 * @param {string} o.accent colour for "soon" / "break" (hex)
 */
function renderIcon(size, { state, progress, ink, accent }) {
  const SS = 4; // supersamples per axis
  const out = Buffer.alloc(size * size * 4);
  const inkRGB = hex(ink);
  const accentRGB = hex(accent);

  const R = 0.43; // ring centre-line radius (unit space)
  const W = Math.max(0.12, 1.9 / size); // ring width, at least ~2px
  const TAU = Math.PI * 2;
  const p = Math.min(1, Math.max(0, progress));
  const endAngle = p * TAU;
  const capA = { x: 0.5, y: 0.5 - R };
  const capB = { x: 0.5 + R * Math.sin(endAngle), y: 0.5 - R * Math.cos(endAngle) };

  // Returns [r,g,b,a] (a in 0..1) for a sample point in unit space.
  const shade = (x, y) => {
    const dx = x - 0.5;
    const dy = y - 0.5;
    const d = Math.hypot(dx, dy);

    if (state === 'break') {
      // A filled "breathing" disc with a halo ring.
      if (d <= 0.3) return [...accentRGB, 1];
      if (Math.abs(d - R) <= W / 2) return [...accentRGB, 0.55];
      return null;
    }

    if (state === 'paused') {
      if (Math.abs(d - R) <= W / 2) return [...inkRGB, 0.45];
      const inBar = (cx) => Math.abs(x - cx) <= 0.055 && Math.abs(y - 0.5) <= 0.17;
      if (inBar(0.41) || inBar(0.59)) return [...inkRGB, 1];
      return null;
    }

    const onRing = Math.abs(d - R) <= W / 2;
    const color = state === 'soon' ? accentRGB : inkRGB;
    if (state !== 'idle' && p > 0) {
      // Angle measured clockwise from 12 o'clock.
      let a = Math.atan2(dx, -dy);
      if (a < 0) a += TAU;
      const inArc = onRing && a <= endAngle;
      const inCap = Math.hypot(x - capA.x, y - capA.y) <= W / 2 || Math.hypot(x - capB.x, y - capB.y) <= W / 2;
      if (inArc || (p < 1 && inCap)) return [...color, 1];
    }
    if (onRing) return [...inkRGB, 0.32];
    // Small centre dot – the "breath".
    if (d <= (state === 'soon' ? 0.13 : 0.1)) return [...color, state === 'idle' ? 0.5 : 1];
    return null;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (!c) continue;
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return encodePNG(size, size, out);
}

module.exports = { renderIcon, encodePNG };
