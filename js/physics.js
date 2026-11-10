// Tile collision shared by the game and by the level validator (no DOM here).
import { T, TILE } from './config.js';

const EPS = 0.001;

export function tileSolid(room, tx, ty, body) {
  const t = room.tile(tx, ty);
  if (t === TILE.SOLID || t === TILE.BREAK || t === TILE.SLAM || t === TILE.GRATE) return true;
  if (t === TILE.SPIKE || t === TILE.LIQUID) return !!(body && body.avoidHazard);
  return false;
}

function boxHit(a, s) {
  return a.x < s.x + s.w && a.x + a.w > s.x && a.y < s.y + s.h && a.y + a.h > s.y;
}

// Moves a body {x,y,w,h,vx,vy} through the room, resolving against tiles and
// solid entities. Sets onGround / hitL / hitR / hitCeil / groundType.
export function moveBody(room, b, dt) {
  b.hitL = b.hitR = b.hitCeil = false;
  b.onGround = false;
  b.groundType = 0;
  const solids = room.solids || [];

  // ---- horizontal
  const dx = b.vx * dt;
  if (dx !== 0) {
    b.x += dx;
    const ty0 = Math.floor(b.y / T), ty1 = Math.floor((b.y + b.h - EPS) / T);
    if (dx > 0) {
      const tx = Math.floor((b.x + b.w - EPS) / T);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (tileSolid(room, tx, ty, b)) { b.x = tx * T - b.w; b.vx = 0; b.hitR = true; break; }
      }
    } else {
      const tx = Math.floor(b.x / T);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (tileSolid(room, tx, ty, b)) { b.x = (tx + 1) * T; b.vx = 0; b.hitL = true; break; }
      }
    }
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (!s.solid || s === b || !boxHit(b, s)) continue;
      if (dx > 0) { b.x = s.x - b.w; b.hitR = true; } else { b.x = s.x + s.w; b.hitL = true; }
      b.vx = 0;
    }
  }

  // ---- vertical
  const dy = b.vy * dt;
  const prevBottom = b.y + b.h;
  b.y += dy;
  const tx0 = Math.floor(b.x / T), tx1 = Math.floor((b.x + b.w - EPS) / T);
  if (dy >= 0) {
    const ty = Math.floor((b.y + b.h - EPS) / T);
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = room.tile(tx, ty);
      const oneway = t === TILE.ONEWAY && !b.dropThrough && prevBottom <= ty * T + 0.01;
      if (oneway || tileSolid(room, tx, ty, b)) {
        b.y = ty * T - b.h; b.vy = 0; b.onGround = true;
        if (!b.groundType || t === TILE.SOLID) b.groundType = t;
        if (t === TILE.SOLID) break;
      }
    }
  } else {
    const ty = Math.floor(b.y / T);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tileSolid(room, tx, ty, b)) { b.y = (ty + 1) * T; b.vy = 0; b.hitCeil = true; break; }
    }
  }
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (!s.solid || s === b || !boxHit(b, s)) continue;
    if (dy >= 0) { b.y = s.y - b.h; b.onGround = true; if (!b.groundType) b.groundType = TILE.SOLID; } else { b.y = s.y + s.h; b.hitCeil = true; }
    b.vy = 0;
  }
}

// Is there a wall directly beside the body on side `dir` (-1 / +1)?
export function touchingWall(room, b, dir) {
  const px = dir > 0 ? b.x + b.w + 1 : b.x - 1;
  const tx = Math.floor(px / T);
  const t1 = room.tile(tx, Math.floor((b.y + b.h * 0.2) / T));
  const t2 = room.tile(tx, Math.floor((b.y + b.h * 0.8) / T));
  const ok = (t) => t === TILE.SOLID || t === TILE.SLAM || t === TILE.BREAK || t === TILE.GRATE;
  return ok(t1) && ok(t2);
}

// Point queries in pixels.
export function solidAt(room, px, py, body) {
  return tileSolid(room, Math.floor(px / T), Math.floor(py / T), body);
}

export function standableAt(room, px, py) {
  const t = room.tile(Math.floor(px / T), Math.floor(py / T));
  return t === TILE.SOLID || t === TILE.ONEWAY || t === TILE.BREAK || t === TILE.SLAM || t === TILE.GRATE;
}

// Straight line of sight between two points (coarse steps of half a tile).
export function lineClear(room, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / (T * 0.5)));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const tt = room.tile(Math.floor((x0 + (x1 - x0) * t) / T), Math.floor((y0 + (y1 - y0) * t) / T));
    if (tt === TILE.SOLID || tt === TILE.BREAK || tt === TILE.SLAM) return false;
  }
  return true;
}
