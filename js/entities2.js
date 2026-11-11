// Machinery of the deeper areas: flame jets, moving lifts, saw-gears,
// crumbling ledges and pale barriers.
import { G } from './state.js';
import { T, AREAS } from './config.js';
import { register } from './world.js';
import { addLight, drawGlow, burst, spawnP, ell, rrect } from './gfx.js';
import { Sound } from './audio.js';
import { has } from './save.js';
import { rand, overlap, TAU, rgba, clamp } from './util.js';
import { Entity } from './entities.js';
import { HAZ } from './terrain.js';

// ---------------------------------------------------------------- flame jet (fires on a timer)
class Jet extends Entity {
  constructor(x, y, spec) {
    const len = (spec.len || 4) * T, dir = spec.dir || 'up';
    if (dir === 'up') super(x - 10, y - len, 20, len);
    else if (dir === 'down') super(x - 10, y - T, 20, len);
    else if (dir === 'right') super(x - T / 2, y - T / 2 - 10, len, 20);
    else super(x + T / 2 - len, y - T / 2 - 10, len, 20);
    this.type = 'jet'; this.spec = spec; this.dir = dir; this.len = len; this.bx = x; this.by = y; this.layer = 2;
    this.on = spec.on || 1.1; this.off = spec.off || 1.7; this.phase = spec.phase || 0; this.active = false; this.tell = false;
  }
  update(dt) {
    this.t += dt;
    if (this.spec.bossP2 && !(G.boss && G.boss.phase === 2 && G.boss.state !== 'dying')) { this.active = false; this.tell = false; return; }
    const cyc = this.on + this.off, k = (G.time + this.phase) % cyc;
    const was = this.active;
    this.active = k < this.on;
    this.tell = !this.active && k > cyc - 0.5;
    if (this.active && !was) { const p = G.player; if (p && Math.abs(p.cx - this.cx) < 520 && Math.abs(p.cy - this.cy) < 320) Sound.play('dash'); }
  }
  touch(p) { if (this.active) p.hurt(1, this.cx); }
  origin() { // nozzle point + unit direction
    const d = this.dir;
    if (d === 'up') return [this.bx, this.by, 0, -1];
    if (d === 'down') return [this.bx, this.by - T, 0, 1];
    if (d === 'right') return [this.bx - T / 2, this.by - T / 2, 1, 0];
    return [this.bx + T / 2, this.by - T / 2, -1, 0];
  }
  draw(c) {
    const [ox, oy, dx, dy] = this.origin();
    c.fillStyle = '#2a1712'; c.fillRect(ox - 9 - Math.abs(dx) * -3, oy - 4 - Math.abs(dy) * 0, 18 - Math.abs(dx) * 10, 8 + Math.abs(dx) * 10);
    c.fillStyle = this.active || this.tell ? '#ffae5a' : '#6a3a22'; c.fillRect(ox - 5 + dx * 2, oy - 2 + dy * 2, 10 - Math.abs(dx) * 6, 4 + Math.abs(dx) * 6);
    if (this.tell && Math.random() < 0.6) spawnP({ x: ox + rand(-4, 4), y: oy + rand(-4, 4), vx: dx * rand(40, 140) + rand(-20, 20), vy: dy * rand(40, 140) + rand(-20, 20), life: 0.25, size: 2, color: '#ffae5a' });
    if (!this.active) { if (this.tell) addLight(ox, oy, 46, '#ffae5a', 0.3, 0.4); return; }
    const L = this.len, t = G.now;
    c.save(); c.translate(ox, oy); c.rotate(Math.atan2(dy, dx)); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const w = [11, 7, 3.5][i], wob = Math.sin(t * 30 + i) * 1.5;
      c.fillStyle = ['rgba(255,90,40,0.55)', 'rgba(255,170,70,0.8)', 'rgba(255,245,210,0.95)'][i];
      c.beginPath(); c.moveTo(0, -w); c.quadraticCurveTo(L * 0.5, -w - 2 + wob, L - i * 6, 0); c.quadraticCurveTo(L * 0.5, w + 2 - wob, 0, w); c.closePath(); c.fill();
    }
    c.restore();
    for (let i = 0; i < 2; i++) spawnP({ x: ox + dx * rand(10, L), y: oy + dy * rand(10, L), vx: rand(-30, 30), vy: rand(-60, -10), life: 0.3, size: 2.4, color: '#ffae5a' });
    addLight(ox + dx * L * 0.5, oy + dy * L * 0.5, L * 0.8, '#ff9440', 0.4, 0.9);
  }
}
register('jet', (room, spec, x, y) => new Jet(x, y, spec));

// ---------------------------------------------------------------- lift (a platform that glides between two stops)
class Lift extends Entity {
  constructor(x, y, spec) {
    const w = (spec.w || 3) * T;
    super(x - T / 2, y - T, w, 12);
    this.type = 'lift'; this.spec = spec; this.solid = true; this.layer = 0;
    this.x0 = this.x; this.y0 = this.y; this.x1 = this.x + (spec.dx || 0) * T; this.y1 = this.y + (spec.dy || 0) * T;
    this.dist = Math.hypot(this.x1 - this.x0, this.y1 - this.y0) || 1;
    this.speed = spec.speed || 96; this.pause = spec.pause === undefined ? 0.8 : spec.pause;
    this.k = 0; this.dirn = 1; this.wait = this.pause;
  }
  update(dt) {
    if (this.wait > 0) { this.wait -= dt; return; }
    this.k += this.dirn * this.speed * dt / this.dist;
    if (this.k >= 1) { this.k = 1; this.dirn = -1; this.wait = this.pause; } else if (this.k <= 0) { this.k = 0; this.dirn = 1; this.wait = this.pause; }
    const e = this.k * this.k * (3 - 2 * this.k); // ease in / out
    const nx = this.x0 + (this.x1 - this.x0) * e, ny = this.y0 + (this.y1 - this.y0) * e;
    const dx = nx - this.x, dy = ny - this.y;
    // carry whoever is standing on us
    const riders = [];
    const p = G.player;
    if (p && p.groundEnt === this) riders.push(p);
    for (const o of this.room.entities) if (o.isEnemy && o.groundEnt === this) riders.push(o);
    this.x = nx; this.y = ny;
    for (const r of riders) { r.x += dx; r.y += dy; }
    if (p && p.groundEnt !== this && p.state !== 'dead' && overlap(p, this)) { // shove aside instead of swallowing
      if (dx > 0) p.x = this.x + this.w; else if (dx < 0) p.x = this.x - p.w; else if (dy > 0) p.y = this.y + this.h; else p.y = this.y - p.h;
    }
  }
  draw(c) {
    const A = AREAS[this.room.area];
    c.strokeStyle = rgba(A.rim, 0.14); c.lineWidth = 2; c.setLineDash([3, 9]);
    c.beginPath(); c.moveTo(this.x0 + this.w / 2, this.y0 + 6); c.lineTo(this.x1 + this.w / 2, this.y1 + 6); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#231a1c'; rrect(c, this.x, this.y, this.w, this.h, 3); c.fill();
    c.fillStyle = rgba(A.rim, 0.95); c.fillRect(this.x + 3, this.y, this.w - 6, 2);
    c.fillStyle = rgba(A.rim, 0.5); c.fillRect(this.x + 6, this.y + 6, 4, 3); c.fillRect(this.x + this.w - 10, this.y + 6, 4, 3);
    c.fillStyle = '#231a1c'; c.fillRect(this.x + this.w / 2 - 3, this.y + this.h, 6, 5);
    addLight(this.cx, this.y, 70, A.rim, 0.16, 0.4);
  }
}
register('lift', (room, spec, x, y) => new Lift(x, y, spec));

// ---------------------------------------------------------------- saw-gear (cannot be killed; bounce off it or avoid it)
class Saw extends Entity {
  constructor(x, y, spec) {
    super(x - 17, y - T / 2 - 17, 34, 34);
    this.type = 'saw'; this.spec = spec; this.layer = 2;
    this.x0 = this.x; this.y0 = this.y; this.x1 = this.x + (spec.dx || 0) * T; this.y1 = this.y + (spec.dy || 0) * T;
    this.dist = Math.hypot(this.x1 - this.x0, this.y1 - this.y0) || 1;
    this.speed = spec.speed || 130; this.k = spec.k || 0; this.dirn = 1; this.rot = 0;
  }
  update(dt) {
    this.k += this.dirn * this.speed * dt / this.dist;
    if (this.k >= 1) { this.k = 1; this.dirn = -1; } else if (this.k <= 0) { this.k = 0; this.dirn = 1; }
    this.x = this.x0 + (this.x1 - this.x0) * this.k; this.y = this.y0 + (this.y1 - this.y0) * this.k;
    this.rot += dt * 9;
    if (Math.random() < 0.15) spawnP({ x: this.cx + rand(-14, 14), y: this.cy + rand(-14, 14), life: 0.2, size: 2, color: '#ffae5a', shape: 'spark', vx: rand(-120, 120), vy: rand(-120, 120) });
  }
  touch(p) { p.hurt(1, this.cx); }
  onSlash() { Sound.play('clang'); return true; }
  draw(c) {
    c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(this.x0 + 17, this.y0 + 17); c.lineTo(this.x1 + 17, this.y1 + 17); c.stroke();
    c.save(); c.translate(this.cx, this.cy); c.rotate(this.rot);
    c.fillStyle = '#3a2a2e';
    c.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 13 : 19; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill();
    c.strokeStyle = HAZ; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = '#1a1214'; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
    c.fillStyle = HAZ; c.fillRect(-1.5, -1.5, 3, 3);
    c.restore();
    addLight(this.cx, this.cy, 60, HAZ, 0.26, 0.5);
  }
}
register('saw', (room, spec, x, y) => new Saw(x, y, spec));

// ---------------------------------------------------------------- crumbling ledge (falls shortly after you land on it)
class Crumble extends Entity {
  constructor(x, y, spec) {
    super(x - T / 2, y - T, (spec.w || 2) * T, 12);
    this.type = 'crumble'; this.solid = true; this.layer = 0; this.shakeT = -1; this.gone = 0; this.spec = spec;
  }
  update(dt) {
    const p = G.player;
    if (this.gone > 0) { this.gone -= dt; if (this.gone <= 0 && !(p && overlap(p, { x: this.x, y: this.y - 2, w: this.w, h: this.h + 4 }))) { this.solid = true; this.shakeT = -1; this.gone = 0; } else if (this.gone <= 0) this.gone = 0.2; return; }
    if (this.shakeT < 0) { if (p && p.groundEnt === this) { this.shakeT = 0; Sound.play('crack'); } return; }
    this.shakeT += dt;
    if (this.shakeT > 0.55) {
      this.solid = false; this.gone = 2.6;
      burst(this.cx, this.y + 6, 10, { color: [AREAS[this.room.area].rim, '#ffffff'], shape: 'shard', s0: 30, s1: 160, grav: 900, z0: 2, z1: 4, vr: 8, l0: 0.3, l1: 0.7 });
      Sound.play('break');
    }
  }
  draw(c) {
    if (!this.solid) return;
    const A = AREAS[this.room.area], sh = this.shakeT >= 0 ? rand(-1.5, 1.5) : 0;
    c.fillStyle = rgba(A.rim, 0.22); rrect(c, this.x + sh, this.y, this.w, this.h, 3); c.fill();
    c.strokeStyle = rgba(A.rim, 0.9); c.lineWidth = 1.5; rrect(c, this.x + sh, this.y, this.w, this.h, 3); c.stroke();
    c.strokeStyle = rgba('#ffffff', 0.5); c.lineWidth = 1;
    c.beginPath(); for (let x = this.x + 10; x < this.x + this.w - 4; x += 14) { c.moveTo(x + sh, this.y + 1); c.lineTo(x + 4 + sh, this.y + 6); c.lineTo(x - 1 + sh, this.y + 11); } c.stroke();
    addLight(this.cx, this.y, 56, A.rim, 0.14, 0.3);
  }
}
register('crumble', (room, spec, x, y) => new Crumble(x, y, spec));

// ---------------------------------------------------------------- pale barrier (only the Eclipse dash passes through)
class Barrier extends Entity {
  constructor(x, y, spec) {
    const th = spec.h || 3;
    super(x - 8, y - th * T, 16, th * T);
    this.type = 'barrier'; this.solid = true; this.layer = 2; this.spec = spec;
  }
  update(dt) {
    this.t += dt;
    const p = G.player;
    // solid to everything except a ghosting (Eclipse) dash
    this.solid = !(p && p.ghost);
    if (p && p.ghost && overlap(p, this) && Math.random() < 0.6) spawnP({ x: p.cx, y: p.cy + rand(-14, 14), life: 0.4, size: 3, color: '#c9c2ff' });
  }
  draw(c) {
    const t = G.now;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = rgba('#e8e4ff', 0.5 - i * 0.14); c.lineWidth = 2 + i * 3;
      c.beginPath();
      for (let y = this.y; y <= this.y + this.h; y += 8) { const x = this.cx + Math.sin(y * 0.11 + t * 3 + i) * 3; if (y === this.y) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
    }
    c.restore();
    addLight(this.cx, this.cy, 90, '#c9c2ff', 0.3, 0.7);
    if (!has('eclipse')) { const p = G.player; if (p && Math.abs(p.cx - this.cx) < 70 && Math.abs(p.cy - this.cy) < 80) G.hint = 'A wall of pale light. Nothing solid may pass.'; }
  }
}
register('barrier', (room, spec, x, y) => new Barrier(x, y, spec));
