// Canvas setup, camera, glow sprites, the darkness/light pass and particles.
import { G } from './state.js';
import { T } from './config.js';
import { clamp, rand, pick, rgba, approach, TAU } from './util.js';

export const view = { w: 960, h: 544, scale: 1, bw: 960, bh: 544, small: false, portrait: false };
export let canvas = null;
export let ctx = null;
let lightCv = null, lctx = null;
const glowCache = new Map();
let holeSprite = null, vignette = null;
const resizeHooks = [];
export function onResize(fn) { resizeHooks.push(fn); }

export function initGfx(cv) {
  canvas = cv;
  ctx = cv.getContext('2d', { alpha: false });
  lightCv = document.createElement('canvas');
  lctx = lightCv.getContext('2d');
  holeSprite = makeRadial([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.9)'], [0.65, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']], 128);
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
}

function makeRadial(stops, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

export function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(160, rect.width), cssH = Math.max(120, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const q = (G.settings && G.settings.quality) || 'auto';
  const cap = q === 'low' ? 480 : q === 'med' ? 720 : q === 'high' ? 1200 : (coarse ? 720 : 1080);
  const bh = Math.min(Math.round(cssH * dpr), cap);
  const bw = Math.round(bh * cssW / cssH);
  view.small = Math.min(cssW, cssH) < 520;
  view.portrait = cssH > cssW;
  const targetH = view.small ? 448 : 544;
  const tilePx = Math.max(10, Math.round(T * bh / targetH));
  const scale = tilePx / T;
  if (canvas.width !== bw || canvas.height !== bh || view.scale !== scale) {
    canvas.width = bw; canvas.height = bh;
    view.bw = bw; view.bh = bh; view.scale = scale;
    view.w = bw / scale; view.h = bh / scale;
    lightCv.width = Math.ceil(bw / 4); lightCv.height = Math.ceil(bh / 4);
    vignette = null;
    for (const fn of resizeHooks) fn();
  }
}

// ------------------------------------------------------------------ glows
export function glowSprite(color) {
  let c = glowCache.get(color);
  if (!c) {
    c = makeRadial([[0, rgba(color, 1)], [0.2, rgba(color, 0.62)], [0.5, rgba(color, 0.2)], [0.8, rgba(color, 0.05)], [1, rgba(color, 0)]], 96);
    glowCache.set(color, c);
  }
  return c;
}

// Immediate additive glow. Caller is responsible for the world transform.
export function drawGlow(c, x, y, r, color, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  const pa = c.globalAlpha, po = c.globalCompositeOperation;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = pa * Math.min(1, alpha);
  c.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  c.globalAlpha = pa; c.globalCompositeOperation = po;
}

// ------------------------------------------------------------------ lights
const lights = [];
// hole: how strongly this light pushes back the darkness (0..1)
// a: additive colour strength
export function addLight(x, y, r, color, a = 0.3, hole = 1) {
  lights.push({ x, y, r, color, a, hole });
}

export function drawLighting(cam, ambient, darkMul = 1) {
  const s4 = view.scale / 4;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  lctx.clearRect(0, 0, lightCv.width, lightCv.height);
  lctx.fillStyle = `rgba(${ambient[0]},${ambient[1]},${ambient[2]},${clamp(ambient[3] * darkMul, 0, 0.96)})`;
  lctx.fillRect(0, 0, lightCv.width, lightCv.height);
  lctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i];
    if (L.hole <= 0) continue;
    const x = (L.x - cam.x) * s4, y = (L.y - cam.y) * s4, r = L.r * s4;
    if (x + r < 0 || y + r < 0 || x - r > lightCv.width || y - r > lightCv.height) continue;
    lctx.globalAlpha = Math.min(1, L.hole);
    lctx.drawImage(holeSprite, x - r, y - r, r * 2, r * 2);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCv, 0, 0, view.bw, view.bh);
  // coloured bloom on top of the darkness
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i];
    if (!L.color || L.a <= 0) continue;
    const x = L.x - cam.x, y = L.y - cam.y, r = L.r * 0.85;
    if (x + r < 0 || y + r < 0 || x - r > view.w || y - r > view.h) continue;
    ctx.globalAlpha = Math.min(1, L.a);
    ctx.drawImage(glowSprite(L.color), x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  lights.length = 0;
}

export function drawVignette() {
  if (!vignette) {
    vignette = document.createElement('canvas');
    vignette.width = 256; vignette.height = 144;
    const g = vignette.getContext('2d');
    const gr = g.createRadialGradient(128, 72, 40, 128, 72, 150);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 144);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(vignette, 0, 0, view.bw, view.bh);
}

// ------------------------------------------------------------------ particles
const parts = [];
const MAXP = 520;
export function spawnP(p) {
  if (parts.length >= MAXP) parts.shift();
  parts.push({
    x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0, life: p.life || 0.5, t: 0, size: p.size || 3,
    color: p.color || '#ffffff', grav: p.grav || 0, drag: p.drag || 0, shape: p.shape || 'dot',
    grow: p.grow || 0, rot: p.rot || 0, vr: p.vr || 0, a: p.a === undefined ? 1 : p.a, wob: p.wob || 0, seed: Math.random() * 10,
  });
}
export function burst(x, y, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(o.a0 === undefined ? 0 : o.a0, o.a1 === undefined ? TAU : o.a1);
    const sp = rand(o.s0 === undefined ? 40 : o.s0, o.s1 === undefined ? 200 : o.s1);
    spawnP({
      x: x + rand(-1, 1) * (o.spread || 0), y: y + rand(-1, 1) * (o.spread || 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(o.l0 === undefined ? 0.3 : o.l0, o.l1 === undefined ? 0.7 : o.l1),
      size: rand(o.z0 === undefined ? 2 : o.z0, o.z1 === undefined ? 4 : o.z1),
      color: Array.isArray(o.color) ? pick(o.color) : (o.color || '#ffffff'),
      grav: o.grav || 0, drag: o.drag === undefined ? 2 : o.drag, shape: o.shape || 'dot', a: o.a, vr: o.vr ? rand(-o.vr, o.vr) : 0, rot: rand(0, TAU),
    });
  }
}
export function ring(x, y, color, size = 10, grow = 260, life = 0.35) {
  spawnP({ x, y, shape: 'ring', color, size, grow, life });
}
export function clearParticles() { parts.length = 0; }
export function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.vx -= p.vx * p.drag * dt;
    p.vy += (p.grav - p.vy * p.drag) * dt;
    if (p.wob) p.vx += Math.sin(p.t * 3 + p.seed) * p.wob * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
}
// World transform must already be applied.
export function drawParticles(c, cam) {
  const x0 = cam.x - 40, y0 = cam.y - 40, x1 = cam.x + view.w + 40, y1 = cam.y + view.h + 40;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    const k = p.t / p.life;
    const al = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    if (p.shape === 'dot') {
      const r = p.size * (1 - k * 0.5);
      c.globalAlpha = al * 0.9;
      c.drawImage(glowSprite(p.color), p.x - r * 3, p.y - r * 3, r * 6, r * 6);
      c.globalAlpha = al;
      c.fillStyle = '#ffffff';
      c.fillRect(p.x - r * 0.35, p.y - r * 0.35, r * 0.7, r * 0.7);
    } else if (p.shape === 'spark') {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const len = Math.min(18, sp * 0.045) + p.size;
      c.globalAlpha = al;
      c.strokeStyle = p.color; c.lineWidth = Math.max(1, p.size * 0.6);
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len); c.stroke();
    } else if (p.shape === 'ring') {
      c.globalAlpha = (1 - k) * p.a;
      c.strokeStyle = p.color; c.lineWidth = Math.max(1, 4 * (1 - k));
      c.beginPath(); c.arc(p.x, p.y, p.size + p.grow * k, 0, TAU); c.stroke();
    } else if (p.shape === 'shard') {
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = Math.min(1, al * 1.4);
      c.fillStyle = p.color;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.beginPath(); c.moveTo(-p.size, p.size * 0.6); c.lineTo(0, -p.size); c.lineTo(p.size, p.size * 0.5); c.closePath(); c.fill();
      c.restore();
      c.globalCompositeOperation = 'lighter';
    } else if (p.shape === 'smoke') {
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = al * 0.35;
      c.fillStyle = p.color;
      const r = p.size * (1 + k * 1.6);
      c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
      c.globalCompositeOperation = 'lighter';
    }
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ camera
export function shake(mag, dur = 0.25) {
  if (G.settings && !G.settings.shake) return;
  const c = G.cam;
  if (mag >= c.shakeMag || c.shakeT <= 0) { c.shakeMag = mag; c.shakeT = dur; c.shakeDur = dur; }
}

export function updateCamera(dt, snap) {
  const c = G.cam, p = G.player, r = G.room;
  if (!r) return;
  let fx = r.pxW / 2, fy = r.pxH / 2, face = 0;
  if (c.focus) { fx = c.focus.x; fy = c.focus.y; }
  else if (p) {
    fx = p.x + p.w / 2; fy = p.y + p.h / 2; face = p.facing;
    const b = G.boss; // during boss fights, lean the view toward the boss so it is never a surprise
    if (b && !b.dead) { fx += clamp((b.cx - fx) * 0.45, -view.w * 0.3, view.w * 0.3); face = 0; }
  }
  c.look = snap ? face * 48 : approach(c.look || 0, face * 48, 150 * dt);
  let tx = fx + c.look - view.w / 2;
  let ty = fy - view.h * 0.56 + (c.lookY || 0);
  if (c.lock) { // boss arenas can pin the camera inside a rectangle
    tx = clamp(tx, c.lock.x0, Math.max(c.lock.x0, c.lock.x1 - view.w));
  }
  if (r.pxW <= view.w) tx = (r.pxW - view.w) / 2; else tx = clamp(tx, 0, r.pxW - view.w);
  if (r.pxH <= view.h) ty = (r.pxH - view.h) / 2; else ty = clamp(ty, 0, r.pxH - view.h);
  if (snap) { c.tx = tx; c.ty = ty; }
  else { c.tx += (tx - c.tx) * Math.min(1, dt * 7); c.ty += (ty - c.ty) * Math.min(1, dt * 8); }
  let sx = 0, sy = 0;
  if (c.shakeT > 0) {
    c.shakeT -= dt;
    const k = Math.max(0, c.shakeT / (c.shakeDur || 0.25));
    sx = rand(-1, 1) * c.shakeMag * k; sy = rand(-1, 1) * c.shakeMag * k;
    if (c.shakeT <= 0) c.shakeMag = 0;
  }
  // snap to device pixels so terrain chunks never shimmer or show seams
  c.x = Math.round((c.tx + sx) * view.scale) / view.scale;
  c.y = Math.round((c.ty + sy) * view.scale) / view.scale;
}

// ------------------------------------------------------------------ shape helpers
export function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
export function rrect(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else {
    const rr = Math.min(typeof r === 'number' ? r : r[0], w / 2, h / 2);
    c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath();
  }
}
export function tri(c, x1, y1, x2, y2, x3, y3) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); }
