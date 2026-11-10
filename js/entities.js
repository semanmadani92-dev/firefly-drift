// World objects: lanterns (save points), pickups, gates, levers, characters,
// projectiles. Enemies live in enemies.js and build on Entity from here.
import { G } from './state.js';
import { T, TILE, AREAS } from './config.js';
import { register } from './world.js';
import { moveBody, solidAt } from './physics.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell, rrect } from './gfx.js';
import { Sound } from './audio.js';
import { flag, setFlag, has, equipped } from './save.js';
import { rand, lerp, approach, overlap, TAU, clamp, rgba, sign } from './util.js';
import { ITEMS, RELICS, HINTS, TABLETS, NPCS } from './data/text.js';
import { HAZ } from './terrain.js';

export class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.t = 0;
    this.dead = false; this.layer = 1; this.type = 'entity'; this.room = null;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  update(dt) { this.t += dt; }
  draw() {}
}

// ---------------------------------------------------------------- drawing bits
export function drawFlame(c, x, y, h, color, t, core = '#fff7d6') {
  const sway = Math.sin(t * 9) * h * 0.1 + Math.sin(t * 23) * h * 0.04, w = h * 0.42;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x - w, y);
  c.bezierCurveTo(x - w * 1.1, y - h * 0.5, x + sway - w * 0.2, y - h * 0.7, x + sway, y - h);
  c.bezierCurveTo(x + sway + w * 0.2, y - h * 0.7, x + w * 1.1, y - h * 0.5, x + w, y);
  c.quadraticCurveTo(x, y + h * 0.22, x - w, y);
  c.fill();
  c.fillStyle = core;
  c.beginPath();
  c.moveTo(x - w * 0.45, y);
  c.quadraticCurveTo(x + sway * 0.5, y - h * 0.75, x + w * 0.45, y);
  c.quadraticCurveTo(x, y + h * 0.14, x - w * 0.45, y);
  c.fill();
}

// Apply a collected / bought item to the save file. Returns toast text.
export function giveItem(kind, spec = {}) {
  const S = G.save;
  if (kind === 'seed') {
    S.seeds++;
    if (S.seeds >= 3) { S.seeds = 0; S.maxHp++; S.hp = S.maxHp; return ['Ember Seed', 'Three seeds take root. Your flame grows: +1 ember.']; }
    return ['Ember Seed', `${S.seeds} of 3 gathered.`];
  }
  if (kind === 'vial') { S.maxVials++; S.vials = S.maxVials; return ['Dew Vial', ITEMS.vial.desc]; }
  if (kind === 'glass') { S.glass++; S.lumenMax = 99 + 33 * S.glass; return ['Lumen Glass', ITEMS.glass.desc]; }
  if (kind === 'shard') { S.shards++; return ['Moon Shard', ITEMS.shard.desc]; }
  if (kind === 'slot') { S.slots++; return ['Relic Knot', ITEMS.slot.desc]; }
  if (kind === 'chart') { S.charts[spec.area] = 1; return ['Star Chart', `${AREAS[spec.area].name} is now drawn on your map.`]; }
  if (kind === 'relic') {
    const id = spec.relic || spec.id;
    if (!S.relics.includes(id)) S.relics.push(id);
    if (S.equipped.length < S.slots && !S.equipped.includes(id)) S.equipped.push(id);
    return [`Relic: ${RELICS[id].name}`, RELICS[id].desc];
  }
  return ['', ''];
}

export function dropMotes(room, x, y, total) {
  let n = total;
  while (n > 0) {
    const v = n >= 10 ? 5 : 1;
    n -= v;
    room.add(new Mote(x + rand(-6, 6), y + rand(-6, 6), v));
  }
}

// ---------------------------------------------------------------- lantern
class Lantern extends Entity {
  constructor(x, y, uid) {
    super(x - 16, y - 76, 32, 76);
    this.type = 'lantern'; this.bx = x; this.by = y; this.uid = uid;
    this.prompt = 'Rest'; this.reach = 46; this.layer = 0; this.glow = 0;
  }
  get lit() { return flag('lan:' + this.uid); }
  interact() { G.game.rest(this); }
  update(dt) { this.t += dt; this.glow = approach(this.glow, this.lit ? 1 : 0, dt * 1.5); }
  draw(c) {
    const x = this.bx, y = this.by, g = this.glow, t = G.now;
    c.strokeStyle = '#1b2233'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x - 12, y - 62); c.quadraticCurveTo(x - 12, y - 76, x + 2, y - 74); c.stroke();
    c.strokeStyle = '#39445e'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x - 13.5, y); c.lineTo(x - 13.5, y - 62); c.stroke();
    c.fillStyle = '#1b2233'; c.fillRect(x - 19, y - 4, 14, 4);
    // hanging cage
    const sw = Math.sin(t * 1.3 + this.bx) * 1.5, lx = x + 4 + sw, ly = y - 70;
    c.strokeStyle = '#1b2233'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 2, y - 74); c.lineTo(lx, ly + 4); c.stroke();
    c.fillStyle = g > 0.05 ? rgba('#ffcf7a', 0.25 + 0.3 * g) : 'rgba(120,150,220,0.12)';
    rrect(c, lx - 8, ly + 6, 16, 22, 5); c.fill();
    c.strokeStyle = '#27304a'; c.lineWidth = 2; rrect(c, lx - 8, ly + 6, 16, 22, 5); c.stroke();
    c.fillStyle = '#1b2233'; c.fillRect(lx - 9, ly + 3, 18, 4); c.fillRect(lx - 7, ly + 27, 14, 3);
    if (g > 0.05) drawFlame(c, lx, ly + 24, 9 + 5 * g, '#ffb347', t + this.bx);
    else drawFlame(c, lx, ly + 24, 5, '#6f8fdc', t + this.bx, '#cfe0ff');
    addLight(lx, ly + 16, 110 + 130 * g, g > 0.05 ? '#ffcf7a' : '#6f8fdc', 0.22 + 0.2 * g, 0.6 + 0.4 * g);
    if (g > 0.5 && Math.random() < 0.06) spawnP({ x: lx + rand(-4, 4), y: ly + 12, vy: -rand(16, 40), vx: rand(-8, 8), life: rand(0.8, 1.6), size: 1.6, color: '#ffcf7a', wob: 30 });
  }
}
register('lantern', (room, spec, x, y, info) => new Lantern(x, y, info.uid));

// ---------------------------------------------------------------- motes (currency)
export class Mote extends Entity {
  constructor(x, y, val = 1) {
    super(x - 4, y - 4, 8, 8);
    this.type = 'mote'; this.val = val; this.layer = 2;
    this.vx = rand(-150, 150); this.vy = rand(-340, -140);
  }
  update(dt) {
    this.t += dt;
    const p = G.player; if (!p) return;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
    const range = equipped('magnet') ? 420 : 74;
    if (this.t > 0.4 && d < range && p.state !== 'dead') {
      const sp = 560;
      this.vx = lerp(this.vx, dx / d * sp, Math.min(1, dt * 9)); this.vy = lerp(this.vy, dy / d * sp, Math.min(1, dt * 9));
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else {
      this.vy = Math.min(this.vy + 1500 * dt, 640);
      const pv = this.vy;
      moveBody(this.room, this, dt);
      if (this.onGround) { this.vx *= 0.86; if (pv > 220) this.vy = -pv * 0.42; }
      if (this.y > this.room.pxH + 40) this.dead = true;
    }
    if (this.t > 0.3 && d < 20 && p.state !== 'dead') {
      this.dead = true;
      G.save.motes += this.val;
      Sound.play('mote');
      spawnP({ x: this.cx, y: this.cy, life: 0.3, size: 3, color: '#ffe9a8', vy: -40 });
    }
  }
  draw(c) {
    const big = this.val > 1, r = big ? 4.2 : 3, pul = 1 + Math.sin(G.now * 8 + this.x) * 0.15;
    const col = big ? '#8fffe0' : '#ffe08a';
    drawGlow(c, this.cx, this.cy, r * 4 * pul, col, 0.8);
    c.fillStyle = '#fffbe6';
    c.beginPath(); c.moveTo(this.cx, this.cy - r); c.lineTo(this.cx + r * 0.8, this.cy); c.lineTo(this.cx, this.cy + r); c.lineTo(this.cx - r * 0.8, this.cy); c.closePath(); c.fill();
  }
}

// ---------------------------------------------------------------- geode (mote cache)
class Geode extends Entity {
  constructor(x, y, uid, spec) {
    super(x - 14, y - 20, 28, 20);
    this.type = 'geode'; this.uid = uid; this.hp = 2; this.amount = spec.n || 8; this.shakeT = 0;
  }
  onSlash() {
    this.hp--; this.shakeT = 0.2;
    burst(this.cx, this.cy, 6, { color: ['#ffe08a', '#8fffe0'], shape: 'shard', s0: 60, s1: 200, grav: 700, z0: 2, z1: 4, vr: 8 });
    if (this.hp <= 0) {
      this.dead = true; setFlag('geo:' + this.uid);
      Sound.play('break'); dropMotes(this.room, this.cx, this.cy - 6, this.amount);
      ring(this.cx, this.cy, '#ffe08a', 6, 120, 0.3);
    } else Sound.play('crack');
    return true;
  }
  update(dt) { this.t += dt; this.shakeT = Math.max(0, this.shakeT - dt); }
  draw(c) {
    const ox = this.shakeT > 0 ? rand(-2, 2) : 0, x = this.cx + ox, y = this.y + this.h;
    const cols = ['#ffe08a', '#8fffe0', '#ffc46a'];
    for (let i = 0; i < 3; i++) {
      const bx = x + (i - 1) * 8, hh = [14, 20, 11][i], lean = (i - 1) * 4;
      c.fillStyle = cols[i];
      c.beginPath(); c.moveTo(bx - 5, y); c.lineTo(bx + lean, y - hh); c.lineTo(bx + 5, y); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath(); c.moveTo(bx - 1, y); c.lineTo(bx + lean, y - hh); c.lineTo(bx + 1.5, y); c.closePath(); c.fill();
    }
    addLight(x, y - 10, 56, '#ffe08a', 0.3, 0.5);
  }
}
register('geode', (room, spec, x, y, info) => (flag('geo:' + info.uid) ? null : new Geode(x, y, info.uid, spec)));

// ---------------------------------------------------------------- dewbloom (refills a vial)
class Dewbloom extends Entity {
  constructor(x, y, uid) {
    super(x - 12, y - 34, 24, 34);
    this.type = 'dewbloom'; this.uid = uid; this.bx = x; this.by = y; this.pop = 0;
  }
  get spent() { return G.killed.has(this.uid); }
  onSlash() {
    if (this.spent) return false;
    G.killed.add(this.uid); this.pop = 0.4;
    const S = G.save;
    if (S.vials < S.maxVials) { S.vials++; G.ui.toast('Dew gathered. A vial is full again.'); }
    Sound.play('heal');
    burst(this.bx, this.by - 28, 16, { color: ['#9fe8ff', '#ffffff'], s0: 40, s1: 180, l0: 0.4, l1: 0.9, grav: 200 });
    ring(this.bx, this.by - 28, '#9fe8ff', 4, 140, 0.35);
    return true;
  }
  update(dt) { this.t += dt; this.pop = Math.max(0, this.pop - dt); }
  draw(c) {
    const x = this.bx, y = this.by, sp = this.spent, sw = Math.sin(G.now * 1.6 + x) * 2;
    c.strokeStyle = '#1d5a4c'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 5, y - 16, x + sw, y - 26); c.stroke();
    c.fillStyle = '#237060';
    ell(c, x - 6, y - 8, 7, 2.6, -0.5); c.fill(); ell(c, x + 5, y - 13, 6, 2.2, 0.6); c.fill();
    if (sp) { c.fillStyle = '#1d4a5a'; ell(c, x + sw, y - 28, 3.5, 5); c.fill(); return; }
    const pul = 1 + Math.sin(G.now * 3 + x) * 0.08;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      c.fillStyle = i % 2 ? '#7fd8f5' : '#b9f1ff';
      ell(c, x + sw + Math.cos(a) * 6, y - 28 + Math.sin(a) * 6, 5.5 * pul, 3, a); c.fill();
    }
    c.fillStyle = '#ffffff'; ell(c, x + sw, y - 27, 3, 3); c.fill();
    addLight(x + sw, y - 28, 80, '#9fe8ff', 0.36, 0.7);
  }
}
register('dewbloom', (room, spec, x, y, info) => new Dewbloom(x, y, info.uid));

// ---------------------------------------------------------------- item pickups
const ITEM_COL = { seed: '#ff9a5a', vial: '#9fe8ff', glass: '#8fffe0', shard: '#e8eeff', slot: '#ffd98a', chart: '#f1e2b8', relic: '#ffd98a' };
export function drawItemIcon(c, kind, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  if (kind === 'seed') {
    c.fillStyle = '#ff9a5a'; c.beginPath(); c.moveTo(0, -9); c.bezierCurveTo(8, -2, 6, 8, 0, 9); c.bezierCurveTo(-6, 8, -8, -2, 0, -9); c.fill();
    c.fillStyle = '#fff1c4'; c.beginPath(); c.moveTo(0, -3); c.bezierCurveTo(3, 1, 3, 5, 0, 6); c.bezierCurveTo(-3, 5, -3, 1, 0, -3); c.fill();
  } else if (kind === 'vial') {
    c.fillStyle = 'rgba(200,240,255,0.25)'; rrect(c, -6, -5, 12, 14, 5); c.fill();
    c.fillStyle = '#7fd8f5'; rrect(c, -5, 0, 10, 8, 4); c.fill();
    c.strokeStyle = '#d8f4ff'; c.lineWidth = 1.5; rrect(c, -6, -5, 12, 14, 5); c.stroke();
    c.fillStyle = '#d8f4ff'; c.fillRect(-3, -10, 6, 5); c.fillStyle = '#8a6a48'; c.fillRect(-2.5, -12, 5, 3);
  } else if (kind === 'glass') {
    c.fillStyle = '#8fffe0'; c.beginPath(); c.moveTo(0, -10); c.lineTo(8, 0); c.lineTo(0, 10); c.lineTo(-8, 0); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.moveTo(0, -10); c.lineTo(3, 0); c.lineTo(0, 10); c.lineTo(-2, 0); c.closePath(); c.fill();
  } else if (kind === 'shard') {
    c.fillStyle = '#e8eeff'; c.beginPath(); c.arc(0, 0, 10, -1.9, 1.9); c.arc(5, 0, 8.4, 1.4, -1.4, true); c.closePath(); c.fill();
  } else if (kind === 'slot') {
    c.strokeStyle = '#ffd98a'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 7.5, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(-3, 7); c.lineTo(-6, 13); c.moveTo(3, 7); c.lineTo(6, 13); c.stroke();
  } else if (kind === 'chart') {
    c.fillStyle = '#f1e2b8'; rrect(c, -9, -7, 18, 14, 2); c.fill();
    c.strokeStyle = '#8a6a48'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-5, 2); c.lineTo(-1, -3); c.lineTo(3, 1); c.lineTo(6, -2); c.stroke();
    c.fillStyle = '#c9b88a'; c.fillRect(-10, -8, 3, 16); c.fillRect(7, -8, 3, 16);
  } else { // relic
    c.fillStyle = '#ffd98a'; c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, r = i % 2 ? 5 : 10; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill();
    c.fillStyle = '#fff7dc'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
  }
  c.restore();
}
class Item extends Entity {
  constructor(x, y, spec, uid) {
    super(x - 12, y - 30, 24, 28);
    this.type = 'item'; this.kind = spec.item; this.spec = spec; this.uid = uid; this.bx = x; this.by = y - 16; this.layer = 2;
    this.delay = spec.delay || 0;
  }
  touch() {
    if (this.dead || this.delay > 0) return;
    this.dead = true; setFlag('got:' + this.uid);
    const [title, desc] = giveItem(this.kind, this.spec);
    G.ui.toast(desc, title, 4200);
    Sound.play(this.kind === 'relic' || this.kind === 'vial' ? 'big' : 'pickup');
    const col = ITEM_COL[this.kind] || '#ffffff';
    burst(this.bx, this.by, 22, { color: [col, '#ffffff'], s0: 60, s1: 260, l0: 0.4, l1: 1.0 });
    ring(this.bx, this.by, col, 6, 220, 0.5);
    G.game.autosave();
  }
  update(dt) { this.t += dt; this.delay = Math.max(0, this.delay - dt); }
  draw(c) {
    const y = this.by + Math.sin(G.now * 2.2 + this.bx) * 4, col = ITEM_COL[this.kind] || '#ffffff';
    c.save(); c.translate(this.bx, y); c.rotate(G.now * 0.6);
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(col, 0.35); c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); c.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); c.stroke(); }
    c.restore();
    drawGlow(c, this.bx, y, 26, col, 0.6);
    drawItemIcon(c, this.kind, this.bx, y, 1);
    addLight(this.bx, y, 90, col, 0.3, 0.8);
  }
}
register('item', (room, spec, x, y, info) => (flag('got:' + info.uid) ? null : new Item(x, y, spec, info.uid)));
export function spawnItem(room, x, y, spec, uid) { return flag('got:' + uid) ? null : room.add(new Item(x, y, spec, uid)); }

// ---------------------------------------------------------------- ability shrine
const AB_COL = { dash: '#8fd8ff', shot: '#ffe08a', grip: '#8fffb0', djump: '#d0b8ff', slam: '#ffa06a', eclipse: '#c9c2ff' };
class Shrine extends Entity {
  constructor(x, y, spec) {
    super(x - 22, y - 74, 44, 74);
    this.type = 'shrine'; this.ability = spec.ability; this.bx = x; this.by = y; this.layer = 0; this.reach = 48;
  }
  get taken() { return has(this.ability); }
  get prompt() { return this.taken ? null : 'Take the light'; }
  interact() { if (!this.taken) G.game.giveAbility(this.ability, this); }
  draw(c) {
    const x = this.bx, y = this.by, col = AB_COL[this.ability] || '#ffffff', tk = this.taken;
    c.fillStyle = '#141c2e';
    c.beginPath(); c.moveTo(x - 24, y); c.lineTo(x - 18, y - 12); c.lineTo(x + 18, y - 12); c.lineTo(x + 24, y); c.closePath(); c.fill();
    c.strokeStyle = '#222c44'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 16, y - 12); c.quadraticCurveTo(x - 24, y - 60, x, y - 72); c.quadraticCurveTo(x + 24, y - 60, x + 16, y - 12); c.stroke();
    c.strokeStyle = rgba(col, tk ? 0.15 : 0.6); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x - 16, y - 12); c.quadraticCurveTo(x - 24, y - 60, x, y - 72); c.quadraticCurveTo(x + 24, y - 60, x + 16, y - 12); c.stroke();
    if (tk) return;
    const fy = y - 40 + Math.sin(G.now * 2) * 4, pul = 1 + Math.sin(G.now * 4) * 0.12;
    drawGlow(c, x, fy, 34 * pul, col, 0.9);
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + G.now, r = (i % 2 ? 4 : 10) * pul; c.lineTo(x + Math.cos(a) * r, fy + Math.sin(a) * r); }
    c.closePath(); c.fill();
    addLight(x, fy, 170, col, 0.4, 1);
    if (Math.random() < 0.2) spawnP({ x: x + rand(-18, 18), y: y - 14, vy: -rand(20, 60), life: rand(0.8, 1.5), size: 1.8, color: col, wob: 40 });
  }
}
register('shrine', (room, spec, x, y) => new Shrine(x, y, spec));

// ---------------------------------------------------------------- hints + tablets
class Hint extends Entity {
  constructor(x, y, spec) { super(x - 8, y - 8, 16, 8); this.type = 'hint'; this.id = spec.id; this.r = spec.r || 150; this.needs = spec.unless; this.bx = x; this.by = y; }
  update() {
    const p = G.player; if (!p) return;
    if (this.needs && has(this.needs)) return;
    if (Math.abs(p.cx - this.bx) < this.r && Math.abs(p.cy - this.by) < 130) G.hint = HINTS[this.id];
  }
  draw(c) { // a small glowing waymark so players learn where hints live
    const x = this.bx, y = this.by;
    c.fillStyle = '#18233a'; c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x - 5, y - 16); c.lineTo(x + 5, y - 16); c.lineTo(x + 7, y); c.closePath(); c.fill();
    c.fillStyle = rgba('#8fd8ff', 0.6 + Math.sin(G.now * 3) * 0.3); c.fillRect(x - 2, y - 12, 4, 2); c.fillRect(x - 1, y - 8, 2, 4);
    addLight(x, y - 10, 46, '#8fd8ff', 0.2, 0.4);
  }
}
register('hint', (room, spec, x, y) => new Hint(x, y, spec));

class Tablet extends Entity {
  constructor(x, y, spec) { super(x - 16, y - 44, 32, 44); this.type = 'tablet'; this.id = spec.id; this.bx = x; this.by = y; this.prompt = 'Read'; this.reach = 40; this.layer = 0; }
  interact() {
    const tb = TABLETS[this.id]; if (!tb) return;
    G.save.lore[this.id] = 1;
    G.ui.dialog(tb.title, tb.text);
  }
  draw(c) {
    const x = this.bx, y = this.by, read = G.save && G.save.lore[this.id];
    c.fillStyle = '#18233a';
    c.beginPath(); c.moveTo(x - 15, y); c.lineTo(x - 13, y - 34); c.quadraticCurveTo(x, y - 48, x + 13, y - 34); c.lineTo(x + 15, y); c.closePath(); c.fill();
    c.strokeStyle = '#2b3a5a'; c.lineWidth = 2; c.stroke();
    const a = read ? 0.35 : 0.65 + Math.sin(G.now * 2.4) * 0.25;
    c.fillStyle = rgba('#b8c8ff', a);
    for (let i = 0; i < 4; i++) c.fillRect(x - 8 + (i % 2) * 2, y - 32 + i * 7, 14 - (i % 3) * 4, 2);
    addLight(x, y - 22, 60, '#b8c8ff', 0.2, 0.45);
  }
}
register('tablet', (room, spec, x, y) => new Tablet(x, y, spec));

// ---------------------------------------------------------------- gates, levers, switches
class Gate extends Entity {
  constructor(x, y, spec) {
    const th = spec.h || 3, tw = spec.w || 1;
    super(x - T / 2, y - th * T, tw * T, th * T);
    this.type = 'gate'; this.spec = spec; this.horizontal = tw > th; this.layer = 0;
    this.want = this.shouldOpen(); this.open = this.want ? 1 : 0; this.solid = !this.want;
  }
  shouldOpen() {
    if (this.spec.boss) return !G.bossLock;
    const o = flag(this.spec.flag);
    return this.spec.inv ? !o : o;
  }
  update(dt) {
    const w = this.shouldOpen();
    if (w !== this.want) { this.want = w; Sound.play('gate'); shake(4, 0.3); }
    this.open = approach(this.open, w ? 1 : 0, dt * 2.2);
    const p = G.player;
    if (this.open < 0.8) { if (!this.solid && !(p && overlap(p, this))) this.solid = true; } else this.solid = false;
  }
  draw(c) {
    const k = 1 - this.open; if (k <= 0.02) return;
    const A = AREAS[this.room.area];
    c.save();
    c.beginPath(); c.rect(this.x, this.y, this.w, this.h); c.clip();
    if (this.horizontal) c.translate(-this.w * this.open, 0); else c.translate(0, -this.h * this.open);
    c.fillStyle = '#10182a'; c.fillRect(this.x + 3, this.y, this.w - 6, this.h);
    c.strokeStyle = rgba(A.rim, 0.75); c.lineWidth = 2;
    c.strokeRect(this.x + 4, this.y + 1, this.w - 8, this.h - 2);
    c.fillStyle = rgba(this.spec.boss ? HAZ : A.rim, 0.5 + Math.sin(G.now * 3) * 0.2);
    if (this.horizontal) for (let x = this.x + 16; x < this.x + this.w; x += 32) c.fillRect(x - 3, this.y + 13, 6, 6);
    else for (let y = this.y + 16; y < this.y + this.h; y += 32) { c.beginPath(); c.moveTo(this.cx, y - 6); c.lineTo(this.cx + 5, y); c.lineTo(this.cx, y + 6); c.lineTo(this.cx - 5, y); c.closePath(); c.fill(); }
    c.restore();
    addLight(this.cx, this.cy, 70, this.spec.boss ? HAZ : A.rim, 0.14 * k, 0.3 * k);
  }
}
register('gate', (room, spec, x, y) => new Gate(x, y, spec));

class Lever extends Entity {
  constructor(x, y, spec) { super(x - 12, y - 30, 24, 30); this.type = 'lever'; this.spec = spec; this.bx = x; this.by = y; this.ang = flag(spec.flag) ? 0.7 : -0.7; }
  onSlash() {
    if (flag(this.spec.flag)) return true;
    setFlag(this.spec.flag);
    Sound.play('lever'); shake(3, 0.2);
    burst(this.bx, this.by - 20, 8, { color: '#ffe08a', shape: 'spark', s0: 80, s1: 220 });
    if (this.spec.msg !== '') G.ui.toast(this.spec.msg || 'Somewhere, a way has opened.');
    G.game.autosave();
    return true;
  }
  update(dt) { this.ang = approach(this.ang, flag(this.spec.flag) ? 0.7 : -0.7, dt * 8); }
  draw(c) {
    const x = this.bx, y = this.by, on = flag(this.spec.flag);
    c.fillStyle = '#1b2438'; rrect(c, x - 12, y - 8, 24, 8, 3); c.fill();
    c.strokeStyle = '#3b4a6a'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + Math.sin(this.ang) * 22, y - 6 - Math.cos(this.ang) * 22); c.stroke();
    const kx = x + Math.sin(this.ang) * 24, ky = y - 6 - Math.cos(this.ang) * 24, col = on ? '#8fffb0' : '#ffe08a';
    c.fillStyle = col; c.beginPath(); c.arc(kx, ky, 4.5, 0, TAU); c.fill();
    addLight(kx, ky, 54, col, 0.3, 0.5);
  }
}
register('lever', (room, spec, x, y) => new Lever(x, y, spec));

class Crystal extends Entity { // a switch only light can wake (strike it or shoot it)
  constructor(x, y, spec) { super(x - 12, y - 30, 24, 28); this.type = 'crystal'; this.spec = spec; this.bx = x; this.by = y - 16; }
  hitIt() {
    if (flag(this.spec.flag)) return true;
    setFlag(this.spec.flag);
    Sound.play('big'); shake(4, 0.3);
    burst(this.bx, this.by, 20, { color: ['#8fffe0', '#ffffff'], s0: 80, s1: 260 });
    ring(this.bx, this.by, '#8fffe0', 6, 240, 0.5);
    G.ui.toast(this.spec.msg || 'The crystal wakes. A gate grinds open.');
    G.game.autosave();
    return true;
  }
  onSlash() { return this.spec.shotOnly ? false : this.hitIt(); }
  onShot() { return this.hitIt(); }
  draw(c) {
    const on = flag(this.spec.flag), x = this.bx, y = this.by + Math.sin(G.now * 2 + x) * 2, col = on ? '#8fffe0' : '#8f7ad8';
    c.fillStyle = col;
    c.beginPath(); c.moveTo(x, y - 13); c.lineTo(x + 9, y); c.lineTo(x, y + 13); c.lineTo(x - 9, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath(); c.moveTo(x, y - 13); c.lineTo(x + 3, y); c.lineTo(x, y + 13); c.lineTo(x - 2, y); c.closePath(); c.fill();
    addLight(x, y, on ? 110 : 60, col, on ? 0.4 : 0.22, on ? 0.9 : 0.4);
  }
}
register('crystal', (room, spec, x, y) => new Crystal(x, y, spec));

// ---------------------------------------------------------------- projectiles
export class Shot extends Entity { // hostile
  constructor(x, y, vx, vy, o = {}) {
    super(x - 5, y - 5, 10, 10);
    this.type = 'shot'; this.vx = vx; this.vy = vy; this.layer = 2;
    this.grav = o.grav || 0; this.dmg = o.dmg || 1; this.color = o.color || '#ffb070'; this.life = o.life || 4.5; this.through = !!o.through;
    this.trail = 0;
  }
  pop() {
    if (this.dead) return;
    this.dead = true;
    burst(this.cx, this.cy, 7, { color: this.color, s0: 40, s1: 160, l0: 0.2, l1: 0.45 });
  }
  update(dt) {
    this.t += dt;
    this.vy += this.grav * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (!this.through && solidAt(this.room, this.cx, this.cy)) this.pop();
    if (this.t > this.life || this.x < -80 || this.y < -200 || this.x > this.room.pxW + 80 || this.y > this.room.pxH + 80) this.dead = true;
    this.trail -= dt;
    if (this.trail <= 0) { this.trail = 0.035; spawnP({ x: this.cx, y: this.cy, life: 0.25, size: 2.4, color: this.color }); }
  }
  touch(p) { if (p.hurt(this.dmg, this.cx - this.vx * 0.05)) this.pop(); }
  onSlash() { this.pop(); Sound.play('clang'); return true; }
  draw(c) {
    drawGlow(c, this.cx, this.cy, 16, this.color, 0.9);
    c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(this.cx, this.cy, 3.6, 0, TAU); c.fill();
    addLight(this.cx, this.cy, 50, this.color, 0.2, 0.5);
  }
}

export class StarShot extends Entity { // the player's Starshot spell
  constructor(x, y, dir, dmg) {
    super(x - 10, y - 7, 20, 14);
    this.type = 'starshot'; this.dir = dir; this.vx = dir * 660; this.dmg = dmg; this.layer = 2; this.life = 1.4;
  }
  pop() {
    if (this.dead) return;
    this.dead = true;
    Sound.play('spellHit');
    burst(this.cx, this.cy, 12, { color: ['#ffe08a', '#ffffff'], s0: 60, s1: 240, l0: 0.2, l1: 0.5 });
    ring(this.cx, this.cy, '#ffe08a', 4, 110, 0.25);
  }
  update(dt) {
    this.t += dt;
    this.x += this.vx * dt;
    const fx = this.dir > 0 ? this.x + this.w : this.x;
    const tt = this.room.tile(Math.floor(fx / T), Math.floor(this.cy / T));
    if (tt === TILE.SOLID || tt === TILE.BREAK || tt === TILE.SLAM) { this.pop(); return; }
    if (this.t > this.life || this.x < -40 || this.x > this.room.pxW + 40) { this.dead = true; return; }
    for (const e of this.room.entities) {
      if (e === this || e.dead || !overlap(this, e)) continue;
      if (e.onShot) { if (e.onShot(this)) { this.pop(); return; } }
      else if (e.isEnemy) { if (e.hurt(this.dmg, this.dir, 'shot')) { this.pop(); return; } }
    }
    spawnP({ x: this.cx - this.dir * 8, y: this.cy + rand(-3, 3), life: 0.3, size: 3, color: '#ffe08a', vx: -this.dir * 40 });
  }
  draw(c) {
    drawGlow(c, this.cx, this.cy, 26, '#ffe08a', 1);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(this.cx + this.dir * 12, this.cy); c.lineTo(this.cx - this.dir * 6, this.cy - 5); c.lineTo(this.cx - this.dir * 14, this.cy); c.lineTo(this.cx - this.dir * 6, this.cy + 5); c.closePath(); c.fill();
    addLight(this.cx, this.cy, 120, '#ffe08a', 0.3, 0.9);
  }
}

// ---------------------------------------------------------------- lost light (dropped motes)
export class LostLight extends Entity {
  constructor(x, y, amount) { super(x - 14, y - 14, 28, 28); this.type = 'lost'; this.amount = amount; this.layer = 2; }
  touch() {
    if (this.dead) return;
    this.dead = true;
    G.save.motes += this.amount; G.save.lost = null;
    Sound.play('big');
    burst(this.cx, this.cy, 26, { color: ['#ffe08a', '#ffffff'], s0: 80, s1: 300, l0: 0.4, l1: 1 });
    G.ui.toast(`You gather your lost light: ${this.amount} motes.`);
    G.game.autosave();
  }
  draw(c) {
    const y = this.cy + Math.sin(G.now * 2.5) * 5, pul = 1 + Math.sin(G.now * 5) * 0.15;
    drawGlow(c, this.cx, y, 34 * pul, '#ffe08a', 0.9);
    c.fillStyle = '#fff7d6'; c.beginPath(); c.arc(this.cx, y, 6 * pul, 0, TAU); c.fill();
    addLight(this.cx, y, 150, '#ffe08a', 0.35, 0.9);
    if (Math.random() < 0.3) spawnP({ x: this.cx + rand(-10, 10), y: y + rand(-10, 10), vy: -rand(10, 50), life: rand(0.5, 1.2), size: 1.6, color: '#ffe08a', wob: 40 });
  }
}

// ---------------------------------------------------------------- characters
function drawTallow(c, x, y, t) {
  c.fillStyle = '#d8ccae'; ell(c, x, y - 2, 26, 5); c.fill();
  c.fillStyle = '#efe3c4';
  c.beginPath(); c.moveTo(x - 17, y - 2); c.quadraticCurveTo(x - 20, y - 24, x - 14, y - 38); c.quadraticCurveTo(x, y - 44, x + 13, y - 37); c.quadraticCurveTo(x + 20, y - 22, x + 17, y - 2); c.closePath(); c.fill();
  c.fillStyle = '#fff6dc';
  for (const [dx, dy, h] of [[-13, -34, 14], [-6, -38, 9], [8, -37, 17], [14, -30, 8]]) { rrect(c, x + dx - 2.5, y + dy, 5, h, 2.5); c.fill(); }
  c.strokeStyle = '#4a3a2a'; c.lineWidth = 1.6; c.lineCap = 'round';
  const bl = Math.sin(t * 0.7) > 0.96 ? 0.2 : 1;
  if (bl < 1) { c.beginPath(); c.moveTo(x - 8.5, y - 22); c.lineTo(x - 3.5, y - 22); c.moveTo(x + 3.5, y - 22); c.lineTo(x + 8.5, y - 22); c.stroke(); }
  else { c.beginPath(); c.arc(x - 6, y - 23, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); c.beginPath(); c.arc(x + 6, y - 23, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  c.beginPath(); c.arc(x, y - 15, 3, 0.2, Math.PI - 0.2); c.stroke();
  c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 41); c.lineTo(x + 1, y - 47); c.stroke();
  drawFlame(c, x + 1, y - 46, 11, '#ffb347', t);
  addLight(x, y - 46, 150, '#ffcf7a', 0.3, 0.9);
}
function drawSconce(c, x, y, t) {
  const bob = Math.sin(t * 2.4) * 1.2;
  c.fillStyle = '#5a4020'; c.fillRect(x - 12, y - 6, 6, 6); c.fillRect(x + 5, y - 6, 6, 6);
  c.fillStyle = '#6a5a3a'; rrect(c, x - 24, y - 44 + bob, 14, 30, 4); c.fill(); // pack
  c.fillStyle = '#f1e2b8'; c.fillRect(x - 26, y - 50 + bob, 4, 14); c.fillRect(x - 20, y - 53 + bob, 4, 14);
  c.fillStyle = '#c8963c'; ell(c, x, y - 22 + bob, 17, 17); c.fill();
  c.fillStyle = '#e8b85a'; ell(c, x - 4, y - 28 + bob, 8, 6, -0.4); c.fill();
  c.fillStyle = '#c8963c';
  c.beginPath(); c.moveTo(x + 12, y - 26 + bob); c.quadraticCurveTo(x + 28, y - 28 + bob, x + 30, y - 38 + bob); c.lineTo(x + 25, y - 38 + bob); c.quadraticCurveTo(x + 22, y - 30 + bob, x + 12, y - 18 + bob); c.closePath(); c.fill();
  c.fillStyle = '#8a6020'; rrect(c, x - 9, y - 42 + bob, 18, 6, 2); c.fill();
  c.fillStyle = '#2a1a0a'; ell(c, x - 3, y - 24 + bob, 2.2, 3); c.fill(); ell(c, x + 7, y - 24 + bob, 2.2, 3); c.fill();
  c.strokeStyle = '#2a1a0a'; c.lineWidth = 1.5; c.beginPath(); c.arc(x + 2, y - 17 + bob, 4, 0.1, Math.PI - 0.1); c.stroke();
  c.strokeStyle = '#ffe9a8'; c.lineWidth = 1.2; c.beginPath(); c.arc(x + 7, y - 24 + bob, 4.5, 0, TAU); c.stroke();
  drawFlame(c, x + 27.5, y - 38 + bob, 10, '#ffb347', t + 2);
  addLight(x + 27, y - 42, 140, '#ffcf7a', 0.3, 0.9);
}
function drawVesper(c, x, y, t) {
  const bob = Math.sin(t * 1.6) * 2;
  c.fillStyle = '#161d33';
  c.beginPath(); c.moveTo(x - 13, y); c.quadraticCurveTo(x - 15, y - 34, x - 7, y - 52 + bob); c.quadraticCurveTo(x, y - 60 + bob, x + 7, y - 52 + bob); c.quadraticCurveTo(x + 15, y - 34, x + 13, y); c.closePath(); c.fill();
  c.strokeStyle = '#2c3a66'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = 'rgba(127,184,255,0.22)'; rrect(c, x - 7, y - 46 + bob, 14, 20, 6); c.fill();
  drawFlame(c, x, y - 29 + bob, 12, '#7fb8ff', t + 5, '#eaf4ff');
  c.fillStyle = '#eaf4ff'; ell(c, x - 3, y - 39 + bob, 1.4, 2); c.fill(); ell(c, x + 3, y - 39 + bob, 1.4, 2); c.fill();
  addLight(x, y - 34, 130, '#7fb8ff', 0.3, 0.85);
}
const NPC_DRAW = { tallow: drawTallow, sconce: drawSconce, vesper: drawVesper };
class Npc extends Entity {
  constructor(x, y, spec) {
    super(x - 20, y - 56, 40, 56);
    this.type = 'npc'; this.id = spec.id; this.bx = x; this.by = y; this.prompt = NPCS[spec.id].shop ? 'Trade' : 'Talk'; this.reach = 52; this.layer = 0;
  }
  interact() { G.game.talk(this.id); }
  draw(c) { (NPC_DRAW[this.id] || drawVesper)(c, this.bx, this.by, G.now); }
}
register('npc', (room, spec, x, y) => new Npc(x, y, spec));

// ---------------------------------------------------------------- props (scenery)
class Prop extends Entity {
  constructor(x, y, spec) { super(x - 40, y - 100, 80, 100); this.type = 'prop'; this.kind = spec.kind; this.bx = x; this.by = y; this.layer = -1; this.spec = spec; }
  draw(c) {
    const x = this.bx, y = this.by, t = G.now;
    if (this.kind === 'hut') {
      const w = this.spec.w || 46, h = this.spec.h || 92;
      c.fillStyle = '#131a30'; ell(c, x, y - h * 0.45, w, h * 0.5); c.fill();
      c.fillRect(x - w * 0.9, y - h * 0.3, w * 1.8, h * 0.3);
      c.fillStyle = '#0d1326'; rrect(c, x - w * 0.5, y - h - 6, w, 14, 5); c.fill();
      c.strokeStyle = '#0d1326'; c.lineWidth = 4; c.beginPath(); c.arc(x, y - h - 12, 9, Math.PI, 0); c.stroke();
      c.strokeStyle = '#27345a'; c.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x + i * w * 0.5, y - h * 0.9); c.quadraticCurveTo(x + i * w * 0.75, y - h * 0.45, x + i * w * 0.5, y - 4); c.stroke(); }
      c.fillStyle = '#ffcf7a'; ell(c, x - 4, y - h * 0.55, 10, 12); c.fill();
      c.fillStyle = '#0d1326'; c.fillRect(x - 5, y - h * 0.55 - 12, 2, 24); c.fillRect(x - 14, y - h * 0.55 - 1, 20, 2);
      c.fillStyle = '#0a0f1e'; rrect(c, x + 12, y - 30, 16, 30, [8, 8, 0, 0]); c.fill();
      addLight(x - 4, y - h * 0.55, 120, '#ffcf7a', 0.26, 0.75);
    } else if (this.kind === 'post') {
      c.strokeStyle = '#1b2233'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 46); c.stroke();
      c.fillStyle = 'rgba(255,207,122,0.35)'; rrect(c, x - 6, y - 60, 12, 16, 4); c.fill();
      drawFlame(c, x, y - 47, 8, '#ffb347', t + x);
      addLight(x, y - 52, 120, '#ffcf7a', 0.28, 0.8);
    } else if (this.kind === 'stall') {
      c.strokeStyle = '#2a2238'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x - 44, y); c.lineTo(x - 44, y - 70); c.moveTo(x + 44, y); c.lineTo(x + 44, y - 70); c.stroke();
      for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#7a3a4a' : '#d8c8a0'; c.beginPath(); c.moveTo(x - 50 + i * 16.7, y - 74); c.lineTo(x - 50 + (i + 1) * 16.7, y - 74); c.lineTo(x - 50 + (i + 1) * 16.7, y - 58); c.quadraticCurveTo(x - 50 + (i + 0.5) * 16.7, y - 50, x - 50 + i * 16.7, y - 58); c.closePath(); c.fill(); }
      c.fillStyle = '#2a2238'; c.fillRect(x - 46, y - 22, 40, 22);
      c.fillStyle = '#3a304a'; c.fillRect(x - 48, y - 25, 44, 4);
    } else if (this.kind === 'tree') { // the lantern-tree of Candlestead
      c.fillStyle = '#0f162a';
      c.beginPath(); c.moveTo(x - 26, y); c.bezierCurveTo(x - 12, y - 60, x - 22, y - 120, x - 8, y - 190); c.lineTo(x + 10, y - 190); c.bezierCurveTo(x + 22, y - 120, x + 12, y - 60, x + 28, y); c.closePath(); c.fill();
      c.strokeStyle = '#0f162a'; c.lineCap = 'round';
      const br = [[-70, -150, -120, -210], [80, -140, 130, -200], [-30, -200, -60, -270], [40, -200, 70, -280], [0, -190, 4, -300]];
      for (const [mx, my, ex, ey] of br) { c.lineWidth = 9; c.beginPath(); c.moveTo(x, y - 170); c.quadraticCurveTo(x + mx, y + my, x + ex, y + ey); c.stroke(); }
      const fruit = [[-120, -196], [130, -186], [-60, -256], [70, -266], [4, -286], [-92, -160], [100, -150], [-34, -214], [38, -226]];
      fruit.forEach(([fx, fy], i) => {
        const sw = Math.sin(t * 1.2 + i) * 2;
        c.strokeStyle = '#0f162a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + fx, y + fy); c.lineTo(x + fx + sw, y + fy + 14); c.stroke();
        c.fillStyle = '#ffcf7a'; ell(c, x + fx + sw, y + fy + 19, 5, 6.5); c.fill();
        addLight(x + fx + sw, y + fy + 19, 70, '#ffcf7a', 0.24, 0.6);
      });
    } else if (this.kind === 'sign') {
      c.fillStyle = '#2a2238'; c.fillRect(x - 2, y - 30, 4, 30);
      c.fillStyle = '#3a304a'; rrect(c, x - 18, y - 42, 36, 16, 3); c.fill();
      c.fillStyle = rgba('#ffcf7a', 0.8);
      const d = this.spec.dir || 1;
      c.beginPath(); c.moveTo(x + d * 10, y - 34); c.lineTo(x + d * 2, y - 39); c.lineTo(x + d * 2, y - 29); c.closePath(); c.fill();
      c.fillRect(x - d * 10, y - 35.5, d * 12, 3);
    }
  }
}
register('prop', (room, spec, x, y) => new Prop(x, y, spec));
