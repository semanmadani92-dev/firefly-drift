// Settings + three save slots, stored in the browser (localStorage).
import { G } from './state.js';

const PREFIX = 'moonwick.';
const mem = {}; // fallback when storage is blocked (private mode etc.)

function sget(k) { try { const v = localStorage.getItem(PREFIX + k); return v === null ? (mem[k] || null) : v; } catch (e) { return mem[k] || null; } }
function sset(k, v) { mem[k] = v; try { localStorage.setItem(PREFIX + k, v); } catch (e) { /* storage unavailable */ } }
function sdel(k) { delete mem[k]; try { localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ } }

export const DEFAULT_SETTINGS = { music: 0.7, sfx: 0.8, shake: true, quality: 'auto', touch: 'auto', touchSize: 1, keys: null, timer: false };

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(sget('settings') || '{}') || {}; } catch (e) { s = {}; }
  G.settings = Object.assign({}, DEFAULT_SETTINGS, s);
  return G.settings;
}
export function saveSettings() { sset('settings', JSON.stringify(G.settings)); }

export function newSave() {
  return {
    v: 1, created: Date.now(), played: 0,
    hp: 5, maxHp: 5, vials: 2, maxVials: 2, dew: 0, lumen: 0, lumenMax: 99, motes: 0, blade: 0,
    abilities: {}, relics: [], equipped: [], slots: 2, seeds: 0, glass: 0, shards: 0, charts: {},
    flags: {}, visited: {}, kills: {}, lore: {}, seen: {},
    lantern: null, lost: null, deaths: 0, area: 'village',
  };
}

export function readSlot(slot) {
  try {
    const raw = sget('slot' + slot);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return Object.assign(newSave(), d);
  } catch (e) { return null; }
}
export function writeSave() {
  if (!G.save) return false;
  G.save.savedAt = Date.now();
  sset('slot' + G.slot, JSON.stringify(G.save));
  sset('last', String(G.slot));
  return true;
}
export function deleteSlot(slot) { sdel('slot' + slot); }
export function lastSlot() { const v = sget('last'); return v === null ? -1 : parseInt(v, 10); }

export const flag = (k) => !!(G.save && G.save.flags[k]);
export function setFlag(k, v = true) { if (G.save) { if (v) G.save.flags[k] = 1; else delete G.save.flags[k]; } }
export const has = (ability) => !!(G.save && G.save.abilities[ability]);
export const equipped = (relic) => !!(G.save && G.save.equipped.includes(relic));
