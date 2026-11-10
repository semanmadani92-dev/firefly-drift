// Wick, the lampling: movement, matchblade, dash, spells, healing, drawing.
import { G } from './state.js';
import { T, TILE, PHYS, HERO } from './config.js';
import { Input } from './input.js';
import { moveBody, touchingWall } from './physics.js';
import { Sound } from './audio.js';
import { addLight, drawGlow, burst, ring, spawnP, shake, ell, rrect } from './gfx.js';
import { has, equipped, setFlag } from './save.js';
import { clamp, lerp, rand, approach, overlap, sign, TAU, rgba } from './util.js';
import { StarShot, drawFlame } from './entities.js';
import { HAZ } from './terrain.js';

export const BLADE_DMG = [10, 14, 18, 23, 28];
const ATK_TIME = 0.26;
const DEW_PER_VIAL = 14;
export const SPELL_COST = 33;

export class Player {
  constructor() {
    this.w = HERO.w; this.h = HERO.h; this.t = 0;
    this.reset(0, 0);
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // x = centre, y = feet
  reset(x, y) {
    this.x = x - this.w / 2; this.y = y - this.h; this.vx = 0; this.vy = 0; this.facing = 1;
    this.state = 'normal'; this.onGround = false; this.groundType = 0; this.coyote = 0; this.jumping = false;
    this.jumpBuf = 0; this.atkBuf = 0; this.dashBuf = 0;
    this.airDash = true; this.airJumps = 0; this.dashT = 0; this.dashCd = 0; this.dashDir = 1; this.ghost = false;
    this.atkT = 0; this.atkCd = 0; this.atkDir = 'side'; this.atkSide = 1; this.atkHit = new Set(); this.atkRecoiled = false; this.swing = 0;
    this.inv = 0; this.ctlLock = 0; this.recoil = 0; this.recoilV = 0; this.wallLock = 0; this.wallDir = 0; this.wallCoyote = 0; this.lastWall = 0;
    this.healT = 0; this.castT = 0; this.slamT = 0; this.dropT = 0; this.stepT = 0; this.squash = 0; this.lookT = 0; this.lowT = 0;
    this.safe = { x: this.x, y: this.y }; this.safeT = 0; this.deadT = 0; this.runPhase = 0;
    this.dropThrough = false; this.hitL = this.hitR = this.hitCeil = false;
    this.ribbon = [];
    for (let i = 0; i < 7; i++) this.ribbon.push({ x, y: y - 30 });
  }

  bladeDmg() {
    const S = G.save;
    let d = BLADE_DMG[Math.min(S.blade, BLADE_DMG.length - 1)];
    if (S.hp === 1 && equipped('lastember')) d *= 1.6;
    return Math.round(d);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const I = Input, S = G.save, P = PHYS, room = G.room;
    this.t += dt;
    const dec = (k) => { if (this[k] > 0) this[k] = Math.max(0, this[k] - dt); };
    dec('inv'); dec('ctlLock'); dec('dashCd'); dec('atkCd'); dec('jumpBuf'); dec('atkBuf'); dec('dashBuf'); dec('wallLock'); dec('recoil'); dec('castT'); dec('dropT'); dec('atkT'); dec('wallCoyote');
    this.squash = approach(this.squash, 0, dt * 4);

    if (this.state === 'dead') {
      this.deadT += dt;
      this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall); this.vx = approach(this.vx, 0, 600 * dt);
      moveBody(room, this, dt);
      this.updateRibbon(dt);
      return;
    }
    const wasGround = this.onGround;
    const ctl = this.ctlLock <= 0;
    let mx = 0;
    if (ctl) { if (I.down.left) mx -= 1; if (I.down.right) mx += 1; }
    if (ctl) {
      if (I.pressed.jump) this.jumpBuf = P.jumpBuf;
      if (I.pressed.attack) this.atkBuf = 0.14;
      if (I.pressed.dash) this.dashBuf = 0.12;
    }

    if (this.state === 'rest') {
      this.vx = 0;
      if (I.pressed.left || I.pressed.right || I.pressed.jump || I.pressed.attack || I.pressed.dash || I.pressed.down) { this.state = 'normal'; this.jumpBuf = 0; this.atkBuf = 0; this.dashBuf = 0; }
      this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
      moveBody(room, this, dt);
      this.updateRibbon(dt);
      this.scan(false);
      return;
    }

    if (this.state === 'heal') {
      this.vx = 0;
      this.healT += dt;
      const need = equipped('quicksip') ? 0.5 : 0.95;
      if (Math.random() < 0.5) spawnP({ x: this.cx + rand(-16, 16), y: this.y + this.h, vy: -rand(40, 110), life: rand(0.4, 0.8), size: 2, color: '#9fe8ff', wob: 30 });
      if (Math.floor(this.healT * 8) !== Math.floor((this.healT - dt) * 8)) Sound.play('sipping');
      if (this.healT >= need) {
        S.vials--; S.hp = Math.min(S.maxHp, S.hp + 2);
        this.state = 'normal'; this.ctlLock = 0.08;
        Sound.play('heal');
        burst(this.cx, this.cy, 18, { color: ['#9fe8ff', '#ffffff'], s0: 60, s1: 220, l0: 0.3, l1: 0.8 });
        ring(this.cx, this.cy, '#9fe8ff', 8, 180, 0.4);
      } else if (I.pressed.jump || I.pressed.dash || !this.onGround) { this.state = 'normal'; }
    }

    if (this.state === 'dash') {
      this.dashT -= dt;
      this.vx = this.dashDir * P.dashV; this.vy = 0;
      if (Math.random() < 0.9) spawnP({ x: this.cx - this.dashDir * 6, y: this.cy + rand(-12, 12), life: 0.28, size: 3.2, color: this.ghost ? '#c9c2ff' : '#8fd8ff', vx: -this.dashDir * 60 });
      moveBody(room, this, dt);
      if (this.dashT <= 0 || this.hitL || this.hitR) {
        this.state = 'normal'; this.ghost = false;
        this.vx = this.dashDir * P.run;
      }
      this.afterMove(dt, wasGround, mx);
      return;
    }

    if (this.state === 'slam') {
      this.slamT += dt;
      this.inv = Math.max(this.inv, 0.12);
      this.vx = 0;
      if (this.slamT < 0.14) { this.vy = 0; }
      else {
        this.vy = P.slamV;
        spawnP({ x: this.cx + rand(-6, 6), y: this.y, life: 0.3, size: 3.5, color: '#ffa06a', vy: -120 });
        moveBody(room, this, dt);
        if (this.onGround) { if (!this.slamImpact()) { this.state = 'normal'; this.ctlLock = 0.18; this.inv = Math.max(this.inv, 0.4); } }
      }
      this.afterMove(dt, wasGround, 0);
      return;
    }

    // ---------------- normal movement
    if (this.state === 'normal') {
      const speed = P.run * (equipped('swiftwick') ? 1.14 : 1);
      if (this.wallLock > 0) { /* keep wall-jump velocity */ }
      else if (this.recoil > 0) this.vx = this.recoilV;
      else this.vx = mx * speed;
      if (mx !== 0 && this.atkT <= 0.1 && this.wallLock <= 0) this.facing = mx;

      this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);

      // wall cling / slide
      this.wallDir = 0;
      if (has('grip') && !this.onGround && this.vy > 0 && mx !== 0 && this.wallLock <= 0 && touchingWall(room, this, mx)) {
        this.wallDir = mx; this.lastWall = mx; this.wallCoyote = 0.12;
        this.vy = Math.min(this.vy, P.wallSlide);
        this.airDash = true; this.airJumps = has('djump') ? 1 : 0;
        if (Math.random() < 0.3) spawnP({ x: mx > 0 ? this.x + this.w : this.x, y: this.y + this.h * 0.7, life: 0.35, size: 2, color: '#cfe8dc', vy: -20 });
      }

      // jump family
      if (this.jumpBuf > 0) {
        if (this.onGround || this.coyote > 0) {
          if (I.down.down && this.groundType === TILE.ONEWAY) { this.dropT = 0.2; this.jumpBuf = 0; this.coyote = 0; }
          else {
            this.vy = -P.jumpV; this.jumping = true; this.coyote = 0; this.jumpBuf = 0; this.squash = -0.35;
            Sound.play('jump');
            burst(this.cx, this.y + this.h, 5, { color: '#cfe8dc', a0: Math.PI, a1: TAU, s0: 20, s1: 90, l0: 0.2, l1: 0.4, z0: 1.5, z1: 2.5 });
          }
        } else if (has('grip') && (this.wallDir || this.wallCoyote > 0)) {
          const wd = this.wallDir || this.lastWall;
          this.vx = -wd * P.wallJumpX; this.vy = -P.wallJumpY; this.wallLock = P.wallLock; this.facing = -wd;
          this.jumping = true; this.jumpBuf = 0; this.wallCoyote = 0; this.squash = -0.3;
          Sound.play('jump');
          burst(wd > 0 ? this.x + this.w : this.x, this.cy, 6, { color: '#cfe8dc', s0: 30, s1: 120, l0: 0.2, l1: 0.4 });
        } else if (this.airJumps > 0) {
          this.airJumps--; this.vy = -P.djumpV; this.jumping = true; this.jumpBuf = 0; this.squash = -0.3;
          Sound.play('djump');
          ring(this.cx, this.y + this.h, '#d0b8ff', 4, 90, 0.3);
          burst(this.cx, this.y + this.h, 10, { color: ['#d0b8ff', '#ffffff'], a0: 0.2, a1: Math.PI - 0.2, s0: 40, s1: 160, l0: 0.2, l1: 0.5 });
        }
      }
      if (this.jumping && !I.down.jump && this.vy < -P.jumpCut) this.vy = -P.jumpCut;
      if (this.vy >= 0) this.jumping = false;

      // dash
      if (this.dashBuf > 0 && has('dash') && this.dashCd <= 0 && (this.onGround || this.airDash)) {
        this.dashBuf = 0;
        this.state = 'dash'; this.dashT = P.dashT; this.dashCd = P.dashCd;
        this.dashDir = this.wallDir ? -this.wallDir : (mx || this.facing); this.facing = this.dashDir;
        if (!this.onGround) this.airDash = false;
        this.ghost = has('eclipse'); this.atkT = 0; this.jumping = false;
        Sound.play('dash');
        ring(this.cx, this.cy, '#8fd8ff', 6, 110, 0.25);
      }

      // strike
      if (this.atkBuf > 0 && this.atkCd <= 0 && this.state === 'normal') this.startAttack();

      // spells + healing
      if (ctl && I.pressed.spell && this.castT <= 0 && this.state === 'normal') this.cast();
      if (ctl && I.pressed.heal && this.state === 'normal') {
        if (this.onGround && S.vials > 0 && S.hp < S.maxHp) { this.state = 'heal'; this.healT = 0; this.vx = 0; }
        else if (S.vials <= 0 || S.hp >= S.maxHp) Sound.play('deny');
      }

      this.dropThrough = this.dropT > 0;
      moveBody(room, this, dt);
    } else {
      // (heal) still needs gravity
      this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
      moveBody(room, this, dt);
    }
    this.afterMove(dt, wasGround, mx);
  }

  afterMove(dt, wasGround, mx) {
    const I = Input, P = PHYS, room = G.room, S = G.save;
    if (this.onGround) {
      if (!wasGround) {
        this.squash = 0.4;
        Sound.play('land');
        burst(this.cx, this.y + this.h, 6, { color: '#cfe8dc', a0: Math.PI, a1: TAU, s0: 30, s1: 110, l0: 0.2, l1: 0.45, z0: 1.5, z1: 2.5 });
      }
      this.coyote = P.coyote; this.airDash = true; this.airJumps = has('djump') ? 1 : 0;
      if (Math.abs(this.vx) > 40 && this.state === 'normal') {
        this.runPhase += dt * 16; this.stepT += dt;
        if (this.stepT > 0.26) { this.stepT = 0; Sound.play('step'); }
      } else this.runPhase = 0;
    } else {
      if (this.coyote > 0) this.coyote = Math.max(0, this.coyote - dt);
    }

    if (this.atkT > ATK_TIME - 0.15 && this.state !== 'dash') this.attackHits();

    // hazards: thorns and bad water send you back to safe ground
    if (this.touchingHazard()) { G.game.hazard(); return; }

    // remember the last safe footing
    if (this.onGround && this.groundType === TILE.SOLID && this.state === 'normal') {
      this.safeT += dt;
      if (this.safeT > 0.12) {
        this.safeT = 0;
        const fy = Math.floor((this.y + this.h + 2) / T), ay = fy - 1;
        const x0 = Math.floor((this.x - T * 0.8) / T), x1 = Math.floor((this.x + this.w + T * 0.8) / T);
        let ok = true;
        for (let tx = x0; tx <= x1 && ok; tx++) {
          const g = room.tile(tx, fy), a = room.tile(tx, ay);
          if (g !== TILE.SOLID || a === TILE.SPIKE || a === TILE.LIQUID) ok = false;
        }
        if (ok && this.x > 8 && this.x < room.pxW - this.w - 8) this.safe = { x: this.x, y: this.y };
      }
    }

    // camera peek up / down
    if (this.onGround && mx === 0 && Math.abs(this.vx) < 5 && this.state === 'normal' && this.atkT <= 0 && (I.down.up || I.down.down) && !G.prompt) {
      this.lookT += dt;
      if (this.lookT > 0.55) G.cam.lookY = approach(G.cam.lookY || 0, I.down.up ? -120 : 130, 420 * dt);
    } else { this.lookT = 0; G.cam.lookY = approach(G.cam.lookY || 0, 0, 520 * dt); }

    if (S.hp === 1) { this.lowT -= dt; if (this.lowT <= 0) { this.lowT = 1.15; Sound.play('low'); } }
    this.updateRibbon(dt);
    this.scan(true);
  }

  // touch pickups / enemies, find the nearest thing to interact with
  scan(canInteract) {
    const room = G.room, I = Input;
    let best = null, bd = 1e9;
    const list = room.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      if (e.touch && overlap(this, e)) e.touch(this);
      if (this.state === 'dead') return;
      const pr = e.prompt;
      if (pr && this.onGround) {
        const d = Math.abs(e.cx - this.cx);
        if (d < (e.reach || 40) && Math.abs((e.y + e.h) - (this.y + this.h)) < 70 && d < bd) { best = e; bd = d; }
      }
    }
    G.prompt = best;
    if (best && canInteract && this.ctlLock <= 0 && this.state === 'normal' && this.atkT <= 0 && (I.pressed.up || I.pressed.interact)) {
      this.vx = 0;
      best.interact();
    }
  }

  // ------------------------------------------------------------ combat
  startAttack() {
    const I = Input;
    let dir = 'side';
    if (I.down.up) dir = 'up'; else if (I.down.down && !this.onGround) dir = 'down';
    this.atkDir = dir; this.atkSide = this.facing;
    this.atkT = ATK_TIME; this.atkCd = equipped('quickstrike') ? 0.27 : 0.36;
    this.atkBuf = 0; this.atkHit.clear(); this.atkRecoiled = false; this.swing++;
    Sound.play('slash');
  }

  attackBox() {
    const reach = equipped('longwick') ? 1.28 : 1, cx = this.cx, cy = this.cy;
    if (this.atkDir === 'side') { const w = 60 * reach, h = 46; return { x: this.atkSide > 0 ? cx + 2 : cx - 2 - w, y: cy - h / 2 - 3, w, h }; }
    if (this.atkDir === 'up') { const w = 52, h = 56 * reach; return { x: cx - w / 2, y: this.y - h + 10, w, h }; }
    const w = 52, h = 54 * reach; return { x: cx - w / 2, y: this.y + this.h - 12, w, h };
  }

  attackHits() {
    const room = G.room, S = G.save, box = this.attackBox(), dmg = this.bladeDmg();
    let solid = false, enemy = false, sx = box.x + box.w / 2, sy = box.y + box.h / 2;
    const list = room.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || !e.onSlash || this.atkHit.has(e) || !overlap(box, e)) continue;
      this.atkHit.add(e);
      const dx = this.atkDir === 'side' ? this.atkSide : (sign(e.cx - this.cx) || this.facing);
      if (e.onSlash(this, { dmg, dir: this.atkDir, dx })) {
        solid = true; if (e.isEnemy) enemy = true;
        sx = clamp(e.cx, box.x, box.x + box.w); sy = clamp(e.cy, box.y, box.y + box.h);
      }
    }
    // tiles: hollow walls crack, thorns can be bounced on
    const tx0 = Math.floor(box.x / T), tx1 = Math.floor((box.x + box.w) / T), ty0 = Math.floor(box.y / T), ty1 = Math.floor((box.y + box.h) / T);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!room.inside(tx, ty)) continue;
      const tt = room.tiles[ty * room.w + tx];
      if (tt === TILE.BREAK) {
        const root = room.groupOf[ty * room.w + tx], key = 'g' + root;
        if (this.atkHit.has(key)) continue;
        this.atkHit.add(key); solid = true; sx = tx * T + 16; sy = ty * T + 16;
        G.game.hitBreakable(tx, ty);
      } else if (tt === TILE.SPIKE && this.atkDir === 'down' && !this.atkHit.has('spk')) {
        this.atkHit.add('spk'); solid = true; sx = tx * T + 16; sy = ty * T + 10; Sound.play('clang');
      } else if (tt === TILE.SLAM && !this.atkHit.has('slm')) {
        this.atkHit.add('slm'); solid = true; sx = tx * T + 16; sy = ty * T + 8; Sound.play('clang');
      }
    }
    if (solid) {
      burst(sx, sy, 7, { color: ['#fff1c4', '#ffb347'], shape: 'spark', s0: 120, s1: 380, l0: 0.12, l1: 0.3, z0: 2, z1: 3 });
      ring(sx, sy, '#fff1c4', 3, 70, 0.16);
      if (!this.atkRecoiled) {
        this.atkRecoiled = true;
        if (this.atkDir === 'side') { this.recoil = 0.1; this.recoilV = -this.atkSide * 170; }
        else if (this.atkDir === 'down') { this.vy = -575; this.jumping = false; this.airDash = true; this.airJumps = has('djump') ? 1 : 0; }
        else if (this.vy < 0) this.vy *= 0.4;
      }
    }
    if (enemy) {
      S.lumen = Math.min(S.lumenMax, S.lumen + (equipped('brightcore') ? 16 : 11));
      S.dew += equipped('dewdrinker') ? 1.6 : 1;
      if (S.dew >= DEW_PER_VIAL) {
        if (S.vials < S.maxVials) { S.vials++; S.dew = 0; Sound.play('drip'); spawnP({ x: this.cx, y: this.y - 6, life: 0.6, size: 4, color: '#9fe8ff', vy: -50 }); }
        else S.dew = DEW_PER_VIAL;
      }
      G.hitstop = Math.max(G.hitstop, 0.045);
      shake(3, 0.12);
      Sound.play('hit');
    }
  }

  cast() {
    const S = G.save, I = Input;
    const wantSlam = I.down.down && !this.onGround && has('slam');
    if (!has('shot') && !has('slam')) return;
    if (S.lumen < SPELL_COST) { Sound.play('deny'); G.lumenFlash = 0.4; return; }
    if (wantSlam) {
      S.lumen -= SPELL_COST;
      this.state = 'slam'; this.slamT = 0; this.vx = 0; this.vy = 0; this.atkT = 0;
      Sound.play('charge');
      ring(this.cx, this.cy, '#ffa06a', 6, 80, 0.2);
    } else if (has('shot')) {
      S.lumen -= SPELL_COST;
      this.castT = 0.24;
      const dmg = Math.round(25 * (1 + S.blade * 0.3));
      G.room.add(new StarShot(this.cx + this.facing * 16, this.cy - 3, this.facing, dmg));
      this.recoil = 0.08; this.recoilV = -this.facing * 120;
      Sound.play('spell');
      burst(this.cx + this.facing * 14, this.cy - 3, 8, { color: ['#ffe08a', '#ffffff'], s0: 40, s1: 180, l0: 0.15, l1: 0.35 });
    }
  }

  // Meteor landing. Returns true if a cracked floor broke and the fall continues.
  slamImpact() {
    const room = G.room, S = G.save;
    Sound.play('slam'); shake(12, 0.35);
    const fx = this.cx, fy = this.y + this.h;
    burst(fx, fy, 22, { color: ['#ffa06a', '#ffe08a', '#ffffff'], a0: Math.PI, a1: TAU, s0: 80, s1: 420, l0: 0.25, l1: 0.6, shape: 'spark', z0: 2, z1: 4 });
    ring(fx, fy, '#ffa06a', 10, 320, 0.4);
    const dmg = Math.round(32 * (1 + S.blade * 0.3));
    for (const e of room.entities) {
      if (e.dead || !e.isEnemy) continue;
      if (Math.abs(e.cx - fx) < 110 + e.w / 2 && Math.abs((e.y + e.h) - fy) < 70) e.hurt(dmg, sign(e.cx - fx) || 1, 'slam');
    }
    let broke = false;
    const ty = Math.floor((fy + 4) / T);
    for (let tx = Math.floor((this.x - 6) / T); tx <= Math.floor((this.x + this.w + 6) / T); tx++) {
      if (room.inside(tx, ty) && room.tiles[ty * room.w + tx] === TILE.SLAM) { G.game.breakGroup(tx, ty); broke = true; }
    }
    if (broke) { this.onGround = false; this.slamT = 0.14; }
    return broke;
  }

  touchingHazard() {
    const room = G.room;
    const x0 = Math.floor((this.x + 4) / T), x1 = Math.floor((this.x + this.w - 4) / T), y0 = Math.floor((this.y + 8) / T), y1 = Math.floor((this.y + this.h - 3) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!room.inside(tx, ty)) continue;
      const t = room.tiles[ty * room.w + tx];
      if (t === TILE.SPIKE || t === TILE.LIQUID) return true;
    }
    return false;
  }

  // Returns true if the hit landed.
  hurt(dmg, fromX, o = {}) {
    if (this.state === 'dead' || G.mode !== 'play') return false;
    if (!o.force && (this.inv > 0 || this.ghost || this.state === 'slam')) return false;
    const S = G.save;
    S.hp = Math.max(0, S.hp - dmg);
    if (this.state !== 'normal') { this.state = 'normal'; this.ghost = false; }
    this.atkT = 0;
    Sound.play('hurt');
    G.hitstop = Math.max(G.hitstop, 0.13);
    shake(10, 0.32);
    G.flash.a = 0.34; G.flash.color = HAZ;
    burst(this.cx, this.cy, 16, { color: ['#ffd08a', '#ffffff', HAZ], s0: 80, s1: 320, l0: 0.25, l1: 0.6 });
    if (S.hp <= 0) { this.die(); return true; }
    this.inv = PHYS.hurtInv * (equipped('stoutglass') ? 1.45 : 1);
    if (!o.noKnock && !equipped('steadyflame')) {
      const d = fromX === undefined ? -this.facing : (this.cx < fromX ? -1 : 1);
      this.vy = -350; this.recoil = 0.2; this.recoilV = d * 240; this.vx = d * 240; this.ctlLock = 0.18; this.jumping = false;
    }
    if (equipped('thornhide') && o.src && o.src.hurt && !o.src.dead) o.src.hurt(8, sign(o.src.cx - this.cx) || 1, 'thorn');
    return true;
  }

  die() {
    this.state = 'dead'; this.deadT = 0; this.vx = 0; this.vy = -220; this.ghost = false;
    Sound.play('die');
    burst(this.cx, this.cy, 44, { color: ['#ffd08a', '#ffffff', '#ff9a3a'], s0: 60, s1: 420, l0: 0.5, l1: 1.4, drag: 1.5 });
    ring(this.cx, this.cy, '#ffd08a', 8, 300, 0.6);
    G.game.playerDied();
  }

  // ------------------------------------------------------------ drawing
  updateRibbon(dt) {
    let px = this.cx - this.facing * 2, py = this.y + 3;
    const seg = 5;
    for (let i = 0; i < this.ribbon.length; i++) {
      const s = this.ribbon[i];
      s.y += 34 * dt; s.x -= this.facing * 18 * dt;
      s.x += Math.sin(G.now * 5 + i * 0.9) * 10 * dt;
      const dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy) || 0.001;
      if (d > seg) { s.x = px + dx / d * seg; s.y = py + dy / d * seg; }
      px = s.x; py = s.y;
    }
  }

  draw(c) {
    const S = G.save, cx = this.cx, fy = this.y + this.h, t = G.now;
    const dead = this.state === 'dead';
    if (dead && this.deadT > 0.5) return;
    const blink = this.inv > 0 && Math.floor(t * 22) % 2 === 0;
    const hpK = S ? clamp(S.hp / Math.max(1, S.maxHp), 0.15, 1) : 1;
    let flick = 1;
    if (S && S.hp === 1) flick = 0.6 + Math.abs(Math.sin(t * 11)) * 0.4;

    // ribbon
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = blink ? 'rgba(95,232,208,0.4)' : '#5fe8d0';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - this.facing * 2, this.y + 3);
    for (const s of this.ribbon) c.lineTo(s.x, s.y);
    c.stroke();
    const tail = this.ribbon[this.ribbon.length - 1];
    drawGlow(c, tail.x, tail.y, 9, '#5fe8d0', 0.7);

    let sx = 1 + this.squash * 0.5, sy = 1 - this.squash * 0.5;
    if (!this.onGround && this.state === 'normal') { const k = clamp(Math.abs(this.vy) / 900, 0, 1) * 0.18; sx -= k; sy += k; }
    if (this.state === 'dash') { sx = 1.35; sy = 0.72; }
    if (this.state === 'slam') { sx = 0.8; sy = 1.25; }
    const run = this.onGround && Math.abs(this.vx) > 40;
    const bob = run ? Math.abs(Math.sin(this.runPhase)) * 2 : Math.sin(t * 2.4) * 0.8;
    const lean = this.state === 'dash' ? 0.3 : run ? 0.1 : this.state === 'heal' ? 0 : clamp(this.vx / 2600, -0.1, 0.1) * this.facing;
    const sit = this.state === 'rest' ? 5 : this.state === 'heal' ? 2 : 0;

    c.save();
    c.translate(cx, fy);
    c.scale(this.facing * sx, sy);
    c.rotate(lean);
    c.globalAlpha = blink ? 0.45 : 1;
    // legs
    c.strokeStyle = '#1a2238'; c.lineWidth = 3.2; c.lineCap = 'round';
    const lp = this.runPhase;
    if (sit) { c.beginPath(); c.moveTo(-3, -6); c.lineTo(5, -1); c.moveTo(3, -6); c.lineTo(10, -1); c.stroke(); }
    else if (this.onGround) {
      const a = run ? Math.sin(lp) * 5 : 0, b = run ? Math.sin(lp + Math.PI) * 5 : 0;
      c.beginPath(); c.moveTo(-3.5, -8); c.lineTo(-3.5 + a, -0.8 - Math.max(0, Math.cos(lp)) * (run ? 2 : 0)); c.moveTo(3.5, -8); c.lineTo(3.5 + b, -0.8 - Math.max(0, Math.cos(lp + Math.PI)) * (run ? 2 : 0)); c.stroke();
    } else { c.beginPath(); c.moveTo(-3.5, -8); c.lineTo(-5.5, -2.5); c.moveTo(3.5, -8); c.lineTo(2, -2); c.stroke(); }
    const by = -bob + sit;
    // base
    c.fillStyle = '#1a2238'; rrect(c, -7.5, by - 13, 15, 6, 2.5); c.fill();
    // glass
    const gl = c.createLinearGradient(0, by - 33, 0, by - 11);
    gl.addColorStop(0, rgba('#ffe7a8', 0.95 * flick)); gl.addColorStop(1, rgba('#ff9d3c', 0.95 * flick));
    c.fillStyle = gl; rrect(c, -8.5, by - 33, 17, 21, 6.5); c.fill();
    c.fillStyle = rgba('#fff8e0', 0.75 * hpK * flick); ell(c, 0, by - 21, 5 * hpK + 1, 7 * hpK + 1); c.fill();
    c.strokeStyle = '#27304e'; c.lineWidth = 1.6; rrect(c, -8.5, by - 33, 17, 21, 6.5); c.stroke();
    c.strokeStyle = 'rgba(39,48,78,0.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-3, by - 33); c.lineTo(-3.6, by - 12); c.stroke();
    // eyes
    const bl = Math.sin(t * 0.9 + 1) > 0.985 || dead ? 0.25 : 1;
    c.fillStyle = '#2a1608';
    ell(c, 1.2, by - 23, 1.5, 2.6 * bl); c.fill(); ell(c, 5.6, by - 23, 1.5, 2.6 * bl); c.fill();
    // cap + handle
    c.fillStyle = '#1a2238'; rrect(c, -7.5, by - 37, 15, 5.5, 2.5); c.fill();
    c.strokeStyle = '#1a2238'; c.lineWidth = 2; c.beginPath(); c.arc(0, by - 38, 4, Math.PI, 0); c.stroke();
    c.fillStyle = '#5fe8d0'; c.fillRect(-2.5, by - 37.5, 5, 2.2);
    // matchblade held ready (hidden mid-swing)
    if (this.atkT <= 0 && !sit) {
      c.strokeStyle = '#d8c090'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(7, by - 14); c.lineTo(15, by - 29); c.stroke();
      c.fillStyle = '#ff7a3a'; ell(c, 15.6, by - 30.4, 2.4, 3, 0.5); c.fill();
    }
    c.restore();
    c.globalAlpha = 1;
    if (!blink && this.atkT <= 0 && !sit) drawGlow(c, cx + this.facing * 15.6, fy - 30 - bob, 9, '#ff9a3a', 0.8);

    if (this.state === 'heal') {
      const k = this.healT / 0.95;
      c.strokeStyle = rgba('#9fe8ff', 0.8); c.lineWidth = 2;
      c.beginPath(); c.arc(cx, this.cy, 26 - k * 8, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1)); c.stroke();
    }
    this.drawSlash(c);

    const lr = (150 + 16 * (S ? S.hp : 5)) * (0.9 + 0.1 * flick);
    addLight(cx, this.cy - 4, dead ? lr * Math.max(0, 1 - this.deadT * 2) : lr, '#ffd08a', 0.2 * flick, 1);
  }

  drawSlash(c) {
    if (this.atkT <= 0) return;
    const k = 1 - this.atkT / ATK_TIME;
    const reach = equipped('longwick') ? 1.28 : 1;
    const side = this.atkDir === 'side';
    const ang = side ? (this.atkSide > 0 ? 0 : Math.PI) : this.atkDir === 'up' ? -Math.PI / 2 : Math.PI / 2;
    const ox = this.cx + Math.cos(ang) * 8, oy = this.cy - 3 + Math.sin(ang) * 12;
    const R = 46 * reach;
    const flip = (this.swing % 2 ? -1 : 1) * (side ? this.atkSide : 1);
    const a0 = -1.25, a1 = 1.25;
    const head = lerp(a0, a1, clamp(k / 0.5, 0, 1)), tailA = lerp(a0, a1, clamp((k - 0.3) / 0.6, 0, 1));
    const al = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    if (head - tailA < 0.05) return;
    c.save();
    c.translate(ox, oy); c.rotate(ang); c.scale(1, flip);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = al * 0.55; c.fillStyle = '#ff9a3a';
    c.beginPath(); c.arc(0, 0, R + 3, tailA, head); c.arc(-R * 0.34, 0, R * 0.92, head * 0.86, tailA * 0.86, true); c.closePath(); c.fill();
    c.globalAlpha = al; c.fillStyle = '#fff3c8';
    c.beginPath(); c.arc(0, 0, R, tailA, head); c.arc(-R * 0.2, 0, R * 0.9, head * 0.9, tailA * 0.9, true); c.closePath(); c.fill();
    c.restore();
    addLight(ox + Math.cos(ang) * R * 0.7, oy + Math.sin(ang) * R * 0.7, 90, '#ffb347', 0.25 * al, 0.6 * al);
  }
}
