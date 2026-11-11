// Room registry + runtime Room. Pure data and logic (no DOM), so the level
// validator can import it under Node.
import { T, CELL_W, CELL_H, TILE } from './config.js';
import { G } from './state.js';

export const ROOMS = {};   // id -> room definition
export const CELLS = {};   // "gx,gy" -> room id
export const REG = {};     // entity type -> factory(room, spec, px, py, info)
export function register(type, fn) { REG[type] = fn; }

export const TILE_CH = { '#': TILE.SOLID, '.': TILE.EMPTY, ' ': TILE.EMPTY, '=': TILE.ONEWAY, '^': TILE.SPIKE, '~': TILE.LIQUID, '%': TILE.BREAK, '&': TILE.SLAM, ':': TILE.GRATE };

// Map characters that mean the same thing in every room.
export const DEFAULT_KEY = {
  P: { t: 'start' },
  L: { t: 'lantern' },
  o: { t: 'geode' },
  d: { t: 'dewbloom' },
};

// Helpers for writing rooms one 30x17 cell at a time.
export function hjoin(...cells) { return cells[0].map((_, i) => cells.map((c) => c[i]).join('')); }
export function vjoin(...parts) { return [].concat(...parts); }

export function registerRooms(list) {
  for (const def of list) {
    const rows = def.rows;
    def.h = rows.length;
    def.w = rows[0].length;
    def.cw = Math.round(def.w / CELL_W);
    def.ch = Math.round(def.h / CELL_H);
    const tiles = new Uint8Array(def.w * def.h);
    const ents = [];
    const key = Object.assign({}, DEFAULT_KEY, def.key || {});
    for (let y = 0; y < def.h; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < def.w; x++) {
        const ch = row[x] || '#';
        if (ch in TILE_CH) tiles[y * def.w + x] = TILE_CH[ch];
        else {
          const sp = key[ch] || null;
          tiles[y * def.w + x] = sp && sp.tile ? TILE_CH[sp.tile] : TILE.EMPTY;
          ents.push({ ch, tx: x, ty: y, spec: sp, uid: `${def.id}:${x},${y}` });
        }
      }
    }
    def._tiles = tiles;
    def._ents = ents;
    def._key = key;
    ROOMS[def.id] = def;
    for (let cy = 0; cy < def.ch; cy++) for (let cx = 0; cx < def.cw; cx++) CELLS[`${def.gx + cx},${def.gy + cy}`] = def.id;
  }
}

export function roomAtCell(gx, gy) { const id = CELLS[`${gx},${gy}`]; return id ? ROOMS[id] : null; }

function passable(t) { return t === TILE.EMPTY || t === TILE.ONEWAY; }

// For the map screen: what does each side of a cell look like?
// 'in' = same room continues, 'door' = opening to another room, 'wall' = closed.
export function cellEdges(def, cx, cy) {
  def._edges = def._edges || {};
  const k = `${cx},${cy}`;
  if (def._edges[k]) return def._edges[k];
  const t = (x, y) => def._tiles[y * def.w + x];
  const x0 = cx * CELL_W, y0 = cy * CELL_H;
  const e = { L: 'wall', R: 'wall', U: 'wall', D: 'wall' };
  const scanV = (x) => { for (let y = y0; y < y0 + CELL_H; y++) if (passable(t(x, y))) return true; return false; };
  const scanH = (y) => { for (let x = x0; x < x0 + CELL_W; x++) if (passable(t(x, y))) return true; return false; };
  const nb = (dx, dy) => !!CELLS[`${def.gx + cx + dx},${def.gy + cy + dy}`];
  e.L = cx > 0 ? 'in' : scanV(x0) && nb(-1, 0) ? 'door' : 'wall';
  e.R = cx < def.cw - 1 ? 'in' : scanV(x0 + CELL_W - 1) && nb(1, 0) ? 'door' : 'wall';
  e.U = cy > 0 ? 'in' : scanH(y0) && nb(0, -1) ? 'door' : 'wall';
  e.D = cy < def.ch - 1 ? 'in' : scanH(y0 + CELL_H - 1) && nb(0, 1) ? 'door' : 'wall';
  def._edges[k] = e;
  return e;
}

export class Room {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.area = def.area;
    this.w = def.w; this.h = def.h;
    this.pxW = def.w * T; this.pxH = def.h * T;
    this.tiles = Uint8Array.from(def._tiles);
    this.entities = [];
    this.solids = [];
    this.groupOf = null;
    this.breakHits = new Map();
    this.startPos = null;
    this._groupBreakables();
  }

  tile(tx, ty) {
    if (tx < 0) tx = 0; else if (tx >= this.w) tx = this.w - 1;
    if (ty < 0) ty = 0; else if (ty >= this.h) ty = this.h - 1;
    return this.tiles[ty * this.w + tx];
  }
  inside(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  setTile(tx, ty, v) { if (this.inside(tx, ty)) this.tiles[ty * this.w + tx] = v; }

  // Breakable walls / slam floors come in connected groups that break together.
  _groupBreakables() {
    const w = this.w, h = this.h, tl = this.tiles;
    const group = new Int32Array(w * h).fill(-1);
    const flags = (G.save && G.save.flags) || {};
    for (let i = 0; i < w * h; i++) {
      if ((tl[i] !== TILE.BREAK && tl[i] !== TILE.SLAM) || group[i] !== -1) continue;
      const kind = tl[i];
      const stack = [i], cells = [];
      group[i] = i;
      while (stack.length) {
        const c = stack.pop(); cells.push(c);
        const x = c % w, y = (c / w) | 0;
        const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (tl[j] === kind && group[j] === -1) { group[j] = i; stack.push(j); }
        }
      }
      if (flags[`brk:${this.id}:${i}`]) for (const c of cells) tl[c] = TILE.EMPTY;
    }
    this.groupOf = group;
  }

  // Returns the list of tile indices in the group containing (tx,ty).
  groupCells(tx, ty) {
    const root = this.groupOf[ty * this.w + tx];
    const out = [];
    if (root < 0) return out;
    for (let i = 0; i < this.groupOf.length; i++) if (this.groupOf[i] === root && this.tiles[i] !== TILE.EMPTY) out.push(i);
    return out;
  }

  spawnAll() {
    for (const info of this.def._ents) {
      const spec = info.spec;
      if (!spec) continue;
      const s = typeof spec === 'string' ? { t: spec } : spec;
      const px = info.tx * T + T / 2, py = (info.ty + 1) * T;
      if (s.t === 'start') { this.startPos = { x: px, y: py }; continue; }
      const f = REG[s.t];
      if (!f) { if (G.debug) console.warn('no factory for', s.t); continue; }
      const e = f(this, s, px, py, info);
      if (e) this.add(e);
    }
  }

  add(e) {
    e.room = this;
    this.entities.push(e);
    if (e.solid !== undefined) this.solids.push(e);
    return e;
  }

  update(dt) {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (!e.dead) e.update(dt); }
    let dead = false;
    for (let i = 0; i < list.length; i++) if (list[i].dead) { dead = true; break; }
    if (dead) {
      this.entities = list.filter((e) => !e.dead);
      this.solids = this.solids.filter((e) => !e.dead);
    }
  }

  find(type) { return this.entities.find((e) => e.type === type && !e.dead); }
  all(type) { return this.entities.filter((e) => e.type === type && !e.dead); }
}

// Which neighbouring room (if any) lies beyond the edge the point just crossed?
export function neighborFor(room, px, py) {
  const def = room.def;
  const gpx = def.gx * CELL_W * T + px, gpy = def.gy * CELL_H * T + py;
  const gx = Math.floor(gpx / (CELL_W * T)), gy = Math.floor(gpy / (CELL_H * T));
  const nd = roomAtCell(gx, gy);
  if (!nd || nd === def) return null;
  return { def: nd, x: gpx - nd.gx * CELL_W * T, y: gpy - nd.gy * CELL_H * T };
}

export function cellOf(room, px, py) {
  const def = room.def;
  const cx = Math.min(def.cw - 1, Math.max(0, Math.floor(px / (CELL_W * T))));
  const cy = Math.min(def.ch - 1, Math.max(0, Math.floor(py / (CELL_H * T))));
  return { gx: def.gx + cx, gy: def.gy + cy };
}
