// Boss framework + the Bramble Warden (Gloamwood).
import { G } from './state.js';
import { T, AREAS } from './config.js';
import { register } from './world.js';
import { solidAt, standableAt } from './physics.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell } from './gfx.js';
import { Sound } from './audio.js';
import { flag, setFlag, has } from './save.js';
import { rand, approach, sign, clamp, TAU, rgba, pick } from './util.js';
import { Entity, Shot, dropMotes, drawFlame } from './entities.js';
import { Enemy } from './enemies.js';
import { HAZ } from './terrain.js';

export const BOSSES = {};

// A floating light left behind by a boss: touching it grants an ability.
export class AbilityOrb extends Entity {
  constructor(x, y, ability) { super(x - 16, y - 48, 32, 40); this.type = 'orb'; this.ability = ability; this.layer = 2; this.delay = 1.0; }
  update(dt) { this.t += dt; this.delay = Math.max(0, this.delay - dt); }
  touch() { if (this.delay <= 0 && !this.dead) { this.dead = true; G.game.giveAbility(this.ability, this); } }
  draw(c) {
    const y = this.cy + Math.sin(G.now * 2) * 5, pul = 1 + Math.sin(G.now * 4) * 0.12;
    drawGlow(c, this.cx, y, 40 * pul, '#ffe08a', 1);
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + G.now * 0.8, r = (i % 2 ? 5 : 12) * pul; c.lineTo(this.cx + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath(); c.fill();
    addLight(this.cx, y, 200, '#ffe08a', 0.4, 1);
    if (Math.random() < 0.3) spawnP({ x: this.cx + rand(-14, 14), y: y + rand(-14, 14), vy: -rand(20, 70), life: rand(0.6, 1.2), size: 2, color: '#ffe08a', wob: 40 });
  }
}

export class Boss extends Enemy {
  constructor(x, y, w, h, o) {
    super(x, y, w, h, Object.assign({ kb: 0 }, o));
    this.boss = true; this.name = o.name; this.id = o.id; this.spec = o.spec || {};
    this.state = 'sleep'; this.phase = 1; this.uid = null; this.reward = this.spec.reward || null; this.spawnX = x; this.spawnY = y;
    this.dmgBase = this.dmg;
  }
  shouldWake() {
    const p = G.player, s = this.spec;
    if (!p || p.state === 'dead') return false;
    if (s.wake !== undefined) return s.wakeDir > 0 ? p.cx > s.wake * T : p.cx < s.wake * T;
    return Math.abs(p.cx - this.cx) < 360 && Math.abs(p.cy - this.cy) < 200;
  }
  startFight() {
    G.bossLock = true; G.boss = this;
    Sound.music(this.spec.music || 'boss');
    Sound.play('roar'); shake(10, 1.0);
    this.setState('intro');
    G.ui.bossIntro(this.name);
    G.cam.focus = { x: this.cx, y: this.cy - 40 };
    const p = G.player;
    if (p) { p.ctlLock = Math.max(p.ctlLock, 1.6); p.vx = 0; }
    G.game.after(1.6, () => { G.cam.focus = null; });
  }
  hurt(dmg, dx, src) {
    if (this.state === 'dying' || this.state === 'intro') return false;
    if (this.state === 'sleep') { this.startFight(); return true; }
    return super.hurt(dmg, dx, src);
  }
  die() {
    if (this.state === 'dying') return;
    this.setState('dying'); this.dmg = 0; this.vx = 0; this.hp = 0;
    G.timeScale = 0.3; G.hitstop = 0.25;
    Sound.play('roar'); shake(14, 1.2);
    for (const e of this.room.entities) if (e.type === 'shot' || e.type === 'hazard') e.dead = true;
  }
  updateDying(dt) {
    if (this.st > 0.9) G.timeScale = approach(G.timeScale, 1, dt * 2);
    if (Math.random() < 0.6) burst(this.x + rand(0, this.w), this.y + rand(0, this.h), 4, { color: [this.eye, '#ffffff', '#ffe08a'], s0: 40, s1: 240, l0: 0.4, l1: 1.0 });
    if (Math.floor(this.st * 5) !== Math.floor((this.st - dt) * 5)) { Sound.play('ehit'); shake(5, 0.15); }
    if (this.st > 2.4) this.finish();
  }
  finish() {
    this.dead = true;
    G.timeScale = 1; G.bossLock = false; G.boss = null;
    setFlag('boss_' + this.id);
    const S = G.save;
    S.kills[this.kind] = (S.kills[this.kind] || 0) + 1;
    Sound.play('edie'); Sound.play('big');
    Sound.music(AREAS[this.room.area].music);
    G.flash.a = 0.9; G.flash.color = '#ffffff';
    burst(this.cx, this.cy, 60, { color: [this.eye, '#ffffff', '#ffe08a'], s0: 80, s1: 520, l0: 0.5, l1: 1.6, drag: 1.4 });
    ring(this.cx, this.cy, '#ffffff', 10, 520, 0.7);
    dropMotes(this.room, this.cx, this.cy, this.motes);
    if (this.reward && this.reward.ability && !has(this.reward.ability)) this.room.add(new AbilityOrb(this.cx, this.y + this.h - 10, this.reward.ability));
    G.ui.toast(`${this.name} is at rest.`, 'Victory', 4200);
    G.game.autosave();
  }
}

register('boss', (room, spec, x, y) => {
  if (flag('boss_' + spec.id)) {
    if (spec.reward && spec.reward.ability && !has(spec.reward.ability)) return new AbilityOrb(x, y - 10, spec.reward.ability);
    return null;
  }
  const Cls = BOSSES[spec.id];
  return Cls ? new Cls(x, y, spec) : null;
});

// ---------------------------------------------------------------- shared boss hazards
export class Shockwave extends Entity {
  constructor(x, y, dir, speed = 390) {
    super(x - 12, y - 36, 24, 36);
    this.type = 'hazard'; this.dir = dir; this.vx = dir * speed; this.layer = 2; this.dmg = 1;
  }
  update(dt) {
    this.t += dt;
    this.x += this.vx * dt;
    const fx = this.dir > 0 ? this.x + this.w : this.x, fy = this.y + this.h;
    if (this.t > 2 || solidAt(this.room, fx, fy - 8) || !standableAt(this.room, fx, fy + 4)) { this.dead = true; burst(this.cx, fy, 8, { color: HAZ, s0: 40, s1: 160, a0: Math.PI, a1: TAU }); return; }
    spawnP({ x: this.cx, y: fy - rand(0, 26), life: 0.3, size: 3, color: HAZ, vx: -this.dir * 60, vy: -rand(10, 60) });
  }
  touch(p) { p.hurt(this.dmg, this.cx - this.dir * 20); }
  draw(c) {
    const fy = this.y + this.h, x = this.cx;
    c.save(); c.translate(x, fy); c.scale(this.dir, 1);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      c.fillStyle = rgba(i === 0 ? '#ffffff' : HAZ, 0.9 - i * 0.25);
      const o = -i * 9, hh = 36 - i * 7 + Math.sin(this.t * 30 + i) * 3;
      c.beginPath(); c.moveTo(o - 9, 0); c.quadraticCurveTo(o + 4, -hh * 0.5, o + 12, -hh); c.quadraticCurveTo(o + 8, -hh * 0.4, o + 5, 0); c.closePath(); c.fill();
    }
    c.restore();
    addLight(x, fy - 16, 90, HAZ, 0.34, 0.7);
  }
}

export class ThornBurst extends Entity {
  constructor(x, y, delay = 0.75) {
    super(x - 17, y - 72, 34, 72);
    this.type = 'hazard'; this.bx = x; this.by = y; this.delay = delay; this.up = 0; this.fired = false; this.layer = 2;
  }
  update(dt) {
    this.t += dt;
    if (this.t < this.delay) {
      if (Math.random() < 0.6) spawnP({ x: this.bx + rand(-14, 14), y: this.by, vy: -rand(40, 140), life: 0.35, size: 2, color: HAZ });
      return;
    }
    const k = this.t - this.delay;
    if (!this.fired) {
      this.fired = true; Sound.play('crack'); shake(4, 0.15);
      burst(this.bx, this.by, 10, { color: [HAZ, '#ffffff'], a0: Math.PI + 0.4, a1: TAU - 0.4, s0: 100, s1: 360, l0: 0.2, l1: 0.5, shape: 'spark' });
    }
    this.up = k < 0.08 ? k / 0.08 : k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.25);
    if (k > 0.8) this.dead = true;
  }
  touch(p) { if (this.t >= this.delay && this.up > 0.5) p.hurt(1, this.bx); }
  draw(c) {
    const x = this.bx, y = this.by;
    if (this.t < this.delay) {
      const k = this.t / this.delay;
      c.fillStyle = rgba(HAZ, 0.35 + 0.5 * k * Math.abs(Math.sin(this.t * 22)));
      c.fillRect(x - 17, y - 2.5, 34, 3);
      drawGlow(c, x, y, 22 + k * 16, HAZ, 0.5 * k + 0.2);
      return;
    }
    const u = this.up;
    for (let i = -1; i <= 1; i++) {
      const hh = (i === 0 ? 72 : 50) * u, bx = x + i * 11;
      c.fillStyle = '#1e0e1c';
      c.beginPath(); c.moveTo(bx - 7, y); c.lineTo(bx + i * 4, y - hh); c.lineTo(bx + 7, y); c.closePath(); c.fill();
      c.strokeStyle = HAZ; c.lineWidth = 1.6; c.beginPath(); c.moveTo(bx - 7, y); c.lineTo(bx + i * 4, y - hh); c.stroke();
    }
    addLight(x, y - 30, 100, HAZ, 0.3 * u, 0.6 * u);
  }
}

// ---------------------------------------------------------------- The Bramble Warden
class Warden extends Boss {
  constructor(x, y, spec) {
    super(x, y, 84, 76, { kind: 'warden', id: 'warden', name: 'The Bramble Warden', hp: 430, motes: 150, eye: '#ffb060', spec });
    this.facing = spec.wakeDir > 0 ? -1 : 1;
    this.last = ''; this.repeat = 0; this.combo = 0; this.idleT = 1; this.recT = 0.7; this.walk = 0;
    const a = spec.arena || [2, 28];
    this.aL = a[0] * T; this.aR = a[1] * T;
  }
  pickAttack() {
    const p = G.player, d = Math.abs(p.cx - this.cx), p2 = this.phase === 2;
    const opts = d > 250 ? ['charge', 'charge', 'leap', 'leap', 'thorn'] : ['leap', 'thorn', 'thorn', 'charge'];
    if (p2) opts.push('volley', 'volley');
    let a = pick(opts);
    if (a === this.last && ++this.repeat >= 2) { a = pick(opts.filter((o) => o !== this.last)); }
    if (a !== this.last) this.repeat = 0;
    this.last = a;
    this.facing = sign(p.cx - this.cx) || this.facing;
    if (a === 'charge') { this.combo = p2 ? 1 : 0; this.setState('chargeTel'); Sound.play('charge'); }
    else if (a === 'leap') this.setState('leapTel');
    else if (a === 'thorn') { this.setState('thornTel'); Sound.play('warn'); }
    else { this.setState('volley'); Sound.play('warn'); }
  }
  update(dt) {
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.inv > 0) this.inv -= dt;
    const p = G.player, p2 = this.phase === 2, room = this.room;
    const dx = p.cx - this.cx;
    this.dmg = this.dmgBase;
    switch (this.state) {
      case 'sleep': if (this.shouldWake()) this.startFight(); break;
      case 'intro': this.vx = 0; if (this.st > 1.7) { this.setState('idle'); this.idleT = 0.5; } break;
      case 'idle':
        this.vx = approach(this.vx, 0, 900 * dt);
        this.facing = sign(dx) || this.facing;
        if (this.st > this.idleT) this.pickAttack();
        break;
      case 'chargeTel':
        this.vx = -this.facing * 22;
        if (Math.random() < 0.6) spawnP({ x: this.cx - this.facing * 30, y: this.y + this.h, vx: -this.facing * rand(60, 180), vy: -rand(20, 120), life: 0.45, size: 2.6, color: '#cfe8dc' });
        if (this.st > (p2 ? 0.5 : 0.7)) this.setState('charge');
        break;
      case 'charge':
        this.dmg = 2; this.walk += dt * 26;
        this.vx = this.facing * (p2 ? 610 : 520);
        if (Math.random() < 0.7) spawnP({ x: this.cx - this.facing * 34, y: this.y + this.h, vx: -this.facing * rand(40, 140), vy: -rand(20, 100), life: 0.4, size: 2.6, color: '#cfe8dc' });
        if (this.st > 2.2) this.setState('recover');
        break;
      case 'stun':
        this.vx = approach(this.vx, 0, 500 * dt);
        if (this.st > (p2 ? 0.8 : 1.15)) {
          if (this.combo > 0) { this.combo--; this.facing = sign(dx) || this.facing; this.setState('chargeTel'); Sound.play('charge'); }
          else { this.setState('idle'); this.idleT = 0.3; }
        }
        break;
      case 'leapTel':
        this.vx = 0;
        if (this.st > (p2 ? 0.34 : 0.46)) {
          const tx = clamp(p.cx + p.vx * 0.25, this.aL + 60, this.aR - 60), air = 0.86;
          this.vx = clamp((tx - this.cx) / air, -620, 620); this.vy = -860; this.onGround = false;
          this.setState('leap'); Sound.play('jump');
        }
        break;
      case 'leap': break;
      case 'thornTel':
        this.vx = 0;
        if (this.st > 0.5) {
          const gy = this.y + this.h, xs = [p.cx, p.cx - 120, p.cx + 120];
          if (p2) xs.push(p.cx - 240, p.cx + 240);
          xs.forEach((x, i) => { if (x > this.aL + 20 && x < this.aR - 20) room.add(new ThornBurst(x, gy, 0.7 + (i > 0 ? 0.12 : 0) + (i > 2 ? 0.12 : 0))); });
          Sound.play('thud'); shake(6, 0.3);
          this.recT = p2 ? 0.9 : 1.15; this.setState('recover');
        }
        break;
      case 'volley':
        this.vx = 0;
        if (this.st > 0.5) {
          const lx = this.cx + this.facing * 26, ly = this.y - 26;
          for (let i = 0; i < 5; i++) {
            const tx = p.cx + (i - 2) * 80, tt = 1.0, vx = (tx - lx) / tt, vy = ((p.y + p.h) - ly) / tt - 0.5 * 900 * tt;
            room.add(new Shot(lx, ly, vx, vy, { grav: 900, color: '#ffb060', life: 3 }));
          }
          Sound.play('shoot');
          burst(lx, ly, 12, { color: '#ffb060', s0: 60, s1: 240 });
          this.recT = 0.9; this.setState('recover');
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.st > this.recT) { this.setState('idle'); this.idleT = p2 ? rand(0.3, 0.6) : rand(0.6, 1.0); }
        break;
      case 'roar2':
        this.vx = 0; this.inv = 0.2;
        if (this.st > 1.3) { this.setState('idle'); this.idleT = 0.3; }
        break;
      case 'dying': this.updateDying(dt); break;
      default: break;
    }
    if (this.state === 'dying') { this.vy = Math.min(this.vy + 2000 * dt, 900); this.physics(dt); return; }
    this.physics(dt);
    if (this.x < this.aL) { this.x = this.aL; this.hitL = true; }
    if (this.x + this.w > this.aR) { this.x = this.aR - this.w; this.hitR = true; }
    if (this.state === 'charge' && (this.hitL || this.hitR)) {
      this.setState('stun'); this.vx = -this.facing * 120; this.vy = -260;
      Sound.play('thud'); shake(12, 0.4);
      burst(this.facing > 0 ? this.x + this.w : this.x, this.cy, 18, { color: ['#cfe8dc', '#ffb060'], s0: 80, s1: 360, l0: 0.25, l1: 0.6 });
      if (p2) for (let i = 0; i < 3; i++) room.add(new Shot(clamp(p.cx + rand(-150, 150), this.aL + 30, this.aR - 30), room.pxH * 0.12 + rand(0, 30), 0, 60, { grav: 700, color: HAZ, life: 3 }));
    }
    if (this.state === 'leap' && this.onGround && this.st > 0.12) {
      Sound.play('thud'); shake(13, 0.4);
      const gy = this.y + this.h;
      burst(this.cx, gy, 20, { color: ['#cfe8dc', HAZ], a0: Math.PI, a1: TAU, s0: 80, s1: 380, l0: 0.25, l1: 0.6 });
      room.add(new Shockwave(this.x + this.w + 4, gy, 1, p2 ? 440 : 380));
      room.add(new Shockwave(this.x - 4, gy, -1, p2 ? 440 : 380));
      this.vx = 0; this.recT = p2 ? 0.55 : 0.8; this.setState('recover');
    }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5 && (this.state === 'idle' || this.state === 'recover' || this.state === 'stun')) {
      this.phase = 2; this.setState('roar2'); this.eye = HAZ;
      Sound.play('roar'); shake(12, 1.0);
      ring(this.cx, this.cy, HAZ, 20, 520, 0.7);
    }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k), st = this.state, p2 = this.phase === 2;
    const sleep = st === 'sleep', dying = st === 'dying';
    const crouch = sleep ? 20 : st === 'leapTel' || st === 'chargeTel' ? 8 : st === 'stun' ? 6 : 0;
    const rear = st === 'thornTel' || st === 'roar2' || st === 'intro' ? -0.22 : st === 'charge' ? 0.1 : 0;
    const shk = st === 'chargeTel' || st === 'roar2' || st === 'intro' || dying ? rand(-2, 2) : 0;
    const eyeCol = p2 ? HAZ : '#ffb060';
    c.save();
    if (dying) c.globalAlpha = clamp(1 - (this.st - 1.4), 0.15, 1);
    c.translate(x + shk, y); c.scale(this.facing, 1);
    // legs
    c.strokeStyle = C('#1f1826'); c.lineWidth = 9; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const lx = [-30, -18, 16, 28][i], a = st === 'charge' ? Math.sin(this.walk + i * 1.6) * 12 : 0;
      c.beginPath(); c.moveTo(lx, -30 + crouch); c.lineTo(lx + a * 0.4, -14 + crouch * 0.5); c.lineTo(lx + a, -1); c.stroke();
    }
    c.translate(0, crouch); c.rotate(rear);
    // body of woven root
    c.fillStyle = C('#2a2034'); ell(c, -2, -44, 42, 23); c.fill();
    c.strokeStyle = C('#4d3c60'); c.lineWidth = 2;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-38 + i * 14, -56 + (i % 2) * 6); c.quadraticCurveTo(-30 + i * 14, -40, -40 + i * 16, -28); c.stroke(); }
    c.fillStyle = C('#22a57e');
    for (let i = 0; i < 6; i++) { ell(c, -32 + i * 11, -64 + Math.abs(i - 2.5) * 2.4, 8, 4.5); c.fill(); }
    c.fillStyle = C('#463658');
    for (let i = 0; i < 5; i++) { const bx = -30 + i * 12; c.beginPath(); c.moveTo(bx - 5, -64); c.lineTo(bx - 2, -80 - (i % 2) * 5); c.lineTo(bx + 5, -64); c.closePath(); c.fill(); }
    // neck + head
    c.fillStyle = C('#2a2034');
    c.beginPath(); c.moveTo(24, -58); c.quadraticCurveTo(40, -72, 50, -68 + (sleep ? 26 : 0)); c.lineTo(62, -54 + (sleep ? 26 : 0)); c.quadraticCurveTo(56, -44 + (sleep ? 20 : 0), 44, -46 + (sleep ? 18 : 0)); c.quadraticCurveTo(34, -36, 26, -34); c.closePath(); c.fill();
    const hy = sleep ? 26 : 0;
    c.fillStyle = C('#efe6d0'); c.beginPath(); c.moveTo(60, -55 + hy); c.lineTo(66, -50 + hy); c.lineTo(58, -49 + hy); c.closePath(); c.fill();
    if (sleep) { c.strokeStyle = C('#8a7a9a'); c.lineWidth = 2; c.beginPath(); c.moveTo(47, -58 + hy); c.lineTo(54, -57 + hy); c.stroke(); }
    else { c.fillStyle = C(eyeCol); ell(c, 51, -59, 3.4, 2.6, 0.3); c.fill(); }
    // antlers of root, with the lantern hung between
    c.strokeStyle = C('#5a4670'); c.lineWidth = 4;
    const ax = 44, ay = -66 + hy;
    c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(ax - 4, ay - 26, ax - 22, ay - 40); c.moveTo(ax - 6, ay - 22); c.lineTo(ax + 8, ay - 38); c.moveTo(ax - 14, ay - 33); c.lineTo(ax - 8, ay - 50); c.stroke();
    c.beginPath(); c.moveTo(ax + 6, ay + 2); c.quadraticCurveTo(ax + 16, ay - 22, ax + 8, ay - 44); c.moveTo(ax + 13, ay - 18); c.lineTo(ax + 26, ay - 30); c.moveTo(ax + 12, ay - 32); c.lineTo(ax + 22, ay - 46); c.stroke();
    const sw = Math.sin(this.t * 2.2) * 3, lx = ax + 2 + sw, ly = ay - 24;
    c.strokeStyle = C('#3a2e48'); c.lineWidth = 1.5; c.beginPath(); c.moveTo(ax - 2, ay - 34); c.lineTo(lx, ly); c.stroke();
    c.fillStyle = sleep ? 'rgba(160,170,220,0.3)' : rgba(eyeCol, 0.5); ell(c, lx, ly + 7, 6, 8); c.fill();
    c.strokeStyle = C('#3a2e48'); c.lineWidth = 1.5; ell(c, lx, ly + 7, 6, 8); c.stroke();
    if (!sleep && !dying) drawFlame(c, lx, ly + 12, st === 'volley' ? 13 : 8, eyeCol, this.t);
    c.restore();
    if (!sleep) {
      const wx = x + this.facing * 46, wy = y - 84 + crouch;
      addLight(wx, wy, st === 'volley' || st === 'roar2' ? 190 : 130, eyeCol, 0.34, 0.9);
      addLight(x + this.facing * 51, y - 59 + crouch, 60, eyeCol, 0.24, 0.4);
    } else if (Math.random() < 0.02) spawnP({ x: x + this.facing * 60, y: y - 34, vy: -20, life: 1.2, size: 2, color: '#b8c8ff', wob: 20 });
    if (st === 'stun') for (let i = 0; i < 3; i++) { const a = this.t * 5 + i * TAU / 3; drawGlow(c, x + this.facing * 48 + Math.cos(a) * 16, y - 96 + Math.sin(a) * 4, 7, '#ffe08a', 0.9); }
  }
}
BOSSES.warden = Warden;
