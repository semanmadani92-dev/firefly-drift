// Level checker. Run with:  node tools/validate.mjs
// Verifies room shapes, that doors line up between neighbouring rooms, and
// that every map letter means something.
import { ALL_ROOMS } from '../js/data/rooms.js';
import { registerRooms, ROOMS, CELLS, TILE_CH, REG } from '../js/world.js';
import { CELL_W, CELL_H, TILE } from '../js/config.js';

let errors = 0, warns = 0;
const err = (m) => { errors++; console.log('ERROR ' + m); };
const warn = (m) => { warns++; console.log('warn  ' + m); };

for (const def of ALL_ROOMS) {
  const rows = def.rows;
  if (rows.length % CELL_H !== 0) err(`${def.id}: ${rows.length} rows is not a multiple of ${CELL_H}`);
  rows.forEach((r, i) => { if (r.length !== rows[0].length) err(`${def.id}: row ${i} has ${r.length} chars, expected ${rows[0].length}: "${r}"`); });
  if (rows[0].length % CELL_W !== 0) err(`${def.id}: width ${rows[0].length} is not a multiple of ${CELL_W}`);
}
if (errors) { console.log(`\n${errors} error(s). Fix shapes first.`); process.exit(1); }

const seenCells = {};
for (const def of ALL_ROOMS) {
  const cw = def.rows[0].length / CELL_W, ch = def.rows.length / CELL_H;
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const k = `${def.gx + cx},${def.gy + cy}`;
    if (seenCells[k]) err(`${def.id} overlaps ${seenCells[k]} at cell ${k}`);
    seenCells[k] = def.id;
  }
}
registerRooms(ALL_ROOMS);

const passable = (t) => t === TILE.EMPTY || t === TILE.ONEWAY;
const tileOf = (def, x, y) => def._tiles[y * def.w + x];
const known = new Set(['start', 'lantern', 'geode', 'dewbloom', 'item', 'shrine', 'hint', 'tablet', 'gate', 'lever', 'crystal', 'npc', 'prop', 'boss',
  'mossback', 'snuffling', 'kite', 'spitter', 'brute', 'inkblot', 'quill', 'tome', 'eel', 'sentinel',
  'jet', 'lift', 'saw', 'crumble', 'barrier', 'cinderling', 'bellowsback', 'emberfly', 'tinknight',
  'drip', 'prismite', 'orbiter', 'wisp', 'lancer', 'moonseed']);

for (const def of ALL_ROOMS) {
  for (const e of def._ents) {
    if (e.spec === null && !(e.ch in (def.key || {}))) err(`${def.id}: letter '${e.ch}' at ${e.tx},${e.ty} has no meaning`);
    else if (e.spec) { const t = typeof e.spec === 'string' ? e.spec : e.spec.t; if (!known.has(t)) warn(`${def.id}: unknown thing type '${t}'`); }
  }
  if (def.hidden) continue;
  // door alignment on all four sides
  const sides = [
    { name: 'left', n: def.h, at: (i) => [0, i], nb: (i) => [def.gx - 1, def.gy + Math.floor(i / CELL_H)], nat: (nd, i) => [nd.w - 1, i + (def.gy - nd.gy) * CELL_H] },
    { name: 'right', n: def.h, at: (i) => [def.w - 1, i], nb: (i) => [def.gx + def.cw, def.gy + Math.floor(i / CELL_H)], nat: (nd, i) => [0, i + (def.gy - nd.gy) * CELL_H] },
    { name: 'top', n: def.w, at: (i) => [i, 0], nb: (i) => [def.gx + Math.floor(i / CELL_W), def.gy - 1], nat: (nd, i) => [i + (def.gx - nd.gx) * CELL_W, nd.h - 1] },
    { name: 'bottom', n: def.w, at: (i) => [i, def.h - 1], nb: (i) => [def.gx + Math.floor(i / CELL_W), def.gy + def.ch], nat: (nd, i) => [i + (def.gx - nd.gx) * CELL_W, 0] },
  ];
  for (const s of sides) {
    const reported = new Set();
    for (let i = 0; i < s.n; i++) {
      const [x, y] = s.at(i);
      const open = passable(tileOf(def, x, y));
      const [ngx, ngy] = s.nb(i);
      const nid = CELLS[`${ngx},${ngy}`];
      if (!nid) { if (open && !def.open && !reported.has('none')) { reported.add('none'); warn(`${def.id}: ${s.name} side opens at ${x},${y} but no room is there yet`); } continue; }
      const nd = ROOMS[nid];
      const [nx, ny] = s.nat(nd, i);
      const nopen = passable(tileOf(nd, nx, ny));
      if (open !== nopen && !reported.has(nid)) { reported.add(nid); err(`${def.id}: ${s.name} side at ${x},${y} is ${open ? 'open' : 'closed'} but ${nid} at ${nx},${ny} is ${nopen ? 'open' : 'closed'}`); }
    }
  }
}
console.log(`\n${ALL_ROOMS.length} rooms, ${Object.keys(CELLS).length} cells. ${errors} error(s), ${warns} warning(s).`);
process.exit(errors ? 1 : 0);
