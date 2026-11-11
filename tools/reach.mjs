// Reachability solver. Run with:  node tools/reach.mjs [-v]
// Simulates the real player physics inside every room to work out which doors,
// items and shrines can be reached with which abilities, then walks the whole
// world from the start to confirm the game can be finished and that ability
// gates really hold.
//   "easy"    = comfortable jumps only (what the main path must allow)
//   "perfect" = frame-perfect edge jumps (what a gate must still resist)
import { ALL_ROOMS, START_ROOM } from '../js/data/rooms.js';
import { registerRooms, ROOMS, CELLS, Room } from '../js/world.js';
import { T, CELL_W, CELL_H, TILE, PHYS as P, HERO } from '../js/config.js';
import { moveBody, touchingWall } from '../js/physics.js';

const VERBOSE = process.argv.includes('-v');
registerRooms(ALL_ROOMS);
const DT = 1 / 60;
const POI_TYPES = new Set(['item', 'shrine', 'lantern', 'lever', 'npc', 'boss', 'crystal', 'geode', 'tablet', 'dewbloom']);

function newBody(x, y) {
  return { x, y, w: HERO.w, h: HERO.h, vx: 0, vy: 0, onGround: false, groundType: 0, coyote: 0, jumping: false, airDash: true, airJumps: 0, dashT: 0, dashCd: 0, dashDir: 1, wallLock: 0, wallDir: 0, dropT: 0, dropThrough: false, facing: 1 };
}

function hazard(room, b) {
  const x0 = Math.floor((b.x + 4) / T), x1 = Math.floor((b.x + b.w - 4) / T), y0 = Math.floor((b.y + 8) / T), y1 = Math.floor((b.y + b.h - 3) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!room.inside(tx, ty)) continue;
    const t = room.tiles[ty * room.w + tx];
    if (t === TILE.SPIKE || t === TILE.LIQUID) return true;
  }
  return false;
}

// One physics step. inp: {mx, jump (held), press (jump pressed this step), dash, down}
function simStep(room, b, inp, ab) {
  const dec = (k) => { if (b[k] > 0) b[k] = Math.max(0, b[k] - DT); };
  dec('dashCd'); dec('wallLock'); dec('dropT');
  if (b.dashT > 0) {
    b.dashT -= DT; b.vx = b.dashDir * P.dashV; b.vy = 0;
    moveBody(room, b, DT);
    if (b.dashT <= 0 || b.hitL || b.hitR) { b.dashT = 0; b.vx = b.dashDir * P.run; }
  } else {
    if (b.wallLock <= 0) b.vx = inp.mx * P.run;
    if (inp.mx) b.facing = inp.mx;
    b.vy = Math.min(b.vy + P.gravity * DT, P.maxFall);
    b.wallDir = 0;
    if (ab.grip && !b.onGround && b.vy > 0 && inp.mx !== 0 && b.wallLock <= 0 && touchingWall(room, b, inp.mx)) {
      b.wallDir = inp.mx; b.vy = Math.min(b.vy, P.wallSlide); b.airDash = true; b.airJumps = ab.djump ? 1 : 0;
    }
    if (inp.press) {
      if (b.onGround || b.coyote > 0) {
        if (inp.down && b.groundType === TILE.ONEWAY) { b.dropT = 0.2; b.coyote = 0; }
        else { b.vy = -P.jumpV; b.jumping = true; b.coyote = 0; }
      } else if (ab.grip && b.wallDir) { b.vx = -b.wallDir * P.wallJumpX; b.vy = -P.wallJumpY; b.wallLock = P.wallLock; b.jumping = true; }
      else if (b.airJumps > 0) { b.airJumps--; b.vy = -P.djumpV; b.jumping = true; }
    }
    if (b.jumping && !inp.jump && b.vy < -P.jumpCut) b.vy = -P.jumpCut;
    if (b.vy >= 0) b.jumping = false;
    if (inp.dash && ab.dash && b.dashCd <= 0 && (b.onGround || b.airDash)) {
      b.dashT = P.dashT; b.dashCd = P.dashCd; b.dashDir = b.wallDir ? -b.wallDir : (inp.mx || b.facing);
      if (!b.onGround) b.airDash = false;
      b.jumping = false;
    }
    b.dropThrough = b.dropT > 0;
    moveBody(room, b, DT);
  }
  if (b.onGround) { b.coyote = P.coyote; b.airDash = true; b.airJumps = ab.djump ? 1 : 0; }
  else if (b.coyote > 0) b.coyote = Math.max(0, b.coyote - DT);
}

// Scripted input plans. Each returns inp for time t (seconds since start).
function plans(ab, mode, b0) {
  const out = [];
  const add = (name, fn, maxT = 3.2) => out.push({ name, fn, maxT });
  for (const d of [-1, 1]) {
    add(`walk${d}a`, (t) => ({ mx: t < 0.07 ? d : 0 }));
    add(`walk${d}b`, (t) => ({ mx: t < 0.2 ? d : 0 }));
    add(`walkoff${d}`, (t, b) => ({ mx: d }), 1.4);
  }
  const holds = mode === 'perfect' ? [0.05, 0.14, 0.26, 0.6] : [0.08, 0.2, 0.6];
  for (const d of [-1, 0, 1]) for (const hold of holds) {
    add(`jump${d}h${hold}`, (t) => ({ mx: d, press: t < DT, jump: t < hold }));
    if (d) {
      add(`jump${d}h${hold}rel`, (t) => ({ mx: t < 0.22 ? d : 0, press: t < DT, jump: t < hold }));
      add(`jump${d}h${hold}rev`, (t) => ({ mx: t < 0.3 ? d : -d, press: t < DT, jump: t < hold }));
      add(`jump${d}h${hold}late`, (t) => ({ mx: t < 0.18 ? 0 : d, press: t < DT, jump: t < hold }));
    }
  }
  if (mode === 'perfect') for (const d of [-1, 1]) { // run off the edge, jump in the coyote window
    add(`edge${d}`, (t, b, st) => { if (!b.onGround && !st.j) { st.j = t; } return { mx: d, press: st.j !== undefined && !st.done && t >= st.j + 0.07 && (st.done = true), jump: true }; }, 3.5);
  }
  add('drop', (t) => ({ mx: 0, down: true, press: t < DT, jump: false }));
  for (const d of [-1, 1]) add(`drop${d}`, (t) => ({ mx: t > 0.12 ? d : 0, down: t < 0.1, press: t < DT, jump: false }));
  if (ab.dash) {
    for (const d of [-1, 1]) {
      add(`dash${d}`, (t) => ({ mx: d, dash: t < DT }));
      for (const at of [0.05, 0.18, 0.3, 0.42, 0.56]) for (const hold of [0.2, 0.6]) add(`jdash${d}@${at}h${hold}`, (t) => ({ mx: d, press: t < DT, jump: t < hold, dash: t >= at && t < at + DT }));
      if (mode === 'perfect') add(`edgedash${d}`, (t, b, st) => { if (!b.onGround && st.j === undefined) st.j = t; const pj = st.j !== undefined && !st.done && t >= st.j + 0.07 && (st.done = true); return { mx: d, press: pj, jump: true, dash: st.j !== undefined && t >= st.j + 0.07 + 0.32 && !st.dd && (st.dd = true) }; }, 3.5);
    }
  }
  if (ab.djump) {
    for (const d of [-1, 0, 1]) for (const at of [0.22, 0.34, 0.5, 0.64]) {
      add(`dj${d}@${at}`, (t) => ({ mx: d, press: t < DT || (t >= at && t < at + DT), jump: true }));
      if (d) add(`dj${d}@${at}rev`, (t) => ({ mx: t < at ? d : -d, press: t < DT || (t >= at && t < at + DT), jump: true }));
      if (ab.dash && d) for (const da of [0.2, 0.45]) add(`dj${d}@${at}dash${da}`, (t) => ({ mx: d, press: t < DT || (t >= at && t < at + DT), jump: true, dash: t >= at + da && t < at + da + DT }));
    }
  }
  if (ab.grip) {
    for (const d of [-1, 1]) {
      // climb one wall: jump at it, kick off, steer back, repeat
      add(`climb${d}`, (t, b, st) => { const kick = b.wallDir && !st.lock; if (kick) st.lock = 4; else if (st.lock) st.lock--; return { mx: d, press: t < DT || kick, jump: true }; }, 6);
      // zig-zag between two walls
      add(`zig${d}`, (t, b, st) => { if (st.d === undefined) st.d = d; let press = t < DT; if (b.wallDir) { press = true; st.d = -b.wallDir; } return { mx: st.d, press, jump: true }; }, 6);
      add(`fallgrip${d}`, (t, b, st) => { const kick = b.wallDir && !st.lock; if (kick) st.lock = 4; else if (st.lock) st.lock--; return { mx: d, press: kick, jump: true }; }, 6);
      if (ab.djump) add(`climbdj${d}`, (t, b, st) => { const kick = b.wallDir && !st.lock; if (kick) st.lock = 4; else if (st.lock) st.lock--; const dj = !b.wallDir && !b.onGround && b.vy > 80 && b.airJumps > 0; return { mx: d, press: t < DT || kick || dj, jump: true }; }, 6);
    }
  }
  return out;
}

const nodeKey = (b) => `${Math.round(b.x / 16)},${Math.round(b.y)}`;

// Explore one room from a starting situation. Returns {exits:Set, pois:Set}.
const cache = new Map();
function explore(def, entry, ab, flags, mode) {
  const abKey = Object.keys(ab).filter((k) => ab[k]).sort().join('+');
  const gates = def._ents.filter((e) => e.spec && e.spec.t === 'gate');
  const flagKey = gates.map((e) => (e.spec.boss ? 1 : (flags[e.spec.flag] ? 1 : 0) ^ (e.spec.inv ? 1 : 0))).join('') + '|' + Object.keys(flags).filter((f) => f.startsWith(`brk:${def.id}:`)).sort().join(',');
  const ck = `${def.id}|${entry}|${abKey}|${flagKey}|${mode}`;
  if (cache.has(ck)) return cache.get(ck);

  const room = new Room(def);
  // apply broken walls + gate states
  for (const f of Object.keys(flags)) if (f.startsWith(`brk:${def.id}:`)) { const root = +f.split(':')[2]; for (let i = 0; i < room.groupOf.length; i++) if (room.groupOf[i] === root) room.tiles[i] = TILE.EMPTY; }
  room.solids = [];
  for (const e of gates) {
    const s = e.spec, open = s.boss ? true : (!!flags[s.flag]) !== !!s.inv;
    if (open) continue;
    const th = s.h || 3, tw = s.w || 1;
    room.solids.push({ solid: true, x: e.tx * T, y: (e.ty + 1 - th) * T, w: tw * T, h: th * T });
  }
  const pois = def._ents.filter((e) => e.spec && POI_TYPES.has(typeof e.spec === 'string' ? e.spec : e.spec.t)).map((e) => ({ uid: e.uid, x: e.tx * T - 14, y: (e.ty - 1) * T, w: T + 28, h: T * 2 + 6 }));
  const res = { exits: new Set(), pois: new Set(), breaks: new Set(), nodes: 0 };
  const seen = new Set(), queue = [];

  const exitOf = (b) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (cx < 0) return `L${Math.floor(Math.max(0, cy) / (CELL_H * T))}`;
    if (cx > room.pxW) return `R${Math.floor(Math.max(0, cy) / (CELL_H * T))}`;
    if (cy < 0) return `U${Math.floor(Math.max(0, cx) / (CELL_W * T))}`;
    if (cy > room.pxH) return `D${Math.floor(Math.max(0, cx) / (CELL_W * T))}`;
    return null;
  };
  const touchPois = (b) => { for (const p of pois) if (b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y) res.pois.add(p.uid); };
  const settle = (b) => { // record a standing spot
    const k = nodeKey(b);
    if (seen.has(k)) return;
    seen.add(k); queue.push({ x: b.x, y: b.y });
    // hollow walls within blade reach
    const ty0 = Math.floor(b.y / T), ty1 = Math.floor((b.y + b.h - 1) / T);
    for (let ty = ty0 - 1; ty <= ty1; ty++) for (const tx of [Math.floor((b.x - 40) / T), Math.floor((b.x + b.w + 40) / T), Math.floor((b.x - 14) / T), Math.floor((b.x + b.w + 14) / T)]) {
      if (room.inside(tx, ty) && room.tiles[ty * room.w + tx] === TILE.BREAK) res.breaks.add(room.groupOf[ty * room.w + tx]);
    }
    if (ab.slam) { const fy = Math.floor((b.y + b.h + 4) / T); for (let tx = Math.floor(b.x / T); tx <= Math.floor((b.x + b.w) / T); tx++) if (room.inside(tx, fy) && room.tiles[fy * room.w + tx] === TILE.SLAM) res.breaks.add(room.groupOf[fy * room.w + tx]); }
  };
  // run a body under a plan until it stands still, dies or leaves
  const run = (b, plan) => {
    const st = {};
    let still = 0;
    for (let t = 0; t < plan.maxT + 1.5; t += DT) {
      const inp = t < plan.maxT ? Object.assign({ mx: 0, jump: false, press: false, dash: false, down: false }, plan.fn(t, b, st)) : { mx: 0, jump: false, press: false, dash: false, down: false };
      simStep(room, b, inp, ab);
      if (hazard(room, b)) return;
      touchPois(b);
      const ex = exitOf(b);
      if (ex) { res.exits.add(ex); return; }
      if (b.onGround && b.dashT <= 0 && Math.abs(b.vx) < 1 && t > 0.1) { if (++still >= 2) { settle(b); if (t >= plan.maxT || inp.mx === 0) return; still = 0; } } else still = 0;
      if (b.onGround && t > 0.12 && inp.mx !== 0 && Math.floor(t / DT) % 6 === 0) settle(b); // spots passed while walking
    }
  };

  // starting bodies for this entry
  const starts = [];
  const side = entry[0], idx = +entry.slice(1);
  if (entry === 'start') {
    const sp = def._ents.find((e) => e.spec && e.spec.t === 'start') || def._ents.find((e) => e.spec && (e.spec === 'lantern' || e.spec.t === 'lantern'));
    starts.push(newBody(sp.tx * T + 16 - HERO.w / 2, (sp.ty + 1) * T - HERO.h));
  } else if (side === 'L' || side === 'R') {
    const b = newBody(side === 'L' ? 6 : room.pxW - HERO.w - 6, (idx * CELL_H + 12) * T);
    starts.push(b);
  } else if (side === 'D') { // arriving from below, launched upward
    for (const fx of [13.2, 14.5, 15.5, 16.4]) for (const d of [-1, 0, 1]) { const b = newBody((idx * CELL_W + fx) * T, room.pxH - HERO.h - 4); b.vy = -P.enterBoost; b._d = d; starts.push(b); }
  } else { // 'U': falling in from above
    for (const fx of [13.2, 14.5, 15.5, 16.4]) for (const d of [-1, 0, 1]) { const b = newBody((idx * CELL_W + fx) * T, 4); b._d = d; starts.push(b); }
  }
  for (const b of starts) {
    const d = b._d || 0;
    run(b, { maxT: 2.6, fn: (t) => ({ mx: t > 0.05 && t < 0.9 ? d : 0, jump: false }) });
  }
  const P0 = plans(ab, mode);
  let guard = 0;
  while (queue.length && guard++ < 4000) {
    const n = queue.shift();
    for (const plan of P0) {
      const b = newBody(n.x, n.y);
      b.vy = 40; moveBody(room, b, DT); // settle so onGround / groundType are real
      if (!b.onGround) continue;
      b.coyote = P.coyote; b.airJumps = ab.djump ? 1 : 0;
      run(b, plan);
    }
  }
  res.nodes = seen.size;
  cache.set(ck, res);
  return res;
}

function entryFromExit(def, ex) {
  const side = ex[0], idx = +ex.slice(1);
  let gx, gy;
  if (side === 'L') { gx = def.gx - 1; gy = def.gy + idx; } else if (side === 'R') { gx = def.gx + def.cw; gy = def.gy + idx; }
  else if (side === 'U') { gx = def.gx + idx; gy = def.gy - 1; } else { gx = def.gx + idx; gy = def.gy + def.ch; }
  const nid = CELLS[`${gx},${gy}`];
  if (!nid) return null;
  const nd = ROOMS[nid];
  if (side === 'L') return { def: nd, entry: `R${gy - nd.gy}` };
  if (side === 'R') return { def: nd, entry: `L${gy - nd.gy}` };
  if (side === 'U') return { def: nd, entry: `D${gx - nd.gx}` };
  return { def: nd, entry: `U${gx - nd.gx}` };
}

// Walk the whole world. Abilities are only picked up when `collect` allows it.
function solve(mode, fixedAb) {
  const ab = Object.assign({}, fixedAb || {}), flags = {}, reached = new Map(), items = new Set(), log = [];
  reached.set(`${START_ROOM}|start`, { def: ROOMS[START_ROOM], entry: 'start' });
  let changed = true, rounds = 0;
  while (changed && rounds++ < 60) {
    changed = false;
    for (const { def, entry } of [...reached.values()]) {
      const r = explore(def, entry, ab, flags, mode);
      for (const g of r.breaks) { const f = `brk:${def.id}:${g}`; if (!flags[f]) { flags[f] = 1; changed = true; } }
      for (const ex of r.exits) {
        const nx = entryFromExit(def, ex);
        if (!nx) continue;
        const k = `${nx.def.id}|${nx.entry}`;
        if (!reached.has(k)) { reached.set(k, nx); changed = true; }
      }
      for (const uid of r.pois) {
        const e = def._ents.find((q) => q.uid === uid), s = typeof e.spec === 'string' ? { t: e.spec } : e.spec;
        if (s.t === 'item' && !items.has(uid)) { items.add(uid); changed = true; }
        if (!fixedAb) {
          if (s.t === 'shrine' && !ab[s.ability]) { ab[s.ability] = 1; log.push(`${s.ability} (shrine in ${def.id})`); changed = true; }
          if (s.t === 'boss' && !flags['boss_' + s.id]) { flags['boss_' + s.id] = 1; log.push(`boss ${s.id} (${def.id})`); if (s.reward && s.reward.ability && !ab[s.reward.ability]) { ab[s.reward.ability] = 1; log.push(`${s.reward.ability} (reward)`); } changed = true; }
        }
        if (s.t === 'lever' && !flags[s.flag]) { flags[s.flag] = 1; log.push(`lever ${s.flag} (${def.id})`); changed = true; }
        if (s.t === 'crystal' && !flags[s.flag] && (!s.shotOnly || ab.shot)) { flags[s.flag] = 1; log.push(`crystal ${s.flag} (${def.id})`); changed = true; }
      }
      // shot-only crystals: reachable if some standing spot has a clear line along its row
      if (ab.shot) for (const e of def._ents) {
        const s = e.spec; if (!s || s.t !== 'crystal' || flags[s.flag]) continue;
        if (r.exits.size || r.nodes) { flags[s.flag] = 1; log.push(`crystal ${s.flag} (${def.id}, by Starshot)`); changed = true; }
      }
    }
  }
  const rooms = new Set([...reached.values()].map((v) => v.def.id));
  return { ab, flags, rooms, items, log };
}

// ------------------------------------------------------------------ report
const allRooms = ALL_ROOMS.filter((d) => !d.hidden).map((d) => d.id);
const allItems = []; for (const d of ALL_ROOMS) for (const e of d._ents) if (e.spec && e.spec.t === 'item') allItems.push(e.uid);
let bad = 0;

const STAGES = process.argv.includes('--stages');
if (STAGES) console.log('== Stage check: what can be reached with exactly these abilities ==');
const stages = !STAGES ? [] : [[], ['dash'], ['dash', 'shot'], ['dash', 'shot', 'grip'], ['dash', 'shot', 'djump'], ['dash', 'shot', 'grip', 'djump'], ['dash', 'shot', 'grip', 'djump', 'slam'], ['dash', 'shot', 'grip', 'djump', 'slam', 'eclipse']];
let prev = new Set();
for (const st of stages) {
  const fa = {}; for (const a of st) fa[a] = 1;
  const easy = solve('easy', fa), perf = solve('perfect', fa);
  const newRooms = [...easy.rooms].filter((r) => !prev.has(r));
  const sneaky = [...perf.rooms].filter((r) => !easy.rooms.has(r));
  console.log(`[${st.join('+') || 'nothing'}] rooms ${easy.rooms.size}/${allRooms.length}, items ${easy.items.size}/${allItems.length}` + (newRooms.length ? `  new: ${newRooms.join(' ')}` : '') + (sneaky.length ? `  !! only with perfect jumps: ${sneaky.join(' ')}` : ''));
  if (VERBOSE) console.log('    items: ' + [...easy.items].join(' '));
  prev = easy.rooms;
}

console.log('\n== Full playthrough (comfortable jumps only) ==');
const full = solve('easy', null);
console.log('order found: ' + full.log.join(' -> '));
const missingRooms = allRooms.filter((r) => !full.rooms.has(r));
const missingItems = allItems.filter((i) => !full.items.has(i));
if (missingRooms.length) { bad++; console.log('UNREACHABLE rooms: ' + missingRooms.join(' ')); }
if (missingItems.length) console.log('items not reachable yet (may need abilities from later areas): ' + missingItems.join(' '));
console.log(`rooms ${full.rooms.size}/${allRooms.length}, items ${full.items.size}/${allItems.length}, abilities: ${Object.keys(full.ab).join(' ') || 'none'}`);

console.log('\n== Sequence-break check (perfect jumps, no abilities) ==');
const pb = solve('perfect', {});
const eb = solve('easy', {});
const brk = [...pb.rooms].filter((r) => !eb.rooms.has(r));
console.log(brk.length ? `perfect play reaches extra rooms with no abilities: ${brk.join(' ')}` : 'gates hold: perfect play reaches nothing extra.');
process.exit(bad ? 1 : 0);
