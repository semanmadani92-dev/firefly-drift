// Procedural art for rooms: rim-lit terrain chunks, decoration, hazards and
// the parallax backdrop behind each area. Everything is drawn in code.
import { T, TILE, AREAS } from './config.js';
import { view, onResize, addLight, glowSprite } from './gfx.js';
import { hash2, rgba, mulberry32, strSeed, clamp, TAU, lerp } from './util.js';
import { G } from './state.js';

const CHW = 15, CHH = 17;          // tiles per pre-rendered chunk
export const HAZ = '#ff4f7a';      // every hazard in the game glows this colour

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
function bakeGlow(g, x, y, r, color, a) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  g.restore();
}
function tilePath(p, x, y, w, h, tl, tr, br, bl) {
  p.moveTo(x + tl, y);
  p.lineTo(x + w - tr, y); if (tr) p.arcTo(x + w, y, x + w, y + tr, tr);
  p.lineTo(x + w, y + h - br); if (br) p.arcTo(x + w, y + h, x + w - br, y + h, br);
  p.lineTo(x + bl, y + h); if (bl) p.arcTo(x, y + h, x, y + h - bl, bl);
  p.lineTo(x, y + tl); if (tl) p.arcTo(x, y, x + tl, y, tl);
  p.closePath();
}

// ------------------------------------------------------------ decoration plan
function planDeco(room, A) {
  const items = [], lights = [];
  const seed = strSeed(room.id);
  const solid = (x, y) => room.tile(x, y) === TILE.SOLID;
  const empty = (x, y) => room.inside(x, y) && room.tile(x, y) === TILE.EMPTY;
  const kind = A.deco;
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      if (room.tiles[y * room.w + x] !== TILE.SOLID) continue;
      const r = hash2(x, y, seed), r2 = hash2(x, y, seed + 7), r3 = hash2(x, y, seed + 13);
      const X = x * T, Y = y * T;
      if (empty(x, y - 1)) {
        items.push({ k: 'tuft', x: X, y: Y, r, r2 });
        const tall = empty(x, y - 2);
        if (kind === 'forest') {
          if (r < 0.075 && tall) { items.push({ k: 'shroom', x: X + 8 + r2 * 16, y: Y, r: r2, r2: r3 }); lights.push({ x: X + 8 + r2 * 16, y: Y - 9, r: 58, color: A.glowA, a: 0.34, hole: 0.55, ph: r3 * 9 }); }
          else if (r < 0.115 && tall && empty(x, y - 3)) { const hh = 34 + r2 * 26; items.push({ k: 'bulb', x: X + 16, y: Y, h: hh, r: r3 }); lights.push({ x: X + 16 + (r3 - 0.5) * 16, y: Y - hh, r: 84, color: A.glowB, a: 0.3, hole: 0.7, ph: r2 * 9 }); }
          else if (r < 0.24) items.push({ k: 'fern', x: X + 16, y: Y, r: r2, r2: r3 });
        } else if (kind === 'stacks') {
          if (r < 0.06 && tall) { items.push({ k: 'candle', x: X + 16, y: Y, r: r2 }); lights.push({ x: X + 16, y: Y - 16, r: 70, color: A.glowB, a: 0.3, hole: 0.65, ph: r3 * 9 }); }
          else if (r < 0.2) items.push({ k: 'books', x: X + 4 + r2 * 10, y: Y, r: r2, r2: r3 });
        } else if (kind === 'ember') {
          if (r < 0.07 && tall) { items.push({ k: 'vent', x: X + 16, y: Y, r: r2 }); lights.push({ x: X + 16, y: Y - 6, r: 64, color: A.glowB, a: 0.36, hole: 0.6, ph: r3 * 9 }); }
          else if (r < 0.18) items.push({ k: 'rivet', x: X, y: Y, r: r2 });
        } else if (kind === 'crystal') {
          if (r < 0.1 && tall) { items.push({ k: 'crystal', x: X + 16, y: Y, r: r2, r2: r3, up: 1 }); lights.push({ x: X + 16, y: Y - 16, r: 70, color: r3 < 0.5 ? A.glowA : A.glowB, a: 0.34, hole: 0.6, ph: r3 * 9 }); }
        } else if (kind === 'orrery') {
          if (r < 0.06 && tall) { items.push({ k: 'orb', x: X + 16, y: Y, r: r2 }); lights.push({ x: X + 16, y: Y - 22, r: 74, color: A.glowA, a: 0.3, hole: 0.65, ph: r3 * 9 }); }
        }
      }
      if (empty(x, y + 1)) {
        let room2 = 1; while (room2 < 4 && empty(x, y + 1 + room2)) room2++;
        if (kind === 'forest' || kind === 'stacks') {
          if (r2 < 0.3) {
            const len = Math.min(14 + r3 * 70, room2 * T - 10);
            const bulb = kind === 'forest' && r2 < 0.06 && len > 30;
            items.push({ k: 'vine', x: X + 6 + r * 20, y: Y + T, len, r, bulb });
            if (bulb) lights.push({ x: X + 6 + r * 20, y: Y + T + len, r: 62, color: A.glowA, a: 0.32, hole: 0.55, ph: r * 9 });
          } else if (r2 < 0.52) items.push({ k: 'root', x: X, y: Y + T, r, r2: r3 });
        } else if (kind === 'crystal') {
          if (r2 < 0.12) { items.push({ k: 'crystal', x: X + 16, y: Y + T, r: r2, r2: r3, up: -1 }); lights.push({ x: X + 16, y: Y + T + 14, r: 60, color: r3 < 0.5 ? A.glowA : A.glowB, a: 0.3, hole: 0.5, ph: r3 * 9 }); }
        } else if (kind === 'ember') {
          if (r2 < 0.2) items.push({ k: 'chain', x: X + 16, y: Y + T, len: Math.min(10 + r3 * 50, room2 * T - 12), r });
        } else if (r2 < 0.3) items.push({ k: 'root', x: X, y: Y + T, r, r2: r3 });
      }
      if (kind === 'forest' && r3 < 0.07) {
        const le = empty(x - 1, y), re = empty(x + 1, y);
        if (le || re) {
          const side = le ? -1 : 1;
          items.push({ k: 'fungus', x: side < 0 ? X : X + T, y: Y + 8 + r * 14, side, r: r2 });
          lights.push({ x: (side < 0 ? X : X + T) + side * 5, y: Y + 8 + r * 14, r: 40, color: A.glowA, a: 0.26, hole: 0.4, ph: r * 9 });
        }
      }
    }
  }
  return { items, lights };
}

function drawDeco(g, it, A) {
  const k = it.k;
  if (k === 'tuft') {
    const style = A.deco;
    if (style === 'forest') {
      for (let i = 0; i < 4; i++) {
        const hx = hash2(i, Math.round(it.r * 1000), 3);
        const bx = it.x + 3 + i * 8 + hx * 4, hgt = 4 + hx * 8 + it.r2 * 3, lean = (hx - 0.5) * 7;
        g.strokeStyle = i % 2 ? A.moss : mixHex(A.moss, '#000000', 0.35);
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(bx, it.y + 1); g.quadraticCurveTo(bx + lean * 0.3, it.y - hgt * 0.6, bx + lean, it.y - hgt); g.stroke();
        if (hx > 0.82) { g.fillStyle = A.glowA; g.fillRect(bx + lean - 1, it.y - hgt - 1, 2, 2); }
      }
    } else if (it.r < 0.5) {
      g.fillStyle = rgba(A.rim, 0.22);
      g.fillRect(it.x + 4 + it.r2 * 20, it.y - 2, 5 + it.r * 6, 2);
    }
  } else if (k === 'shroom') {
    const n = 2 + (it.r > 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * 9, hgt = 7 + ((it.r2 * 7 + i * 3) % 8), cw = 5 + ((it.r * 9 + i * 2) % 4);
      g.strokeStyle = '#cfe8dc'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(it.x + ox, it.y + 1); g.lineTo(it.x + ox + (i - 1), it.y - hgt); g.stroke();
      g.fillStyle = A.glowA;
      g.beginPath(); g.ellipse(it.x + ox + (i - 1), it.y - hgt, cw, cw * 0.62, 0, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(it.x + ox + (i - 1) - 2, it.y - hgt - cw * 0.4, 1.5, 1.5);
    }
    bakeGlow(g, it.x, it.y - 9, 22, A.glowA, 0.5);
  } else if (k === 'bulb') {
    const lean = (it.r - 0.5) * 16;
    g.strokeStyle = mixHex(A.moss, '#000000', 0.3); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(it.x, it.y + 1); g.quadraticCurveTo(it.x - lean * 0.6, it.y - it.h * 0.6, it.x + lean, it.y - it.h); g.stroke();
    g.strokeStyle = A.moss; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(it.x - lean * 0.2, it.y - it.h * 0.45); g.quadraticCurveTo(it.x - lean * 0.2 - 9, it.y - it.h * 0.55, it.x - lean * 0.2 - 12, it.y - it.h * 0.42); g.stroke();
    g.fillStyle = A.glowB;
    g.beginPath(); g.ellipse(it.x + lean, it.y - it.h + 3, 5, 7, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.ellipse(it.x + lean - 1, it.y - it.h + 2, 1.8, 3, 0, 0, TAU); g.fill();
    bakeGlow(g, it.x + lean, it.y - it.h + 3, 26, A.glowB, 0.6);
  } else if (k === 'fern') {
    const n = 3 + Math.floor(it.r * 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + (it.r2 - 0.5) * 0.3, len = 10 + ((it.r * 31 + i * 5) % 9);
      g.strokeStyle = i % 2 ? mixHex(A.moss, '#000000', 0.2) : mixHex(A.moss, '#000000', 0.5);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(it.x, it.y + 1);
      g.quadraticCurveTo(it.x + Math.cos(a) * len * 0.7, it.y + Math.sin(a) * len, it.x + Math.cos(a) * len * 1.35, it.y + Math.sin(a) * len * 0.55);
      g.stroke();
    }
  } else if (k === 'vine') {
    const sway = (it.r - 0.5) * 16;
    g.strokeStyle = mixHex(A.moss, '#000000', 0.45); g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(it.x, it.y - 2); g.quadraticCurveTo(it.x + sway, it.y + it.len * 0.5, it.x + sway * 0.4, it.y + it.len); g.stroke();
    g.fillStyle = mixHex(A.moss, '#000000', 0.25);
    for (let d = 10; d < it.len - 4; d += 11) {
      const t = d / it.len, px = it.x + sway * (2 * t * (1 - t)) + sway * 0.4 * t * t;
      g.beginPath(); g.ellipse(px + (d % 22 ? 3 : -3), it.y + d, 3.2, 1.6, d % 22 ? 0.5 : -0.5, 0, TAU); g.fill();
    }
    if (it.bulb) {
      const bx = it.x + sway * 0.4, by = it.y + it.len;
      g.fillStyle = A.glowA; g.beginPath(); g.ellipse(bx, by, 3.6, 5, 0, 0, TAU); g.fill();
      bakeGlow(g, bx, by, 20, A.glowA, 0.55);
    }
  } else if (k === 'root') {
    g.strokeStyle = mixHex(A.rock2, '#000000', 0.15); g.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const bx = it.x + 6 + ((it.r * 40 + i * 13) % 20), len = 6 + ((it.r2 * 50 + i * 9) % 14);
      g.lineWidth = 3 - i;
      g.beginPath(); g.moveTo(bx, it.y - 2); g.quadraticCurveTo(bx + (i ? 4 : -4), it.y + len * 0.5, bx + (i ? -2 : 3), it.y + len); g.stroke();
    }
    g.lineCap = 'butt';
  } else if (k === 'fungus') {
    g.fillStyle = A.glowA;
    g.beginPath(); g.ellipse(it.x, it.y, 8, 3.4, 0, it.side < 0 ? Math.PI / 2 : -Math.PI / 2, it.side < 0 ? Math.PI * 1.5 : Math.PI / 2); g.closePath(); g.fill();
    g.fillStyle = mixHex(A.glowA, '#000000', 0.4);
    g.fillRect(it.side < 0 ? it.x - 7 : it.x, it.y + 2, 7, 1.5);
    bakeGlow(g, it.x + it.side * 4, it.y, 16, A.glowA, 0.45);
  } else if (k === 'candle') {
    g.fillStyle = '#d9d2ee'; g.fillRect(it.x - 2.5, it.y - 12, 5, 13);
    g.fillStyle = A.glowB; g.beginPath(); g.ellipse(it.x, it.y - 16, 2.4, 4.4, 0, 0, TAU); g.fill();
    bakeGlow(g, it.x, it.y - 16, 22, A.glowB, 0.6);
  } else if (k === 'books') {
    for (let i = 0; i < 3; i++) {
      const hh = 8 + ((it.r * 40 + i * 7) % 9);
      g.fillStyle = [mixHex(A.rim, '#000000', 0.55), mixHex(A.glowB, '#000000', 0.6), mixHex(A.moss, '#000000', 0.5)][i];
      g.fillRect(it.x + i * 5, it.y - hh, 4, hh + 1);
      g.fillStyle = rgba(A.rim, 0.5); g.fillRect(it.x + i * 5 + 1, it.y - hh + 2, 2, 1);
    }
  } else if (k === 'vent') {
    g.fillStyle = '#2a1712'; g.fillRect(it.x - 9, it.y - 5, 18, 6);
    g.fillStyle = A.glowB; g.fillRect(it.x - 6, it.y - 4, 12, 2);
    bakeGlow(g, it.x, it.y - 4, 24, A.glowB, 0.5);
  } else if (k === 'rivet') {
    g.fillStyle = rgba(A.rim, 0.35);
    g.beginPath(); g.arc(it.x + 8 + it.r * 16, it.y + 5, 1.8, 0, TAU); g.fill();
  } else if (k === 'crystal') {
    const col = it.r2 < 0.5 ? A.glowA : A.glowB;
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 8, hh = (12 + ((it.r * 30 + i * 11) % 16)) * it.up, lean = (i - 1) * 5;
      g.fillStyle = i === 1 ? col : mixHex(col, '#101030', 0.45);
      g.beginPath(); g.moveTo(it.x + ox - 4, it.y); g.lineTo(it.x + ox + lean, it.y - hh); g.lineTo(it.x + ox + 4, it.y); g.closePath(); g.fill();
    }
    bakeGlow(g, it.x, it.y - 12 * it.up, 26, col, 0.5);
  } else if (k === 'chain') {
    g.strokeStyle = '#3a2620'; g.lineWidth = 2; g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(it.x, it.y - 2); g.lineTo(it.x, it.y + it.len); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#4a3028'; g.beginPath(); g.arc(it.x, it.y + it.len + 3, 4, 0, TAU); g.fill();
  } else if (k === 'orb') {
    g.strokeStyle = rgba(A.rim, 0.6); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(it.x, it.y); g.lineTo(it.x, it.y - 16); g.stroke();
    g.beginPath(); g.ellipse(it.x, it.y - 22, 9, 3.5, 0.4, 0, TAU); g.stroke();
    g.fillStyle = A.glowA; g.beginPath(); g.arc(it.x, it.y - 22, 4.5, 0, TAU); g.fill();
    bakeGlow(g, it.x, it.y - 22, 24, A.glowA, 0.55);
  }
}

// ------------------------------------------------------------ special tiles
function drawOneway(g, room, x, y, A) {
  const X = x * T, Y = y * T;
  const l = room.tile(x - 1, y) === TILE.ONEWAY && x > 0, r = room.tile(x + 1, y) === TILE.ONEWAY && x < room.w - 1;
  g.fillStyle = mixHex(A.rock2, '#5c7880', 0.6);
  g.beginPath();
  tilePath(g, X + (l ? 0 : 2), Y, T - (l ? 0 : 2) - (r ? 0 : 2), 8, l ? 0 : 3, r ? 0 : 3, r ? 0 : 3, l ? 0 : 3);
  g.fill();
  g.fillStyle = rgba(A.rim, 0.95);
  g.fillRect(X + (l ? 0 : 4), Y, T - (l ? 0 : 4) - (r ? 0 : 4), 2);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(X + 15, Y + 2, 1.5, 5);
  if (!l) { g.fillStyle = rgba(A.rim, 0.35); g.fillRect(X + 3, Y + 7, 2, 7); }
  if (!r) { g.fillStyle = rgba(A.rim, 0.35); g.fillRect(X + T - 5, Y + 7, 2, 7); }
}
function drawSpike(g, room, x, y) {
  const X = x * T, Y = y * T;
  const s = (ax, ay) => { const t = room.tile(ax, ay); return t === TILE.SOLID || t === TILE.BREAK || t === TILE.SLAM; };
  let dir = 0; // 0 up,1 down,2 right,3 left
  if (s(x, y + 1) && room.inside(x, y + 1)) dir = 0; else if (s(x, y - 1) && room.inside(x, y - 1)) dir = 1; else if (s(x - 1, y) && room.inside(x - 1, y)) dir = 2; else if (s(x + 1, y) && room.inside(x + 1, y)) dir = 3;
  else if (y === room.h - 1) dir = 0;
  g.save();
  g.translate(X + 16, Y + 16);
  g.rotate([0, Math.PI, Math.PI / 2, -Math.PI / 2][dir]);
  for (let i = 0; i < 3; i++) {
    const bx = -16 + i * 10.6 + 5.3, hh = 20 + hash2(x * 3 + i, y, 5) * 9, lean = (hash2(x, y * 3 + i, 9) - 0.5) * 6;
    g.fillStyle = '#4a1230';
    g.beginPath(); g.moveTo(bx - 5.5, 16); g.lineTo(bx + lean, 16 - hh); g.lineTo(bx + 5.5, 16); g.closePath(); g.fill();
    g.fillStyle = '#220814';
    g.beginPath(); g.moveTo(bx, 16); g.lineTo(bx + lean, 16 - hh); g.lineTo(bx + 5.5, 16); g.closePath(); g.fill();
    g.strokeStyle = HAZ; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(bx - 5.5, 16); g.lineTo(bx + lean, 16 - hh); g.lineTo(bx + 5.5, 16); g.stroke();
    g.fillStyle = '#ffe0e8'; g.fillRect(bx + lean - 1, 16 - hh - 0.5, 2, 2.4);
  }
  bakeGlow(g, 0, 4, 26, HAZ, 0.5);
  g.restore();
}
function drawGrate(g, x, y, A) {
  const X = x * T, Y = y * T;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X, Y, T, T);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = mixHex(A.rock2, '#56707a', 0.5); g.fillRect(X + 3 + i * 8, Y, 3, T);
    g.fillStyle = rgba(A.rim, 0.5); g.fillRect(X + 3 + i * 8, Y, 1, T);
  }
  g.fillStyle = mixHex(A.rock2, '#56707a', 0.4); g.fillRect(X, Y + 14, T, 3);
}

// ------------------------------------------------------------ terrain layer
export class TerrainLayer {
  constructor(room) {
    this.room = room;
    this.A = AREAS[room.area];
    this.chunks = new Map();
    const plan = planDeco(room, this.A);
    this.deco = plan.items;
    this.lights = plan.lights;
    this.seed = strSeed(room.id);
  }
  dispose() { for (const c of this.chunks.values()) { c.width = 0; c.height = 0; } this.chunks.clear(); }

  get(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (!c) { c = this.build(cx, cy); this.chunks.set(key, c); }
    return c;
  }

  draw(c, cam) {
    const W = CHW * T, H = CHH * T;
    const cx0 = Math.floor(cam.x / W), cx1 = Math.floor((cam.x + view.w) / W);
    const cy0 = Math.floor(cam.y / H), cy1 = Math.floor((cam.y + view.h) / H);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) c.drawImage(this.get(cx, cy), cx * W, cy * H, W, H);
    if (this.chunks.size > 14) { // drop chunks far from the camera
      for (const [k, cv] of this.chunks) {
        const [kx, ky] = k.split(',').map(Number);
        if (kx < cx0 - 2 || kx > cx1 + 2 || ky < cy0 - 1 || ky > cy1 + 1) { cv.width = 0; this.chunks.delete(k); }
      }
    }
  }

  addLights(cam) {
    const x0 = cam.x - 120, x1 = cam.x + view.w + 120, y0 = cam.y - 120, y1 = cam.y + view.h + 120;
    const t = G.now;
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      if (L.x < x0 || L.x > x1 || L.y < y0 || L.y > y1) continue;
      const f = 0.86 + Math.sin(t * 1.7 + L.ph) * 0.14;
      addLight(L.x, L.y, L.r * f, L.color, L.a * f, L.hole);
    }
  }

  build(cx, cy) {
    const room = this.room, A = this.A, s = view.scale, seed = this.seed;
    const W = CHW * T, H = CHH * T;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * s); cv.height = Math.round(H * s);
    const g = cv.getContext('2d');
    g.scale(s, s); g.translate(-cx * W, -cy * H);
    const tx0 = cx * CHW - 1, tx1 = cx * CHW + CHW, ty0 = cy * CHH - 1, ty1 = cy * CHH + CHH;
    const isT = (x, y) => room.tile(x, y) === TILE.SOLID;
    const R = 9;
    const addTiles = (p) => {
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        if (!isT(x, y)) continue;
        const l = isT(x - 1, y), r = isT(x + 1, y), u = isT(x, y - 1), d = isT(x, y + 1);
        tilePath(p, x * T, y * T, T, T, !l && !u ? R : 0, !r && !u ? R : 0, !r && !d ? R : 0, !l && !d ? R : 0);
      }
    };
    const path = new Path2D(); addTiles(path);
    const comp = new Path2D();
    comp.rect((tx0 - 2) * T, (ty0 - 2) * T, (CHW + 6) * T, (CHH + 6) * T);
    addTiles(comp);

    g.fillStyle = A.rock; g.fill(path);
    g.save();
    g.clip(path);
    // mottled interior
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (!isT(x, y)) continue;
      const r = hash2(x, y, seed + 31), r2 = hash2(x, y, seed + 37);
      const X = x * T, Y = y * T, kind = A.deco;
      if (kind === 'stacks') { // walls of drowned bookshelves
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(X, Y + T - 3, T, 3);
        let bx = X + 1;
        for (let i = 0; i < 7 && bx < X + T - 2; i++) {
          const h1 = hash2(x * 7 + i, y, seed + 41), bw = 3 + Math.floor(h1 * 4), bh = 16 + hash2(x, y * 7 + i, seed + 43) * 11;
          g.fillStyle = rgba([A.rock2, A.rim, A.glowB, A.moss][Math.floor(h1 * 4)], 0.10 + h1 * 0.16);
          g.fillRect(bx, Y + T - 3 - bh, bw, bh);
          if (h1 > 0.7) { g.fillStyle = rgba(A.rim, 0.22); g.fillRect(bx, Y + T - 3 - bh + 4, bw, 1.4); }
          bx += bw + 1;
        }
      } else if (kind === 'ember') { // riveted plates
        g.fillStyle = rgba(A.rock2, 0.5 + r * 0.3); g.fillRect(X + 1, Y + 1, T - 2, T - 2);
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; g.strokeRect(X + 0.75, Y + 0.75, T - 1.5, T - 1.5);
        g.fillStyle = rgba(A.rim, 0.22);
        g.fillRect(X + 4, Y + 4, 2, 2); g.fillRect(X + T - 6, Y + 4, 2, 2); g.fillRect(X + 4, Y + T - 6, 2, 2); g.fillRect(X + T - 6, Y + T - 6, 2, 2);
        if (r > 0.93) { g.strokeStyle = rgba(A.glowB, 0.55); g.lineWidth = 1.4; g.beginPath(); g.moveTo(X + 6 + r2 * 8, Y + 6); g.lineTo(X + 14 + r2 * 6, Y + 16); g.lineTo(X + 10 + r2 * 10, Y + 27); g.stroke(); }
      } else if (kind === 'crystal') { // facets
        g.fillStyle = rgba(A.rock2, 0.4 + r * 0.4);
        g.beginPath(); if (r2 < 0.5) { g.moveTo(X, Y); g.lineTo(X + T, Y); g.lineTo(X, Y + T); } else { g.moveTo(X + T, Y); g.lineTo(X + T, Y + T); g.lineTo(X, Y + T); } g.closePath(); g.fill();
        g.strokeStyle = rgba(r < 0.5 ? A.glowA : A.glowB, 0.08 + r2 * 0.08); g.lineWidth = 1;
        g.beginPath(); g.moveTo(X + T, Y); g.lineTo(X, Y + T); g.stroke();
        if (r > 0.94) { g.fillStyle = rgba('#ffffff', 0.6); g.fillRect(X + r2 * 28, Y + r2 * 23, 1.6, 1.6); }
      } else if (kind === 'orrery') { // engraved arcs and star-points
        if (r < 0.5) { g.fillStyle = rgba(A.rock2, 0.5); g.fillRect(X, Y, T, T); }
        g.strokeStyle = rgba(A.rim, 0.10 + r2 * 0.08); g.lineWidth = 1;
        g.beginPath(); g.arc(X + (r < 0.5 ? 0 : T), Y + (r2 < 0.5 ? 0 : T), T * (0.5 + r * 0.5), 0, TAU); g.stroke();
        if (r > 0.9) { g.fillStyle = rgba(A.glowA, 0.7); g.fillRect(X + r2 * 28, Y + r2 * 23, 1.8, 1.8); }
      } else { // forest: mottled earth and root
        if (r < 0.42) {
          g.fillStyle = rgba(A.rock2, 0.55 + r2 * 0.3);
          g.beginPath(); g.ellipse(X + r2 * T, Y + r * 2 * T, 14 + r2 * 22, 9 + r * 20, r2 * 3, 0, TAU); g.fill();
        }
        if (r2 < 0.3) {
          g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(X + r * 20, Y + r2 * 60); g.lineTo(X + r * 20 + 10 + r2 * 30, Y + r2 * 60 + (r - 0.2) * 10); g.stroke();
        }
        if (r > 0.965) { g.fillStyle = rgba(A.rim, 0.55); g.fillRect(X + r2 * 28, Y + r2 * 23, 1.6, 1.6); }
      }
    }
    // inner rim light: the shadow of everything that is NOT terrain bleeds inward
    g.fillStyle = '#000';
    g.shadowColor = rgba(A.rim, 0.75); g.shadowBlur = 20 * s;
    g.fill(comp, 'evenodd');
    g.shadowColor = rgba(A.rim, 0.95); g.shadowBlur = 5 * s;
    g.fill(comp, 'evenodd');
    g.shadowColor = 'transparent'; g.shadowBlur = 0;
    // mossy / dusty top edge
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (!isT(x, y) || isT(x, y - 1)) continue;
      const up = room.tile(x, y - 1);
      if (up !== TILE.EMPTY && up !== TILE.ONEWAY && up !== TILE.SPIKE) continue;
      const gr = g.createLinearGradient(0, y * T, 0, y * T + 11);
      gr.addColorStop(0, rgba(A.moss, 0.95)); gr.addColorStop(0.35, rgba(A.moss, 0.45)); gr.addColorStop(1, rgba(A.moss, 0));
      g.fillStyle = gr; g.fillRect(x * T, y * T, T, 11);
    }
    g.restore();

    // hazards, platforms, bars
    for (let y = ty0 + 1; y < ty1; y++) for (let x = tx0 + 1; x < tx1; x++) {
      if (!room.inside(x, y)) continue;
      const t = room.tiles[y * room.w + x];
      if (t === TILE.ONEWAY) drawOneway(g, room, x, y, A);
      else if (t === TILE.SPIKE) drawSpike(g, room, x, y);
      else if (t === TILE.GRATE) drawGrate(g, x, y, A);
    }
    // decoration (anything overlapping this chunk)
    const px0 = cx * W - 96, px1 = cx * W + W + 96, py0 = cy * H - 96, py1 = cy * H + H + 96;
    for (let i = 0; i < this.deco.length; i++) {
      const it = this.deco[i];
      if (it.x < px0 || it.x > px1 || it.y < py0 || it.y > py1) continue;
      drawDeco(g, it, A);
    }
    return cv;
  }
}

// ------------------------------------------------------------ backdrops
const backCache = new Map();
onResize(() => { backCache.clear(); });

function wrapDraw(W, fn) { fn(0); fn(-W); fn(W); }

function buildSky(A, kind, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, A.sky[0]); gr.addColorStop(0.55, A.sky[1]); gr.addColorStop(1, A.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const rnd = mulberry32(strSeed(kind) + 5);
  const stars = kind === 'village' ? 150 : kind === 'crystal' || kind === 'orrery' ? 110 : kind === 'forest' ? 30 : 0;
  for (let i = 0; i < stars; i++) {
    const x = rnd() * w, y = rnd() * h * (kind === 'forest' ? 0.5 : 0.8), r = rnd();
    g.fillStyle = `rgba(${210 + r * 45},${225 + r * 30},255,${0.25 + r * 0.6})`;
    g.fillRect(x, y, r > 0.9 ? 2 : 1, r > 0.9 ? 2 : 1);
  }
  if (kind === 'village') { // the ring of dust where the moon used to hang
    g.save(); g.translate(w * 0.7, h * 0.26); g.rotate(-0.35);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * TAU, rr = 54 + (rnd() - 0.5) * 12;
      g.fillStyle = `rgba(230,236,255,${0.08 + rnd() * 0.35})`;
      g.fillRect(Math.cos(a) * rr, Math.sin(a) * rr * 0.42, 1.3, 1.3);
    }
    g.restore();
    bakeGlow(g, w * 0.7, h * 0.26, 110, '#9fb6ff', 0.22);
  } else if (kind === 'forest') { // faint slanted light shafts through the canopy
    for (let i = 0; i < 5; i++) {
      const x = rnd() * w;
      const sg = g.createLinearGradient(x, 0, x + 60, 0);
      sg.addColorStop(0, rgba(A.rim, 0)); sg.addColorStop(0.5, rgba(A.rim, 0.05)); sg.addColorStop(1, rgba(A.rim, 0));
      g.save(); g.transform(1, 0, -0.35, 1, 0, 0); g.fillStyle = sg; g.fillRect(x, 0, 60, h); g.restore();
    }
  } else if (kind === 'ember') {
    bakeGlow(g, w / 2, h * 1.05, w * 0.7, A.glowB, 0.35);
  }
  return cv;
}

function buildLayer(A, kind, idx, W, H, sc) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
  const g = cv.getContext('2d');
  g.scale(sc, sc);
  const rnd = mulberry32(strSeed(kind) + idx * 977 + 3);
  const col = idx === 0 ? mixHex(A.sky[1], '#000000', 0.3) : mixHex(A.sky[0], '#000000', 0.35);
  const edge = idx === 0 ? rgba(A.rim, 0.05) : rgba(A.rim, 0.09);
  const dots = (n, cols, rmin, rmax, ymin, ymax) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = ymin + rnd() * (ymax - ymin), r = rmin + rnd() * (rmax - rmin), c = cols[Math.floor(rnd() * cols.length)];
      wrapDraw(W, (o) => { bakeGlow(g, x + o, y, r * 5, c, 0.5); g.fillStyle = c; g.beginPath(); g.arc(x + o, y, r, 0, TAU); g.fill(); });
    }
  };
  if (kind === 'forest' || kind === 'village') {
    const n = idx === 0 ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const x = (i + rnd() * 0.8) * (W / n), w = idx === 0 ? 26 + rnd() * 40 : 70 + rnd() * 80, bend = (rnd() - 0.5) * 60;
      const top = kind === 'village' ? H * (idx === 0 ? 0.52 : 0.4) + rnd() * 40 : 0;
      wrapDraw(W, (o) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x + o - w * 0.55, top);
        g.bezierCurveTo(x + o - w * 0.4 + bend, H * 0.35, x + o - w * 0.5 + bend, H * 0.7, x + o - w * 0.95, H);
        g.lineTo(x + o + w * 0.95, H);
        g.bezierCurveTo(x + o + w * 0.5 + bend, H * 0.7, x + o + w * 0.4 + bend, H * 0.35, x + o + w * 0.55, top);
        g.closePath(); g.fill();
        g.strokeStyle = edge; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + o - w * 0.55, top); g.bezierCurveTo(x + o - w * 0.4 + bend, H * 0.35, x + o - w * 0.5 + bend, H * 0.7, x + o - w * 0.95, H); g.stroke();
        if (kind === 'village') { // round crown of leaves
          g.fillStyle = col;
          for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + o + (k - 2) * w * 0.5, top + Math.abs(k - 2) * 12 - 6, w * 0.8, 0, TAU); g.fill(); }
        } else { // branches
          for (let k = 0; k < 3; k++) {
            const by = H * (0.15 + 0.25 * k) + rnd() * 20, dir = k % 2 ? 1 : -1, len = 60 + rnd() * 110;
            g.strokeStyle = col; g.lineWidth = Math.max(3, w * 0.16); g.lineCap = 'round';
            g.beginPath(); g.moveTo(x + o + bend * 0.5, by); g.quadraticCurveTo(x + o + dir * len * 0.6, by - 30, x + o + dir * len, by - 50 - rnd() * 30); g.stroke();
          }
        }
      });
    }
    if (kind === 'forest') {
      for (let i = 0; i < 16; i++) { // hanging vines + canopy clumps
        const x = rnd() * W, len = 60 + rnd() * 220;
        wrapDraw(W, (o) => {
          g.strokeStyle = col; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x + o, 0); g.quadraticCurveTo(x + o + 14, len * 0.6, x + o - 6, len); g.stroke();
          g.fillStyle = col; g.beginPath(); g.ellipse(x + o, -6, 70 + (i % 4) * 22, 34, 0, 0, TAU); g.fill();
        });
      }
      dots(idx === 0 ? 20 : 12, [A.glowA, A.glowB, A.glowA], 1, 2.4, H * 0.1, H * 0.92);
    } else {
      // lamp-houses with lit windows
      const m = idx === 0 ? 7 : 4;
      for (let i = 0; i < m; i++) {
        const x = rnd() * W, hw = idx === 0 ? 16 + rnd() * 10 : 30 + rnd() * 16, hh = hw * (1.3 + rnd() * 0.5), base = H * (idx === 0 ? 0.8 : 0.9);
        wrapDraw(W, (o) => {
          g.fillStyle = col;
          g.beginPath(); g.ellipse(x + o, base - hh * 0.5, hw, hh * 0.55, 0, 0, TAU); g.fill();
          g.fillRect(x + o - hw * 0.5, base - hh * 1.12, hw, hh * 0.18);
          g.fillStyle = '#ffcf7a';
          g.beginPath(); g.ellipse(x + o, base - hh * 0.5, hw * 0.28, hh * 0.2, 0, 0, TAU); g.fill();
          bakeGlow(g, x + o, base - hh * 0.5, hw * 1.8, '#ffcf7a', 0.4);
        });
      }
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, H * (idx === 0 ? 0.8 : 0.9) + Math.sin(x / W * TAU * (2 + idx)) * 14);
      g.lineTo(W, H); g.closePath(); g.fill();
    }
  } else if (kind === 'stacks') {
    const n = idx === 0 ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const x = (i + rnd() * 0.5) * (W / n), w = idx === 0 ? 50 + rnd() * 30 : 90 + rnd() * 50, top = rnd() * H * 0.25;
      wrapDraw(W, (o) => {
        g.fillStyle = col; g.fillRect(x + o, top, w, H - top);
        g.beginPath(); g.arc(x + o + w / 2, top, w / 2, Math.PI, 0); g.fill();
        for (let y = top + 24; y < H; y += 30) { // shelves of book spines
          g.fillStyle = edge; g.fillRect(x + o + 4, y, w - 8, 2);
          for (let bx = x + 6; bx < x + w - 8; bx += 5 + ((bx * 7) % 4)) { g.fillStyle = rgba(A.rim, 0.03 + ((bx * 13 + y) % 5) * 0.012); g.fillRect(bx + o, y - 18 + ((bx * 3) % 6), 3, 18 - ((bx * 3) % 6)); }
        }
      });
    }
    dots(idx === 0 ? 16 : 9, [A.glowA, A.glowB], 1, 2.2, H * 0.05, H * 0.95);
  } else if (kind === 'ember') {
    const n = idx === 0 ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const x = (i + rnd() * 0.6) * (W / n), w = idx === 0 ? 20 + rnd() * 26 : 40 + rnd() * 50, top = rnd() * H * 0.4;
      wrapDraw(W, (o) => {
        g.fillStyle = col; g.fillRect(x + o, top, w, H - top);
        g.fillRect(x + o - 6, top, w + 12, 10);
        g.strokeStyle = edge; g.lineWidth = 2; g.strokeRect(x + o, top, w, H - top);
        const gy = top + 60 + rnd() * 200, gr2 = 26 + rnd() * 40; // cog wheel
        g.strokeStyle = col; g.lineWidth = 10; g.beginPath(); g.arc(x + o + w + gr2, gy, gr2, 0, TAU); g.stroke();
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.fillStyle = col; g.fillRect(x + o + w + gr2 + Math.cos(a) * (gr2 + 6) - 5, gy + Math.sin(a) * (gr2 + 6) - 5, 10, 10); }
      });
    }
    dots(idx === 0 ? 18 : 10, [A.glowA, A.glowB], 1, 2.6, H * 0.3, H);
  } else if (kind === 'crystal') {
    const n = idx === 0 ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, w = idx === 0 ? 24 + rnd() * 40 : 50 + rnd() * 70, hh = H * (0.25 + rnd() * 0.5), up = rnd() < 0.6, lean = (rnd() - 0.5) * 80;
      const c2 = rnd() < 0.5 ? A.glowA : A.glowB;
      wrapDraw(W, (o) => {
        g.fillStyle = col;
        g.beginPath();
        if (up) { g.moveTo(x + o - w / 2, H); g.lineTo(x + o + lean, H - hh); g.lineTo(x + o + w / 2, H); }
        else { g.moveTo(x + o - w / 2, 0); g.lineTo(x + o + lean, hh); g.lineTo(x + o + w / 2, 0); }
        g.closePath(); g.fill();
        g.strokeStyle = rgba(c2, idx === 0 ? 0.08 : 0.16); g.lineWidth = 2;
        g.beginPath(); if (up) { g.moveTo(x + o - w / 2, H); g.lineTo(x + o + lean, H - hh); } else { g.moveTo(x + o - w / 2, 0); g.lineTo(x + o + lean, hh); } g.stroke();
      });
    }
    dots(idx === 0 ? 24 : 12, [A.glowA, A.glowB, '#ffffff'], 0.8, 2, 0, H);
  } else if (kind === 'orrery') {
    for (let i = 0; i < (idx === 0 ? 5 : 3); i++) {
      const x = rnd() * W, y = H * (0.2 + rnd() * 0.6), r = idx === 0 ? 60 + rnd() * 90 : 120 + rnd() * 120, tilt = (rnd() - 0.5) * 1.2;
      wrapDraw(W, (o) => {
        g.strokeStyle = rgba(A.rim, idx === 0 ? 0.07 : 0.12); g.lineWidth = idx === 0 ? 2 : 3;
        g.beginPath(); g.ellipse(x + o, y, r, r * 0.3, tilt, 0, TAU); g.stroke();
        g.beginPath(); g.ellipse(x + o, y, r * 0.7, r * 0.7 * 0.3, tilt + 0.8, 0, TAU); g.stroke();
        g.fillStyle = col; g.beginPath(); g.arc(x + o, y, r * 0.22, 0, TAU); g.fill();
      });
    }
    for (let i = 0; i < (idx === 0 ? 7 : 4); i++) {
      const x = rnd() * W, w = idx === 0 ? 24 + rnd() * 20 : 46 + rnd() * 40;
      wrapDraw(W, (o) => { g.fillStyle = col; g.fillRect(x + o, 0, w, H); g.fillStyle = edge; g.fillRect(x + o, 0, 2, H); });
    }
    dots(idx === 0 ? 20 : 10, [A.glowA, A.glowB], 0.8, 2.2, 0, H);
  }
  // ground fog so layers separate
  const fg = g.createLinearGradient(0, H * 0.55, 0, H);
  fg.addColorStop(0, rgba(A.rim, 0)); fg.addColorStop(1, rgba(A.rim, idx === 0 ? 0.1 : 0.06));
  g.fillStyle = fg; g.fillRect(0, H * 0.55, W, H * 0.45);
  return cv;
}

function getBack(areaKey) {
  let b = backCache.get(areaKey);
  if (!b) {
    const A = AREAS[areaKey], kind = A.back;
    const H = Math.ceil(view.h * 1.22), W = 1400, sc = Math.min(1, view.scale);
    b = { W, H, sky: buildSky(A, kind, 640, 360), far: buildLayer(A, kind, 0, W, H, sc), near: buildLayer(A, kind, 1, W, H, sc) };
    backCache.set(areaKey, b);
    if (backCache.size > 3) { const k = backCache.keys().next().value; if (k !== areaKey) backCache.delete(k); }
  }
  return b;
}

// ctx must be scaled to logical units with no camera translation.
export function drawBackdrop(c, areaKey, cam, room) {
  const b = getBack(areaKey);
  c.drawImage(b.sky, 0, 0, view.w, view.h);
  const span = room && room.pxH > view.h ? clamp(cam.y / (room.pxH - view.h), 0, 1) : 0.5;
  const offX = room ? room.def.gx * 420 : 0;
  const layer = (img, par) => {
    const y = -(b.H - view.h) * span;
    let x = -(((cam.x * par + offX * par) % b.W) + b.W) % b.W;
    for (; x < view.w; x += b.W) c.drawImage(img, x, y, b.W, b.H);
  };
  layer(b.far, 0.14);
  layer(b.near, 0.32);
}
