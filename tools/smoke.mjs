// Headless smoke test: boots the game, starts a new journey, presses a few
// keys and saves screenshots. Usage: node tools/smoke.mjs [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || '/tmp/mw-shots';
mkdirSync(out, { recursive: true });
const PORT = 8123;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/01-title.png` });
  await page.evaluate(() => window.__mw.game.start(0, true));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/02-intro.png` });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(350); }
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/03-start.png` });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space'); await page.waitForTimeout(250);
  await page.keyboard.press('KeyX'); await page.waitForTimeout(90);
  await page.screenshot({ path: `${out}/04-move.png` });
  const st = await page.evaluate(() => { const g = window.__mw.G; return { mode: g.mode, room: g.room && g.room.id, x: Math.round(g.player.x), y: Math.round(g.player.y), hp: g.save.hp, ents: g.room.entities.length, ui: g.uiOpen }; });
  console.log('state', JSON.stringify(st));
} catch (e) { errors.push('TEST ' + e.message); }
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'no console errors');
await browser.close();
srv.kill();
