// Single shared game-state object. Every module imports this; it imports nothing.
export const G = {
  mode: 'boot',        // boot | title | play | transition | dead | ending
  uiOpen: false,       // a menu / dialog is capturing input
  now: 0,              // wall-clock seconds, always advances (visual animation)
  time: 0,             // simulated seconds (stops while paused)
  room: null,
  player: null,
  cam: { x: 0, y: 0, tx: 0, ty: 0, shakeT: 0, shakeMag: 0, sx: 0, sy: 0, lookY: 0 },
  save: null,
  slot: 0,
  settings: null,
  hitstop: 0,
  timeScale: 1,
  fade: { a: 1, target: 0, speed: 3, cb: null, color: '#000' },
  flash: { a: 0, color: '#ffffff' },
  killed: new Set(),   // enemies killed since last rest (they stay dead until you rest)
  boss: null,          // active boss entity (for the HUD bar)
  prompt: null,        // nearest interactable {text, ent}
  debug: false,
};
