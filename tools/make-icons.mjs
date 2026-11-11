// Draws the app icons (a little lantern in the dark) and saves them as PNG.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [192, 512]) {
  const data = await page.evaluate((S) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), u = S / 512;
    g.scale(u, u);
    const bg = g.createRadialGradient(256, 250, 20, 256, 256, 380);
    bg.addColorStop(0, '#16335a'); bg.addColorStop(0.5, '#0a1430'); bg.addColorStop(1, '#03050d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
    // stars
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(220,235,255,${0.2 + rnd() * 0.6})`; const r = 1 + rnd() * 2.2; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, r, 0, 7); g.fill(); }
    // glow
    const gl = g.createRadialGradient(256, 262, 10, 256, 262, 230);
    gl.addColorStop(0, 'rgba(255,200,110,0.75)'); gl.addColorStop(0.45, 'rgba(255,170,70,0.22)'); gl.addColorStop(1, 'rgba(255,170,70,0)');
    g.fillStyle = gl; g.fillRect(0, 0, 512, 512);
    // ribbon
    g.strokeStyle = '#5fe8d0'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(238, 118); g.bezierCurveTo(150, 110, 150, 200, 96, 190); g.stroke();
    // legs
    g.strokeStyle = '#141b30'; g.lineWidth = 22;
    g.beginPath(); g.moveTo(226, 380); g.lineTo(220, 428); g.moveTo(286, 380); g.lineTo(292, 428); g.stroke();
    // lantern body
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.fillStyle = '#141b30'; rr(188, 350, 136, 46, 16); g.fill();
    const body = g.createLinearGradient(0, 150, 0, 360);
    body.addColorStop(0, '#ffeab0'); body.addColorStop(1, '#ff9a38');
    g.fillStyle = body; rr(178, 152, 156, 212, 58); g.fill();
    g.fillStyle = 'rgba(255,250,225,0.8)'; g.beginPath(); g.ellipse(256, 262, 46, 70, 0, 0, 7); g.fill();
    g.strokeStyle = '#27304e'; g.lineWidth = 12; rr(178, 152, 156, 212, 58); g.stroke();
    // eyes
    g.fillStyle = '#2a1608'; g.beginPath(); g.ellipse(250, 246, 12, 22, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(296, 246, 12, 22, 0, 0, 7); g.fill();
    // cap + handle
    g.fillStyle = '#141b30'; rr(190, 112, 132, 50, 18); g.fill();
    g.strokeStyle = '#141b30'; g.lineWidth = 16; g.beginPath(); g.arc(256, 108, 34, Math.PI, 0); g.stroke();
    g.fillStyle = '#5fe8d0'; g.fillRect(232, 118, 48, 16);
    return c.toDataURL('image/png');
  }, size);
  writeFileSync(new URL(`../icon-${size}.png`, import.meta.url), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote icon-' + size + '.png');
}
await browser.close();
