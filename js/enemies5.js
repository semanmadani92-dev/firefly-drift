// The Hollow Moon: the Hush, wearing the fallen Moon like a coat. The last fight.
import { G } from './state.js';
import { T } from './config.js';
import { register, REG } from './world.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell } from './gfx.js';
import { Sound } from './audio.js';
import { flag } from './save.js';
import { rand, approach, sign, clamp, TAU, rgba, pick } from './util.js';
import { Entity, Shot } from './entities.js';
import { Boss, BOSSES, Shockwave } from './bosses.js';
import { HAZ } from './terrain.js';

const PALE = '#f0dca0', VOID = '#b890ff', DARK = '#1c1426';

// A column of cold light: a thin warning line first, then the real thing.
class MoonBeam extends Entity {
  constructor(x, top, bottom, delay) {
    super(x - 15, top, 30, bottom - top);
    this.type = 'hazard'; this.delay = delay; this.layer = 2; this.fired = false;
  }
  update(dt) {
    this.t += dt;
    if (!this.fired && this.t >= this.delay) { this.fired = true; Sound.play('spell'); shake(3, 0.12); }
    if (this.t > this.delay + 0.34) this.dead = true;
  }
  touch(p) { if (this.fired) p.hurt(1, this.cx); }
  draw(c) {
    if (!this.fired) {
      const k = this.t / this.delay;
      c.fillStyle = rgba(HAZ, 0.2 + 0.6 * k * Math.abs(Math.sin(this.t * 22)));
      c.fillRect(this.cx - 1.5, this.y, 3, this.h); c.fillRect(this.cx - 15, this.y + this.h - 3, 30, 3);
      return;
    }
    const k = clamp(1 - (this.t - this.delay) / 0.34, 0, 1);
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = rgba(HAZ, 0.5 * k); c.fillRect(this.cx - 15, this.y, 30, this.h);
    c.fillStyle = rgba('#ffffff', 0.9 * k); c.fillRect(this.cx - 3 - 6 * k, this.y, 6 + 12 * k, this.h);
    c.restore();
    addLight(this.cx, this.y + this.h - 60, 160, HAZ, 0.4 * k, 0.9 * k);
  }
}

class HollowMoon extends Boss {
  constructor(x, y, spec) {
    super(x, y - 150, 84, 84, { kind: 'hollowmoon', id: 'hollowmoon', name: 'The Hollow Moon', hp: 900, motes: 600, eye: PALE, spec, grav: false });
    const a = spec.arena || [4, 54];
    this.aL = a[0] * T; this.aR = a[1] * T; this.floorY = y; this.topY = 2 * T;
    this.hoverY = y - 200; this.last = ''; this.idleT = 1; this.n = 0; this.dir = 1; this.side = 1; this.spin = 0; this.tx = this.cx;
  }
  steer(tx, ty, sp, dt) {
    const dx = tx - this.cx, dy = ty - this.cy, d = Math.hypot(dx, dy) || 1, v = Math.min(sp, d * 5);
    this.vx = approach(this.vx, dx / d * v, 2200 * dt); this.vy = approach(this.vy, dy / d * v, 2200 * dt);
  }
  wisps() { let n = 0; for (const e of this.room.entities) if (!e.dead && e.kind === 'wisp') n++; return n; }
  pickAttack() {
    const ph = this.phase;
    const opts = ['ring', 'beams', 'sweep', 'slam'];
    if (ph >= 2 && this.wisps() < 2) opts.push('call');
    const a = pick(opts.filter((o) => o !== this.last)) || 'ring';
    this.last = a; this.n = 0;
    if (a === 'sweep') { this.n = ph === 3 ? 2 : 1; this.side = G.player.cx > (this.aL + this.aR) / 2 ? -1 : 1; }
    this.setState(a + 'Tel');
    Sound.play('warn');
  }
  rest(sec) { this.setState('tired'); this.idleT = sec; }
  die() {
    for (const e of this.room.entities) if (e.kind === 'wisp' && !e.dead) e.die();
    super.die();
  }
  finish() {
    super.finish();
    Sound.music('ending');
    const e = this.room.def._ents.find((q) => q.spec && q.spec.t === 'moonseed');
    this.room.add(new MoonSeed(e ? e.tx * T + 16 : this.cx, e ? (e.ty + 1) * T : this.floorY, true));
  }
  update(dt) {
    this.t += dt; this.st += dt; this.spin += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.inv > 0) this.inv -= dt;
    const p = G.player, ph = this.phase, room = this.room, mid = (this.aL + this.aR) / 2;
    const fast = ph === 3 ? 0.72 : ph === 2 ? 0.86 : 1; // telegraphs shorten as the coat tears
    this.dmg = this.dmgBase;
    switch (this.state) {
      case 'sleep': this.vx = this.vy = 0; if (this.shouldWake()) this.startFight(); break;
      case 'intro': this.steer(this.cx, this.hoverY, 120, dt); if (this.st > 1.7) { this.setState('idle'); this.idleT = 0.8; } break;
      case 'idle': {
        const off = (p.cx < this.cx ? 1 : -1) * 150;
        this.steer(clamp(p.cx + off, this.aL + 70, this.aR - 70), this.hoverY + Math.sin(this.t * 2) * 18, 230, dt);
        if (this.st > this.idleT) this.pickAttack();
        break;
      }
      case 'ringTel':
        this.steer(this.cx, this.hoverY + 30, 200, dt);
        if (this.st > 0.75 * fast) { this.setState('ring'); this.n = 0; }
        break;
      case 'ring': {
        this.vx = approach(this.vx, 0, 900 * dt); this.vy = approach(this.vy, 0, 900 * dt);
        const waves = ph, count = ph === 1 ? 10 : 12;
        if (this.n < waves && this.st > this.n * 0.5) {
          const o = this.n * Math.PI / count + rand(0.3);
          for (let i = 0; i < count; i++) { const a = o + i / count * TAU; room.add(new Shot(this.cx + Math.cos(a) * 40, this.cy + Math.sin(a) * 40, Math.cos(a) * 250, Math.sin(a) * 250, { color: VOID, life: 3.2 })); }
          Sound.play('spell'); ring(this.cx, this.cy, VOID, 8, 180, 0.3); this.n++;
        }
        if (this.st > waves * 0.5 + 0.5) { this.setState('idle'); this.idleT = rand(0.6, 1.1) * fast; }
        break;
      }
      case 'beamsTel':
        this.steer(mid, this.topY + 90, 420, dt);
        if (this.st > 0.7 * fast) { this.setState('beams'); this.n = 0; }
        break;
      case 'beams': {
        this.steer(mid + Math.sin(this.t * 1.5) * 120, this.topY + 90, 200, dt);
        const total = 4 + ph * 2, every = 0.3 * fast;
        if (this.n < total && this.st > this.n * every) {
          const bx = this.n % 2 === 0 ? p.cx + p.vx * 0.35 : rand(this.aL + 40, this.aR - 40);
          room.add(new MoonBeam(clamp(bx, this.aL + 20, this.aR - 20), this.topY, this.floorY, 0.75 * fast));
          Sound.play('charge'); this.n++;
        }
        if (this.st > total * every + 0.9) { this.setState('idle'); this.idleT = rand(0.4, 0.8) * fast; }
        break;
      }
      case 'sweepTel': { // sink to the floor at one end of the hall
        const ex = this.side > 0 ? this.aL + 70 : this.aR - 70;
        this.steer(ex, this.floorY - 46, 520, dt);
        this.dir = this.side;
        if (this.st > 1.15 * fast && Math.abs(this.cx - ex) < 30) { this.setState('sweep'); Sound.play('dash'); shake(6, 0.3); }
        break;
      }
      case 'sweep': {
        this.dmg = 2; this.vy = 0; this.vx = this.dir * (ph === 3 ? 900 : 760);
        this.y = this.floorY - 46 - this.h / 2;
        spawnP({ x: this.cx - this.dir * 30, y: this.cy + rand(-36, 36), life: 0.35, size: 4, color: VOID, vx: -this.dir * 80 });
        const end = this.dir > 0 ? this.cx > this.aR - 80 : this.cx < this.aL + 80;
        if (end) {
          this.vx = 0; shake(8, 0.3); Sound.play('clang');
          if (--this.n > 0) { this.side = -this.dir; this.setState('sweepTel'); this.st = 0.5; Sound.play('warn'); } else this.rest(1.5);
        }
        break;
      }
      case 'slamTel':
        this.tx = clamp(p.cx + p.vx * 0.25, this.aL + 50, this.aR - 50);
        this.steer(this.tx, this.floorY - 300, 560, dt);
        if (this.st > 0.85 * fast) this.setState('hang');
        break;
      case 'hang':
        this.vx = approach(this.vx, 0, 3000 * dt); this.vy = approach(this.vy, 0, 3000 * dt);
        if (this.st > 0.3 * fast) { this.setState('plunge'); Sound.play('charge'); }
        break;
      case 'plunge':
        this.dmg = 2; this.vx = 0; this.vy = 1300;
        if (this.y + this.h + this.vy * dt >= this.floorY) {
          this.y = this.floorY - this.h; this.vy = 0;
          Sound.play('slam'); shake(14, 0.45);
          burst(this.cx, this.floorY, 26, { color: [PALE, VOID, '#ffffff'], a0: Math.PI, a1: TAU, s0: 80, s1: 460, l0: 0.25, l1: 0.7, shape: 'spark' });
          ring(this.cx, this.floorY, PALE, 12, 340, 0.4);
          const sp = ph === 1 ? 380 : 450;
          room.add(new Shockwave(this.x + this.w + 4, this.floorY, 1, sp)); room.add(new Shockwave(this.x - 4, this.floorY, -1, sp));
          if (ph === 3) for (const d of [-1, 1]) room.add(new MoonBeam(clamp(this.cx + d * 190, this.aL + 20, this.aR - 20), this.topY, this.floorY, 0.6));
          this.rest(ph === 3 ? 1.0 : 1.3);
        }
        break;
      case 'callTel':
        this.steer(mid, this.hoverY - 30, 300, dt);
        if (this.st > 0.8) {
          for (const d of [-1, 1]) {
            if (this.wisps() >= 2) break;
            const w = REG.wisp(room, {}, clamp(this.cx + d * 220, this.aL + 40, this.aR - 40), this.cy + 40, { uid: null });
            if (w) { w.motes = 0; room.add(w); ring(w.cx, w.cy, VOID, 6, 120, 0.3); }
          }
          Sound.play('roar');
          this.setState('idle'); this.idleT = 0.7;
        }
        break;
      case 'tired': // spent and low: the time to strike
        this.vx = approach(this.vx, 0, 2400 * dt); this.vy = approach(this.vy, 0, 2400 * dt);
        if (this.st > this.idleT) { this.setState('idle'); this.idleT = rand(0.5, 0.9) * fast; }
        break;
      case 'roar': this.vx = this.vy = 0; this.inv = 0.2; if (this.st > 1.4) { this.setState('idle'); this.idleT = 0.4; } break;
      case 'dying': this.vx = 0; this.vy = approach(this.vy, 40, 200 * dt); this.updateDying(dt); break;
      default: break;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, this.aL, this.aR - this.w);
    this.y = clamp(this.y, this.topY, this.floorY - this.h);
    if (this.state === 'dying') return;
    const want = this.hp <= this.maxHp * 0.33 ? 3 : this.hp <= this.maxHp * 0.66 ? 2 : 1;
    if (want > ph && (this.state === 'idle' || this.state === 'tired')) {
      this.phase = want; this.setState('roar');
      Sound.play('roar'); shake(14, 1.1); G.flash.a = 0.5; G.flash.color = want === 3 ? '#ffffff' : VOID;
      ring(this.cx, this.cy, want === 3 ? '#ffffff' : VOID, 22, 560, 0.7);
      burst(this.cx, this.cy, 40, { color: ['#0a0612', VOID, PALE], s0: 80, s1: 460, l0: 0.5, l1: 1.3, shape: 'shard', grav: 500, z0: 3, z1: 7, vr: 8 });
      for (const e of room.entities) if (e.type === 'shot' || e.type === 'hazard') e.dead = true;
    }
  }
  draw(c) {
    const x = this.cx, y = this.cy, R = 42, t = this.t, st = this.state, sleep = st === 'sleep', ph = this.phase;
    const C = (k) => this.col(k), p = G.player;
    c.save();
    if (st === 'dying') c.globalAlpha = clamp(1.2 - this.st * 0.4, 0.2, 1);
    if (st === 'roar' || st === 'intro') c.translate(rand(-2, 2), rand(-2, 2));
    // the coat of quiet: dark tatters trailing below. Fewer every time it tears.
    const n = ph === 1 ? 9 : ph === 2 ? 5 : 0;
    c.strokeStyle = C('rgba(6,3,14,0.94)'); c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = -1.1 + i * (2.2 / (n - 1)), sx = x + Math.sin(a) * R * 0.92, sy = y + Math.cos(a) * R * 0.6, len = 54 + Math.sin(t * 1.7 + i) * 12;
      c.lineWidth = 10 - (i % 3) * 2.5;
      c.beginPath(); c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + Math.sin(t * 2 + i) * 12 - this.vx * 0.05, sy + len * 0.5, sx + Math.sin(t * 1.3 + i * 2) * 20 - this.vx * 0.12, sy + len - Math.abs(this.vy) * 0.03);
      c.stroke();
    }
    drawGlow(c, x, y, R * (ph === 3 ? 2.6 : 1.7), ph === 3 ? '#ffffff' : ph === 2 ? VOID : PALE, sleep ? 0.2 : 0.55);
    // the disc: a sliver of old moonlight, the rest eaten by shadow
    c.save(); c.beginPath(); c.arc(x, y, R, 0, TAU); c.clip();
    c.fillStyle = C(ph === 3 ? '#fffbe8' : sleep ? '#6a6250' : PALE); c.fillRect(x - R, y - R, R * 2, R * 2);
    c.fillStyle = C('rgba(160,140,90,0.5)'); ell(c, x - 24, y - 12, 7, 6); c.fill(); ell(c, x - 28, y + 14, 5, 4); c.fill(); ell(c, x - 12, y + 26, 6, 4); c.fill();
    c.fillStyle = C(DARK); ell(c, x + 16 + (ph - 1) * 20, y - 4, R + 2, R + 4); c.fill();
    c.restore();
    c.strokeStyle = C(ph === 3 ? '#ffffff' : PALE); c.lineWidth = 2; c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke();
    if (ph >= 2) { // cracks where the light is getting back out
      c.strokeStyle = rgba('#ffffff', 0.85); c.lineWidth = 1.6; c.beginPath();
      c.moveTo(x - 8, y - R + 3); c.lineTo(x + 2, y - 14); c.lineTo(x - 10, y + 2); c.lineTo(x + 4, y + 24);
      c.moveTo(x + 2, y - 14); c.lineTo(x + 20, y - 6); c.lineTo(x + 14, y + 12);
      if (ph === 3) { c.moveTo(x - 10, y + 2); c.lineTo(x - 30, y + 8); c.moveTo(x + 20, y - 6); c.lineTo(x + 36, y - 16); }
      c.stroke();
    }
    if (!sleep) { // the eye of the Hush, looking out of the dark side
      const ex = x + 12, ey = y - 2, open = st === 'tired' ? 0.35 : 1, lx = p ? clamp((p.cx - ex) / 60, -1, 1) * 4 : 0, ly = p ? clamp((p.cy - ey) / 60, -1, 1) * 3 : 0;
      c.fillStyle = C(ph === 3 ? '#1c1426' : '#ffffff'); ell(c, ex, ey, 12, 9 * open); c.fill();
      c.fillStyle = C(HAZ); ell(c, ex + lx, ey + ly * open, 4.5, 5.5 * open); c.fill();
    }
    c.restore();
    // warnings
    if (st === 'ringTel') { const k = this.st / 0.75; c.strokeStyle = rgba(HAZ, 0.4 + 0.5 * Math.abs(Math.sin(t * 20))); c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, R + 30 - k * 24, 0, TAU); c.stroke(); }
    if (st === 'sweepTel' && this.st > 0.5) { c.fillStyle = rgba(HAZ, 0.25 + Math.abs(Math.sin(t * 24)) * 0.4); c.fillRect(this.aL, this.floorY - 48, this.aR - this.aL, 3); c.fillRect(this.aL, this.floorY - 6, this.aR - this.aL, 3); }
    if (st === 'slamTel' || st === 'hang') { c.fillStyle = rgba(HAZ, 0.4 + Math.abs(Math.sin(t * 24)) * 0.4); c.fillRect(x - 42, this.floorY - 3, 84, 3); c.fillRect(x - 1, y + R, 2, this.floorY - y - R); }
    if (!sleep) addLight(x, y, ph === 3 ? 320 : 230, ph === 3 ? '#fff6d8' : ph === 2 ? VOID : PALE, 0.34, 1);
  }
}
BOSSES.hollowmoon = HollowMoon;

// What is left when the coat comes off: a moon small enough to hold.
class MoonSeed extends Entity {
  constructor(x, y, fresh) {
    super(x - 26, y - 120, 52, 120);
    this.type = 'moonseed'; this.bx = x; this.by = y; this.layer = 2; this.reach = 64; this.grow = fresh ? 0 : 1; this.given = false;
  }
  get prompt() { return this.grow >= 1 && !this.given ? 'Give back the spark' : null; }
  interact() { if (this.grow >= 1 && !this.given) { this.given = true; G.game.ending(this); } }
  update(dt) {
    this.t += dt; this.grow = Math.min(1, this.grow + dt * 0.4);
    if (Math.random() < 0.3) spawnP({ x: this.bx + rand(-40, 40), y: this.by - 76 + rand(-40, 40), vy: -rand(10, 50), life: rand(0.8, 1.6), size: 2, color: pick(['#fffbe8', PALE]), wob: 30 });
  }
  draw(c) {
    const x = this.bx, y = this.by - 76 + Math.sin(G.now * 1.4) * 5, R = 20 * this.grow * (this.given ? 1.6 : 1);
    drawGlow(c, x, y, R * 3.4, '#fffbe8', 0.9);
    c.fillStyle = '#fffbe8'; ell(c, x, y, R, R); c.fill();
    c.fillStyle = 'rgba(200,180,120,0.5)'; ell(c, x - R * 0.35, y - R * 0.2, R * 0.2, R * 0.16); c.fill(); ell(c, x + R * 0.3, y + R * 0.35, R * 0.16, R * 0.12); c.fill();
    addLight(x, y, 300 * this.grow, '#fff6d8', 0.4, 1);
  }
}
register('moonseed', (room, spec, x, y) => (flag('boss_hollowmoon') ? new MoonSeed(x, y, false) : null));
