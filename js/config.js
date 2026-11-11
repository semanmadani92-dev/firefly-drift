// Core constants: tile sizes, physics numbers, area palettes.
export const T = 32;            // tile size in world pixels
export const CELL_W = 30;       // tiles per map cell (one "screen")
export const CELL_H = 17;
export const VERSION = '0.1.0';

export const TILE = { EMPTY: 0, SOLID: 1, ONEWAY: 2, SPIKE: 3, LIQUID: 4, BREAK: 5, SLAM: 6, GRATE: 7 };

// Player physics (pixels / second). The room validator reads the same numbers,
// so level reachability checks always match the real game.
export const PHYS = {
  run: 260,
  gravity: 2200,
  jumpV: 720,
  jumpCut: 220,
  maxFall: 900,
  coyote: 0.1,
  jumpBuf: 0.12,
  dashV: 760,
  dashT: 0.2,
  dashCd: 0.42,
  wallSlide: 110,
  wallJumpX: 300,
  wallJumpY: 690,
  wallLock: 0.15,
  djumpV: 660,
  slamV: 1150,
  hurtInv: 1.3,
  enterBoost: 840,   // upward speed given when you climb into a room from below
};

export const HERO = { w: 18, h: 38 };

// Each area has its own palette, decoration set and music.
export const AREAS = {
  village: {
    name: 'Candlestead', sub: 'The Last Lights',
    sky: ['#070b1f', '#101c44', '#1d3560'], rock: '#0e1830', rock2: '#17264a', rim: '#7fd0ff', moss: '#3f9c8c',
    glowA: '#ffcf7a', glowB: '#8fffe0', ambient: [5, 8, 22, 0.40], deco: 'forest', back: 'village', music: 'village', map: '#f0c060',
    motes: ['#ffe9a8', '#8fffe0'],
  },
  gloam: {
    name: 'Gloamwood', sub: 'Where the Roots Remember',
    sky: ['#020a10', '#052028', '#0a3a3a'], rock: '#071a1c', rock2: '#0c2a2c', rim: '#39e6b4', moss: '#22a57e',
    glowA: '#7dffd6', glowB: '#ffcf7a', ambient: [1, 7, 9, 0.60], deco: 'forest', back: 'forest', music: 'gloam', map: '#3fd9aa',
    motes: ['#7dffd6', '#c8ff9a'],
  },
  stacks: {
    name: 'The Sunken Stacks', sub: 'Every Page Drowned',
    sky: ['#04061a', '#0a1040', '#1a1e5e'], rock: '#0a0e2a', rock2: '#121944', rim: '#7f9cff', moss: '#4a5fd0',
    glowA: '#9fb4ff', glowB: '#e3c6ff', ambient: [3, 4, 18, 0.64], deco: 'stacks', back: 'stacks', music: 'stacks', map: '#7f9cff',
    motes: ['#9fb4ff', '#e3c6ff'],
  },
  ember: {
    name: 'Emberworks', sub: 'The Forge That Would Not Cool',
    sky: ['#120502', '#2a0c06', '#4a1808'], rock: '#1c0d0a', rock2: '#2c1510', rim: '#ff9440', moss: '#c0501c',
    glowA: '#ffae5a', glowB: '#ff5a3a', ambient: [12, 4, 2, 0.58], deco: 'ember', back: 'ember', music: 'ember', map: '#ff9440', liquid: '#ff6a2a',
    motes: ['#ffae5a', '#ff6a3a'],
  },
  starwell: {
    name: 'Starwell', sub: 'Where Fallen Light Pools',
    sky: ['#03040f', '#0a0c2a', '#1a1440'], rock: '#0b0c22', rock2: '#151838', rim: '#a8f0ff', moss: '#b070ff',
    glowA: '#c0f4ff', glowB: '#ff9ae0', ambient: [2, 2, 12, 0.66], deco: 'crystal', back: 'crystal', music: 'starwell', map: '#c0f4ff',
    motes: ['#c0f4ff', '#ff9ae0'],
  },
  orrery: {
    name: 'The Hushed Orrery', sub: 'The Sky Beneath the World',
    sky: ['#050308', '#120a1c', '#221230'], rock: '#120c18', rock2: '#1e1428', rim: '#f0dca0', moss: '#8a6ad0',
    glowA: '#fff0c0', glowB: '#b890ff', ambient: [4, 2, 8, 0.68], deco: 'orrery', back: 'orrery', music: 'orrery', map: '#f0dca0',
    motes: ['#fff0c0', '#b890ff'],
  },
};
