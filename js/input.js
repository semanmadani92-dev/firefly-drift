// Keyboard + gamepad + touch input, merged into one set of named actions.
import { G } from './state.js';

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'spell', 'heal', 'interact', 'map', 'pause', 'confirm', 'back'];

export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ'], attack: ['KeyX', 'KeyJ'], dash: ['KeyC', 'KeyK', 'ShiftLeft'], spell: ['KeyV', 'KeyL'],
  heal: ['KeyF', 'KeyH'], interact: ['KeyE'], map: ['KeyM', 'Tab'], pause: ['Escape', 'KeyP'], confirm: ['Enter'], back: ['Backspace'],
};

const KEY_LABEL = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace' };
export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_LABEL[code]) return KEY_LABEL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

const PAD_BTN = { 0: 'jump', 2: 'attack', 1: 'spell', 3: 'heal', 5: 'dash', 7: 'dash', 4: 'heal', 6: 'heal', 9: 'pause', 8: 'map', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const PAD_LABEL = { jump: 'A', attack: 'X', spell: 'B', heal: 'Y', dash: 'RB', pause: 'Start', map: 'Select', up: '↑', interact: '↑' };
const TOUCH_LABEL = { jump: 'Jump', attack: 'Strike', dash: 'Dash', spell: 'Spell', heal: 'Sip', up: '↑', interact: '↑', map: 'Map', pause: 'Pause' };

const src = { kbd: {}, pad: {}, touch: {} };
const keysHeld = new Set();
let keyToAction = {};

export const Input = {
  down: {},        // action -> held right now
  pressed: {},     // action -> pressed during this sim step
  queued: {},      // presses waiting for the next sim step
  device: 'kbd',   // last used: kbd | pad | touch
  onNav: null,     // (action, repeat) => void, used by menus
  onAny: null,     // first-gesture hook (audio unlock)
  onDevice: null,
  capture: null,   // when set, next keydown is handed to this fn (key rebinding)
  touchSeen: false,

  init() {
    this.rebuild();
    addEventListener('keydown', (e) => this._key(e, true), { passive: false });
    addEventListener('keyup', (e) => this._key(e, false), { passive: false });
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); if (G.onHidden) G.onHidden(); } });
    this._initTouch();
  },

  rebuild() {
    const keys = (G.settings && G.settings.keys) || DEFAULT_KEYS;
    keyToAction = {};
    for (const a of Object.keys(DEFAULT_KEYS)) for (const k of (keys[a] || DEFAULT_KEYS[a])) keyToAction[k] = a;
    keyToAction.ShiftRight = keyToAction.ShiftLeft || keyToAction.ShiftRight;
  },

  clear() {
    keysHeld.clear();
    for (const s of Object.values(src)) for (const k of Object.keys(s)) s[k] = false;
    for (const a of ACTIONS) this.down[a] = false;
    this.queued = {};
  },

  setDevice(d) {
    if (this.device !== d) { this.device = d; if (this.onDevice) this.onDevice(d); }
  },

  _set(source, action, val, repeat) {
    const was = !!this.down[action];
    src[source][action] = val;
    const now = !!(src.kbd[action] || src.pad[action] || src.touch[action]);
    this.down[action] = now;
    if (val && (!was || repeat)) {
      if (!repeat) this.queued[action] = true;
      if (this.onAny) this.onAny();
      if (G.uiOpen && this.onNav) this.onNav(action, !!repeat);
    }
  },

  _key(e, isDown) {
    if (this.capture && isDown) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code); return; }
    const tag = e.target && e.target.tagName;
    const a = keyToAction[e.code];
    if (!a) return;
    if (tag === 'INPUT' && e.target.type !== 'range') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    this.setDevice('kbd');
    if (isDown) {
      if (e.repeat) { if (G.uiOpen) this._set('kbd', a, true, true); return; }
      keysHeld.add(e.code);
      this._set('kbd', a, true);
    } else {
      keysHeld.delete(e.code);
      // still held through another key bound to the same action?
      let still = false;
      for (const k of keysHeld) if (keyToAction[k] === a) { still = true; break; }
      if (!still) this._set('kbd', a, false);
    }
  },

  // called once per rendered frame
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const want = {};
    gp.buttons.forEach((b, i) => { if (b.pressed && PAD_BTN[i]) want[PAD_BTN[i]] = true; });
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (ax < -0.45) want.left = true; if (ax > 0.45) want.right = true;
    if (ay < -0.6) want.up = true; if (ay > 0.6) want.down = true;
    let any = false;
    for (const a of ACTIONS) {
      const v = !!want[a];
      if (v !== !!src.pad[a]) { this._set('pad', a, v); any = any || v; }
    }
    if (any) this.setDevice('pad');
  },

  // called once per simulation step
  step() {
    this.pressed = this.queued;
    this.queued = {};
  },

  // Human label for an action on the device currently in use.
  label(action) {
    if (this.device === 'touch') return TOUCH_LABEL[action] || action;
    if (this.device === 'pad') return PAD_LABEL[action] || action;
    const keys = (G.settings && G.settings.keys) || DEFAULT_KEYS;
    const k = (keys[action] || DEFAULT_KEYS[action] || [])[0];
    return keyLabel(k);
  },

  // ---------------------------------------------------------------- touch
  _initTouch() {
    const root = document.getElementById('touch');
    if (!root) return;
    const zone = document.getElementById('stick-zone');
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    let pid = null, ox = 0, oy = 0;
    const setDirs = (dx, dy) => {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const h = ax > 12, v = ay > 26 && ay > ax * 0.75;
      this._setT('left', h && dx < 0); this._setT('right', h && dx > 0);
      this._setT('up', v && dy < 0); this._setT('down', v && dy > 0);
    };
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null; setDirs(0, 0);
      base.style.left = ''; base.style.top = ''; knob.style.transform = ''; base.classList.remove('live');
    };
    zone.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      e.preventDefault();
      pid = e.pointerId; ox = e.clientX; oy = e.clientY;
      try { zone.setPointerCapture(pid); } catch (err) { /* ignore */ }
      const r = zone.getBoundingClientRect();
      base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
      base.classList.add('live');
      this._touched();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy), max = 46;
      if (d > max) { // drag the origin along so reversing direction is instant
        ox += dx * (1 - max / d); oy += dy * (1 - max / d);
        dx = e.clientX - ox; dy = e.clientY - oy;
        const r = zone.getBoundingClientRect();
        base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      setDirs(dx, dy);
    });
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    root.querySelectorAll('[data-act]').forEach((el) => {
      const act = el.dataset.act;
      let bp = null;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); bp = e.pointerId;
        try { el.setPointerCapture(bp); } catch (err) { /* ignore */ }
        el.classList.add('on'); this._touched(); this._setT(act, true);
      });
      const up = (e) => { if (e.pointerId !== bp) return; bp = null; el.classList.remove('on'); this._setT(act, false); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    addEventListener('touchstart', () => this._touched(), { passive: true });
  },
  _touched() { this.touchSeen = true; this.setDevice('touch'); if (this.onAny) this.onAny(); },
  _setT(a, v) { if (!!src.touch[a] !== v) this._set('touch', a, v); },
};
for (const a of ACTIONS) Input.down[a] = false;
