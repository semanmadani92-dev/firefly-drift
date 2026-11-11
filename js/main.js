// Boot, main loop, room loading, and the game-level events (rest, death, ...).
import { G } from './state.js';
import { T, AREAS, PHYS, TILE, VERSION } from './config.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { loadSettings, newSave, readSlot, writeSave, lastSlot, setFlag } from './save.js';
import { initGfx, ctx, view, updateCamera, drawLighting, drawVignette, updateParticles, drawParticles, clearParticles, spawnP, burst, ring, shake, onResize, addLight } from './gfx.js';
import { ROOMS, Room, registerRooms, neighborFor, cellOf } from './world.js';
import { TerrainLayer, drawBackdrop, HAZ } from './terrain.js';
import { Player, BLADE_DMG } from './player.js';
import { UI } from './ui.js';
import { LostLight } from './entities.js';
import './enemies.js';
import './bosses.js';
import './enemies2.js';
import './enemies3.js';
import './enemies4.js';
import './enemies5.js';
import './entities2.js';
import { NPCS } from './data/text.js';
import { ALL_ROOMS, START_ROOM, TITLE_ROOM } from './data/rooms.js';
import { rand, pick, hash2, rgba, clamp, approach } from './util.js';

const STEP = 1 / 60;
let terrain = null;
let titleHero = null;
const timers = [];
function after(sec, fn) { timers.push({ t: sec, fn }); }

function fadeTo(target, speed, cb) { G.fade.target = target; G.fade.speed = speed; G.fade.cb = cb || null; }

// ------------------------------------------------------------------ rooms
function loadRoom(id, opts = {}) {
  const def = ROOMS[id];
  if (!def) { console.error('missing room', id); return false; }
  if (terrain) terrain.dispose();
  G.bossLock = false; G.boss = null; G.cam.lock = null; G.cam.focus = null; G.prompt = null; G.hint = null;
  const room = new Room(def);
  G.room = room;
  room.spawnAll();
  terrain = new TerrainLayer(room);
  clearParticles();
  const S = G.save;
  if (S) {
    if (S.lost && S.lost.room === id) room.add(new LostLight(S.lost.x, S.lost.y, S.lost.motes));
    if (S.area !== def.area) { S.area = def.area; if (!opts.silent) UI.areaTitle(AREAS[def.area].name, AREAS[def.area].sub); }
  }
  Sound.music(def.music || AREAS[def.area].music);
  return true;
}
onResize(() => { if (terrain) terrain.dispose(); });

function markVisited() {
  const p = G.player, c = cellOf(G.room, p.cx, p.cy);
  G.save.visited[`${c.gx},${c.gy}`] = 1;
}

function checkTransition() {
  const p = G.player, r = G.room;
  if (p.state === 'dead') return;
  const cx = p.cx, cy = p.cy;
  let dir = null;
  if (cx < 0) dir = 'L'; else if (cx > r.pxW) dir = 'R'; else if (cy < 0) dir = 'U'; else if (cy > r.pxH) dir = 'D';
  if (!dir) return;
  const px = dir === 'L' ? -2 : dir === 'R' ? r.pxW + 2 : clamp(cx, 1, r.pxW - 1);
  const py = dir === 'U' ? -2 : dir === 'D' ? r.pxH + 2 : clamp(cy, 1, r.pxH - 1);
  const nb = neighborFor(r, px, py);
  if (!nb) { // nothing beyond: the world simply ends here
    if (dir === 'L' || dir === 'R') {
      p.x = dir === 'L' ? 1 - p.w / 2 : r.pxW - 1 - p.w / 2; p.vx = 0;
      if (!r.def.open && G.now - (game.edgeT || 0) > 6) { game.edgeT = G.now; UI.toast('The way beyond is still lost in the dark. More of the world is on its way.'); }
    }
    else if (dir === 'U') { p.y = 1 - p.h / 2; p.vy = 0; }
    else game.hazard();
    return;
  }
  G.mode = 'transition';
  fadeTo(1, 10, () => {
    loadRoom(nb.def.id);
    let nx = nb.x - p.w / 2, ny = nb.y - p.h / 2;
    if (dir === 'L') nx = nb.def.w * T - p.w - 6;
    else if (dir === 'R') nx = 6;
    else if (dir === 'U') { ny = nb.def.h * T - p.h - 4; p.vy = -PHYS.enterBoost; p.jumping = false; }
    else ny = 4;
    p.x = nx; p.y = ny;
    if (p.state === 'dash' || p.state === 'slam') { p.state = 'normal'; p.ghost = false; }
    p.safe = { x: nx, y: ny }; p.safeT = 0;
    for (const s of p.ribbon) { s.x = p.cx; s.y = p.y + 6; }
    updateCamera(0, true);
    markVisited();
    G.mode = 'play';
    fadeTo(0, 7);
  });
}

// ------------------------------------------------------------------ game events
function spawnAtLantern(first) {
  const S = G.save, p = G.player;
  if (S.lantern && ROOMS[S.lantern.room]) {
    loadRoom(S.lantern.room, { silent: !first });
    p.reset(S.lantern.x + 10, S.lantern.y);
    p.state = 'rest';
  } else {
    loadRoom(START_ROOM, { silent: false });
    const sp = G.room.startPos || { x: 200, y: 200 };
    p.reset(sp.x, sp.y);
    p.state = 'rest';
  }
  S.hp = S.maxHp; S.vials = S.maxVials;
  updateCamera(0, true);
  markVisited();
}

const game = {
  start(slot, isNew) {
    G.slot = slot;
    G.save = (isNew ? null : readSlot(slot)) || newSave();
    G.killed.clear();
    G.timeScale = 1; G.hitstop = 0;
    UI.closeAll();
    UI.shownMotes = G.save.motes;
    G.player = new Player();
    titleHero = null;
    const go = () => {
      G.mode = 'play';
      spawnAtLantern(true);
      UI.showHud(true); UI.applyTouch();
      G.fade.a = 1; fadeTo(0, 1.2);
      if (isNew) { Sound.play('wake'); writeSave(); }
    };
    if (isNew) { G.mode = 'intro'; G.fade.a = 1; G.fade.target = 1; UI.playIntro(go); } else go();
  },
  continueGame() {
    let s = lastSlot();
    if (s < 0 || !readSlot(s)) s = [0, 1, 2].find((i) => readSlot(i));
    if (s === undefined) { UI.open('s-slots'); return; }
    this.start(s, false);
  },
  quitToTitle(noSave) {
    if (!noSave && G.save && G.mode === 'play') writeSave();
    UI.closeAll(); UI.showHud(false); UI.deathMsg(false);
    G.flash.hold = 0; G.flash.a = 0;
    G.save = null; G.player = null; G.mode = 'title'; G.timeScale = 1;
    timers.length = 0;
    enterTitle();
  },
  autosave() { if (G.save && G.mode !== 'title') writeSave(); },

  rest(l) {
    const S = G.save, p = G.player;
    S.hp = S.maxHp; S.vials = S.maxVials;
    S.lantern = { room: G.room.id, x: l.bx, y: l.by };
    const firstTime = !S.flags['lan:' + l.uid];
    setFlag('lan:' + l.uid);
    G.killed.clear();
    p.state = 'rest'; p.vx = 0; p.x = l.bx + 10 - p.w / 2; p.facing = -1;
    Sound.play('rest');
    burst(l.bx + 4, l.by - 54, 22, { color: ['#ffcf7a', '#ffffff'], s0: 40, s1: 220, l0: 0.5, l1: 1.3 });
    ring(l.bx + 4, l.by - 54, '#ffcf7a', 8, 240, 0.6);
    UI.toast('Your embers and dew are restored. Your journey is saved.', firstTime ? 'Lantern lit' : 'Rested');
    writeSave();
  },

  talk(id) {
    const n = NPCS[id];
    UI.dialog(n.name, n.lines(G.save), () => {
      setFlag('met_' + id);
      if (n.shop) UI.openShop(n.shop);
      else if (n.smith) this.smith(n.name);
    });
  },

  // The smith folds Moon Shards into the matchblade.
  smith(name) {
    const S = G.save, cost = [200, 350, 500, 700][S.blade];
    if (S.blade >= 4) { UI.toast('Your matchblade can burn no hotter.'); return; }
    if (S.shards < 1) { UI.toast('Bring a Moon Shard and motes, and the smith will reforge your matchblade.', name, 4200); return; }
    if (S.motes < cost) { UI.toast(`The smith asks ${cost} motes to fold in your Moon Shard. You have ${S.motes}.`, name, 4200); return; }
    UI.confirm('Reforge the matchblade?', `One Moon Shard and ${cost} motes. Each strike will deal ${BLADE_DMG[S.blade + 1]} instead of ${BLADE_DMG[S.blade]}.`, 'Reforge', () => {
      S.shards--; S.motes -= cost; S.blade++;
      Sound.play('big'); shake(6, 0.4);
      G.flash.a = 0.6; G.flash.color = '#ffcf7a';
      UI.toast('Your matchblade burns hotter.', 'Reforged', 3600);
      writeSave();
    });
  },

  giveAbility(id, src) {
    const S = G.save, p = G.player;
    S.abilities[id] = 1;
    if (id === 'shot' || id === 'slam') S.lumen = S.lumenMax;
    Sound.play('big');
    G.flash.a = 0.85; G.flash.color = '#ffffff';
    shake(8, 0.5);
    const x = src ? src.cx : p.cx, y = src ? src.cy : p.cy;
    burst(x, y, 50, { color: ['#ffffff', '#ffe08a', '#8fd8ff'], s0: 80, s1: 480, l0: 0.5, l1: 1.5, drag: 1.5 });
    ring(x, y, '#ffffff', 10, 420, 0.7);
    p.ctlLock = 0.9; p.vx = 0;
    after(0.8, () => UI.abilityCard(id, () => { writeSave(); }));
  },

  hazard() {
    const p = G.player;
    if (G.mode !== 'play' || p.state === 'dead') return;
    p.hurt(1, undefined, { force: true, noKnock: true });
    if (p.state === 'dead') return;
    G.mode = 'transition';
    fadeTo(1, 8, () => {
      p.x = p.safe.x; p.y = p.safe.y; p.vx = 0; p.vy = 0; p.state = 'normal'; p.ghost = false;
      p.ctlLock = 0.3; p.inv = Math.max(p.inv, 1.2); p.jumping = false; p.recoil = 0; p.wallLock = 0;
      for (const s of p.ribbon) { s.x = p.cx; s.y = p.y + 6; }
      updateCamera(0, true);
      G.mode = 'play';
      fadeTo(0, 5);
    });
  },

  playerDied() {
    const S = G.save, p = G.player;
    G.mode = 'dead'; G.timeScale = 0.4;
    S.deaths++;
    if (S.motes > 0) {
      S.lost = { room: G.room.id, x: p.safe.x + p.w / 2, y: p.safe.y + p.h * 0.4, motes: S.motes };
      S.motes = 0;
    }
    after(1.2, () => { UI.deathMsg(true); fadeTo(1, 1.4); });
    after(3.4, () => {
      UI.deathMsg(false);
      G.timeScale = 1; G.hitstop = 0;
      G.killed.clear();
      const firstDeath = S.deaths === 1 && S.lost;
      spawnAtLantern(false);
      G.mode = 'play';
      writeSave();
      fadeTo(0, 1.2);
      if (firstDeath) after(1.5, () => UI.toast('Your motes wait where you fell. Reach them before you fall again.', 'Lost light', 5000));
    });
  },

  // The spark goes back into the Moon: white-out, then the ending screen.
  ending(src) {
    const S = G.save, p = G.player;
    if (G.mode !== 'play') return;
    setFlag('ended');
    p.ctlLock = 99; p.vx = 0; p.inv = 99;
    Sound.music('ending'); Sound.play('big'); shake(8, 1.2);
    burst(src.bx, src.by - 76, 80, { color: ['#ffffff', '#fff6d8', '#f0dca0'], s0: 60, s1: 520, l0: 0.8, l1: 2.2, drag: 1.2 });
    ring(src.bx, src.by - 76, '#ffffff', 14, 700, 1.2);
    writeSave();
    after(1.4, () => { G.flash.color = '#fffbe8'; G.flash.hold = 1; });
    after(3.2, () => { G.mode = 'ending'; UI.showEnding(S); });
  },

  hitBreakable(tx, ty) {
    const room = G.room, root = room.groupOf[ty * room.w + tx];
    const n = (room.breakHits.get(root) || 0) + 1;
    room.breakHits.set(root, n);
    if (n >= 2) { this.breakGroup(tx, ty); return; }
    Sound.play('crack'); shake(3, 0.12);
    const A = AREAS[room.area];
    burst(tx * T + 16, ty * T + 16, 8, { color: [A.rock2, A.rim], shape: 'shard', s0: 60, s1: 220, grav: 800, z0: 2, z1: 4, vr: 8, l0: 0.3, l1: 0.6 });
  },
  breakGroup(tx, ty) {
    const room = G.room, root = room.groupOf[ty * room.w + tx], A = AREAS[room.area];
    for (const c of room.groupCells(tx, ty)) {
      room.tiles[c] = TILE.EMPTY;
      const x = (c % room.w) * T + 16, y = ((c / room.w) | 0) * T + 16;
      burst(x, y, 7, { color: [A.rock2, A.rim, '#000000'], shape: 'shard', s0: 60, s1: 280, grav: 900, z0: 3, z1: 6, vr: 9, l0: 0.4, l1: 0.9 });
    }
    setFlag(`brk:${room.id}:${root}`);
    Sound.play('break'); shake(8, 0.3);
  },
  after, fadeTo, loadRoom,
};
G.game = game;
G.ui = UI;

// ------------------------------------------------------------------ title backdrop
function enterTitle() {
  G.mode = 'title';
  loadRoom(TITLE_ROOM, { silent: true });
  titleHero = new Player();
  const sp = G.room.startPos || { x: 480, y: 448 };
  titleHero.reset(sp.x, sp.y);
  titleHero.state = 'rest'; titleHero.facing = 1;
  G.cam.focus = { x: sp.x, y: sp.y - 60 };
  updateCamera(0, true);
  Sound.music('title');
  G.fade.a = 1; fadeTo(0, 0.8);
  UI.open('s-title');
}

// ------------------------------------------------------------------ simulation
function ambient(dt) {
  const A = AREAS[G.room.area], cam = G.cam;
  if (Math.random() < dt * 9) {
    spawnP({ x: cam.x + rand(view.w), y: cam.y + rand(view.h), vx: rand(-14, 14), vy: rand(-20, -3), life: rand(3, 6), size: rand(1.1, 2.1), color: pick(A.motes), wob: 26, a: 0.7 });
  }
}

function step(dt) {
  Input.step();
  G.time += dt;
  G.hint = null;
  const p = G.player;
  p.update(dt);
  if (G.mode !== 'play' && G.mode !== 'dead') return;
  G.room.update(dt);
  ambient(dt);
  if (G.mode === 'play') {
    checkTransition();
    if (G.mode !== 'play') return;
    markVisited();
    if (Input.pressed.pause) UI.open('s-pause');
    else if (Input.pressed.map) UI.openInv('map');
  }
  updateCamera(dt);
}

// ------------------------------------------------------------------ rendering
function drawEntities(c, layer, cam) {
  const list = G.room.entities;
  const x0 = cam.x - 260, x1 = cam.x + view.w + 260, y0 = cam.y - 320, y1 = cam.y + view.h + 260;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.layer !== layer) continue;
    if (e.x + e.w < x0 || e.x > x1 || e.y + e.h < y0 || e.y > y1) continue;
    e.draw(c);
  }
}

function drawDynamicTiles(c, room, cam) {
  const A = AREAS[room.area];
  const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(room.w - 1, Math.floor((cam.x + view.w) / T));
  const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(room.h - 1, Math.floor((cam.y + view.h) / T));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = room.tiles[ty * room.w + tx];
    if (t !== TILE.BREAK && t !== TILE.SLAM && t !== TILE.LIQUID) continue;
    const X = tx * T, Y = ty * T;
    if (t === TILE.LIQUID) {
      const top = room.tile(tx, ty - 1) !== TILE.LIQUID;
      const LQ = A.liquid || HAZ;
      c.fillStyle = rgba(LQ, 0.34); c.fillRect(X, Y + (top ? 8 : 0), T, T - (top ? 8 : 0));
      c.fillStyle = 'rgba(20,4,16,0.5)'; c.fillRect(X, Y + (top ? 14 : 0), T, T - (top ? 14 : 0));
      if (top) {
        c.strokeStyle = A.liquid ? '#ffe9b0' : '#ffc0d0'; c.lineWidth = 2; c.beginPath();
        for (let i = 0; i <= 4; i++) { const xx = X + i * 8, yy = Y + 8 + Math.sin(G.now * 2.4 + xx * 0.06) * 2.2; if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); }
        c.stroke();
        if ((tx & 1) === 0) addLight(X + 16, Y + 10, A.liquid ? 96 : 70, LQ, A.liquid ? 0.3 : 0.22, 0.45);
      }
    } else {
      const h1 = hash2(tx, ty, 91), h2 = hash2(tx, ty, 97);
      c.fillStyle = A.rock2; c.fillRect(X, Y, T, T);
      c.fillStyle = rgba(A.rim, 0.07); c.fillRect(X, Y, T, T);
      c.strokeStyle = rgba('#000000', 0.65); c.lineWidth = 1.6;
      c.beginPath();
      if (t === TILE.BREAK) { c.moveTo(X + 4 + h1 * 8, Y); c.lineTo(X + 14 + h2 * 6, Y + 13); c.lineTo(X + 8 + h1 * 10, Y + 22); c.lineTo(X + 18 + h2 * 8, Y + T); c.moveTo(X + 14 + h2 * 6, Y + 13); c.lineTo(X + T, Y + 9 + h1 * 8); }
      else { c.moveTo(X, Y + 6 + h1 * 6); c.lineTo(X + 12, Y + 14); c.lineTo(X + 20, Y + 8 + h2 * 6); c.lineTo(X + T, Y + 16); c.moveTo(X + 12, Y + 14); c.lineTo(X + 14 + h1 * 6, Y + T); }
      c.stroke();
      c.strokeStyle = rgba(A.rim, 0.22); c.lineWidth = 1; c.strokeRect(X + 0.5, Y + 0.5, T - 1, T - 1);
    }
  }
}

function render(dt) {
  const c = ctx, room = G.room, cam = G.cam;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (!room || !terrain) { c.fillStyle = '#03050d'; c.fillRect(0, 0, view.bw, view.bh); return; }
  const A = AREAS[room.area];
  c.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  drawBackdrop(c, room.area, cam, room);
  c.translate(-cam.x, -cam.y);
  drawEntities(c, -1, cam);
  drawEntities(c, 0, cam);
  terrain.draw(c, cam);
  drawDynamicTiles(c, room, cam);
  drawEntities(c, 1, cam);
  if (G.player && G.mode !== 'title' && G.mode !== 'intro') G.player.draw(c);
  if (titleHero && G.mode === 'title') titleHero.draw(c);
  drawEntities(c, 2, cam);
  terrain.addLights(cam);
  drawLighting(cam, A.ambient, room.def.dark || 1);
  c.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  c.translate(-cam.x, -cam.y);
  drawParticles(c, cam);
  drawVignette();
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (G.save && G.save.hp === 1 && G.mode === 'play') { // danger pulse
    c.globalAlpha = 0.07 + Math.abs(Math.sin(G.now * 3)) * 0.07; c.fillStyle = HAZ; c.fillRect(0, 0, view.bw, view.bh);
  }
  if (G.flash.hold) G.flash.a = Math.min(1, G.flash.a + dt * 1.2);
  if (G.flash.a > 0.01) { c.globalAlpha = Math.min(1, G.flash.a); c.fillStyle = G.flash.color; c.fillRect(0, 0, view.bw, view.bh); if (!G.flash.hold) G.flash.a = Math.max(0, G.flash.a - dt * 2.6); }
  if (G.fade.a > 0.005) { c.globalAlpha = Math.min(1, G.fade.a); c.fillStyle = '#000'; c.fillRect(0, 0, view.bw, view.bh); }
  c.globalAlpha = 1;
}

// ------------------------------------------------------------------ main loop
let last = 0, acc = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000;
  const dt = Math.min(0.1, Math.max(0, now - last));
  last = now; G.now = now;
  try {
    Input.poll();
    Sound.tick();
    for (let i = timers.length - 1; i >= 0; i--) { const tm = timers[i]; tm.t -= dt; if (tm.t <= 0) { timers.splice(i, 1); tm.fn(); } }
    const f = G.fade;
    if (f.a !== f.target) {
      f.a = approach(f.a, f.target, f.speed * dt);
      if (f.a === f.target && f.cb) { const cb = f.cb; f.cb = null; cb(); }
    }
    const sim = (G.mode === 'play' || G.mode === 'dead') && !G.uiOpen;
    if (sim) {
      if (G.hitstop > 0) G.hitstop -= dt;
      else {
        acc += dt * G.timeScale;
        let n = 0;
        while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; if (G.mode !== 'play' && G.mode !== 'dead') break; }
        if (n >= 5) acc = 0;
      }
      if (G.save) G.save.played += dt;
      updateParticles(dt * G.timeScale);
    } else {
      acc = 0;
      if (G.mode === 'title' && titleHero) {
        titleHero.updateRibbon(dt);
        const A = AREAS[G.room.area];
        if (Math.random() < dt * 8) spawnP({ x: G.cam.x + rand(view.w), y: G.cam.y + rand(view.h), vx: rand(-14, 14), vy: rand(-20, -3), life: rand(3, 6), size: rand(1.1, 2.1), color: pick(A.motes), wob: 26, a: 0.7 });
        G.cam.focus.x = (G.room.startPos ? G.room.startPos.x : 480) + Math.sin(now * 0.12) * 60;
        updateCamera(dt);
        updateParticles(dt);
      } else if (G.mode === 'transition') updateParticles(dt);
    }
    UI.dlgTick(dt); UI.introTick(dt);
    if (G.save) UI.hudSync(dt);
    render(dt);
  } catch (err) {
    if (!frame.err) { frame.err = true; console.error(err); }
    throw err;
  }
}

function boot() {
  loadSettings();
  G.debug = /[?&]debug/.test(location.search);
  registerRooms(ALL_ROOMS);
  initGfx(document.getElementById('game'));
  Input.init();
  Input.onAny = () => Sound.unlock();
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, () => Sound.unlock(), { passive: true });
  UI.init();
  G.onHidden = () => { if (G.mode === 'play' && !G.uiOpen) UI.open('s-pause'); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) Sound.suspend(); else Sound.resume(); });
  enterTitle();
  requestAnimationFrame((t) => { last = t / 1000; requestAnimationFrame(frame); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // handy for testing from the browser console
  window.__mw = {
    G, game, UI, VERSION,
    tp(id, tx, ty) { if (!ROOMS[id]) return false; loadRoom(id); const p = G.player; const sp = G.room.startPos; p.reset(tx !== undefined ? tx * T + 16 : sp ? sp.x : 200, ty !== undefined ? (ty + 1) * T : sp ? sp.y : 200); p.safe = { x: p.x, y: p.y }; updateCamera(0, true); return true; },
    give(...ab) { for (const a of ab) G.save.abilities[a] = 1; G.save.lumen = G.save.lumenMax; },
    rooms: () => Object.keys(ROOMS),
  };
}
boot();
