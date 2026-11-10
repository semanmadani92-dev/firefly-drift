// Scenario runner for visual checks.
//   node tools/shot.mjs <scenario.mjs> <outDir> [width] [height] [touch]
// The scenario module exports: async function run(page, shot, helpers)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const [scn, out = '/tmp/mw-shots', w = '1280', h = '720', touch = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PORT = 8100 + Math.floor(Math.random() * 800);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: !!touch, isMobile: !!touch });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const helpers = {
  wait: (ms) => page.waitForTimeout(ms),
  ev: (fn, arg) => page.evaluate(fn, arg),
  hold: async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); },
  tap: (key) => page.keyboard.press(key),
  // start a fresh journey with no intro, optionally teleporting
  begin: async (opts = {}) => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html${opts.query || ''}`);
    await page.waitForTimeout(900);
    await page.evaluate((o) => {
      const m = window.__mw;
      try { localStorage.clear(); } catch (e) { /* ignore */ }
      m.game.start(0, true); m.UI.introNext(true);
      if (o.give) m.give(...o.give);
      if (o.motes) m.G.save.motes = o.motes;
      if (o.room) m.tp(o.room, o.tx, o.ty);
      if (o.flags) for (const f of o.flags) m.G.save.flags[f] = 1;
    }, opts);
    await page.waitForTimeout(opts.settle || 1600);
  },
  state: () => page.evaluate(() => { const g = window.__mw.G, p = g.player; return { mode: g.mode, room: g.room && g.room.id, x: Math.round(p.x), y: Math.round(p.y), hp: g.save.hp, st: p.state, gnd: p.onGround, motes: g.save.motes, ents: g.room.entities.length, ui: g.uiOpen, vis: Object.keys(g.save.visited).length }; }),
};
try {
  const mod = await import(pathToFileURL(resolve(scn)).href);
  await mod.run(page, shot, helpers);
} catch (e) { errors.push('TEST ' + (e.stack || e.message)); }
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'no console errors');
await browser.close();
srv.kill();
