// Creatures of the Sunken Stacks, and their keeper: the Curator.
import { G } from './state.js';
import { T, TILE } from './config.js';
import { register } from './world.js';
import { solidAt, standableAt } from './physics.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell, rrect } from './gfx.js';
import { Sound } from './audio.js';
import { rand, approach, sign, clamp, TAU, rgba, pick, lerp } from './util.js';
import { Shot } from './entities.js';
import { Enemy, regEnemy } from './enemies.js';
import { Boss, BOSSES, Shockwave } from './bosses.js';
import { HAZ } from './terrain.js';

const INK = '#b9a6ff';

// ---------------------------------------------------------------- Inkblot (splits when it dies)
class Inkblot extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 30, 18, { kind: 'inkblot', hp: 30, motes: 3, uid, eye: INK, kb: 0.8 });
    this.facing = Math.random() < 0.5 ? -1 : 1; this.wob = Math.random() * 6;
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    this.patrol(46);
    this.wob += dt * 6;
    this.physics(dt);
    if (this.hitL) this.facing = 1; else if (this.hitR) this.facing = -1;
    if (Math.random() < 0.04) spawnP({ x: this.cx + rand(-10, 10), y: this.y + this.h - 2, shape: 'smoke', color: '#141033', life: 0.7, size: 3 });
  }
  die() {
    if (this.dead) return;
    const room = this.room, x = this.cx, y = this.y + this.h;
    super.die();
    for (const d of [-1, 1]) { const k = new Inkling(x + d * 8, y - 2, null); k.vx = d * 150; k.vy = -300; k.wait = 0.5; room.add(k); }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k), s = Math.sin(this.wob);
    c.save(); c.translate(x, y); c.scale(this.facing * (1 + s * 0.06), 1 - s * 0.06);
    c.fillStyle = C('#1a1540');
    c.beginPath(); c.moveTo(-17, 0); c.quadraticCurveTo(-18, -14, -6, -18); c.quadraticCurveTo(4, -23, 12, -15); c.quadraticCurveTo(19, -8, 16, 0); c.closePath(); c.fill();
    c.strokeStyle = C('#4a3fa0'); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-14, -6); c.quadraticCurveTo(-12, -15, -3, -17); c.stroke();
    c.fillStyle = C(INK); ell(c, 6, -10, 3, 3.4); c.fill(); ell(c, 12, -8, 2, 2.4); c.fill();
    c.fillStyle = '#0c0a1e'; ell(c, 7, -10, 1.2, 1.8); c.fill();
    c.restore();
    addLight(x + this.facing * 7, y - 10, 48, INK, 0.2, 0.4);
  }
}
regEnemy('inkblot', Inkblot);

class Inkling extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 14, 12, { kind: 'inkling', hp: 10, motes: 1, uid, eye: INK });
    this.wait = rand(0.2, 0.6);
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player;
    if (this.onGround) {
      this.vx = approach(this.vx, 0, 1400 * dt);
      this.wait -= dt;
      if (this.wait <= 0) {
        let dir = sign(p.cx - this.cx) || 1;
        if (!standableAt(this.room, this.cx + dir * 60, this.y + this.h + 6) && !standableAt(this.room, this.cx + dir * 60, this.y + this.h + 38)) dir = -dir;
        this.facing = dir; this.vx = dir * 170; this.vy = -340; this.wait = rand(0.35, 0.8); this.onGround = false;
      }
    }
    this.physics(dt);
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k);
    const st = this.onGround ? 0 : clamp(-this.vy / 900, -0.2, 0.3);
    c.fillStyle = C('#1a1540');
    ell(c, x, y - 6 * (1 + st), 8 * (1 - st * 0.5), 7 * (1 + st)); c.fill();
    c.fillStyle = C(INK); ell(c, x + this.facing * 3, y - 7, 2.2, 2.6); c.fill();
    addLight(x, y - 6, 34, INK, 0.16, 0.3);
  }
}

// ---------------------------------------------------------------- Quill (aims, then darts in a straight line)
class Quill extends Enemy {
  constructor(x, y, uid) {
    super(x, y - 8, 24, 14, { kind: 'quill', hp: 15, motes: 4, uid, eye: '#e3c6ff', grav: false });
    this.avoidHazard = false;
    this.state = 'hover'; this.cd = rand(0.8, 1.8); this.ang = 0; this.side = Math.random() < 0.5 ? -1 : 1;
  }
  update(dt) {
    if (this.baseUpdate(dt)) { if (this.state !== 'hover') this.setState('hover'); return; }
    const p = G.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (this.state === 'hover') {
      const near = Math.abs(dx) < 420 && Math.abs(dy) < 300;
      const tx = near ? p.cx + this.side * 150 : this.homeX + Math.sin(this.t * 0.7) * 40;
      const ty = near ? p.cy - 100 + Math.sin(this.t * 2) * 10 : this.homeY + Math.sin(this.t * 1.6) * 8;
      this.vx = clamp((tx - this.cx) * 2, -130, 130); this.vy = clamp((ty - this.cy) * 2, -130, 130);
      this.ang = lerpAng(this.ang, Math.atan2(dy, dx), dt * 6);
      this.cd -= dt;
      if (this.cd <= 0 && this.canSee(400)) { this.setState('aim'); Sound.play('warn'); }
    } else if (this.state === 'aim') {
      this.vx = approach(this.vx, 0, 400 * dt); this.vy = approach(this.vy, 0, 400 * dt);
      if (this.st < 0.38) this.ang = lerpAng(this.ang, Math.atan2(dy, dx), dt * 10);
      if (this.st > 0.58) { this.setState('dart'); Sound.play('dash'); }
    } else if (this.state === 'dart') {
      this.vx = Math.cos(this.ang) * 620; this.vy = Math.sin(this.ang) * 620;
      spawnP({ x: this.cx, y: this.cy, life: 0.22, size: 2.4, color: '#e3c6ff' });
      if (this.st > 0.03 && (this.hitL || this.hitR || this.hitCeil || this.onGround)) { this.setState('stuck'); Sound.play('clang'); burst(this.cx, this.cy, 6, { color: '#e3c6ff', shape: 'spark', s0: 60, s1: 200 }); }
      else if (this.st > 0.75) { this.setState('hover'); this.cd = 1.3; this.side *= -1; }
    } else { // stuck in a wall for a moment
      this.vx = 0; this.vy = 0;
      if (this.st > 1.0) { this.setState('hover'); this.cd = 1.0; this.side *= -1; }
    }
    this.physics(dt);
  }
  draw(c) {
    const x = this.cx, y = this.cy, C = (k) => this.col(k);
    if (this.state === 'aim') {
      c.strokeStyle = rgba(HAZ, 0.25 + 0.5 * (this.st / 0.58)); c.lineWidth = 1.2; c.setLineDash([5, 6]);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(this.ang) * 380, y + Math.sin(this.ang) * 380); c.stroke(); c.setLineDash([]);
    }
    c.save(); c.translate(x + (this.state === 'stuck' ? rand(-1, 1) * Math.max(0, 0.4 - this.st) * 6 : 0), y); c.rotate(this.ang);
    c.fillStyle = C('#d9d2ee');
    c.beginPath(); c.moveTo(-18, 0); c.quadraticCurveTo(-8, -9, 6, -3); c.lineTo(6, 3); c.quadraticCurveTo(-8, 9, -18, 0); c.closePath(); c.fill();
    c.strokeStyle = C('#8f7ad8'); c.lineWidth = 1.2; c.beginPath(); c.moveTo(-16, 0); c.lineTo(8, 0); c.stroke();
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-10 + i * 5, 0); c.lineTo(-13 + i * 5, -5); c.moveTo(-10 + i * 5, 0); c.lineTo(-13 + i * 5, 5); c.stroke(); }
    c.fillStyle = C('#2a2250'); c.beginPath(); c.moveTo(6, -3); c.lineTo(17, 0); c.lineTo(6, 3); c.closePath(); c.fill();
    c.fillStyle = C(this.state === 'aim' || this.state === 'dart' ? '#ffffff' : '#e3c6ff'); ell(c, 15, 0, 1.8, 1.8); c.fill();
    c.restore();
    addLight(x, y, this.state === 'dart' ? 70 : 46, '#e3c6ff', 0.22, 0.4);
  }
}
function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * Math.min(1, t); }
regEnemy('quill', Quill);

// ---------------------------------------------------------------- Tomewing (a flying book that spits letters)
class Tome extends Enemy {
  constructor(x, y, uid) {
    super(x, y - 6, 34, 26, { kind: 'tome', hp: 40, motes: 7, uid, eye: '#9fb4ff', grav: false, kb: 0.5 });
    this.avoidHazard = false; this.cd = rand(1.0, 2.2); this.ph = Math.random() * 6;
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player, dx = p.cx - this.cx, dy = p.cy - this.cy;
    let tx = this.homeX + Math.sin(this.t * 0.6 + this.ph) * 50, ty = this.homeY + Math.sin(this.t * 1.3 + this.ph) * 12;
    if (Math.abs(dx) < 140 && Math.abs(dy) < 150) tx = clamp(this.cx - sign(dx) * 90, this.homeX - 150, this.homeX + 150);
    this.vx = clamp((tx - this.cx) * 1.8, -110, 110); this.vy = clamp((ty - this.cy) * 1.8, -90, 90);
    this.facing = sign(dx) || 1;
    if (this.state === 'idle') {
      this.cd -= dt;
      if (this.cd <= 0 && this.canSee(440)) { this.setState('open'); Sound.play('warn'); }
    } else if (this.st > 0.55) {
      const base = Math.atan2(dy, dx);
      for (const off of [-0.3, 0, 0.3]) this.room.add(new Shot(this.cx, this.cy, Math.cos(base + off) * 235, Math.sin(base + off) * 235, { color: '#9fb4ff' }));
      Sound.play('shoot');
      this.setState('idle'); this.cd = 2.7;
    }
    this.physics(dt);
  }
  draw(c) {
    const x = this.cx, y = this.cy, C = (k) => this.col(k);
    const open = this.state === 'open' ? 0.55 + this.st * 0.6 : 0.35 + Math.sin(this.t * 7) * 0.2;
    c.save(); c.translate(x, y);
    for (const s of [-1, 1]) {
      c.save(); c.scale(s, 1); c.rotate(-open);
      c.fillStyle = C('#2a3a8a'); rrect(c, 0, -13, 19, 24, 2); c.fill();
      c.fillStyle = C('#e8e4f6'); c.fillRect(1.5, -11, 15, 20);
      c.fillStyle = C('#7f8fc8'); for (let i = 0; i < 4; i++) c.fillRect(3.5, -8 + i * 4.4, 10 - (i % 2) * 3, 1.3);
      c.restore();
    }
    c.fillStyle = C('#1a2458'); c.fillRect(-2, -13, 4, 24);
    c.fillStyle = C(this.state === 'open' ? '#ffffff' : '#9fb4ff'); ell(c, 0, -2, 3, 3.6); c.fill();
    c.restore();
    addLight(x, y, this.state === 'open' ? 96 : 60, '#9fb4ff', this.state === 'open' ? 0.36 : 0.22, 0.5);
  }
}
regEnemy('tome', Tome);

// ---------------------------------------------------------------- Eel (leaps out of ink)
class Eel extends Enemy {
  constructor(x, y, uid, spec, room) {
    super(x, y, 20, 30, { kind: 'eel', hp: 20, motes: 5, uid, eye: '#9fe8ff', grav: false, kb: 0.5 });
    this.avoidHazard = false;
    const ty = Math.floor((y - 4) / T);
    let x0 = Math.floor(x / T), x1 = x0;
    while (room.inside(x0 - 1, ty) && room.tiles[ty * room.w + x0 - 1] === TILE.LIQUID) x0--;
    while (room.inside(x1 + 1, ty) && room.tiles[ty * room.w + x1 + 1] === TILE.LIQUID) x1++;
    this.px0 = x0 * T + 14; this.px1 = (x1 + 1) * T - 14;
    this.surf = ty * T + 8; this.restY = this.surf + 6;
    this.y = this.restY; this.state = 'lurk'; this.cd = rand(0.4, 1.4); this.dir = Math.random() < 0.5 ? -1 : 1; this.dmg = 0;
  }
  hurt(dmg, dx, src) { if (this.state === 'lurk' || this.state === 'tel') return false; return super.hurt(dmg, dx, src); }
  update(dt) {
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    const p = G.player, dx = p.cx - this.cx;
    if (this.state === 'lurk') {
      this.dmg = 0;
      this.x += this.dir * 34 * dt;
      if (this.cx < this.px0) this.dir = 1; else if (this.cx > this.px1) this.dir = -1;
      this.y = this.restY;
      this.cd -= dt;
      const above = this.surf - (p.y + p.h);
      if (this.cd <= 0 && p.state !== 'dead' && Math.abs(dx) < 84 && above > -10 && above < 230) { this.setState('tel'); Sound.play('warn'); }
    } else if (this.state === 'tel') {
      if (Math.random() < 0.7) spawnP({ x: this.cx + rand(-8, 8), y: this.surf, vy: -rand(30, 90), life: 0.35, size: 2, color: '#9fe8ff' });
      if (this.st > 0.42) {
        this.setState('leap'); this.dmg = 1;
        this.vy = -800; this.vx = clamp(dx * 1.4, -130, 130);
        Sound.play('jump');
        burst(this.cx, this.surf, 10, { color: [HAZ, '#9fe8ff'], a0: Math.PI + 0.5, a1: TAU - 0.5, s0: 80, s1: 300, grav: 700, l0: 0.3, l1: 0.6 });
      }
    } else { // leap
      this.vy += 1700 * dt;
      this.x = clamp(this.x + this.vx * dt, this.px0 - 40, this.px1 + 20); this.y += this.vy * dt;
      if (this.vy > 0 && this.y >= this.restY) {
        this.y = this.restY; this.setState('lurk'); this.cd = 1.5; this.vx = 0; this.vy = 0;
        burst(this.cx, this.surf, 8, { color: [HAZ, '#9fe8ff'], a0: Math.PI + 0.5, a1: TAU - 0.5, s0: 60, s1: 220, grav: 700, l0: 0.3, l1: 0.5 });
      }
    }
  }
  draw(c) {
    const x = this.cx, C = (k) => this.col(k);
    if (this.state !== 'leap') { // only its lure shows above the ink
      const sh = this.state === 'tel' ? rand(-2, 2) : 0;
      c.strokeStyle = '#3a4a8a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + sh, this.surf + 4); c.quadraticCurveTo(x + 4 + sh, this.surf - 8, x + sh, this.surf - 12); c.stroke();
      c.fillStyle = '#9fe8ff'; ell(c, x + sh, this.surf - 13, 2.6, 2.6); c.fill();
      addLight(x, this.surf - 13, this.state === 'tel' ? 70 : 40, '#9fe8ff', 0.3, 0.4);
      return;
    }
    const ang = Math.atan2(this.vy, this.vx || 0.01) + Math.PI / 2;
    c.save(); c.translate(x, this.cy); c.rotate(ang);
    c.fillStyle = C('#22306e');
    c.beginPath(); c.moveTo(0, -17); c.bezierCurveTo(10, -12, 9, 6, 3, 17); c.lineTo(-3, 17); c.bezierCurveTo(-9, 6, -10, -12, 0, -17); c.fill();
    c.fillStyle = C('#6f8fdc'); c.beginPath(); c.moveTo(0, 14); c.lineTo(8, 24); c.lineTo(0, 20); c.lineTo(-8, 24); c.closePath(); c.fill();
    c.fillStyle = C('#e8f5ff'); c.beginPath(); c.moveTo(-5, -12); c.lineTo(0, -6); c.lineTo(5, -12); c.lineTo(3, -15); c.lineTo(-3, -15); c.closePath(); c.fill();
    c.fillStyle = C('#9fe8ff'); ell(c, -4, -7, 1.8, 1.8); c.fill(); ell(c, 4, -7, 1.8, 1.8); c.fill();
    c.restore();
    addLight(x, this.cy, 70, '#9fe8ff', 0.26, 0.5);
  }
}
register('eel', (room, spec, x, y, info) => (G.killed.has(info.uid) ? null : new Eel(x, y, info.uid, spec, room)));

// ---------------------------------------------------------------- Shelf Sentinel (shielded from the front)
class Sentinel extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 30, 46, { kind: 'sentinel', hp: 70, motes: 16, uid, eye: '#ffd98a', kb: 0.15 });
    this.state = 'walk'; this.turnT = 0; this.walk = 0; this.block = 0;
  }
  onSlash(p, atk) {
    const front = sign(p.cx - this.cx) === this.facing;
    const above = p.y + p.h < this.y + 12;
    if (front && !above && this.state !== 'dazed') {
      this.block = 0.2; Sound.play('clang');
      burst(this.cx + this.facing * 16, clamp(p.cy, this.y, this.y + this.h), 8, { color: ['#ffd98a', '#ffffff'], shape: 'spark', s0: 100, s1: 320, l0: 0.12, l1: 0.3 });
      return true;
    }
    return this.hurt(atk.dmg, atk.dx, 'blade');
  }
  hurt(dmg, dx, src) {
    if (src === 'shot') { const p = G.player; if (sign(p.cx - this.cx) === this.facing) { this.block = 0.2; Sound.play('clang'); return true; } }
    return super.hurt(dmg, dx, src);
  }
  update(dt) {
    if (this.block > 0) this.block -= dt;
    if (this.baseUpdate(dt)) return;
    const p = G.player, dx = p.cx - this.cx, want = sign(dx) || this.facing;
    this.dmg = 1;
    if (this.state === 'walk') {
      const sees = Math.abs(dx) < 380 && Math.abs(p.cy - this.cy) < 120 && p.state !== 'dead';
      if (sees) {
        if (want !== this.facing) { this.turnT += dt; this.vx = 0; if (this.turnT > 0.62) { this.facing = want; this.turnT = 0; } }
        else {
          this.turnT = 0;
          this.vx = this.edgeAhead() || this.wallAhead() ? 0 : this.facing * 62;
          this.walk += dt * 7;
          if (Math.abs(dx) < 78 && this.st > 0.8) this.setState('wind');
        }
      } else { this.turnT = 0; this.patrol(34); this.walk += dt * 4; }
    } else if (this.state === 'wind') {
      this.vx = -this.facing * 20;
      if (this.st > 0.34) { this.setState('bash'); Sound.play('dash'); }
    } else if (this.state === 'bash') {
      this.vx = this.edgeAhead() ? 0 : this.facing * 300;
      if (this.st > 0.26) this.setState('rest');
    } else { // rest
      this.vx = approach(this.vx, 0, 1200 * dt);
      if (this.st > 0.7) this.setState('walk');
    }
    this.physics(dt);
    if (this.state === 'walk' && !(Math.abs(dx) < 380)) { if (this.hitL) this.facing = 1; else if (this.hitR) this.facing = -1; }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k);
    const lean = this.state === 'wind' ? -0.12 : this.state === 'bash' ? 0.16 : 0;
    c.save(); c.translate(x, y); c.scale(this.facing, 1); c.rotate(lean);
    c.strokeStyle = C('#1a2040'); c.lineWidth = 6; c.lineCap = 'round';
    const a = Math.sin(this.walk) * 4;
    c.beginPath(); c.moveTo(-6, -14); c.lineTo(-6 + a, -1); c.moveTo(6, -14); c.lineTo(6 - a, -1); c.stroke();
    c.fillStyle = C('#27305e'); rrect(c, -12, -42, 24, 30, 6); c.fill();
    c.strokeStyle = C('#4a5aa0'); c.lineWidth = 1.5; rrect(c, -12, -42, 24, 30, 6); c.stroke();
    c.fillStyle = C('#1a2040'); rrect(c, -9, -52, 18, 13, 5); c.fill();
    c.fillStyle = C('#ffd98a'); c.fillRect(-2, -47, 9, 2.6);
    // the great book it carries as a shield
    const bx = 13 + (this.block > 0 ? 3 : 0);
    c.fillStyle = C('#5a3a2a'); rrect(c, bx - 4, -46, 9, 40, 2); c.fill();
    c.fillStyle = C('#e8dcc0'); c.fillRect(bx + 3, -44, 2.4, 36);
    c.fillStyle = C('#ffd98a'); c.fillRect(bx - 2, -30, 5, 7);
    c.restore();
    addLight(x + this.facing * 4, y - 46, 56, '#ffd98a', 0.2, 0.45);
  }
}
regEnemy('sentinel', Sentinel);

// ---------------------------------------------------------------- The Curator (boss)
class Curator extends Boss {
  constructor(x, y, spec) {
    super(x, y - 30, 44, 88, { kind: 'curator', id: 'curator', name: 'The Curator', hp: 560, motes: 220, eye: '#9fb4ff', spec, grav: false });
    this.avoidHazard = false; this.dropThrough = true;
    const a = spec.arena || [6, 54];
    this.aL = a[0] * T; this.aR = a[1] * T; this.groundY = y;
    this.hoverY = y - 30 - 88; this.alpha = 1; this.tx = this.x; this.ty = this.y;
    this.hits = 0; this.last = ''; this.waves = 0; this.summonCd = 0; this.idleT = 1; this.recT = 0.6; this.fan2 = false;
    this.facing = spec.wakeDir > 0 ? -1 : 1;
  }
  anchors() { const m = (this.aL + this.aR) / 2; return [this.aL + 150, m - 180, m + 180, this.aR - 150]; }
  blinkTo(x, y, next) { this.blinkX = x - this.w / 2; this.blinkY = y; this.next = next; this.setState('out'); Sound.play('dash'); this.hits = 0; }
  farAnchor() {
    const p = G.player, as = this.anchors().filter((a) => Math.abs(a - p.cx) > 170 && Math.abs(a - this.cx) > 60);
    return pick(as.length ? as : this.anchors());
  }
  onHurt() {
    this.hits++;
    if (this.hits >= 5 && (this.state === 'idle' || this.state === 'recover')) this.blinkTo(this.farAnchor(), this.hoverY, 'idle');
  }
  pickAttack() {
    const p2 = this.phase === 2;
    const opts = ['fan', 'fan', 'rain', 'dive', 'dive'];
    if (p2 && this.summonCd <= 0 && this.room.entities.filter((e) => e.kind === 'quill' && !e.dead).length < 2) opts.push('summon', 'summon');
    let a = pick(opts.filter((o) => o !== this.last));
    this.last = a;
    const p = G.player;
    this.facing = sign(p.cx - this.cx) || this.facing;
    if (a === 'fan') { this.fan2 = false; this.setState('fanTel'); Sound.play('warn'); }
    else if (a === 'rain') this.blinkTo((this.aL + this.aR) / 2, this.groundY - 300, 'rainTel');
    else if (a === 'dive') this.blinkTo(clamp(p.cx, this.aL + 40, this.aR - 40), this.groundY - 290, 'diveTel');
    else { this.setState('summon'); Sound.play('warn'); }
  }
  fireFan(extra) {
    const p = G.player, n = this.phase === 2 ? 7 : 5;
    const base = Math.atan2(p.cy - this.cy, p.cx - this.cx) + (extra ? 0.1 : 0);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.21;
      this.room.add(new Shot(this.cx, this.cy - 10, Math.cos(a) * 340, Math.sin(a) * 340, { color: '#e3c6ff' }));
    }
    Sound.play('shoot');
    burst(this.cx, this.cy - 10, 10, { color: '#e3c6ff', s0: 60, s1: 220 });
  }
  rainWave(k) {
    const room = this.room, off = (k % 2) * 56;
    for (let x = this.aL + 40 + off; x < this.aR - 20; x += 112) {
      room.add(new Shot(x, 3 * T + 8, 0, 40, { grav: 760, color: INK, life: 3 }));
      burst(x, 3 * T + 10, 3, { color: INK, s0: 20, s1: 70, l0: 0.2, l1: 0.4 });
    }
    Sound.play('drip');
  }
  update(dt) {
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.summonCd > 0) this.summonCd -= dt;
    const p = G.player, p2 = this.phase === 2, room = this.room;
    const dx = p.cx - this.cx;
    this.dmg = this.dmgBase;
    let free = true; // free-floating toward (tx, ty)
    switch (this.state) {
      case 'sleep': free = false; if (this.shouldWake()) this.startFight(); break;
      case 'intro': free = false; if (this.st > 1.7) { this.setState('idle'); this.idleT = 0.6; this.tx = this.x; this.ty = this.hoverY; } break;
      case 'idle':
        this.facing = sign(dx) || this.facing;
        this.ty = this.hoverY + Math.sin(this.t * 2) * 8;
        if (this.st > this.idleT) this.pickAttack();
        break;
      case 'out': // fading away
        free = false; this.alpha = Math.max(0, 1 - this.st / 0.28); this.inv = 0.1; this.dmg = 0;
        if (this.st > 0.3) { this.x = this.blinkX; this.y = this.blinkY; this.tx = this.x; this.ty = this.y; this.setState('in'); ring(this.cx, this.cy, INK, 10, 160, 0.3); }
        break;
      case 'in':
        free = false; this.alpha = Math.min(1, this.st / 0.28); this.inv = 0.1; this.dmg = 0;
        this.facing = sign(dx) || this.facing;
        if (this.st > 0.3) { this.alpha = 1; this.setState(this.next || 'idle'); if (this.state === 'idle') this.idleT = p2 ? rand(0.3, 0.6) : rand(0.6, 1.0); else Sound.play('warn'); }
        break;
      case 'fanTel':
        if (this.st > (p2 ? 0.42 : 0.55)) { this.fireFan(false); this.setState('fanRec'); }
        break;
      case 'fanRec':
        if (p2 && !this.fan2 && this.st > 0.4) { this.fan2 = true; this.fireFan(true); }
        if (this.st > (p2 ? 0.95 : 0.7)) { this.setState('idle'); this.idleT = p2 ? rand(0.25, 0.5) : rand(0.5, 0.9); }
        break;
      case 'rainTel':
        free = false;
        if (this.st > 0.6) { this.waves = 0; this.setState('rain'); }
        break;
      case 'rain': {
        free = false;
        const total = p2 ? 4 : 2, every = p2 ? 0.62 : 0.78;
        if (this.waves < total && this.st > this.waves * every) { this.rainWave(this.waves); this.waves++; }
        if (this.st > total * every + 0.5) this.blinkTo(this.farAnchor(), this.hoverY, 'idle');
        break;
      }
      case 'diveTel':
        free = false;
        this.x = approach(this.x, clamp(p.cx, this.aL + 40, this.aR - 40) - this.w / 2, 220 * dt);
        if (this.st > (p2 ? 0.3 : 0.42)) { this.setState('dive'); Sound.play('charge'); }
        break;
      case 'dive':
        free = false; this.dmg = 2;
        this.y += 1050 * dt;
        spawnP({ x: this.cx + rand(-14, 14), y: this.y, life: 0.3, size: 3, color: INK });
        if (this.y + this.h >= this.groundY) {
          this.y = this.groundY - this.h;
          Sound.play('thud'); shake(12, 0.4);
          burst(this.cx, this.groundY, 22, { color: [INK, HAZ, '#ffffff'], a0: Math.PI, a1: TAU, s0: 80, s1: 420, l0: 0.25, l1: 0.6 });
          room.add(new Shockwave(this.x + this.w + 4, this.groundY, 1, p2 ? 430 : 370));
          room.add(new Shockwave(this.x - 4, this.groundY, -1, p2 ? 430 : 370));
          this.setState('stuck');
        }
        break;
      case 'stuck':
        free = false;
        if (this.st > (p2 ? 0.75 : 1.05)) this.blinkTo(this.farAnchor(), this.hoverY, 'idle');
        break;
      case 'summon':
        if (this.st > 0.6) {
          for (const d of [-1, 1]) { const q = new Quill(this.cx + d * 60, this.cy - 20, null); q.cd = 1.2 + (d > 0 ? 0.5 : 0); q.motes = 0; room.add(q); ring(this.cx + d * 60, this.cy - 28, '#e3c6ff', 6, 90, 0.3); }
          Sound.play('spell'); this.summonCd = 14;
          this.setState('idle'); this.idleT = 0.6;
        }
        break;
      case 'roar2':
        free = false; this.inv = 0.2;
        if (Math.random() < 0.5) spawnP({ x: this.cx + rand(-20, 20), y: this.cy + rand(-30, 30), vx: rand(-200, 200), vy: rand(-200, 200), life: 0.5, size: 3, color: INK });
        if (this.st > 1.3) this.blinkTo(this.farAnchor(), this.hoverY, 'idle');
        break;
      case 'dying': free = false; this.updateDying(dt); this.y = Math.min(this.groundY - this.h, this.y + 30 * dt); return;
      default: break;
    }
    if (free) {
      this.x += clamp((this.tx - this.x) * 3, -320, 320) * dt;
      this.y += clamp((this.ty - this.y) * 3, -320, 320) * dt;
    }
    this.x = clamp(this.x, this.aL, this.aR - this.w);
    if (Math.random() < 0.3 && this.alpha > 0.5) spawnP({ x: this.cx + rand(-14, 14), y: this.y + this.h - 4, vy: rand(40, 120), life: 0.5, size: 2.2, color: INK, grav: 300 });
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5 && (this.state === 'idle' || this.state === 'fanRec' || this.state === 'stuck')) {
      this.phase = 2; this.setState('roar2'); this.eye = '#e3c6ff';
      Sound.play('roar'); shake(12, 1.0);
      ring(this.cx, this.cy, INK, 20, 520, 0.7);
    }
  }
  draw(c) {
    const x = this.cx, y = this.y, C = (k) => this.col(k), st = this.state, sleep = st === 'sleep';
    const eye = this.phase === 2 ? '#e3c6ff' : '#9fb4ff';
    const raise = st === 'fanTel' || st === 'rainTel' || st === 'rain' || st === 'summon' || st === 'roar2' ? 1 : 0;
    const shk = st === 'roar2' || st === 'dying' || st === 'intro' ? rand(-2, 2) : 0;
    c.save();
    c.globalAlpha = st === 'dying' ? clamp(1 - (this.st - 1.4), 0.15, 1) : this.alpha;
    c.translate(x + shk, y); c.scale(this.facing, 1);
    if (st === 'dive') c.scale(0.86, 1.14);
    const sway = Math.sin(this.t * 2.2) * 3;
    // robe: long, fraying into drips
    c.fillStyle = C('#171238');
    c.beginPath(); c.moveTo(-9, 22); c.quadraticCurveTo(-22, 50, -19 + sway, 82);
    for (let i = 0; i < 5; i++) { const bx = -19 + i * 9.5 + sway * (1 - i / 5); c.quadraticCurveTo(bx + 2.5, 92 + Math.sin(this.t * 4 + i) * 4, bx + 5, 80); c.quadraticCurveTo(bx + 7, 76, bx + 9.5, 82); }
    c.quadraticCurveTo(22, 50, 9, 22); c.closePath(); c.fill();
    c.strokeStyle = C('#4a3fa0'); c.lineWidth = 1.6; c.beginPath(); c.moveTo(-9, 24); c.quadraticCurveTo(-21, 50, -18 + sway, 78); c.stroke();
    c.fillStyle = C('#2a2260'); rrect(c, -3, 26, 6, 40, 2); c.fill();
    // arms + the great quill
    c.strokeStyle = C('#171238'); c.lineWidth = 5; c.lineCap = 'round';
    const ay = raise ? -4 : 46;
    c.beginPath(); c.moveTo(-8, 28); c.quadraticCurveTo(-22, 34, -20, ay); c.stroke();
    c.beginPath(); c.moveTo(8, 28); c.quadraticCurveTo(24, 34, 22, raise ? -8 : 44); c.stroke();
    c.save(); c.translate(22, raise ? -8 : 44); c.rotate(raise ? -0.5 : 0.25);
    c.strokeStyle = C('#d9d2ee'); c.lineWidth = 2; c.beginPath(); c.moveTo(0, 30); c.lineTo(0, -34); c.stroke();
    c.fillStyle = C('#e8e4f6'); c.beginPath(); c.moveTo(0, -36); c.quadraticCurveTo(10, -22, 2, -2); c.lineTo(0, -4); c.quadraticCurveTo(-8, -22, 0, -36); c.fill();
    c.restore();
    // head: a reading lamp
    c.strokeStyle = C('#2a2260'); c.lineWidth = 4; c.beginPath(); c.moveTo(0, 24); c.lineTo(0, 12); c.stroke();
    c.fillStyle = sleep ? 'rgba(140,150,210,0.25)' : rgba(eye, 0.9); ell(c, 2, 12, 9, 6); c.fill();
    c.fillStyle = C('#27307a');
    c.beginPath(); c.moveTo(-17, 12); c.quadraticCurveTo(-14, -6, 0, -8); c.quadraticCurveTo(15, -6, 18, 12); c.closePath(); c.fill();
    c.strokeStyle = C('#5a66c8'); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-15, 9); c.quadraticCurveTo(-12, -4, 0, -6); c.stroke();
    c.fillStyle = C('#1a2050'); c.fillRect(-3, -12, 6, 5);
    if (!sleep) { c.fillStyle = '#12102a'; ell(c, 4, 12, 1.8, 2.8); c.fill(); ell(c, 9, 12, 1.4, 2.4); c.fill(); }
    // fan of quills held behind while it gathers them
    if (st === 'fanTel') { const n = this.phase === 2 ? 7 : 5; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32; c.strokeStyle = rgba('#e3c6ff', 0.4 + this.st); c.lineWidth = 2; c.beginPath(); c.moveTo(Math.cos(a) * 26, 14 + Math.sin(a) * 26); c.lineTo(Math.cos(a) * 46, 14 + Math.sin(a) * 46); c.stroke(); } }
    c.restore();
    if (!sleep && this.alpha > 0.3) {
      addLight(x + this.facing * 2, y + 14, raise ? 190 : 140, eye, 0.36 * this.alpha, 0.9 * this.alpha);
      if (st === 'diveTel') { c.fillStyle = rgba(HAZ, 0.5 + Math.sin(this.t * 30) * 0.3); c.fillRect(x - 18, this.groundY - 3, 36, 3); drawGlow(c, x, this.groundY, 30, HAZ, 0.5); }
      if (st === 'stuck') for (let i = 0; i < 3; i++) { const a = this.t * 5 + i * TAU / 3; drawGlow(c, x + Math.cos(a) * 18, y - 14 + Math.sin(a) * 4, 7, '#ffe08a', 0.9); }
    }
  }
}
BOSSES.curator = Curator;
