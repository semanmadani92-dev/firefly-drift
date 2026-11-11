// Creatures of Starwell, and the Echo that waits in the Mirror Pool.
import { G } from './state.js';
import { T } from './config.js';
import { register } from './world.js';
import { solidAt, standableAt } from './physics.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell, rrect } from './gfx.js';
import { Sound } from './audio.js';
import { rand, approach, sign, clamp, TAU, rgba, pick, overlap } from './util.js';
import { Entity, Shot, drawFlame } from './entities.js';
import { Enemy, regEnemy } from './enemies.js';
import { Boss, BOSSES, Shockwave } from './bosses.js';
import { HAZ } from './terrain.js';

const ICE = '#c0f4ff', ROSE = '#ff9ae0', PALE = '#c9c2ff';

// ---------------------------------------------------------------- Prismite (curls into a spiked ball when struck)
class Prismite extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 28, 20, { kind: 'prismite', hp: 40, motes: 6, uid, eye: ICE, kb: 0.6 });
    this.state = 'walk'; this.facing = Math.random() < 0.5 ? -1 : 1; this.walk = 0; this.rot = 0;
  }
  hurt(dmg, dx, src) {
    if (this.state === 'ball') { Sound.play('clang'); burst(this.cx, this.cy, 6, { color: [ICE, '#ffffff'], shape: 'spark', s0: 80, s1: 260 }); return true; }
    const r = super.hurt(dmg, dx, src);
    if (r && !this.dead) { this.setState('ball'); this.stun = 0; }
    return r;
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player;
    if (this.state === 'ball') {
      const d = sign(p.cx - this.cx) || this.facing;
      if (this.onGround && !this.edgeAhead(d) && !this.wallAhead(d)) this.vx = approach(this.vx, d * 190, 700 * dt); else this.vx = approach(this.vx, 0, 900 * dt);
      this.rot += this.vx * dt / 10;
      if (this.st > 1.1) { this.setState('walk'); this.facing = d; }
    } else { this.patrol(50); this.walk += dt * 7; }
    this.physics(dt);
    if (this.state === 'walk') { if (this.hitL) this.facing = 1; else if (this.hitR) this.facing = -1; }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k);
    c.save(); c.translate(x, y);
    if (this.state === 'ball') {
      c.translate(0, -11); c.rotate(this.rot);
      c.fillStyle = C('#3a4a8a');
      c.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = i % 2 ? 9 : 15; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill();
      c.strokeStyle = HAZ; c.lineWidth = 1.5; c.stroke();
    } else {
      c.scale(this.facing, 1);
      c.strokeStyle = C('#1a2250'); c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const lx = -8 + i * 8, a = Math.sin(this.walk + i * 2) * 3; c.beginPath(); c.moveTo(lx, -5); c.lineTo(lx + a, 0); c.stroke(); }
      c.fillStyle = C('#2a3670'); c.beginPath(); c.moveTo(-14, -3); c.lineTo(-10, -14); c.lineTo(10, -14); c.lineTo(14, -3); c.closePath(); c.fill();
      for (let i = 0; i < 3; i++) { c.fillStyle = C(i === 1 ? ICE : ROSE); const bx = -8 + i * 8; c.beginPath(); c.moveTo(bx - 4, -13); c.lineTo(bx + (i - 1) * 3, -26 + Math.abs(i - 1) * 5); c.lineTo(bx + 4, -13); c.closePath(); c.fill(); }
      c.fillStyle = C('#ffffff'); ell(c, 11, -8, 1.8, 1.8); c.fill();
    }
    c.restore();
    addLight(x, y - 14, 56, this.state === 'ball' ? HAZ : ICE, 0.26, 0.5);
  }
}
regEnemy('prismite', Prismite);

// ---------------------------------------------------------------- Orbiter (a core ringed by cutting shards)
class Orbiter extends Enemy {
  constructor(x, y, uid) {
    super(x, y - 6, 20, 20, { kind: 'orbiter', hp: 30, motes: 7, uid, eye: ROSE, grav: false, kb: 0.7 });
    this.avoidHazard = false; this.ang = Math.random() * 6; this.R = 36;
  }
  update(dt) {
    this.ang += dt * 3.2;
    if (this.baseUpdate(dt)) return;
    const p = G.player, dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
    if (d < 420 && p.state !== 'dead') { this.vx = approach(this.vx, dx / d * 64, 200 * dt); this.vy = approach(this.vy, dy / d * 64, 200 * dt); }
    else { this.vx = approach(this.vx, (this.homeX - this.cx) * 0.8, 120 * dt); this.vy = approach(this.vy, (this.homeY - this.cy) * 0.8, 120 * dt); }
    this.physics(dt);
    for (let i = 0; i < 3; i++) { // the shards cut
      const a = this.ang + i * TAU / 3, sx = this.cx + Math.cos(a) * this.R, sy = this.cy + Math.sin(a) * this.R;
      if (Math.abs(sx - p.cx) < 15 && Math.abs(sy - p.cy) < 24) { p.hurt(1, sx); break; }
    }
  }
  draw(c) {
    const x = this.cx, y = this.cy, C = (k) => this.col(k);
    c.strokeStyle = rgba(ROSE, 0.14); c.lineWidth = 1; c.beginPath(); c.arc(x, y, this.R, 0, TAU); c.stroke();
    for (let i = 0; i < 3; i++) {
      const a = this.ang + i * TAU / 3, sx = x + Math.cos(a) * this.R, sy = y + Math.sin(a) * this.R;
      c.save(); c.translate(sx, sy); c.rotate(a + Math.PI / 2);
      c.fillStyle = C('#ffd0f0'); c.beginPath(); c.moveTo(0, -9); c.lineTo(4, 0); c.lineTo(0, 9); c.lineTo(-4, 0); c.closePath(); c.fill();
      c.strokeStyle = HAZ; c.lineWidth = 1.2; c.stroke();
      c.restore();
      drawGlow(c, sx, sy, 10, HAZ, 0.5);
    }
    c.fillStyle = C('#3a2a6a'); ell(c, x, y, 10, 10); c.fill();
    c.fillStyle = C(ROSE); ell(c, x, y, 5, 5); c.fill();
    c.fillStyle = '#1a1030'; ell(c, x + sign(G.player.cx - x) * 1.5, y, 1.8, 2.4); c.fill();
    addLight(x, y, 70, ROSE, 0.26, 0.5);
  }
}
regEnemy('orbiter', Orbiter);

// ---------------------------------------------------------------- Hush Wisp (drifts through walls; only solid some of the time)
class Wisp extends Enemy {
  constructor(x, y, uid) {
    super(x, y - 6, 22, 22, { kind: 'wisp', hp: 20, motes: 5, uid, eye: PALE, grav: false, kb: 1 });
    this.state = 'fade'; this.st = Math.random() * 2; this.alpha = 0.25; this.dmg = 0;
  }
  hurt(dmg, dx, src) { if (this.state === 'fade') return false; return super.hurt(dmg, dx, src); }
  update(dt) {
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.stun > 0) { this.stun -= dt; this.x += this.vx * dt; this.vx = approach(this.vx, 0, 700 * dt); return; }
    const p = G.player, dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
    const solid = this.state === 'solid';
    const sp = d < 460 && p.state !== 'dead' ? (solid ? 104 : 72) : 0;
    this.x += dx / d * sp * dt; this.y += dy / d * sp * dt + Math.sin(this.t * 3) * 10 * dt;
    this.alpha = approach(this.alpha, solid ? 1 : 0.22, dt * 3);
    this.dmg = solid && this.alpha > 0.8 ? 1 : 0;
    if (!solid && this.st > 2.2) { this.setState('solid'); Sound.play('warn'); }
    else if (solid && this.st > 2.5) this.setState('fade');
  }
  draw(c) {
    const x = this.cx, y = this.cy, C = (k) => this.col(k);
    c.save(); c.globalAlpha = this.alpha;
    c.fillStyle = C('#3a3470');
    c.beginPath(); c.moveTo(x - 11, y + 4); c.quadraticCurveTo(x - 12, y - 13, x, y - 13); c.quadraticCurveTo(x + 12, y - 13, x + 11, y + 4);
    for (let i = 0; i < 4; i++) c.quadraticCurveTo(x + 8 - i * 5.5 - 1.5, y + 12 + Math.sin(this.t * 6 + i) * 3, x + 5.5 - i * 5.5, y + 4);
    c.closePath(); c.fill();
    c.fillStyle = C('#ffffff'); ell(c, x - 4, y - 3, 2.2, 3.2); c.fill(); ell(c, x + 4, y - 3, 2.2, 3.2); c.fill();
    c.restore();
    addLight(x, y, 60, PALE, 0.24 * this.alpha, 0.5 * this.alpha);
  }
}
regEnemy('wisp', Wisp);

// ---------------------------------------------------------------- Dripstone (falls when you walk beneath it)
class Drip extends Entity {
  constructor(x, y) {
    super(x - 9, y - T, 18, 30);
    this.type = 'drip'; this.state = 'hang'; this.layer = 2; this.vy = 0; this.sx = x;
  }
  update(dt) {
    this.t += dt;
    const p = G.player;
    if (this.state === 'hang') {
      if (p && p.state !== 'dead' && Math.abs(p.cx - this.cx) < 30 && p.cy > this.y && p.cy - this.y < 330) { this.state = 'shake'; this.t = 0; Sound.play('crack'); }
    } else if (this.state === 'shake') {
      if (this.t > 0.36) this.state = 'fall';
    } else {
      this.vy = Math.min(this.vy + 1500 * dt, 900);
      this.y += this.vy * dt;
      if (solidAt(this.room, this.cx, this.y + this.h) || this.y > this.room.pxH) this.shatter();
    }
  }
  shatter() {
    if (this.dead) return;
    this.dead = true; Sound.play('break');
    burst(this.cx, this.y + this.h, 10, { color: [ICE, ROSE, '#ffffff'], shape: 'shard', a0: Math.PI, a1: TAU, s0: 60, s1: 260, grav: 800, z0: 2, z1: 5, vr: 8, l0: 0.3, l1: 0.7 });
  }
  touch(p) { if (this.state === 'fall') { if (p.hurt(1, this.cx)) this.shatter(); } }
  onSlash() { this.shatter(); return true; }
  draw(c) {
    const x = this.cx + (this.state === 'shake' ? rand(-1.5, 1.5) : 0), y = this.y;
    c.fillStyle = '#8fd8f0'; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x, y + 30); c.lineTo(x + 8, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x, y + 30); c.lineTo(x + 1, y); c.closePath(); c.fill();
    if (this.state !== 'hang') { c.strokeStyle = HAZ; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x, y + 30); c.lineTo(x + 8, y); c.stroke(); }
    addLight(x, y + 14, 44, this.state === 'hang' ? ICE : HAZ, 0.22, 0.4);
  }
}
register('drip', (room, spec, x, y) => new Drip(x, y));

// ---------------------------------------------------------------- Crystal Lancer (a long, fast charge)
class Lancer extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 26, 48, { kind: 'lancer', hp: 120, motes: 24, uid, eye: ICE, kb: 0.1 });
    this.state = 'stand'; this.cd = 0.8;
  }
  update(dt) {
    if (this.baseUpdate(dt) && this.state === 'stand') return;
    const p = G.player, dx = p.cx - this.cx;
    this.dmg = 1;
    if (this.state === 'stand') {
      this.vx = approach(this.vx, 0, 1400 * dt);
      this.facing = sign(dx) || this.facing;
      this.cd -= dt;
      if (this.cd <= 0 && p.state !== 'dead' && Math.abs(dx) < 440 && Math.abs((p.y + p.h) - (this.y + this.h)) < 70 && this.canSee(460)) { this.setState('aim'); Sound.play('warn'); }
    } else if (this.state === 'aim') {
      this.vx = -this.facing * 16;
      if (this.st > 0.5) { this.setState('dash'); Sound.play('dash'); }
    } else if (this.state === 'dash') {
      this.dmg = 2; this.vx = this.facing * 640;
      spawnP({ x: this.cx - this.facing * 10, y: this.cy + rand(-16, 16), life: 0.25, size: 3, color: ICE, vx: -this.facing * 60 });
      if (overlap(p, { x: this.facing > 0 ? this.x + this.w : this.x - 34, y: this.y + 12, w: 34, h: 18 })) p.hurt(2, this.cx);
      if (this.edgeAhead()) { this.vx = 0; this.setState('skid'); }
      if (this.st > 0.62) this.setState('skid');
    } else { // skid: open to attack
      this.vx = approach(this.vx, 0, 1500 * dt);
      if (this.st > 0.75) { this.setState('stand'); this.cd = 0.5; }
    }
    this.physics(dt);
    if (this.state === 'dash' && (this.hitL || this.hitR)) { this.setState('skid'); Sound.play('clang'); shake(5, 0.2); }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k), st = this.state;
    c.save(); c.translate(x, y); c.scale(this.facing, 1);
    if (st === 'dash') c.rotate(0.18); else if (st === 'aim') c.rotate(-0.08);
    c.strokeStyle = C('#1a2250'); c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-5, -16); c.lineTo(-6, -1); c.moveTo(5, -16); c.lineTo(7, -1); c.stroke();
    c.fillStyle = C('#2a3670'); c.beginPath(); c.moveTo(-11, -14); c.lineTo(-8, -40); c.lineTo(8, -40); c.lineTo(11, -14); c.closePath(); c.fill();
    c.strokeStyle = C('#6f8fdc'); c.lineWidth = 1.5; c.stroke();
    c.fillStyle = C('#1a2250'); c.beginPath(); c.moveTo(-8, -40); c.lineTo(0, -54); c.lineTo(8, -40); c.closePath(); c.fill();
    c.fillStyle = C(st === 'aim' || st === 'dash' ? '#ffffff' : ICE); c.fillRect(0, -45, 6, 2.4);
    // lance
    const ly = st === 'stand' || st === 'skid' ? -30 : -24, la = st === 'stand' ? -0.7 : st === 'skid' ? 0.3 : 0;
    c.save(); c.translate(6, ly); c.rotate(la);
    c.fillStyle = C('#d8f4ff'); c.beginPath(); c.moveTo(-10, -3); c.lineTo(46, 0); c.lineTo(-10, 3); c.closePath(); c.fill();
    c.strokeStyle = C(HAZ); c.lineWidth = 1; if (st === 'aim' || st === 'dash') c.stroke();
    c.restore();
    c.restore();
    addLight(x + this.facing * 20, y - 28, st === 'aim' || st === 'dash' ? 96 : 60, ICE, 0.26, 0.5);
  }
}
regEnemy('lancer', Lancer);

// ---------------------------------------------------------------- The Echo (boss): Starwell's memory of you
class EchoShot extends Shot {
  constructor(x, y, dir) { super(x, y, dir * 560, 0, { color: PALE, life: 2 }); }
}

class Echo extends Boss {
  constructor(x, y, spec) {
    super(x, y, 22, 42, { kind: 'echo', id: 'echo', name: 'The Echo', hp: 640, motes: 380, eye: PALE, spec });
    this.dropThrough = true;
    const a = spec.arena || [6, 54];
    this.aL = a[0] * T; this.aR = a[1] * T;
    this.facing = spec.wakeDir > 0 ? -1 : 1; this.last = ''; this.idleT = 0.8; this.recT = 0.5; this.n = 0; this.run = 0; this.swing = 0; this.alpha = 1;
    this.ribbon = []; for (let i = 0; i < 7; i++) this.ribbon.push({ x, y: y - 30 });
    this.groundY = y;
  }
  pickAttack() {
    const p = G.player, d = Math.abs(p.cx - this.cx), p2 = this.phase === 2;
    const opts = d < 150 ? ['slash', 'slash', 'dash', 'meteor'] : ['dash', 'shots', 'shots', 'meteor', 'slash'];
    const a = pick(opts.filter((o) => o !== this.last)) || 'dash';
    this.last = a; this.n = 0;
    this.facing = sign(p.cx - this.cx) || this.facing;
    if (a === 'dash') this.n = p2 ? 2 : 1;
    this.setState(a + 'Tel');
    Sound.play('warn');
  }
  strike() { // one cut of the triple combo
    const p = G.player;
    this.swing++;
    Sound.play('slash');
    const hb = { x: this.facing > 0 ? this.cx : this.cx - 74, y: this.y - 8, w: 74, h: 54 };
    if (overlap(p, hb)) p.hurt(1, this.cx);
    this.vx = this.facing * 300;
    this.slashT = 0.18;
  }
  update(dt) {
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.slashT > 0) this.slashT -= dt;
    const p = G.player, p2 = this.phase === 2, room = this.room, dx = p.cx - this.cx;
    this.dmg = this.dmgBase; this.alpha = approach(this.alpha, 1, dt * 5);
    let grav = true;
    switch (this.state) {
      case 'sleep': this.vx = 0; if (this.shouldWake()) this.startFight(); break;
      case 'intro': this.vx = 0; if (this.st > 1.7) { this.setState('idle'); this.idleT = 0.5; } break;
      case 'idle': {
        this.facing = sign(dx) || this.facing;
        const want = Math.abs(dx) > 190 ? this.facing : Math.abs(dx) < 110 ? -this.facing : 0;
        this.vx = want * 200; this.run += dt * 16;
        if (this.st > this.idleT) this.pickAttack();
        break;
      }
      case 'slashTel':
        this.vx = this.facing * (Math.abs(dx) > 70 ? 420 : 0);
        if (this.st > (p2 ? 0.24 : 0.32)) { this.setState('slash'); this.n = 0; }
        break;
      case 'slash':
        this.vx = approach(this.vx, 0, 2200 * dt);
        if (this.n < 3 && this.st > this.n * (p2 ? 0.2 : 0.25)) { if (this.n > 0) this.facing = sign(dx) || this.facing; this.strike(); this.n++; }
        if (this.st > (p2 ? 0.95 : 1.2)) { this.setState('idle'); this.idleT = p2 ? rand(0.2, 0.45) : rand(0.5, 0.9); }
        break;
      case 'dashTel':
        this.vx = -this.facing * 40;
        if (this.st > (p2 ? 0.26 : 0.36)) { this.setState('dash'); Sound.play('dash'); ring(this.cx, this.cy, PALE, 6, 110, 0.25); }
        break;
      case 'dash':
        grav = false; this.vy = 0; this.vx = this.facing * 900; this.alpha = 0.55;
        spawnP({ x: this.cx - this.facing * 6, y: this.cy + rand(-12, 12), life: 0.3, size: 3.4, color: PALE, vx: -this.facing * 60 });
        if (p2 && Math.random() < 0.16) room.add(new Shot(this.cx, this.y - 10, 0, -260, { grav: 900, color: ROSE, life: 3 }));
        if (this.st > 0.36) {
          this.vx = 0;
          if (--this.n > 0) { this.facing = sign(p.cx - this.cx) || -this.facing; this.setState('dashTel'); Sound.play('warn'); }
          else { this.setState('recover'); this.recT = p2 ? 0.4 : 0.6; }
        }
        break;
      case 'shotsTel':
        if (this.st < 0.02 && this.onGround) { this.vy = -420; this.vx = -this.facing * 260; }
        if (this.onGround) this.vx = approach(this.vx, 0, 1800 * dt);
        if (this.st > 0.5) { this.setState('shots'); this.n = 0; this.facing = sign(dx) || this.facing; }
        break;
      case 'shots': {
        this.vx = 0;
        const total = p2 ? 5 : 3, every = p2 ? 0.22 : 0.3;
        if (this.n < total && this.st > this.n * every) {
          const hy = this.n % 2 === 0 ? this.y + this.h - 12 : this.y + this.h - 58;
          room.add(new EchoShot(this.cx + this.facing * 16, hy, this.facing));
          Sound.play('spell'); this.n++;
        }
        if (this.st > total * every + 0.4) { this.setState('idle'); this.idleT = p2 ? rand(0.2, 0.45) : rand(0.5, 0.9); }
        break;
      }
      case 'meteorTel':
        this.vx = 0;
        if (this.st > 0.3) {
          const tx = clamp(p.cx + p.vx * 0.3, this.aL + 30, this.aR - 30);
          this.vy = -1000; this.vx = clamp((tx - this.cx) / 0.5, -700, 700); this.onGround = false;
          this.setState('rise'); Sound.play('djump');
        }
        break;
      case 'rise':
        if (this.vy > -80) { this.setState('hang'); this.vx = 0; }
        break;
      case 'hang':
        grav = false; this.vy = 0; this.vx = approach(this.vx, 0, 2000 * dt);
        if (this.st > (p2 ? 0.18 : 0.28)) { this.setState('plunge'); Sound.play('charge'); }
        break;
      case 'plunge':
        grav = false; this.dmg = 2; this.vx = 0; this.vy = 1150;
        spawnP({ x: this.cx + rand(-6, 6), y: this.y, life: 0.3, size: 3.5, color: PALE, vy: -120 });
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 2000 * dt);
        if (this.st > this.recT) { this.setState('idle'); this.idleT = p2 ? rand(0.2, 0.45) : rand(0.5, 0.9); }
        break;
      case 'roar2': this.vx = 0; this.inv = 0.2; if (this.st > 1.2) { this.setState('idle'); this.idleT = 0.3; } break;
      case 'dying': this.updateDying(dt); break;
      default: break;
    }
    if (this.state === 'dying') { this.vy = Math.min(this.vy + 2000 * dt, 900); this.vx = 0; this.physics(dt); this.updateRibbon(dt); return; }
    const g = this.grav; this.grav = grav;
    this.physics(dt);
    this.grav = g;
    if (this.x < this.aL) { this.x = this.aL; this.hitL = true; }
    if (this.x + this.w > this.aR) { this.x = this.aR - this.w; this.hitR = true; }
    if (this.state === 'plunge' && this.onGround) {
      Sound.play('slam'); shake(12, 0.4);
      const gy = this.y + this.h;
      burst(this.cx, gy, 22, { color: [PALE, ROSE, '#ffffff'], a0: Math.PI, a1: TAU, s0: 80, s1: 420, l0: 0.25, l1: 0.6, shape: 'spark' });
      ring(this.cx, gy, PALE, 10, 300, 0.4);
      room.add(new Shockwave(this.x + this.w + 4, gy, 1, p2 ? 450 : 390)); room.add(new Shockwave(this.x - 4, gy, -1, p2 ? 450 : 390));
      this.setState('recover'); this.recT = p2 ? 0.6 : 0.85;
    }
    if (this.state === 'dash' && (this.hitL || this.hitR)) this.st = 1;
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5 && (this.state === 'idle' || this.state === 'recover')) {
      this.phase = 2; this.setState('roar2'); this.eye = ROSE;
      Sound.play('roar'); shake(12, 1.0);
      ring(this.cx, this.cy, ROSE, 20, 520, 0.7);
    }
    this.updateRibbon(dt);
  }
  updateRibbon(dt) {
    let px = this.cx - this.facing * 2, py = this.y + 3;
    for (let i = 0; i < this.ribbon.length; i++) {
      const s = this.ribbon[i];
      s.y += 34 * dt; s.x -= this.facing * 18 * dt; s.x += Math.sin(G.now * 5 + i * 0.9) * 10 * dt;
      const ddx = s.x - px, ddy = s.y - py, d = Math.hypot(ddx, ddy) || 0.001;
      if (d > 5) { s.x = px + ddx / d * 5; s.y = py + ddy / d * 5; }
      px = s.x; py = s.y;
    }
  }
  draw(c) {
    const x = this.cx, fy = this.y + this.h, C = (k) => this.col(k), st = this.state, sleep = st === 'sleep';
    const col = this.phase === 2 ? ROSE : PALE;
    c.save();
    c.globalAlpha = st === 'dying' ? clamp(1 - (this.st - 1.4), 0.15, 1) : this.alpha;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = C('#ff6ad0'); c.lineWidth = 3;
    c.beginPath(); c.moveTo(x - this.facing * 2, this.y + 3); for (const s of this.ribbon) c.lineTo(s.x, s.y); c.stroke();
    const sx = st === 'dash' ? 1.35 : st === 'plunge' ? 0.8 : 1, sy = st === 'dash' ? 0.72 : st === 'plunge' ? 1.25 : 1;
    const run = st === 'idle' && Math.abs(this.vx) > 40;
    c.translate(x + (st === 'intro' || st === 'roar2' ? rand(-1.5, 1.5) : 0), fy); c.scale(this.facing * sx * 1.12, sy * 1.12);
    c.strokeStyle = C('#0a0816'); c.lineWidth = 3.2;
    const a = run ? Math.sin(this.run) * 5 : 0;
    c.beginPath(); c.moveTo(-3.5, -8); c.lineTo(-3.5 + a, -0.8); c.moveTo(3.5, -8); c.lineTo(3.5 - a, -0.8); c.stroke();
    c.fillStyle = C('#0a0816'); rrect(c, -7.5, -13, 15, 6, 2.5); c.fill();
    c.fillStyle = sleep ? 'rgba(60,56,110,0.9)' : C('#231c4e'); rrect(c, -8.5, -33, 17, 21, 6.5); c.fill();
    if (!sleep) drawFlame(c, 0, -15, 12, col, this.t, '#ffffff');
    c.strokeStyle = C(col); c.lineWidth = 1.4; rrect(c, -8.5, -33, 17, 21, 6.5); c.stroke();
    if (!sleep) { c.fillStyle = '#ffffff'; ell(c, 1.2, -25, 1.4, 2.4); c.fill(); ell(c, 5.6, -25, 1.4, 2.4); c.fill(); }
    c.fillStyle = C('#0a0816'); rrect(c, -7.5, -37, 15, 5.5, 2.5); c.fill();
    c.strokeStyle = C('#0a0816'); c.lineWidth = 2; c.beginPath(); c.arc(0, -38, 4, Math.PI, 0); c.stroke();
    if (st !== 'slash') { c.strokeStyle = C('#8a84c8'); c.lineWidth = 2; c.beginPath(); c.moveTo(7, -14); c.lineTo(15, -29); c.stroke(); c.fillStyle = C(col); ell(c, 15.6, -30.4, 2.4, 3, 0.5); c.fill(); }
    c.restore();
    if (this.slashT > 0) { // its blade leaves a pale crescent
      const k = 1 - this.slashT / 0.18, R = 54, ang = this.facing > 0 ? 0 : Math.PI, flip = this.swing % 2 ? -1 : 1;
      c.save(); c.translate(x + this.facing * 8, this.cy - 3); c.rotate(ang); c.scale(1, flip); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1 - k; c.fillStyle = col;
      c.beginPath(); c.arc(0, 0, R, -1.2, 1.2); c.arc(-R * 0.22, 0, R * 0.9, 1.08, -1.08, true); c.closePath(); c.fill();
      c.restore();
    }
    if (st === 'dashTel') { c.fillStyle = rgba(HAZ, 0.3 + Math.abs(Math.sin(this.t * 26)) * 0.4); c.fillRect(this.facing > 0 ? x : x - 340, fy - 22, 340, 2.5); }
    if (st === 'hang' || st === 'rise') { c.fillStyle = rgba(HAZ, 0.4 + Math.abs(Math.sin(this.t * 26)) * 0.4); c.fillRect(x - 20, this.groundY - 3, 40, 3); }
    if (!sleep) addLight(x, this.cy - 4, 150, col, 0.3 * this.alpha, 0.9 * this.alpha);
  }
}
BOSSES.echo = Echo;
