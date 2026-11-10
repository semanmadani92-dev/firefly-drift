// Enemy base class + the creatures of the Gloamwood.
import { G } from './state.js';
import { T } from './config.js';
import { register } from './world.js';
import { moveBody, solidAt, standableAt, lineClear } from './physics.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell, rrect } from './gfx.js';
import { Sound } from './audio.js';
import { equipped } from './save.js';
import { rand, approach, sign, clamp, TAU, rgba } from './util.js';
import { Entity, Shot, dropMotes } from './entities.js';

export class Enemy extends Entity {
  // x = centre, y = feet
  constructor(x, y, w, h, o) {
    super(x - w / 2, y - h, w, h);
    this.type = 'enemy'; this.isEnemy = true; this.kind = o.kind;
    this.hp = this.maxHp = o.hp; this.dmg = o.dmg === undefined ? 1 : o.dmg;
    this.motes = o.motes || 3; this.kb = o.kb === undefined ? 1 : o.kb;
    this.uid = o.uid; this.eye = o.eye || '#ffb070'; this.grav = o.grav !== false;
    this.flash = 0; this.stun = 0; this.inv = 0; this.facing = -1; this.state = 'idle'; this.st = 0;
    this.avoidHazard = true; this.homeX = x; this.homeY = y - h / 2;
    this.onGround = false;
  }
  setState(s) { this.state = s; this.st = 0; }
  col(c) { return this.flash > 0 ? '#ffffff' : c; }

  hurt(dmg, dx, src) {
    if (this.dead || this.inv > 0) return false;
    this.hp -= dmg; this.flash = 0.12;
    if (this.kb > 0) {
      this.stun = 0.16 * Math.min(1, this.kb + 0.3);
      this.vx = dx * 250 * this.kb;
      if (this.grav && this.onGround) this.vy = -120 * this.kb;
    }
    burst(this.cx, this.cy, 5, { color: [this.eye, '#ffffff'], s0: 60, s1: 220, l0: 0.15, l1: 0.4 });
    if (this.onHurt) this.onHurt(dmg, dx, src);
    if (this.hp <= 0) this.die(dx);
    else if (src !== 'blade') Sound.play('ehit');
    return true;
  }
  onSlash(p, atk) { return this.hurt(atk.dmg, atk.dx, 'blade'); }

  die() {
    if (this.dead) return;
    this.dead = true;
    if (this.uid) G.killed.add(this.uid);
    const S = G.save;
    S.kills[this.kind] = (S.kills[this.kind] || 0) + 1;
    Sound.play('edie');
    burst(this.cx, this.cy, 18, { color: [this.eye, '#ffffff', '#20283c'], s0: 60, s1: 300, l0: 0.3, l1: 0.8, grav: 300 });
    burst(this.cx, this.cy, 8, { color: '#1a2030', shape: 'smoke', s0: 20, s1: 90, l0: 0.5, l1: 1.0, z0: 5, z1: 10 });
    ring(this.cx, this.cy, this.eye, 6, 150, 0.3);
    dropMotes(this.room, this.cx, this.cy, Math.round(this.motes * (equipped('moteblossom') ? 1.4 : 1)));
    G.hitstop = Math.max(G.hitstop, 0.07);
  }

  touch(p) { if (this.dmg > 0 && !this.dead) p.hurt(this.dmg, this.cx, { src: this }); }

  physics(dt) {
    const room = this.room;
    if (this.grav) this.vy = Math.min(this.vy + 2000 * dt, 900);
    moveBody(room, this, dt);
    if (this.x < 2) { this.x = 2; this.hitL = true; }
    if (this.x + this.w > room.pxW - 2) { this.x = room.pxW - 2 - this.w; this.hitR = true; }
    if (this.y < 2 && !this.grav) { this.y = 2; this.hitCeil = true; }
    if (this.y > room.pxH + 80) this.dead = true;
  }
  // true while reeling from a hit (caller should skip its AI)
  baseUpdate(dt) {
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.stun > 0) {
      this.stun -= dt;
      this.vx = approach(this.vx, 0, 700 * dt);
      if (!this.grav) this.vy = approach(this.vy, 0, 700 * dt);
      this.physics(dt);
      return true;
    }
    return false;
  }
  edgeAhead(dir = this.facing) {
    const fx = dir > 0 ? this.x + this.w + 3 : this.x - 3;
    return !standableAt(this.room, fx, this.y + this.h + 5);
  }
  wallAhead(dir = this.facing) {
    const fx = dir > 0 ? this.x + this.w + 3 : this.x - 3;
    return solidAt(this.room, fx, this.y + this.h - 6, this) || solidAt(this.room, fx, this.y + 4, this);
  }
  canSee(range) {
    const p = G.player;
    if (!p || p.state === 'dead') return false;
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    if (dx * dx + dy * dy > range * range) return false;
    return lineClear(this.room, this.cx, this.cy, p.cx, p.cy);
  }
  patrol(speed) {
    if (this.onGround) {
      if (this.wallAhead() || this.edgeAhead()) this.facing *= -1;
      this.vx = this.facing * speed;
    }
  }
}

export function regEnemy(type, Cls) {
  register(type, (room, spec, x, y, info) => (G.killed.has(info.uid) ? null : new Cls(x, y, info.uid, spec)));
}

// ---------------------------------------------------------------- Mossback
class Mossback extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 34, 22, { kind: 'mossback', hp: 30, motes: 4, uid, eye: '#ffcf7a' });
    this.facing = Math.random() < 0.5 ? -1 : 1; this.walk = Math.random() * 6;
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    this.patrol(40);
    this.walk += dt * 7;
    this.physics(dt);
    if (this.hitL) this.facing = 1; else if (this.hitR) this.facing = -1;
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k);
    c.save(); c.translate(x, y); c.scale(this.facing, 1);
    c.strokeStyle = C('#132426'); c.lineWidth = 3.4; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const lx = -10 + i * 9, a = Math.sin(this.walk + i * 2.1) * 3; c.beginPath(); c.moveTo(lx, -6); c.lineTo(lx + a, -0.5); c.stroke(); }
    c.fillStyle = C('#2f5650');
    c.beginPath(); c.moveTo(-17, -4); c.quadraticCurveTo(-17, -25, -1, -25); c.quadraticCurveTo(16, -25, 16, -4); c.closePath(); c.fill();
    c.strokeStyle = C('#3f7a6c'); c.lineWidth = 1.4; c.beginPath(); c.moveTo(-15, -10); c.quadraticCurveTo(-13, -23, -1, -23.5); c.stroke();
    c.fillStyle = C('#27b488');
    for (let i = 0; i < 4; i++) { ell(c, -10 + i * 6.5, -22 + Math.abs(i - 1.5) * 2.2, 5, 3); c.fill(); }
    c.fillStyle = C('#8fffe0'); c.fillRect(-8, -15, 2, 2); c.fillRect(2, -17, 2, 2); c.fillRect(8, -12, 2, 2);
    c.fillStyle = C('#1a3230'); ell(c, 16, -7, 6.5, 5.5); c.fill();
    c.fillStyle = C('#ffcf7a'); ell(c, 18.5, -8, 1.7, 1.9); c.fill();
    c.restore();
    addLight(x + this.facing * 17, y - 8, 52, '#ffcf7a', 0.2, 0.45);
  }
}
regEnemy('mossback', Mossback);

// ---------------------------------------------------------------- Snuffling
class Snuffling extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 22, 20, { kind: 'snuffling', hp: 20, motes: 3, uid, eye: '#dfe8ff' });
    this.wait = rand(0.3, 1.2);
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player, room = this.room;
    if (this.onGround) {
      this.vx = approach(this.vx, 0, 1200 * dt);
      this.wait -= dt;
      if (this.wait <= 0) {
        const dx = p.cx - this.cx;
        let dir;
        if (Math.abs(dx) < 320 && Math.abs(p.cy - this.cy) < 170 && p.state !== 'dead') dir = sign(dx) || 1;
        else dir = this.cx > this.homeX + 70 ? -1 : this.cx < this.homeX - 70 ? 1 : (Math.random() < 0.5 ? -1 : 1);
        const lx = this.cx + dir * 74, fy = this.y + this.h;
        if (!standableAt(room, lx, fy + 6) && !standableAt(room, lx, fy + 38) && !standableAt(room, lx, fy - 26)) dir = -dir;
        this.facing = dir; this.vx = dir * 160; this.vy = -440; this.wait = rand(0.5, 1.05); this.onGround = false;
      }
    }
    this.physics(dt);
    if (Math.random() < 0.08) spawnP({ x: this.cx, y: this.y, shape: 'smoke', color: '#2a2440', life: 0.8, size: 4, vy: -30, vx: rand(-10, 10) });
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k);
    const st = this.onGround ? Math.max(0, 0.12 - this.wait) * 2.2 : clamp(-this.vy / 900, -0.2, 0.3);
    c.save(); c.translate(x, y); c.scale(this.facing * (1 - st * 0.5), 1 + st * 0.6);
    c.fillStyle = C('#2a2440');
    c.beginPath(); c.moveTo(-11, 0); c.quadraticCurveTo(-13, -20, 0, -21); c.quadraticCurveTo(12, -20, 11, 0); c.closePath(); c.fill();
    c.strokeStyle = C('#2a2440'); c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(8, -8); c.quadraticCurveTo(17, -9, 18, -3 + Math.sin(this.t * 7) * 1.5); c.stroke();
    c.strokeStyle = C('#4a4270'); c.lineWidth = 1.4; c.beginPath(); c.moveTo(-9, -6); c.quadraticCurveTo(-10, -18, 0, -19.5); c.stroke();
    c.fillStyle = C('#eef2ff'); ell(c, 3, -13, 4.6, 5); c.fill();
    c.fillStyle = '#12101e'; ell(c, 4.4, -12.6, 2, 2.6); c.fill();
    c.restore();
    addLight(x + this.facing * 3, y - 13, 46, '#dfe8ff', 0.18, 0.4);
  }
}
regEnemy('snuffling', Snuffling);

// ---------------------------------------------------------------- Kitewing
class Kite extends Enemy {
  constructor(x, y, uid) {
    super(x, y - 4, 30, 22, { kind: 'kite', hp: 20, motes: 4, uid, eye: '#ff8ad0', grav: false });
    this.avoidHazard = false;
    this.state = 'hover'; this.cd = rand(0.6, 1.6); this.dvx = 0; this.dvy = 0; this.ph = Math.random() * 6;
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player;
    if (this.state === 'hover') {
      const tx = this.homeX + Math.sin(this.t * 0.8 + this.ph) * 44, ty = this.homeY + Math.sin(this.t * 1.7 + this.ph) * 10;
      this.vx = (tx - this.cx) * 2.2; this.vy = (ty - this.cy) * 2.2;
      if (Math.abs(this.vx) > 6) this.facing = sign(this.vx);
      this.cd -= dt;
      if (this.cd <= 0 && this.canSee(260)) { this.setState('wind'); this.facing = sign(p.cx - this.cx) || 1; Sound.play('warn'); }
    } else if (this.state === 'wind') {
      this.vx = approach(this.vx, -this.facing * 30, 300 * dt); this.vy = -46;
      if (this.st > 0.45) {
        const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
        this.dvx = dx / d * 350; this.dvy = dy / d * 350; this.facing = sign(dx) || 1;
        this.setState('swoop');
      }
    } else if (this.state === 'swoop') {
      this.vx = this.dvx; this.vy = this.dvy;
      if (this.st > 0.05 && (this.hitL || this.hitR || this.onGround || this.hitCeil)) this.setState('rise');
      if (this.st > 0.8) this.setState('rise');
    } else { // rise back to hovering height
      this.vx = approach(this.vx, 0, 500 * dt); this.vy = approach(this.vy, -130, 900 * dt);
      if (this.cy <= this.homeY + 6 || this.st > 2.2 || this.hitCeil) { this.homeX = this.cx; if (this.st > 2.2 || this.hitCeil) this.homeY = this.cy; this.setState('hover'); this.cd = rand(1.0, 2.0); }
    }
    this.physics(dt);
  }
  draw(c) {
    const x = this.cx, y = this.cy, C = (k) => this.col(k);
    const flap = this.state === 'swoop' ? 0.55 : 1 + Math.sin(this.t * 9) * 0.14;
    const ang = this.state === 'swoop' ? Math.atan2(this.dvy, Math.abs(this.dvx)) * 0.7 : this.state === 'wind' ? -0.35 : 0;
    c.save(); c.translate(x, y); c.scale(this.facing, 1); c.rotate(ang);
    // tail ribbon
    c.strokeStyle = C('#ff8ad0'); c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-14, 0);
    for (let i = 1; i <= 5; i++) c.lineTo(-14 - i * 6, Math.sin(this.t * 8 - i * 0.9) * 4);
    c.stroke();
    c.fillStyle = C('#34425f');
    c.beginPath(); c.moveTo(17, 0); c.lineTo(0, -12 * flap); c.lineTo(-15, 0); c.lineTo(0, 11 * flap); c.closePath(); c.fill();
    c.strokeStyle = C('#5a6c94'); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(17, 0); c.lineTo(-15, 0); c.moveTo(0, -12 * flap); c.lineTo(0, 11 * flap); c.stroke();
    const hot = this.state === 'wind' || this.state === 'swoop';
    c.fillStyle = C(hot ? '#ffd0ec' : '#ff8ad0'); ell(c, 7, -0.5, 3.2, 3.2); c.fill();
    c.fillStyle = '#1a0f20'; ell(c, 8, -0.5, 1.3, 1.9); c.fill();
    c.restore();
    addLight(x + this.facing * 7, y, hot ? 80 : 50, '#ff8ad0', hot ? 0.34 : 0.2, 0.45);
  }
}
regEnemy('kite', Kite);

// ---------------------------------------------------------------- Thornspitter
class Spitter extends Enemy {
  constructor(x, y, uid, spec) {
    super(x, y, 26, 28, { kind: 'spitter', hp: 30, motes: 5, uid, eye: '#ff9a5a', kb: 0, grav: false });
    this.ceil = !!(spec && spec.ceil);
    if (this.ceil) this.y = y - T;
    this.cd = rand(0.6, 1.6); this.avoidHazard = false;
  }
  update(dt) {
    this.baseUpdate(dt);
    const p = G.player;
    if (this.state === 'idle') {
      this.cd -= dt;
      if (this.cd <= 0 && this.canSee(400)) this.setState('puff');
    } else if (this.st > 0.5) {
      const mx = this.cx, my = this.ceil ? this.y + this.h - 6 : this.y + 6;
      const dx = p.cx - mx, dy = p.cy - my, d = Math.hypot(dx, dy) || 1;
      this.room.add(new Shot(mx, my, dx / d * 255, dy / d * 255, { color: '#ffb070' }));
      Sound.play('shoot');
      burst(mx, my, 6, { color: '#ffb070', s0: 30, s1: 120, l0: 0.15, l1: 0.35 });
      this.setState('idle'); this.cd = 2.3;
    }
    if (p) this.facing = sign(p.cx - this.cx) || 1;
  }
  draw(c) {
    const x = this.cx, C = (k) => this.col(k), puff = this.state === 'puff' ? 1 + this.st * 0.5 : 1 + Math.sin(this.t * 2) * 0.04;
    const by = this.ceil ? this.y : this.y + this.h, s = this.ceil ? 1 : -1; // s: direction the plant grows (screen y)
    c.save(); c.translate(x, by); c.scale(1, -s);
    c.strokeStyle = C('#1c4a34'); c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -10); c.stroke();
    c.fillStyle = C('#236a48'); ell(c, -9, -3, 9, 3.2, 0.4); c.fill(); ell(c, 9, -3, 9, 3.2, -0.4); c.fill();
    c.fillStyle = C('#2c7a50'); ell(c, 0, -17, 11 * puff, 10 * puff); c.fill();
    c.fillStyle = C(this.state === 'puff' ? '#ffd0a0' : '#ff9a5a'); ell(c, this.facing * 2, -21, 5.5 * puff, 4 * puff); c.fill();
    c.fillStyle = C('#e8f5d0');
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(this.facing * 2 + i * 4 - 1.6, -24 * puff + (puff - 1) * 6 - 0.5); c.lineTo(this.facing * 2 + i * 4, -29 * puff + (puff - 1) * 6); c.lineTo(this.facing * 2 + i * 4 + 1.6, -24 * puff + (puff - 1) * 6 - 0.5); c.closePath(); c.fill(); }
    c.fillStyle = C('#12301f'); ell(c, -5, -15, 1.6, 2); c.fill(); ell(c, 5, -15, 1.6, 2); c.fill();
    c.restore();
    addLight(x, by + s * 20, this.state === 'puff' ? 90 : 56, '#ff9a5a', this.state === 'puff' ? 0.36 : 0.2, 0.5);
  }
}
regEnemy('spitter', Spitter);

// ---------------------------------------------------------------- Bramble Brute
class Brute extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 46, 36, { kind: 'brute', hp: 85, motes: 14, uid, eye: '#ff6a4a', kb: 0.22 });
    this.state = 'walk'; this.walk = 0; this.facing = -1;
  }
  update(dt) {
    if (this.baseUpdate(dt) && this.state !== 'charge') return;
    const p = G.player;
    this.walk += dt * (this.state === 'charge' ? 22 : 6);
    if (this.state === 'walk') {
      this.dmg = 1;
      this.patrol(44);
      const dx = p.cx - this.cx;
      if (this.onGround && p.state !== 'dead' && Math.abs(dx) < 340 && Math.abs((p.y + p.h) - (this.y + this.h)) < 56 && this.canSee(360) && this.st > 0.5) {
        this.facing = sign(dx) || 1; this.setState('tel'); Sound.play('charge');
      }
    } else if (this.state === 'tel') {
      this.vx = -this.facing * 14;
      if (Math.random() < 0.5) spawnP({ x: this.cx - this.facing * 18, y: this.y + this.h, vx: -this.facing * rand(40, 120), vy: -rand(20, 80), life: 0.4, size: 2.2, color: '#cfe8dc' });
      if (this.st > 0.6) this.setState('charge');
    } else if (this.state === 'charge') {
      this.dmg = 2;
      this.vx = this.facing * 350;
      if (this.edgeAhead()) { this.vx = 0; this.setState('tired'); }
      if (this.st > 1.5) this.setState('tired');
    } else if (this.state === 'daze') {
      this.dmg = 1; this.vx = 0;
      if (this.st > 1.15) this.setState('walk');
    } else { // tired
      this.dmg = 1; this.vx = approach(this.vx, 0, 900 * dt);
      if (this.st > 0.7) this.setState('walk');
    }
    this.physics(dt);
    if (this.state === 'charge' && (this.hitL || this.hitR)) {
      this.setState('daze'); this.vx = -this.facing * 90; this.vy = -200;
      Sound.play('thud'); shake(7, 0.3);
      burst(this.facing > 0 ? this.x + this.w : this.x, this.cy, 12, { color: '#cfe8dc', s0: 60, s1: 260, l0: 0.2, l1: 0.5 });
    } else if (this.state === 'walk') { if (this.hitL) this.facing = 1; else if (this.hitR) this.facing = -1; }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k);
    const tel = this.state === 'tel', dz = this.state === 'daze';
    const sh = tel ? rand(-1.5, 1.5) : 0;
    c.save(); c.translate(x + sh, y); c.scale(this.facing, 1);
    if (this.state === 'charge') c.rotate(0.08);
    c.strokeStyle = C('#1a1420'); c.lineWidth = 5; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const lx = -15 + i * 10, a = Math.sin(this.walk + i * 1.7) * 4; c.beginPath(); c.moveTo(lx, -9); c.lineTo(lx + a, -0.5); c.stroke(); }
    c.fillStyle = C('#2c2136');
    c.beginPath(); c.moveTo(-23, -8); c.quadraticCurveTo(-26, -34, -4, -38); c.quadraticCurveTo(20, -38, 23, -16); c.quadraticCurveTo(24, -6, 14, -6); c.closePath(); c.fill();
    // bramble spines
    c.fillStyle = C('#463658');
    for (let i = 0; i < 6; i++) { const bx = -19 + i * 6.5, by = -31 - Math.sin(i * 1.3) * 4 + Math.abs(i - 2.5) * 2; c.beginPath(); c.moveTo(bx - 3.5, by + 4); c.lineTo(bx - 2, by - 8); c.lineTo(bx + 3.5, by + 4); c.closePath(); c.fill(); }
    c.strokeStyle = C('#5a4670'); c.lineWidth = 1.4; c.beginPath(); c.moveTo(-21, -14); c.quadraticCurveTo(-23, -31, -5, -35.5); c.stroke();
    // tusks + eye
    c.fillStyle = C('#efe6d0');
    c.beginPath(); c.moveTo(18, -9); c.quadraticCurveTo(27, -9, 28, -19); c.quadraticCurveTo(23, -14, 16, -14); c.closePath(); c.fill();
    c.fillStyle = C(tel || this.state === 'charge' ? '#ffd0c0' : '#ff6a4a');
    if (dz) { c.strokeStyle = C('#ff6a4a'); c.lineWidth = 1.6; c.beginPath(); c.moveTo(11, -24); c.lineTo(16, -20); c.moveTo(16, -24); c.lineTo(11, -20); c.stroke(); }
    else { ell(c, 14, -22, 2.6, 2.2); c.fill(); }
    c.restore();
    const hot = tel || this.state === 'charge';
    addLight(x + this.facing * 14, y - 22, hot ? 96 : 60, '#ff6a4a', hot ? 0.36 : 0.2, 0.5);
    if (dz) for (let i = 0; i < 2; i++) { const a = this.t * 5 + i * Math.PI; drawGlow(c, x + this.facing * 12 + Math.cos(a) * 12, y - 42 + Math.sin(a) * 3, 6, '#ffe08a', 0.9); }
  }
}
regEnemy('brute', Brute);
