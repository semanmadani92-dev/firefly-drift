// Creatures of the Emberworks, and the Hammerwright who still tends the forge.
import { G } from './state.js';
import { T } from './config.js';
import { solidAt, standableAt } from './physics.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell, rrect } from './gfx.js';
import { Sound } from './audio.js';
import { rand, approach, sign, clamp, TAU, rgba, pick, overlap } from './util.js';
import { Entity, Shot } from './entities.js';
import { Enemy, regEnemy } from './enemies.js';
import { Boss, BOSSES, Shockwave } from './bosses.js';
import { HAZ } from './terrain.js';

const EMB = '#ffae5a';

// ---------------------------------------------------------------- Cinderling (a quick little runner)
class Cinderling extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 20, 18, { kind: 'cinderling', hp: 20, motes: 3, uid, eye: EMB });
    this.facing = Math.random() < 0.5 ? -1 : 1; this.run = 0;
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player, dx = p.cx - this.cx;
    const chase = Math.abs(dx) < 230 && Math.abs((p.y + p.h) - (this.y + this.h)) < 50 && p.state !== 'dead';
    if (this.onGround) {
      if (chase && sign(dx) !== this.facing && this.st > 0.35) { this.facing = sign(dx) || 1; this.st = 0; }
      if (this.wallAhead() || this.edgeAhead()) { this.facing *= -1; this.st = 0; }
      this.vx = this.facing * (chase ? 210 : 120);
    }
    this.run += dt * 22;
    this.physics(dt);
    if (this.hitL) this.facing = 1; else if (this.hitR) this.facing = -1;
    if (Math.random() < 0.3) spawnP({ x: this.cx - this.facing * 8, y: this.y + 6, vy: -rand(20, 60), life: 0.35, size: 2, color: EMB });
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k);
    c.save(); c.translate(x, y); c.scale(this.facing, 1);
    c.strokeStyle = C('#2a1410'); c.lineWidth = 2.6; c.lineCap = 'round';
    const a = Math.sin(this.run) * 4;
    c.beginPath(); c.moveTo(-4, -5); c.lineTo(-4 + a, 0); c.moveTo(4, -5); c.lineTo(4 - a, 0); c.stroke();
    c.fillStyle = C('#3a1c14'); ell(c, 0, -10, 10, 8); c.fill();
    c.fillStyle = C('#ff7a3a');
    c.beginPath(); c.moveTo(-7, -14); c.quadraticCurveTo(-4, -26 + Math.sin(this.t * 14) * 2, 0, -15); c.quadraticCurveTo(3, -24 + Math.cos(this.t * 12) * 2, 7, -14); c.closePath(); c.fill();
    c.fillStyle = C('#fff1c4'); ell(c, 4, -10, 2, 2.6); c.fill();
    c.restore();
    addLight(x, y - 12, 54, EMB, 0.26, 0.5);
  }
}
regEnemy('cinderling', Cinderling);

// ---------------------------------------------------------------- Bellowsback (breathes a long tongue of flame)
class Bellowsback extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 40, 34, { kind: 'bellowsback', hp: 60, motes: 12, uid, eye: '#ff6a3a', kb: 0.1 });
    this.state = 'idle'; this.turnT = 0; this.reach = 150;
  }
  breathBox() { return { x: this.facing > 0 ? this.x + this.w : this.x - this.reach, y: this.y + 4, w: this.reach, h: 26 }; }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player, dx = p.cx - this.cx, want = sign(dx) || this.facing;
    this.vx = 0;
    if (this.state === 'idle') {
      if (want !== this.facing) { this.turnT += dt; if (this.turnT > 0.5) { this.facing = want; this.turnT = 0; } } else this.turnT = 0;
      if (this.st > 0.9 && want === this.facing && Math.abs(dx) < 250 && Math.abs(p.cy - this.cy) < 70 && this.canSee(300)) { this.setState('inhale'); Sound.play('charge'); }
    } else if (this.state === 'inhale') {
      const mx = this.cx + this.facing * 22, my = this.y + 16;
      if (Math.random() < 0.7) spawnP({ x: mx + this.facing * rand(30, 90), y: my + rand(-20, 20), vx: -this.facing * rand(120, 240), life: 0.3, size: 2, color: EMB });
      if (this.st > 0.75) { this.setState('blow'); Sound.play('dash'); }
    } else if (this.state === 'blow') {
      if (overlap(p, this.breathBox())) p.hurt(1, this.cx);
      if (this.st > 1.25) this.setState('rest');
    } else if (this.st > 1.0) this.setState('idle');
    this.physics(dt);
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k), st = this.state;
    const swell = st === 'inhale' ? 1 + this.st * 0.22 : st === 'blow' ? 1.12 - this.st * 0.1 : 1 + Math.sin(this.t * 2) * 0.03;
    c.save(); c.translate(x, y); c.scale(this.facing, 1);
    c.fillStyle = C('#2a1a18'); c.fillRect(-16, -6, 9, 6); c.fillRect(6, -6, 9, 6);
    c.fillStyle = C('#4a2a22'); ell(c, -3, -19, 19 * swell, 15 * swell); c.fill();
    c.strokeStyle = C('#2a1410'); c.lineWidth = 2;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-3 + i * 9 * swell, -33 * swell); c.quadraticCurveTo(-3 + i * 13 * swell, -19, -3 + i * 9 * swell, -5); c.stroke(); }
    c.fillStyle = C('#3a2420'); c.beginPath(); c.moveTo(12, -26); c.lineTo(26, -22); c.lineTo(26, -13); c.lineTo(12, -10); c.closePath(); c.fill();
    c.fillStyle = C(st === 'inhale' || st === 'blow' ? '#ffe0b0' : '#ff6a3a'); ell(c, 25, -17.5, 2.6, 4); c.fill();
    c.fillStyle = C('#ffd98a'); ell(c, 6, -26, 2.2, 2.2); c.fill();
    c.restore();
    if (st === 'blow') {
      const b = this.breathBox(), ox = this.cx + this.facing * 26, oy = this.y + 17, k = Math.min(1, this.st / 0.12);
      c.save(); c.translate(ox, oy); c.scale(this.facing, 1); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const w = [15, 10, 5][i], L = (this.reach - i * 14) * k;
        c.fillStyle = ['rgba(255,90,40,0.5)', 'rgba(255,170,70,0.75)', 'rgba(255,245,210,0.9)'][i];
        c.beginPath(); c.moveTo(0, -4); c.quadraticCurveTo(L * 0.5, -w + Math.sin(this.t * 28 + i) * 2, L, 0); c.quadraticCurveTo(L * 0.5, w - Math.sin(this.t * 24 + i) * 2, 0, 4); c.closePath(); c.fill();
      }
      c.restore();
      addLight(b.x + b.w / 2, b.y + b.h / 2, 150, '#ff9440', 0.4, 0.9);
    }
    addLight(x + this.facing * 20, y - 18, st === 'inhale' ? 90 : 56, '#ff6a3a', 0.26, 0.5);
  }
}
regEnemy('bellowsback', Bellowsback);

// ---------------------------------------------------------------- Emberfly (hovers above you and drops slag)
class Emberfly extends Enemy {
  constructor(x, y, uid) {
    super(x, y - 6, 26, 18, { kind: 'emberfly', hp: 25, motes: 5, uid, eye: EMB, grav: false });
    this.avoidHazard = false; this.cd = rand(1.0, 2.0); this.ph = Math.random() * 6;
  }
  update(dt) {
    if (this.baseUpdate(dt)) return;
    const p = G.player, dx = p.cx - this.cx;
    const near = Math.abs(dx) < 330 && p.cy > this.cy - 20 && p.cy - this.cy < 330 && p.state !== 'dead';
    const tx = near ? clamp(p.cx, this.homeX - 260, this.homeX + 260) : this.homeX + Math.sin(this.t * 0.7 + this.ph) * 90;
    const ty = this.homeY + Math.sin(this.t * 2.3 + this.ph) * 8;
    this.vx = clamp((tx - this.cx) * 2.4, -160, 160); this.vy = clamp((ty - this.cy) * 2, -90, 90);
    if (Math.abs(this.vx) > 8) this.facing = sign(this.vx);
    this.cd -= dt;
    if (near && this.cd <= 0 && Math.abs(dx) < 46) {
      this.room.add(new Shot(this.cx, this.cy + 8, this.vx * 0.3, 40, { grav: 950, color: '#ff7a3a', life: 3 }));
      Sound.play('shoot'); this.cd = 1.7;
    }
    this.physics(dt);
  }
  draw(c) {
    const x = this.cx, y = this.cy, C = (k) => this.col(k), fl = Math.sin(this.t * 34) * 0.5 + 0.5;
    c.save(); c.translate(x, y); c.scale(this.facing, 1);
    c.fillStyle = rgba('#ffd9b0', 0.35 + fl * 0.25);
    ell(c, -3, -8, 9, 3.5 + fl * 2, -0.4); c.fill(); ell(c, 4, -8, 8, 3 + fl * 2, 0.4); c.fill();
    c.fillStyle = C('#3a1c14'); ell(c, 0, 0, 11, 7); c.fill();
    c.fillStyle = C(this.cd < 0.4 ? '#fff1c4' : '#ff7a3a'); ell(c, -4, 4, 5, 4); c.fill();
    c.fillStyle = C('#ffd98a'); ell(c, 7, -1, 2, 2.2); c.fill();
    c.restore();
    addLight(x, y + 4, 60, EMB, 0.26, 0.5);
  }
}
regEnemy('emberfly', Emberfly);

// ---------------------------------------------------------------- Tin Knight (slow, armoured, hits like a forge hammer)
class TinKnight extends Enemy {
  constructor(x, y, uid) {
    super(x, y, 34, 50, { kind: 'tinknight', hp: 110, motes: 22, uid, eye: '#ff9440', kb: 0.1 });
    this.state = 'walk'; this.walk = 0;
  }
  update(dt) {
    if (this.baseUpdate(dt) && this.state === 'walk') return;
    const p = G.player, dx = p.cx - this.cx, room = this.room;
    this.dmg = 1;
    if (this.state === 'walk') {
      const sees = Math.abs(dx) < 360 && Math.abs(p.cy - this.cy) < 110 && p.state !== 'dead';
      if (sees) {
        this.facing = sign(dx) || this.facing;
        this.vx = this.edgeAhead() || this.wallAhead() ? 0 : this.facing * 58;
        if (Math.abs(dx) < 92 && this.st > 0.5) { this.setState('wind'); Sound.play('charge'); }
      } else this.patrol(30);
      this.walk += dt * 5;
    } else if (this.state === 'wind') {
      this.vx = 0;
      if (this.st > 0.55) {
        this.setState('smash'); Sound.play('thud'); shake(6, 0.25);
        const hx = this.cx + this.facing * 46, gy = this.y + this.h;
        burst(hx, gy, 12, { color: [EMB, '#ffffff'], a0: Math.PI, a1: TAU, s0: 80, s1: 320, l0: 0.2, l1: 0.5, shape: 'spark' });
        const sw = new Shockwave(hx + this.facing * 10, gy, this.facing, 300); sw.life = 0.55; room.add(sw);
      }
    } else if (this.state === 'smash') {
      this.vx = 0;
      if (this.st < 0.14) { const hb = { x: this.facing > 0 ? this.cx : this.cx - 76, y: this.y - 6, w: 76, h: this.h + 6 }; if (overlap(p, hb)) p.hurt(2, this.cx); }
      if (this.st > 1.0) this.setState('walk');
    }
    this.physics(dt);
    if (this.state === 'walk') { if (this.hitL) this.facing = 1; else if (this.hitR) this.facing = -1; }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k), st = this.state;
    c.save(); c.translate(x, y); c.scale(this.facing, 1);
    c.strokeStyle = C('#2a1c1a'); c.lineWidth = 7; c.lineCap = 'round';
    const a = Math.sin(this.walk) * 4;
    c.beginPath(); c.moveTo(-7, -16); c.lineTo(-7 + a, -1); c.moveTo(7, -16); c.lineTo(7 - a, -1); c.stroke();
    c.fillStyle = C('#4a3430'); rrect(c, -14, -44, 28, 30, 7); c.fill();
    c.strokeStyle = C('#7a5648'); c.lineWidth = 1.6; rrect(c, -14, -44, 28, 30, 7); c.stroke();
    c.fillStyle = C('#ff9440'); c.fillRect(-6, -34, 12, 3); c.fillRect(-6, -28, 12, 3);
    c.fillStyle = C('#3a2622'); rrect(c, -10, -56, 20, 14, 5); c.fill();
    c.fillStyle = C('#ffd98a'); c.fillRect(0, -51, 9, 2.6);
    // hammer arm
    const ang = st === 'wind' ? -2.3 + this.st * 0.4 : st === 'smash' ? Math.min(0.9, -2.0 + this.st * 30) : -0.5 + Math.sin(this.walk) * 0.1;
    c.save(); c.translate(8, -38); c.rotate(ang);
    c.strokeStyle = C('#6a4a40'); c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(34, 0); c.stroke();
    c.fillStyle = C('#2a1c1a'); rrect(c, 28, -11, 16, 22, 3); c.fill();
    c.fillStyle = C('#ff9440'); c.fillRect(42, -7, 2.5, 14);
    c.restore();
    c.restore();
    addLight(x + this.facing * 4, y - 50, 60, '#ff9440', 0.22, 0.45);
  }
}
regEnemy('tinknight', TinKnight);

// ---------------------------------------------------------------- rolling cog (thrown by the Hammerwright)
class Cog extends Entity {
  constructor(x, y, dir, aL, aR) {
    super(x - 18, y - 36, 36, 36);
    this.type = 'hazard'; this.vx = dir * 330; this.aL = aL; this.aR = aR; this.bounces = 2; this.rot = 0; this.layer = 2;
  }
  update(dt) {
    this.t += dt;
    this.x += this.vx * dt; this.rot += this.vx * dt / 18;
    if ((this.x < this.aL && this.vx < 0) || (this.x + this.w > this.aR && this.vx > 0)) {
      if (this.bounces-- <= 0) { this.dead = true; burst(this.cx, this.cy, 14, { color: [EMB, '#ffffff'], shape: 'spark', s0: 80, s1: 320 }); Sound.play('break'); return; }
      this.vx = -this.vx; Sound.play('clang');
    }
    if (Math.random() < 0.5) spawnP({ x: this.cx, y: this.y + this.h, vx: -this.vx * 0.3 + rand(-30, 30), vy: -rand(40, 140), life: 0.3, size: 2, color: EMB, shape: 'spark' });
  }
  touch(p) { p.hurt(1, this.cx); }
  onSlash() { Sound.play('clang'); return true; }
  draw(c) {
    c.save(); c.translate(this.cx, this.cy); c.rotate(this.rot);
    c.fillStyle = '#4a3430';
    c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 14 : 20; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill();
    c.strokeStyle = HAZ; c.lineWidth = 1.8; c.stroke();
    c.fillStyle = '#1a1214'; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
    c.restore();
    addLight(this.cx, this.cy, 70, HAZ, 0.3, 0.6);
  }
}

// ---------------------------------------------------------------- The Hammerwright (boss)
class Hammerwright extends Boss {
  constructor(x, y, spec) {
    super(x, y, 92, 104, { kind: 'hammerwright', id: 'hammerwright', name: 'The Hammerwright', hp: 720, motes: 300, eye: '#ff9440', spec });
    this.dropThrough = true;
    const a = spec.arena || [6, 54];
    this.aL = a[0] * T; this.aR = a[1] * T;
    this.facing = spec.wakeDir > 0 ? -1 : 1; this.last = ''; this.idleT = 1; this.recT = 0.8; this.walk = 0; this.arm = -0.4;
  }
  pickAttack() {
    const p = G.player, d = Math.abs(p.cx - this.cx), p2 = this.phase === 2;
    const opts = d < 190 ? ['slam', 'slam', 'sweep', 'leap'] : ['leap', 'cog', 'cog', 'sweep'];
    if (p2) opts.push('leap');
    const a = pick(opts.filter((o) => o !== this.last)) || 'slam';
    this.last = a;
    this.facing = sign(p.cx - this.cx) || this.facing;
    this.setState(a + 'Tel');
    Sound.play(a === 'cog' ? 'warn' : 'charge');
  }
  update(dt) {
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.inv > 0) this.inv -= dt;
    const p = G.player, p2 = this.phase === 2, room = this.room, dx = p.cx - this.cx, gy = this.y + this.h;
    this.dmg = this.dmgBase;
    const sp = p2 ? 0.8 : 1; // telegraphs shorten in phase 2
    switch (this.state) {
      case 'sleep': if (this.shouldWake()) this.startFight(); break;
      case 'intro': this.vx = 0; if (this.st > 1.7) { this.setState('idle'); this.idleT = 0.6; } break;
      case 'idle':
        this.facing = sign(dx) || this.facing;
        this.vx = Math.abs(dx) > 120 ? this.facing * (p2 ? 96 : 70) : 0; this.walk += dt * 5;
        this.arm = approach(this.arm, -0.4, dt * 4);
        if (this.st > this.idleT) this.pickAttack();
        break;
      case 'slamTel':
        this.vx = 0; this.arm = approach(this.arm, -2.5, dt * 7);
        if (this.st > 0.6 * sp) {
          this.setState('slamHit'); this.arm = 0.9;
          const hx = clamp(this.cx + this.facing * 96, this.aL + 10, this.aR - 10);
          Sound.play('thud'); shake(13, 0.4);
          burst(hx, gy, 22, { color: [EMB, '#ffffff', HAZ], a0: Math.PI, a1: TAU, s0: 100, s1: 460, l0: 0.25, l1: 0.6, shape: 'spark' });
          ring(hx, gy, EMB, 10, 260, 0.35);
          room.add(new Shockwave(hx + 20, gy, 1, p2 ? 430 : 370)); room.add(new Shockwave(hx - 20, gy, -1, p2 ? 430 : 370));
          this.hitX = hx;
        }
        break;
      case 'slamHit':
        this.vx = 0;
        if (this.st < 0.12 && overlap(p, { x: this.hitX - 44, y: gy - 96, w: 88, h: 96 })) p.hurt(2, this.cx);
        if (this.st > (p2 ? 0.75 : 1.0)) { this.setState('idle'); this.idleT = p2 ? rand(0.3, 0.6) : rand(0.6, 1.0); }
        break;
      case 'sweepTel':
        this.vx = -this.facing * 30; this.arm = approach(this.arm, 2.4, dt * 8);
        if (this.st > 0.5 * sp) { this.setState('sweep'); Sound.play('dash'); }
        break;
      case 'sweep':
        this.dmg = 2; this.vx = this.facing * (p2 ? 700 : 600); this.arm = approach(this.arm, 0.2, dt * 6);
        if (overlap(p, { x: this.facing > 0 ? this.x + this.w : this.x - 70, y: gy - 44, w: 70, h: 44 })) p.hurt(2, this.cx);
        spawnP({ x: this.cx + this.facing * 70, y: gy - 6, vx: -this.facing * rand(40, 160), vy: -rand(20, 120), life: 0.3, size: 2.6, color: EMB, shape: 'spark' });
        if (this.st > 0.5) { this.setState('recover'); this.recT = p2 ? 0.7 : 0.95; }
        break;
      case 'leapTel':
        this.vx = 0;
        if (this.st > 0.5 * sp) {
          const tx = clamp(p.cx + p.vx * 0.3, this.aL + 70, this.aR - 70), air = 0.9;
          this.vx = clamp((tx - this.cx) / air, -640, 640); this.vy = -900; this.onGround = false;
          this.setState('leap'); Sound.play('jump');
        }
        break;
      case 'leap': this.dmg = 2; break;
      case 'cogTel':
        this.vx = 0; this.arm = approach(this.arm, -1.6, dt * 6);
        if (this.st > 0.5 * sp) {
          room.add(new Cog(this.cx + this.facing * 60, gy, this.facing, this.aL, this.aR));
          Sound.play('shoot'); this.arm = 0.6;
          this.setState('recover'); this.recT = p2 ? 0.6 : 0.9;
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 1600 * dt);
        if (this.st > this.recT) { this.setState('idle'); this.idleT = p2 ? rand(0.3, 0.6) : rand(0.6, 1.0); }
        break;
      case 'roar2':
        this.vx = 0; this.inv = 0.2;
        if (this.st > 1.4) { this.setState('idle'); this.idleT = 0.4; }
        break;
      case 'dying': this.updateDying(dt); break;
      default: break;
    }
    if (this.state === 'dying') { this.vy = Math.min(this.vy + 2000 * dt, 900); this.physics(dt); return; }
    this.physics(dt);
    if (this.x < this.aL) { this.x = this.aL; this.hitL = true; }
    if (this.x + this.w > this.aR) { this.x = this.aR - this.w; this.hitR = true; }
    if (this.state === 'leap' && this.onGround && this.st > 0.12) {
      Sound.play('thud'); shake(14, 0.45);
      const g2 = this.y + this.h;
      burst(this.cx, g2, 22, { color: [EMB, '#ffffff'], a0: Math.PI, a1: TAU, s0: 80, s1: 420, l0: 0.25, l1: 0.6 });
      room.add(new Shockwave(this.x + this.w + 4, g2, 1, p2 ? 430 : 370)); room.add(new Shockwave(this.x - 4, g2, -1, p2 ? 430 : 370));
      const n = p2 ? 5 : 3; // slag shaken loose from the roof
      for (let i = 0; i < n; i++) room.add(new Shot(clamp(p.cx + rand(-220, 220), this.aL + 30, this.aR - 30), 3 * T + rand(0, 20), 0, 30, { grav: 720, color: '#ff7a3a', life: 3 }));
      this.vx = 0; this.setState('recover'); this.recT = p2 ? 0.65 : 0.9;
    }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5 && (this.state === 'idle' || this.state === 'recover' || this.state === 'slamHit')) {
      this.phase = 2; this.setState('roar2'); this.eye = '#ffd98a';
      Sound.play('roar'); shake(13, 1.1);
      ring(this.cx, this.cy, EMB, 20, 560, 0.7);
      G.ui.toast('The forge wakes beneath the floor.');
    }
  }
  draw(c) {
    const x = this.cx, y = this.y + this.h, C = (k) => this.col(k), st = this.state, sleep = st === 'sleep', dying = st === 'dying';
    const shk = st === 'roar2' || st === 'intro' || dying ? rand(-2.5, 2.5) : 0;
    const crouch = sleep ? 14 : st === 'leapTel' ? 10 : st === 'slamHit' ? 6 : 0;
    const hot = this.phase === 2 ? '#ffd98a' : '#ff9440';
    c.save();
    if (dying) c.globalAlpha = clamp(1 - (this.st - 1.4), 0.15, 1);
    c.translate(x + shk, y); c.scale(this.facing, 1);
    // legs
    c.strokeStyle = C('#2a1c1a'); c.lineWidth = 15; c.lineCap = 'round';
    const a = st === 'idle' ? Math.sin(this.walk) * 7 : 0;
    c.beginPath(); c.moveTo(-18, -34 + crouch); c.lineTo(-20 + a, -4); c.moveTo(18, -34 + crouch); c.lineTo(20 - a, -4); c.stroke();
    c.translate(0, crouch);
    // furnace body
    c.fillStyle = C('#3a2622'); rrect(c, -38, -92, 76, 62, 16); c.fill();
    c.strokeStyle = C('#7a5648'); c.lineWidth = 2; rrect(c, -38, -92, 76, 62, 16); c.stroke();
    c.fillStyle = sleep ? '#2a1410' : hot; rrect(c, -20, -74, 40, 28, 6); c.fill();
    c.fillStyle = C('#3a2622'); for (let i = 0; i < 4; i++) c.fillRect(-18 + i * 10, -74, 4, 28);
    c.fillStyle = C('#4a3430'); for (const sx of [-34, 30]) { c.beginPath(); c.arc(sx + 2, -84, 4, 0, TAU); c.fill(); }
    // anvil head
    c.fillStyle = C('#2a1c1a');
    c.beginPath(); c.moveTo(-26, -92); c.lineTo(-30, -108); c.lineTo(34, -108); c.lineTo(46, -100); c.lineTo(22, -98); c.lineTo(18, -92); c.closePath(); c.fill();
    if (!sleep) { c.fillStyle = C(hot); c.fillRect(8, -105, 16, 3.5); }
    // chimney
    c.fillStyle = C('#2a1c1a'); c.fillRect(-22, -122, 12, 16);
    // hammer arm
    c.save(); c.translate(26, -80); c.rotate(this.arm);
    c.strokeStyle = C('#6a4a40'); c.lineWidth = 8; c.beginPath(); c.moveTo(0, 0); c.lineTo(62, 0); c.stroke();
    c.fillStyle = C('#2a1c1a'); rrect(c, 52, -22, 30, 44, 5); c.fill();
    c.strokeStyle = C('#7a5648'); c.lineWidth = 2; rrect(c, 52, -22, 30, 44, 5); c.stroke();
    c.fillStyle = C(hot); c.fillRect(79, -16, 3, 32);
    c.restore();
    // off arm
    c.strokeStyle = C('#4a3430'); c.lineWidth = 8; c.beginPath(); c.moveTo(-30, -78); c.lineTo(-44, -52); c.stroke();
    c.restore();
    if (!sleep) {
      addLight(x, y - 60 + crouch, 150, hot, 0.36, 0.95);
      if (!dying && Math.random() < 0.4) spawnP({ x: x - this.facing * 16 + rand(-4, 4), y: y - 122 + crouch, vy: -rand(40, 110), vx: rand(-20, 20), life: rand(0.5, 1.1), size: 5, color: '#2a2024', shape: 'smoke' });
    }
    if (st === 'slamTel') { const hx = clamp(x + this.facing * 96, this.aL + 10, this.aR - 10); c.fillStyle = rgba(HAZ, 0.4 + Math.abs(Math.sin(this.t * 24)) * 0.5); c.fillRect(hx - 44, y - 3, 88, 3); drawGlow(c, hx, y, 40, HAZ, 0.45); }
    if (st === 'sweepTel') { c.fillStyle = rgba(HAZ, 0.3 + Math.abs(Math.sin(this.t * 24)) * 0.4); c.fillRect(this.facing > 0 ? x : x - 330, y - 3, 330, 3); }
  }
}
BOSSES.hammerwright = Hammerwright;
