# Moonwick

A 2D "glowing night" metroidvania that runs in the browser, on phones and computers.
You play Wick, a small living lantern sent down into the dark to relight the fallen Moon.

Everything is made with code: there are no image or sound files. All art is drawn
live on a canvas and all music and sound effects are synthesised in the browser.

## Play

Open `index.html` through any web server (the game uses JavaScript modules, so it
will not run from a `file://` path):

```
python3 -m http.server 8080
# then visit http://localhost:8080
```

On GitHub Pages it works as-is: Settings > Pages > Deploy from a branch > `main`, folder `/`.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | Arrow keys / A D | Stick / D-pad | Left thumb stick |
| Jump (hold = higher) | Space / Z | A | Jump |
| Strike (hold up/down to aim) | X / J | X | Strike |
| Dash (once found) | C / K / Shift | RB / RT | Dash |
| Spell (once found) | V / L | B | Spell |
| Sip dew (heal) | F / H | Y / LB | Sip |
| Rest, talk, read | Up / W / E | Up | Up, or the pill button |
| Map & gear | M / Tab | Select | Map |
| Pause | Esc / P | Start | II |

Keys can be changed in Options > Keyboard.

## Project layout

- `index.html`, `css/style.css` - page, HUD and menus
- `js/main.js` - game loop, room loading, rest / death / save events
- `js/player.js` - Wick: movement, matchblade, dash, spells, healing
- `js/enemies.js`, `js/bosses.js` - creatures and bosses
- `js/entities.js` - lanterns, pickups, gates, levers, characters, projectiles
- `js/terrain.js`, `js/gfx.js` - procedural art, lighting, particles, camera
- `js/audio.js` - synthesised sound effects and music
- `js/ui.js`, `js/input.js`, `js/save.js` - menus, controls, save slots
- `js/data/` - rooms (drawn as text maps), dialogue, items
- `tools/validate.mjs` - checks that every room is well-formed and doors line up
- `tools/smoke.mjs`, `tools/shot.mjs` - headless browser tests / screenshots

## Status

See `PROGRESS.md` for what is finished and what comes next.
