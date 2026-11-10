// All sound is synthesised live with WebAudio: no audio files to download.
import { G } from './state.js';

let ac = null, master = null, sfxBus = null, musBus = null, revIn = null, delayIn = null, noiseBuf = null;
const lastPlayed = {};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function tone(t, o) {
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.d);
  if (o.vib) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = o.vib; lg.gain.value = o.f * 0.06;
    l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + o.d + 0.1);
  }
  const a = o.a || 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.1), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.d);
  osc.connect(g); g.connect(o.bus || sfxBus);
  if (o.rev) g.connect(revIn);
  osc.start(t); osc.stop(t + a + o.d + 0.05);
}
function noise(t, o) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + o.d);
  f.Q.value = o.q || 0.8;
  const g = ac.createGain(), a = o.a || 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.1), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.d);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  src.start(t, Math.random() * 1.5); src.stop(t + a + o.d + 0.05);
}

const PENT = [1047, 1175, 1319, 1568, 1760, 2093];
const SFX = {
  slash: (t) => noise(t, { type: 'bandpass', f: 900, f2: 3400, d: 0.11, v: 0.2, q: 1.2 }),
  hit: (t) => { noise(t, { f: 2200, f2: 500, d: 0.09, v: 0.3 }); tone(t, { type: 'square', f: 190, f2: 80, d: 0.1, v: 0.13 }); },
  clang: (t) => { tone(t, { type: 'triangle', f: 1500, f2: 900, d: 0.14, v: 0.14 }); noise(t, { type: 'highpass', f: 3000, d: 0.06, v: 0.12 }); },
  hurt: (t) => { tone(t, { type: 'sawtooth', f: 320, f2: 80, d: 0.3, v: 0.2 }); noise(t, { f: 1200, f2: 200, d: 0.24, v: 0.24 }); },
  jump: (t) => tone(t, { f: 330, f2: 540, d: 0.12, v: 0.09 }),
  djump: (t) => { tone(t, { f: 520, f2: 940, d: 0.16, v: 0.09 }); noise(t, { type: 'bandpass', f: 2600, d: 0.1, v: 0.05 }); },
  land: (t) => { tone(t, { f: 120, f2: 55, d: 0.1, v: 0.16 }); noise(t, { f: 420, d: 0.06, v: 0.1 }); },
  dash: (t) => noise(t, { type: 'bandpass', f: 500, f2: 2800, d: 0.2, v: 0.22, q: 0.9 }),
  step: (t) => noise(t, { f: 520, d: 0.04, v: 0.045 }),
  mote: (t) => tone(t, { f: PENT[Math.floor(Math.random() * PENT.length)], d: 0.13, v: 0.06, rev: 1 }),
  pickup: (t) => { [660, 880, 1320].forEach((f, i) => tone(t + i * 0.07, { f, d: 0.22, v: 0.1, rev: 1 })); },
  big: (t) => { [392, 494, 587, 784, 988, 1175].forEach((f, i) => tone(t + i * 0.11, { f, type: 'triangle', d: 0.9, v: 0.12, rev: 1 })); tone(t, { f: 98, type: 'sawtooth', d: 1.6, v: 0.08, a: 0.3 }); },
  heal: (t) => { tone(t, { f: 440, f2: 880, d: 0.45, v: 0.09, rev: 1 }); tone(t + 0.1, { f: 660, f2: 1320, d: 0.4, v: 0.06, rev: 1 }); },
  sipping: (t) => tone(t, { f: 300, f2: 420, d: 0.12, v: 0.05 }),
  rest: (t) => { [262, 330, 392, 587].forEach((f, i) => tone(t + i * 0.05, { f, type: 'triangle', d: 1.3, v: 0.07, rev: 1, a: 0.03 })); },
  die: (t) => { tone(t, { type: 'sawtooth', f: 220, f2: 36, d: 1.0, v: 0.24 }); noise(t, { f: 900, f2: 90, d: 1.0, v: 0.25 }); },
  edie: (t) => { noise(t, { type: 'bandpass', f: 800, f2: 160, d: 0.24, v: 0.24 }); tone(t, { type: 'square', f: 230, f2: 60, d: 0.2, v: 0.09 }); },
  ehit: (t) => tone(t, { type: 'square', f: 250, f2: 130, d: 0.06, v: 0.1 }),
  shoot: (t) => tone(t, { type: 'triangle', f: 520, f2: 240, d: 0.15, v: 0.11 }),
  spell: (t) => { tone(t, { type: 'sawtooth', f: 620, f2: 1600, d: 0.17, v: 0.1 }); noise(t, { type: 'highpass', f: 2800, d: 0.15, v: 0.1 }); },
  spellHit: (t) => { noise(t, { type: 'bandpass', f: 1600, f2: 500, d: 0.14, v: 0.2 }); tone(t, { f: 900, f2: 280, d: 0.16, v: 0.1 }); },
  slam: (t) => { tone(t, { f: 110, f2: 32, d: 0.45, v: 0.4 }); noise(t, { f: 700, f2: 120, d: 0.36, v: 0.3 }); },
  break: (t) => { noise(t, { f: 1500, f2: 180, d: 0.36, v: 0.3 }); tone(t, { f: 90, f2: 40, d: 0.25, v: 0.25 }); },
  crack: (t) => noise(t, { f: 1800, f2: 500, d: 0.1, v: 0.2 }),
  gate: (t) => { tone(t, { type: 'sawtooth', f: 72, f2: 48, d: 0.55, v: 0.18 }); noise(t, { f: 320, d: 0.5, v: 0.18 }); },
  lever: (t) => { tone(t, { type: 'square', f: 300, d: 0.06, v: 0.09 }); tone(t + 0.08, { type: 'square', f: 200, d: 0.08, v: 0.09 }); },
  roar: (t) => { tone(t, { type: 'sawtooth', f: 95, f2: 58, d: 1.2, v: 0.28, vib: 13, a: 0.06 }); tone(t, { type: 'sawtooth', f: 143, f2: 80, d: 1.1, v: 0.14, vib: 9, a: 0.06 }); noise(t, { type: 'bandpass', f: 500, f2: 240, d: 1.2, v: 0.2, a: 0.08 }); },
  thud: (t) => { tone(t, { f: 92, f2: 34, d: 0.4, v: 0.4 }); noise(t, { f: 320, d: 0.3, v: 0.28 }); },
  warn: (t) => { tone(t, { type: 'triangle', f: 880, d: 0.07, v: 0.06 }); tone(t + 0.1, { type: 'triangle', f: 880, d: 0.07, v: 0.06 }); },
  charge: (t) => tone(t, { type: 'sawtooth', f: 120, f2: 360, d: 0.5, v: 0.12 }),
  ui: (t) => tone(t, { f: 700, d: 0.04, v: 0.05 }),
  uiok: (t) => tone(t, { f: 600, f2: 920, d: 0.09, v: 0.07 }),
  uiback: (t) => tone(t, { f: 520, f2: 340, d: 0.09, v: 0.06 }),
  buy: (t) => { tone(t, { f: 880, d: 0.1, v: 0.08 }); tone(t + 0.08, { f: 1320, d: 0.18, v: 0.08, rev: 1 }); },
  deny: (t) => tone(t, { type: 'square', f: 140, d: 0.13, v: 0.07 }),
  talk: (t) => tone(t, { type: 'triangle', f: 300 + Math.random() * 140, d: 0.04, v: 0.04 }),
  low: (t) => { tone(t, { f: 70, d: 0.12, v: 0.22 }); tone(t + 0.16, { f: 60, d: 0.14, v: 0.16 }); },
  drip: (t) => tone(t, { f: 1400, f2: 700, d: 0.08, v: 0.04, rev: 1 }),
  wake: (t) => { [330, 440, 554, 659].forEach((f, i) => tone(t + i * 0.16, { f, type: 'triangle', d: 1.2, v: 0.08, rev: 1, a: 0.05 })); },
};
const MIN_GAP = { mote: 0.035, step: 0.1, talk: 0.03, hit: 0.03, ehit: 0.03, sipping: 0.1 };

// ------------------------------------------------------------------ music
// Each track: tempo, root note (MIDI), chord list, melody scale, flavour flags.
const TRACKS = {
  title: { bpm: 56, root: 50, chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [3, 7, 10, 15], [-2, 5, 10, 14]], scale: [0, 3, 5, 7, 10], dens: 0.26, pad: 0.05, cut: 900 },
  village: { bpm: 66, root: 55, chords: [[0, 4, 7, 12], [-3, 4, 9, 12], [-7, 0, 5, 9], [-5, 2, 6, 9]], scale: [0, 2, 4, 7, 9], dens: 0.34, pad: 0.045, cut: 1300 },
  gloam: { bpm: 60, root: 52, chords: [[0, 7, 10, 15], [5, 9, 12, 16], [3, 7, 10, 14], [-5, 2, 7, 10]], scale: [0, 2, 3, 7, 9], dens: 0.22, pad: 0.05, cut: 760 },
  stacks: { bpm: 52, root: 47, chords: [[0, 7, 15], [-4, 3, 8, 12], [5, 8, 12], [-5, 2, 7, 10]], scale: [0, 2, 3, 7, 8], dens: 0.2, pad: 0.055, cut: 680 },
  ember: { bpm: 72, root: 50, chords: [[0, 7, 12, 15], [1, 5, 8, 13], [-2, 5, 10, 13], [0, 7, 12, 15]], scale: [0, 1, 5, 7, 8], dens: 0.2, pad: 0.05, cut: 620, pulse: 1 },
  starwell: { bpm: 58, root: 57, chords: [[0, 4, 7, 11], [2, 6, 9, 14], [-3, 4, 9, 12], [2, 6, 9, 13]], scale: [0, 2, 4, 6, 7, 9, 11], dens: 0.4, pad: 0.042, cut: 1500, high: 1 },
  orrery: { bpm: 50, root: 49, chords: [[0, 4, 8, 14], [2, 6, 10, 16], [-2, 2, 6, 12], [4, 8, 12, 18]], scale: [0, 2, 4, 6, 8, 10], dens: 0.24, pad: 0.05, cut: 800 },
  boss: { bpm: 138, root: 48, chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [-2, 5, 10, 14], [-5, 2, 7, 11]], scale: [0, 3, 5, 7, 10], dens: 0.0, pad: 0.035, cut: 1100, drums: 1, arp: 1 },
  final: { bpm: 150, root: 46, chords: [[0, 7, 12, 15], [1, 8, 13, 16], [-2, 5, 10, 13], [-4, 3, 8, 11]], scale: [0, 1, 3, 7, 8], dens: 0.0, pad: 0.04, cut: 1300, drums: 1, arp: 1 },
  ending: { bpm: 60, root: 55, chords: [[0, 4, 7, 12], [5, 9, 12, 16], [-3, 4, 9, 12], [-5, 2, 7, 11]], scale: [0, 2, 4, 7, 9], dens: 0.5, pad: 0.05, cut: 1600, high: 1 },
};

let cur = null; // { name, def, gain, step, next, chord, lastNote }

function startTrack(name) {
  const def = TRACKS[name];
  if (!def) return null;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(1, ac.currentTime + 1.6);
  gain.connect(musBus);
  return { name, def, gain, step: 0, next: ac.currentTime + 0.12, chord: 0, lastNote: 2 };
}
function padNote(tr, t, n, dur, v) {
  const d = tr.def;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = d.cut; f.Q.value = 0.6;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + dur * 0.32);
  g.gain.linearRampToValueAtTime(v * 0.7, t + dur * 0.75);
  g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.25);
  for (const det of [-6, 7]) {
    const o = ac.createOscillator();
    o.type = det < 0 ? 'triangle' : 'sawtooth';
    o.frequency.value = midi(n); o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + dur * 1.3);
  }
  f.connect(g); g.connect(tr.gain); g.connect(revIn);
}
function pluck(tr, t, n, v) {
  tone(t, { f: midi(n), d: 1.3, v, bus: tr.gain, a: 0.004 });
  tone(t, { f: midi(n) * 2.01, d: 0.5, v: v * 0.3, bus: tr.gain, a: 0.004 });
  tone(t, { f: midi(n), d: 0.9, v: v * 0.5, bus: delayIn, a: 0.004 });
}
function scheduleStep(tr, t) {
  const d = tr.def, s = tr.step, spb = 60 / d.bpm, st = spb / 4;
  const chord = d.chords[tr.chord % d.chords.length];
  if (s % 32 === 0) {
    const dur = st * 32;
    for (const c of chord) padNote(tr, t, d.root + c, dur, d.pad);
    tone(t, { f: midi(d.root + chord[0] - 12), d: dur * 0.8, v: 0.1, bus: tr.gain, a: 0.08 });
  }
  if (d.pulse && s % 8 === 0) tone(t, { f: midi(d.root - 12), type: 'triangle', d: 0.3, v: 0.07, bus: tr.gain });
  if (d.dens > 0 && s % 2 === 0 && Math.random() < d.dens) {
    tr.lastNote = Math.max(0, Math.min(d.scale.length * 2 - 1, tr.lastNote + Math.floor(Math.random() * 5) - 2));
    const oct = Math.floor(tr.lastNote / d.scale.length), deg = d.scale[tr.lastNote % d.scale.length];
    pluck(tr, t, d.root + 12 + (d.high ? 12 : 0) + oct * 12 + deg, 0.05 + Math.random() * 0.03);
  }
  if (d.arp) {
    const n = chord[s % chord.length] + (s % 8 >= 4 ? 12 : 0);
    tone(t, { f: midi(d.root + 12 + n), type: 'square', d: st * 0.9, v: 0.028, bus: tr.gain });
    if (s % 4 === 0) tone(t, { f: midi(d.root - 12 + chord[0]), type: 'sawtooth', d: st * 1.8, v: 0.07, bus: tr.gain });
  }
  if (d.drums) {
    if (s % 8 === 0 || s % 16 === 6) { tone(t, { f: 130, f2: 40, d: 0.16, v: 0.3, bus: tr.gain }); }
    if (s % 8 === 4) noise(t, { type: 'bandpass', f: 1800, d: 0.12, v: 0.12, bus: tr.gain });
    if (s % 2 === 1) noise(t, { type: 'highpass', f: 6000, d: 0.03, v: 0.035, bus: tr.gain });
  }
  tr.step++;
  if (tr.step % 32 === 0) tr.chord++;
  tr.next += st;
}

export const Sound = {
  ready: false,
  wanted: null,

  unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC(); } catch (e) { return; }
      master = ac.createGain(); master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      musBus = ac.createGain(); musBus.connect(master);
      // noise
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      // reverb
      const len = Math.floor(ac.sampleRate * 2.6);
      const ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const dd = ir.getChannelData(ch); for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      const conv = ac.createConvolver(); conv.buffer = ir;
      revIn = ac.createGain(); revIn.gain.value = 0.5;
      revIn.connect(conv); conv.connect(musBus);
      // echo for plucked notes
      const dl = ac.createDelay(1.0); dl.delayTime.value = 0.36;
      const fb = ac.createGain(); fb.gain.value = 0.36;
      delayIn = ac.createGain(); delayIn.gain.value = 0.6;
      delayIn.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(musBus); dl.connect(revIn);
      this.ready = true;
      this.volumes();
    }
    if (ac.state === 'suspended') ac.resume();
    if (this.wanted && (!cur || cur.name !== this.wanted)) this.music(this.wanted);
  },

  volumes() {
    if (!ac) return;
    const s = G.settings || { sfx: 0.8, music: 0.7 };
    sfxBus.gain.value = s.sfx;
    musBus.gain.value = s.music * 0.85;
  },

  play(name) {
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (now - (lastPlayed[name] || -1) < (MIN_GAP[name] || 0.02)) return;
    lastPlayed[name] = now;
    const f = SFX[name];
    if (f) { try { f(now); } catch (e) { /* never let audio break the game */ } }
  },

  music(name) {
    this.wanted = name;
    if (!ac) return;
    if (cur && cur.name === name) return;
    if (cur) {
      const g = cur.gain, t = ac.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, 9000);
    }
    cur = name ? startTrack(name) : null;
  },

  // call every frame; schedules a little ahead of the audio clock
  tick() {
    if (!ac || !cur || ac.state !== 'running') return;
    const t = ac.currentTime;
    if (cur.next < t - 0.5) cur.next = t + 0.05; // tab was asleep
    let guard = 0;
    while (cur.next < t + 0.25 && guard++ < 16) { try { scheduleStep(cur, cur.next); } catch (e) { cur.next += 0.1; } }
  },

  suspend() { if (ac && ac.state === 'running') ac.suspend(); },
  resume() { if (ac && ac.state === 'suspended') ac.resume(); },
};
