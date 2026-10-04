// Minimal PNG writer and a scanline polygon rasterizer, no dependencies.
//
// This exists so the glyphs can be looked at without a browser. Every judgement
// in this project so far about how the ink actually reads - is the taper too long,
// does the wobble look like a hand or like static, is the 撇 thick enough - was
// made from numbers, and numbers cannot answer those. A contact sheet PNG can.
//
// Node's zlib does the compression; everything else here is the minimum to get
// pixels out of the same closed outlines the canvas gets.
import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGB8 PNG from a width*height*3 buffer. */
export function encodePNG(rgb, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type: truecolour
  // 10..12 default: deflate, adaptive filtering, no interlace
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;   // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * A tiny RGB canvas: polygons, discs and text-free marks, with analytic coverage
 * from 4x4 sub-scanlines per row. Anti-aliasing matters here more than usual,
 * because the whole subject is a brush edge - a hard-edged triangle does not look
 * like ink, and neither does a stroke that vanishes into stair-steps.
 */
export class Sheet {
  constructor(width, height, bg = '#0a0d12') {
    this.w = width;
    this.h = height;
    this.px = Buffer.alloc(width * height * 3);
    const [r, g, b] = hexToRgb(bg);
    for (let i = 0; i < width * height; i++) {
      this.px[i * 3] = r;
      this.px[i * 3 + 1] = g;
      this.px[i * 3 + 2] = b;
    }
  }

  blend(x, y, rgb, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    if (a >= 1) {
      this.px[i] = rgb[0];
      this.px[i + 1] = rgb[1];
      this.px[i + 2] = rgb[2];
      return;
    }
    this.px[i] += (rgb[0] - this.px[i]) * a;
    this.px[i + 1] += (rgb[1] - this.px[i + 1]) * a;
    this.px[i + 2] += (rgb[2] - this.px[i + 2]) * a;
  }

  /**
   * Fill one closed polygon with non-zero winding, so the outline's two halves
   * (which is how every stroke is built) fill as one shape.
   */
  polygon(points, rgb, alpha = 1) {
    const n = points.length;
    if (n < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const SS = 4;
    const xs = [];
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      for (let s = 0; s < SS; s++) {
        const sy = y + (s + 0.5) / SS;
        xs.length = 0;
        for (let i = 0; i < n; i++) {
          const a = points[i];
          const b = points[(i + 1) % n];
          if (a[1] === b[1]) continue;
          const lo = Math.min(a[1], b[1]);
          const hi = Math.max(a[1], b[1]);
          if (sy < lo || sy >= hi) continue;
          const t = (sy - a[1]) / (b[1] - a[1]);
          xs.push({ x: a[0] + (b[0] - a[0]) * t, w: b[1] > a[1] ? 1 : -1 });
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p.x - q.x);
        let wind = 0;
        for (let i = 0; i < xs.length - 1; i++) {
          wind += xs[i].w;
          if (wind === 0) continue;
          this.#span(xs[i].x, xs[i + 1].x, y, rgb, alpha / SS);
        }
      }
    }
  }

  #span(x0, x1, y, rgb, alpha) {
    if (x1 <= x0) return;
    const left = Math.max(0, Math.floor(x0));
    const right = Math.min(this.w - 1, Math.ceil(x1) - 1);
    for (let x = left; x <= right; x++) {
      const cover = Math.min(x + 1, x1) - Math.max(x, x0);
      if (cover > 0) this.blend(x, y, rgb, Math.min(1, cover * alpha));
    }
  }

  line(x0, y0, x1, y1, rgb, alpha = 1, width = 1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, rgb, alpha);
    }
  }

  disc(cx, cy, r, rgb, alpha = 1) {
    if (r <= 0) return;
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(this.w - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cover = Math.max(0, Math.min(1, r + 0.5 - d));
        if (cover > 0) this.blend(x, y, rgb, cover * alpha);
      }
    }
  }

  rect(x, y, w, h, rgb, alpha = 1) {
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.h, Math.ceil(y + h)); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.w, Math.ceil(x + w)); px++) {
        const cw = Math.min(px + 1, x + w) - Math.max(px, x);
        const ch = Math.min(py + 1, y + h) - Math.max(py, y);
        if (cw > 0 && ch > 0) this.blend(px, py, rgb, Math.min(1, cw * ch * alpha));
      }
    }
  }

  toPNG() {
    return encodePNG(this.px, this.w, this.h);
  }
}