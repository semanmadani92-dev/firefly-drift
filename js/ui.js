// HUD + every menu. All of this is ordinary HTML layered over the canvas.
import { G } from './state.js';
import { Input, DEFAULT_KEYS, keyLabel } from './input.js';
import { Sound } from './audio.js';
import { saveSettings, readSlot, deleteSlot, has, flag, setFlag } from './save.js';
import { AREAS, CELL_W, CELL_H, VERSION } from './config.js';
import { ROOMS, CELLS, cellEdges } from './world.js';
import { RELICS, ABILITIES, BESTIARY, TABLETS, SHOPS, INTRO, ENDING, CREDITS } from './data/text.js';
import { giveItem } from './entities.js';
import { fmtTime, clamp } from './util.js';
import { resize } from './gfx.js';
import { BLADE_DMG } from './player.js';

const $ = (id) => document.getElementById(id);
const PIP = '<svg class="pip CLS" viewBox="0 0 16 20"><path d="M8 1C12 6 15 9 15 13A7 7 0 0 1 1 13C1 9 4 6 8 1Z"/></svg>';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Replace {action} with the current device's button name.
export function fmt(text, html = true) {
  return esc(text).replace(/\{(\w+)\}/g, (m, a) => (html ? `<kbd>${esc(Input.label(a))}</kbd>` : Input.label(a)));
}

function completion() {
  const S = G.save;
  let total = 0, got = 0;
  for (const id in ROOMS) for (const e of ROOMS[id]._ents) {
    const s = e.spec; if (!s || typeof s === 'string') continue;
    if (s.t === 'item') { total++; if (S.flags['got:' + e.uid]) got++; }
    else if (s.t === 'shrine') { total++; if (S.abilities[s.ability]) got++; }
    else if (s.t === 'boss') { total += 2; if (S.flags['boss_' + s.id]) got += 2; }
  }
  for (const k in SHOPS) for (const w of SHOPS[k]) { total++; if (S.flags['shop:' + w.id]) got++; }
  return total ? Math.round(got / total * 100) : 0;
}

export const UI = {
  stack: [], dlg: null, h: {}, toastT: 0, shownMotes: 0, tab: 'map', intro: null, cardCb: null, confirmCb: null, shopId: null,

  init() {
    Input.onNav = (a, rep) => this.nav(a, rep);
    Input.onDevice = () => { this.applyTouch(); this.h = {}; };
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => this.back()));
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.btn')) Sound.play('uiok'); });
    // title
    $('btn-continue').onclick = () => G.game.continueGame();
    $('btn-start').onclick = () => this.open('s-slots');
    $('btn-options').onclick = () => this.open('s-options');
    $('btn-help').onclick = () => this.open('s-help');
    // pause
    $('p-resume').onclick = () => this.back();
    $('p-map').onclick = () => this.openInv('map');
    $('p-options').onclick = () => this.open('s-options');
    $('p-help').onclick = () => this.open('s-help');
    $('p-quit').onclick = () => G.game.quitToTitle();
    // options
    const S = G.settings;
    const cyc = (id, key, vals, labels, after) => {
      const el = $(id);
      const paint = () => { el.textContent = labels[Math.max(0, vals.indexOf(G.settings[key]))]; };
      el.onclick = () => { const i = (vals.indexOf(G.settings[key]) + 1) % vals.length; G.settings[key] = vals[i]; paint(); saveSettings(); if (after) after(); };
      paint(); el._paint = paint;
    };
    $('o-music').value = Math.round(S.music * 100); $('o-sfx').value = Math.round(S.sfx * 100);
    $('o-music').oninput = (e) => { G.settings.music = e.target.value / 100; Sound.volumes(); saveSettings(); };
    $('o-sfx').oninput = (e) => { G.settings.sfx = e.target.value / 100; Sound.volumes(); saveSettings(); Sound.play('mote'); };
    cyc('o-shake', 'shake', [true, false], ['On', 'Off']);
    cyc('o-quality', 'quality', ['auto', 'low', 'med', 'high'], ['Auto', 'Low (fastest)', 'Medium', 'High (sharpest)'], () => resize());
    cyc('o-touch', 'touch', ['auto', 'on', 'off'], ['Auto', 'Always show', 'Never show'], () => this.applyTouch());
    cyc('o-tsize', 'touchSize', [0.85, 1, 1.2], ['Small', 'Medium', 'Large'], () => this.applyTouch());
    cyc('o-timer', 'timer', [false, true], ['Off', 'On']);
    $('o-keys').onclick = () => this.open('s-keys');
    $('o-full').onclick = () => {
      const d = document, el = d.documentElement;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => this.toast('Full screen is not available here. On a phone, add the game to your home screen instead.'));
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else this.toast('Full screen is not available here. On a phone, add the game to your home screen instead.');
    };
    $('keys-reset').onclick = () => { G.settings.keys = null; saveSettings(); Input.rebuild(); this.renderKeys(); };
    // inventory tabs
    document.querySelectorAll('.tab[data-tab]').forEach((b) => { b.onclick = () => { this.tab = b.dataset.tab; this.renderInv(); }; });
    // misc
    $('card-ok').onclick = () => this.closeCard();
    $('confirm-no').onclick = () => { this.confirmCb = null; this.close(); };
    $('confirm-yes').onclick = () => { const cb = this.confirmCb; this.confirmCb = null; this.close(); if (cb) cb(); };
    $('end-ok').onclick = () => G.game.quitToTitle(true);
    $('dialog').addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.dlg) this.dlgNext(); });
    $('s-intro').addEventListener('pointerdown', () => this.introNext());
    addEventListener('resize', () => { if (this.top() === 's-inv' && this.tab === 'map') this.renderMap(); });
    this.applyTouch();
  },

  // ------------------------------------------------------------ screen stack
  top() { return this.stack[this.stack.length - 1] || null; },
  sync() {
    const was = G.uiOpen;
    G.uiOpen = this.stack.length > 0 || !!this.dlg;
    if (was && !G.uiOpen) { Input.queued = {}; }
    this.applyTouch();
  },
  open(id) {
    const cur = this.top();
    if (cur === id) return;
    if (cur) $(cur).classList.add('hidden');
    this.stack.push(id);
    $(id).classList.remove('hidden');
    this.onShow(id); this.sync(); this.focusFirst();
  },
  close() {
    const id = this.stack.pop();
    if (id) $(id).classList.add('hidden');
    const cur = this.top();
    if (cur) { $(cur).classList.remove('hidden'); this.onShow(cur); this.focusFirst(); }
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.sync();
  },
  closeAll() {
    for (const id of this.stack) $(id).classList.add('hidden');
    this.stack = [];
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.sync();
  },
  back() {
    const id = this.top();
    if (!id || id === 's-title' || id === 's-end') return;
    if (id === 's-card') { this.closeCard(); return; }
    if (id === 's-intro') { this.introNext(true); return; }
    if (id === 's-confirm') { this.confirmCb = null; }
    Sound.play('uiback');
    this.close();
  },
  onShow(id) {
    if (id === 's-title') {
      const has1 = [0, 1, 2].some((i) => readSlot(i));
      $('btn-continue').classList.toggle('hidden', !has1);
      $('title-fine').textContent = `v${VERSION}  -  your journey is saved in this browser`;
    } else if (id === 's-slots') this.renderSlots();
    else if (id === 's-options') { $('o-music').value = Math.round(G.settings.music * 100); $('o-sfx').value = Math.round(G.settings.sfx * 100); ['o-shake', 'o-quality', 'o-touch', 'o-tsize', 'o-timer'].forEach((k) => $(k)._paint && $(k)._paint()); }
    else if (id === 's-keys') this.renderKeys();
    else if (id === 's-help') this.renderHelp();
    else if (id === 's-inv') this.renderInv();
    else if (id === 's-shop') this.renderShop();
  },
  focusables(id) {
    return [...$(id).querySelectorAll('button, input')].filter((el) => !el.disabled && el.offsetParent !== null);
  },
  focusFirst() {
    const id = this.top(); if (!id) return;
    if (Input.device === 'touch') return;
    const els = this.focusables(id);
    const pref = els.find((e) => e.classList.contains('prefer')) || els[0];
    if (pref) pref.focus({ preventScroll: false });
  },
  nav(a, rep) {
    if (this.dlg) { if (!rep && (a === 'confirm' || a === 'jump' || a === 'attack' || a === 'interact' || a === 'up')) this.dlgNext(); return; }
    const id = this.top();
    if (!id) return;
    if (a === 'pause' || a === 'back' || (a === 'attack' && !rep)) { if (!rep) this.back(); return; }
    if (a === 'map' && id === 's-inv') { if (!rep) this.back(); return; }
    if (id === 's-intro') { if (!rep && (a === 'confirm' || a === 'jump')) this.introNext(); return; }
    const els = this.focusables(id);
    if (!els.length) return;
    let i = els.indexOf(document.activeElement);
    const move = (d) => { i = i < 0 ? 0 : (i + d + els.length) % els.length; els[i].focus(); Sound.play('ui'); };
    if (a === 'up') move(-1);
    else if (a === 'down') move(1);
    else if (a === 'left' || a === 'right') {
      const el = els[i], d = a === 'right' ? 1 : -1;
      if (el && el.type === 'range') { el.value = clamp(+el.value + d * (+el.step || 1), +el.min, +el.max); el.dispatchEvent(new Event('input')); }
      else if (id === 's-inv') { const tabs = ['map', 'gear', 'journal']; this.tab = tabs[(tabs.indexOf(this.tab) + d + 3) % 3]; this.renderInv(); Sound.play('ui'); }
      else move(d);
    } else if ((a === 'confirm' || a === 'jump') && !rep) { const el = els[i] || els[0]; if (el) el.click(); }
  },

  // ------------------------------------------------------------ touch layout
  applyTouch() {
    const s = G.settings || {};
    const inGame = G.mode === 'play' || G.mode === 'transition' || G.mode === 'dead';
    const want = s.touch === 'on' || (s.touch !== 'off' && Input.device === 'touch');
    const on = want && inGame;
    $('touch').classList.toggle('hidden', !on || this.stack.length > 0);
    $('app').classList.toggle('touch-on', on);
    document.documentElement.style.setProperty('--ts', String(s.touchSize || 1));
    if (on && !this._rot && innerHeight > innerWidth) {
      this._rot = true; $('rotate').classList.remove('hidden'); setTimeout(() => $('rotate').classList.add('hidden'), 5000);
    }
    resize();
  },

  // ------------------------------------------------------------ HUD
  showHud(v) { $('hud').classList.toggle('hidden', !v); if (v) this.h = {}; },
  hudSync(dt) {
    const S = G.save; if (!S) return;
    const h = this.h;
    if (h.hp !== S.hp || h.maxHp !== S.maxHp) {
      let s = '';
      for (let i = 0; i < S.maxHp; i++) s += PIP.replace('CLS', (i < S.hp ? 'on' : '') + (h.hp !== undefined && i >= Math.min(h.hp, S.hp) && i < Math.max(h.hp, S.hp) ? ' pop' : ''));
      $('hp').innerHTML = s; h.hp = S.hp; h.maxHp = S.maxHp;
    }
    if (h.vials !== S.vials || h.maxVials !== S.maxVials) {
      let s = '';
      for (let i = 0; i < S.maxVials; i++) s += `<div class="vial${i < S.vials ? ' on' : ''}"></div>`;
      $('vials').innerHTML = s + '<div class="dew"><i id="dewbar"></i></div>'; h.vials = S.vials; h.maxVials = S.maxVials; h.dew = -1;
    }
    const dew = Math.round(clamp(S.dew / 14, 0, 1) * 100);
    if (h.dew !== dew) { const b = $('dewbar'); if (b) b.style.width = (S.vials >= S.maxVials ? 0 : dew) + '%'; h.dew = dew; }
    const showL = has('shot') || has('slam');
    if (h.showL !== showL) { $('lumen').classList.toggle('hidden', !showL); h.showL = showL; }
    if (showL) {
      if (h.lmax !== S.lumenMax) { $('lumen').style.width = Math.round(S.lumenMax / 99 * 96) + 'px'; h.lmax = S.lumenMax; }
      const lw = Math.round(S.lumen / S.lumenMax * 100);
      if (h.lw !== lw) { $('lumen').firstElementChild.style.width = lw + '%'; h.lw = lw; }
      if (G.lumenFlash > 0) { G.lumenFlash = 0; const el = $('lumen'); el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny'); }
    }
    if (this.shownMotes !== S.motes) {
      const d = S.motes - this.shownMotes;
      this.shownMotes += Math.abs(d) < 3 ? d : Math.round(d * 0.25) || Math.sign(d);
      $('motes').textContent = this.shownMotes;
    }
    const b = G.boss;
    if (!!b !== !!h.boss) { $('bossbar').classList.toggle('hidden', !b); h.boss = !!b; if (b) $('bossname').textContent = b.name; }
    if (b) { const w = Math.round(clamp(b.hp / b.maxHp, 0, 1) * 100); if (h.bw !== w) { $('bosshp').style.width = w + '%'; h.bw = w; } }
    const hint = G.uiOpen ? null : G.hint;
    if (h.hint !== hint) { const el = $('hint'); if (hint) el.innerHTML = fmt(hint); el.classList.toggle('show', !!hint); h.hint = hint; }
    const pr = !G.uiOpen && G.prompt && G.mode === 'play' ? G.prompt.prompt : null;
    if (h.pr !== pr) {
      const el = $('prompt'); if (pr) el.innerHTML = `<kbd>${esc(Input.label('up'))}</kbd> ${esc(pr)}`;
      el.classList.toggle('show', !!pr);
      const tp = $('t-interact'); tp.classList.toggle('hidden', !pr); if (pr) tp.textContent = pr;
      h.pr = pr;
    }
    const ab = (has('dash') ? 1 : 0) + (showL ? 2 : 0);
    if (h.ab !== ab) { document.querySelector('.t-dash').classList.toggle('hidden', !has('dash')); document.querySelector('.t-spell').classList.toggle('hidden', !showL); h.ab = ab; }
    if (G.settings.timer !== h.timerOn) { $('timer').classList.toggle('hidden', !G.settings.timer); h.timerOn = G.settings.timer; }
    if (G.settings.timer) { const t = Math.floor(S.played); if (h.tm !== t) { $('timer').textContent = fmtTime(t); h.tm = t; } }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('show'); }
  },
  toast(text, title = '', ms = 3200) {
    const el = $('toast');
    el.firstElementChild.textContent = title; el.lastElementChild.innerHTML = fmt(text);
    el.classList.add('show'); this.toastT = ms / 1000;
  },
  areaTitle(name, sub) {
    const el = $('areatitle');
    el.firstElementChild.textContent = name; el.lastElementChild.textContent = sub || '';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  bossIntro(name) {
    const el = $('bosstitle'); el.textContent = name;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  deathMsg(v) { $('deathmsg').classList.toggle('show', !!v); },

  // ------------------------------------------------------------ dialogue
  dialog(name, pages, cb) {
    this.dlg = { pages: pages.map((p) => fmt(p, false)), i: 0, n: 0, cb, snd: 0 };
    $('dlg-name').textContent = name || '';
    $('dlg-text').textContent = '';
    $('dialog').classList.remove('hidden');
    this.sync();
  },
  dlgTick(dt) {
    const d = this.dlg; if (!d) return;
    const full = d.pages[d.i];
    if (d.n < full.length) {
      d.n = Math.min(full.length, d.n + dt * 75);
      $('dlg-text').textContent = full.slice(0, Math.floor(d.n));
      d.snd -= dt; if (d.snd <= 0) { d.snd = 0.05; Sound.play('talk'); }
    }
  },
  dlgNext() {
    const d = this.dlg; if (!d) return;
    const full = d.pages[d.i];
    if (d.n < full.length) { d.n = full.length; $('dlg-text').textContent = full; return; }
    d.i++; d.n = 0;
    Sound.play('ui');
    if (d.i >= d.pages.length) {
      this.dlg = null; $('dialog').classList.add('hidden'); this.sync();
      if (d.cb) d.cb();
    }
  },

  // ------------------------------------------------------------ cards / confirm / intro
  abilityCard(id, cb) {
    const a = ABILITIES[id];
    $('card-kicker').textContent = 'A new light';
    $('card-title').textContent = a.name;
    $('card-how').innerHTML = fmt(a.how);
    $('card-lore').textContent = a.lore;
    this.cardCb = cb;
    this.open('s-card');
  },
  closeCard() { const cb = this.cardCb; this.cardCb = null; this.close(); if (cb) cb(); },
  confirm(title, text, yes, cb) {
    $('confirm-title').textContent = title; $('confirm-text').textContent = text; $('confirm-yes').textContent = yes || 'Yes';
    this.confirmCb = cb; this.open('s-confirm');
  },
  playIntro(cb) {
    this.intro = { i: -1, cb, t: 0 };
    $('intro-skip').innerHTML = fmt('{jump} to continue', true);
    this.open('s-intro');
    this.introNext();
  },
  introNext(skip) {
    const it = this.intro; if (!it) return;
    it.i++; it.t = 0;
    if (skip || it.i >= INTRO.length) { this.intro = null; this.close(); if (it.cb) it.cb(); return; }
    const el = $('intro-text');
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = INTRO[it.i]; el.style.opacity = 1; }, 250);
  },
  introTick(dt) { const it = this.intro; if (it) { it.t += dt; if (it.t > 4.2) this.introNext(); } },

  // ------------------------------------------------------------ ending
  showEnding(S) {
    const h = Math.floor(S.played / 3600), m = Math.floor(S.played / 60) % 60;
    const time = h ? `${h} h ${m} min` : `${m} min`;
    $('end-text').innerHTML = '<h2>Moonrise</h2>' + ENDING.map((l) => `<p>${esc(l)}</p>`).join('')
      + `<p class="endstats">Time ${time} &nbsp;·&nbsp; Fallen ${S.deaths} time${S.deaths === 1 ? '' : 's'} &nbsp;·&nbsp; ${completion()}% found</p>`
      + CREDITS.slice(1).map((l) => `<p class="fine">${esc(l)}</p>`).join('')
      + '<p class="fine">Your journey is saved. Continue it to keep exploring.</p>';
    this.showHud(false);
    this.open('s-end');
  },

  // ------------------------------------------------------------ save slots
  renderSlots() {
    const box = $('slots'); box.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const d = readSlot(i);
      const row = document.createElement('div'); row.className = 'slot';
      if (d) {
        const save0 = G.save; G.save = d; const pct = completion(); G.save = save0;
        row.innerHTML = `<div class="slot-info"><b>Journey ${i + 1} - ${esc(AREAS[d.area] ? AREAS[d.area].name : 'Unknown')}</b><span>${fmtTime(d.played)} played &middot; ${d.maxHp} embers &middot; ${pct}% found</span></div>`;
        const play = document.createElement('button'); play.className = 'btn prefer'; play.textContent = 'Play';
        play.onclick = () => G.game.start(i, false);
        const del = document.createElement('button'); del.className = 'btn ghost'; del.textContent = 'Erase';
        del.onclick = () => this.confirm('Erase this journey?', 'Everything in this save will be lost for good.', 'Erase', () => { deleteSlot(i); this.renderSlots(); this.focusFirst(); });
        row.append(play, del);
      } else {
        row.innerHTML = `<div class="slot-info"><b>Journey ${i + 1}</b><span>Empty</span></div>`;
        const nw = document.createElement('button'); nw.className = 'btn'; nw.textContent = 'Begin';
        nw.onclick = () => G.game.start(i, true);
        row.append(nw);
      }
      box.append(row);
    }
  },

  // ------------------------------------------------------------ keys + help
  renderKeys() {
    const names = { left: 'Move left', right: 'Move right', up: 'Up / interact', down: 'Down', jump: 'Jump', attack: 'Strike', dash: 'Dash', spell: 'Spell', heal: 'Sip dew', map: 'Map & gear', pause: 'Pause' };
    const box = $('keys'); box.innerHTML = '';
    const keys = G.settings.keys || DEFAULT_KEYS;
    for (const a of Object.keys(names)) {
      const b = document.createElement('button'); b.className = 'btn';
      b.innerHTML = `<span>${names[a]}</span><b>${(keys[a] || DEFAULT_KEYS[a]).map(keyLabel).join(' / ')}</b>`;
      b.onclick = () => {
        b.innerHTML = `<span>${names[a]}</span><b>press a key...</b>`;
        Input.capture = (code) => {
          const cur = JSON.parse(JSON.stringify(G.settings.keys || DEFAULT_KEYS));
          if (code !== 'Escape') {
            for (const k of Object.keys(cur)) cur[k] = cur[k].filter((c) => c !== code);
            cur[a] = [code, ...(cur[a] || [])].slice(0, 2);
            G.settings.keys = cur; saveSettings(); Input.rebuild();
          }
          this.renderKeys();
        };
      };
      box.append(b);
    }
  },
  renderHelp() {
    const rows = [
      ['{left} {right}', 'Walk'], ['{jump}', 'Jump - hold for a higher jump'], ['{attack}', 'Strike with your matchblade (hold {up} or {down} to aim)'],
      ['{heal}', 'Sip dew to mend your embers (stand still)'], ['{up}', 'Rest at lanterns, talk, read'], ['{down} + {jump}', 'Drop through thin ledges'],
      ['{map}', 'Map and gear'], ['{pause}', 'Pause'],
    ];
    if (has('dash')) rows.splice(3, 0, ['{dash}', 'Comet Dash']);
    if (has('shot')) rows.splice(4, 0, ['{spell}', 'Starshot (costs lumen)']);
    $('help').innerHTML = '<div class="cols">' + rows.map((r) => `<div>${fmt(r[0])}</div><div>${fmt(r[1])}</div>`).join('') + '</div>'
      + '<p>Lanterns are your save points. Rest at one to refill your embers and dew - but the creatures of the dark return too.</p>'
      + '<p>If your light goes out you wake at your last lantern, and your motes wait where you fell. Fall again before reaching them and they are gone.</p>'
      + '<p>The world opens as you find new lights. If a path is beyond you, remember it and come back.</p>';
  },

  // ------------------------------------------------------------ inventory
  openInv(tab) { this.tab = tab || this.tab; if (this.top() !== 's-inv') this.open('s-inv'); else this.renderInv(); },
  renderInv() {
    document.querySelectorAll('.tab[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    for (const t of ['map', 'gear', 'journal']) $('tab-' + t).classList.toggle('hidden', t !== this.tab);
    if (this.tab === 'map') requestAnimationFrame(() => this.renderMap());
    else if (this.tab === 'gear') this.renderGear();
    else this.renderJournal();
  },
  renderGear() {
    const S = G.save, resting = G.player && G.player.state === 'rest';
    let L = '<div><h3>Wick</h3>';
    const stat = (k, v) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;
    L += stat('Embers', `${S.hp} / ${S.maxHp}`) + stat('Dew vials', `${S.vials} / ${S.maxVials}`) + stat('Matchblade', `${BLADE_DMG[S.blade]} damage`)
      + stat('Ember seeds', `${S.seeds} / 3`) + stat('Moon shards', S.shards) + stat('Motes', S.motes) + stat('Time', fmtTime(S.played)) + stat('Found', completion() + '%');
    L += '<h3 style="margin-top:14px">Lights</h3>';
    let any = false;
    for (const id of Object.keys(ABILITIES)) if (S.abilities[id]) { any = true; L += `<div class="abil"><b>${ABILITIES[id].name}</b><span>${fmt(ABILITIES[id].how)}</span></div>`; }
    if (!any) L += '<div class="abil locked"><b>None yet</b><span>Old lights still sleep somewhere below.</span></div>';
    L += '</div>';
    let R = `<div><h3>Relics - ${S.equipped.length} of ${S.slots} worn</h3><p class="fine" style="text-align:left;margin-top:0">${resting ? 'Choose which relics to wear.' : 'Rest at a lantern to change relics.'}</p><div class="relics" id="relics"></div></div>`;
    $('tab-gear').innerHTML = `<div class="gear">${L}${R}</div>`;
    const box = $('relics');
    if (!S.relics.length) box.innerHTML = '<p class="fine" style="text-align:left">You carry no relics yet.</p>';
    for (const id of S.relics) {
      const b = document.createElement('button');
      b.className = 'btn relic' + (S.equipped.includes(id) ? ' on' : '');
      b.disabled = !resting;
      b.innerHTML = `<b>${RELICS[id].name}</b><span>${RELICS[id].desc}</span>`;
      b.onclick = () => {
        const i = S.equipped.indexOf(id);
        if (i >= 0) S.equipped.splice(i, 1);
        else if (S.equipped.length < S.slots) S.equipped.push(id);
        else { Sound.play('deny'); return; }
        this.renderGear();
      };
      box.append(b);
    }
  },
  renderJournal() {
    const S = G.save;
    let L = '<div><h3>Creatures</h3>', n = 0;
    for (const id of Object.keys(BESTIARY)) if (S.kills[id]) { n++; L += `<div class="entry"><i>${S.kills[id]} felled</i><b>${BESTIARY[id].name}</b><span>${BESTIARY[id].desc}</span></div>`; }
    if (!n) L += '<p class="fine" style="text-align:left">Nothing recorded yet.</p>';
    L += '</div><div><h3>Stones read</h3>'; n = 0;
    for (const id of Object.keys(TABLETS)) if (S.lore[id]) { n++; L += `<div class="entry"><b>${TABLETS[id].title}</b><span>${TABLETS[id].text.join(' ')}</span></div>`; }
    if (!n) L += '<p class="fine" style="text-align:left">Nothing recorded yet.</p>';
    $('tab-journal').innerHTML = `<div class="journal">${L}</div></div>`;
  },
  renderMap() {
    const cv = $('mapcv'), r = cv.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const W = r.width, H = r.height, S = G.save;
    g.fillStyle = '#050816'; g.fillRect(0, 0, W, H);
    const cells = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const key in CELLS) {
      const def = ROOMS[CELLS[key]];
      if (def.hidden) continue;
      const vis = !!S.visited[key], ch = !!S.charts[def.area];
      if (!vis && !ch) continue;
      const [gx, gy] = key.split(',').map(Number);
      cells.push({ gx, gy, def, vis });
      x0 = Math.min(x0, gx); y0 = Math.min(y0, gy); x1 = Math.max(x1, gx); y1 = Math.max(y1, gy);
    }
    if (!cells.length) { g.fillStyle = '#9aa3c4'; g.font = '16px Georgia'; g.textAlign = 'center'; g.fillText('Nothing charted yet.', W / 2, H / 2); return; }
    const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
    const cw = clamp(Math.min((W - 60) / nx, (H - 60) / ny * (CELL_W / CELL_H)), 14, 84), chh = cw * CELL_H / CELL_W;
    const ox = (W - nx * cw) / 2 - x0 * cw, oy = (H - ny * chh) / 2 - y0 * chh;
    const seen = (gx, gy) => { const k = `${gx},${gy}`; const id = CELLS[k]; return id && (S.visited[k] || S.charts[ROOMS[id].area]); };
    for (const c of cells) {
      const A = AREAS[c.def.area], x = ox + c.gx * cw, y = oy + c.gy * chh;
      g.globalAlpha = c.vis ? 0.5 : 0.16; g.fillStyle = A.map; g.fillRect(x, y, cw + 0.5, chh + 0.5);
      g.globalAlpha = 1;
    }
    g.lineCap = 'round';
    for (const c of cells) {
      const A = AREAS[c.def.area], x = ox + c.gx * cw, y = oy + c.gy * chh;
      const e = cellEdges(c.def, c.gx - c.def.gx, c.gy - c.def.gy);
      g.strokeStyle = A.map; g.lineWidth = 2; g.globalAlpha = c.vis ? 1 : 0.5;
      const side = (kind, ax, ay, bx, by, nxc, nyc) => {
        if (kind === 'in') return;
        g.beginPath();
        if (kind === 'wall') { g.moveTo(ax, ay); g.lineTo(bx, by); }
        else { const mx = (ax + bx) / 2, my = (ay + by) / 2, gx2 = (bx - ax) * 0.14, gy2 = (by - ay) * 0.14; g.moveTo(ax, ay); g.lineTo(mx - gx2, my - gy2); g.moveTo(mx + gx2, my + gy2); g.lineTo(bx, by); }
        g.stroke();
        if (kind === 'door' && c.vis && !seen(nxc, nyc)) { // somewhere you have not been yet
          const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = Math.sign(nxc - c.gx), dy = Math.sign(nyc - c.gy);
          g.fillStyle = '#e9ecf8'; g.globalAlpha = 0.8;
          g.beginPath(); g.arc(mx + dx * 5, my + dy * 5, 2, 0, Math.PI * 2); g.fill();
          g.globalAlpha = c.vis ? 1 : 0.5;
        }
      };
      side(e.L, x, y, x, y + chh, c.gx - 1, c.gy); side(e.R, x + cw, y, x + cw, y + chh, c.gx + 1, c.gy);
      side(e.U, x, y, x + cw, y, c.gx, c.gy - 1); side(e.D, x, y + chh, x + cw, y + chh, c.gx, c.gy + 1);
      g.globalAlpha = 1;
    }
    // icons for things you have seen
    const done = new Set();
    for (const c of cells) {
      if (done.has(c.def.id)) continue; done.add(c.def.id);
      for (const en of c.def._ents) {
        const s = en.spec; if (!s) continue;
        const t = typeof s === 'string' ? s : s.t;
        const gx = c.def.gx + Math.floor(en.tx / CELL_W), gy = c.def.gy + Math.floor(en.ty / CELL_H);
        if (!S.visited[`${gx},${gy}`]) continue;
        const px = ox + (c.def.gx + en.tx / CELL_W) * cw, py = oy + (c.def.gy + (en.ty + 0.5) / CELL_H) * chh;
        if (t === 'lantern') { g.fillStyle = S.flags['lan:' + en.uid] ? '#ffcf7a' : '#6f8fdc'; g.beginPath(); g.arc(px, py - 2, 3.4, 0, Math.PI * 2); g.fill(); g.fillRect(px - 0.8, py, 1.6, 5); }
        else if (t === 'npc') { g.fillStyle = '#8fffe0'; g.fillRect(px - 2.5, py - 2.5, 5, 5); }
        else if (t === 'shrine' && !S.abilities[s.ability]) { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(px, py - 5); g.lineTo(px + 4, py); g.lineTo(px, py + 5); g.lineTo(px - 4, py); g.closePath(); g.fill(); }
        else if (t === 'boss' && !S.flags['boss_' + s.id]) { g.fillStyle = '#ff4f7a'; g.beginPath(); g.moveTo(px, py - 6); g.lineTo(px + 6, py + 4); g.lineTo(px - 6, py + 4); g.closePath(); g.fill(); }
      }
    }
    if (S.lost) { const d = ROOMS[S.lost.room]; if (d) { g.strokeStyle = '#ffe08a'; g.lineWidth = 1.5; g.beginPath(); g.arc(ox + (d.gx + S.lost.x / (CELL_W * 32)) * cw, oy + (d.gy + S.lost.y / (CELL_H * 32)) * chh, 5, 0, Math.PI * 2); g.stroke(); } }
    const p = G.player, room = G.room;
    if (p && room) {
      const px = ox + (room.def.gx + p.cx / (CELL_W * 32)) * cw, py = oy + (room.def.gy + p.cy / (CELL_H * 32)) * chh;
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, 7.5, 0, Math.PI * 2); g.stroke();
    }
    // area names
    const byArea = {};
    for (const c of cells) { if (!c.vis) continue; const a = byArea[c.def.area] = byArea[c.def.area] || { x: 0, y: 1e9, n: 0 }; a.x += ox + (c.gx + 0.5) * cw; a.y = Math.min(a.y, oy + c.gy * chh); a.n++; }
    g.textAlign = 'center'; g.font = '600 11px Cinzel, Georgia, serif';
    for (const k in byArea) { const a = byArea[k]; g.fillStyle = AREAS[k].map; g.globalAlpha = 0.9; g.fillText(AREAS[k].name.toUpperCase(), a.x / a.n, a.y - 7); g.globalAlpha = 1; }
    $('map-legend').textContent = 'White ring: you.  Gold dot: lantern.  Green square: friend.  White dots on walls: ways you have not taken.';
  },

  // ------------------------------------------------------------ shop
  openShop(id) { this.shopId = id; this.open('s-shop'); },
  renderShop() {
    const S = G.save, wares = SHOPS[this.shopId] || [];
    $('shop-motes').textContent = S.motes;
    const box = $('shop-list'); box.innerHTML = '';
    for (const w of wares) {
      const sold = !!S.flags['shop:' + w.id];
      const name = w.kind === 'relic' ? `Relic: ${RELICS[w.relic].name}` : w.name;
      const desc = w.kind === 'relic' ? RELICS[w.relic].desc : w.desc;
      const b = document.createElement('button');
      b.className = 'btn ware' + (sold ? ' sold' : S.motes < w.price ? ' poor' : '');
      b.innerHTML = `<div class="w-info"><b>${esc(name)}</b><span>${esc(desc)}</span></div><div class="w-price">${sold ? 'Sold' : w.price}</div>`;
      b.onclick = () => {
        if (sold) return;
        if (S.motes < w.price) { Sound.play('deny'); return; }
        S.motes -= w.price; setFlag('shop:' + w.id);
        giveItem(w.kind, w);
        Sound.play('buy');
        G.game.autosave();
        this.renderShop(); this.focusFirst();
      };
      box.append(b);
    }
  },
};
