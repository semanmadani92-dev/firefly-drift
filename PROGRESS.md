# Moonwick - progress notes

Working rule: commit and push after every meaningful step, so nothing is lost if a
session stops. When resuming, read this file and `git log` first.

## Done (version 1.0 - the game can be played from start to ending)
- Engine: fixed-step loop, tile collision, camera, room transitions on a world grid
- Art: rim-lit procedural terrain, decoration, parallax backdrops, darkness + light pass, particles
- Wick: run, variable jump, coyote time, strike (side / up / down + bounce), Comet Dash,
  Quillhook wall grip, Second Wind, Starshot, Meteor slam, Eclipse dash, dew healing,
  hurt / death / lost light
- World: 46 rooms in six areas
  1. Candlestead (village) and the Gloamwood - boss: the Bramble Warden (gives Starshot)
  2. The Sunken Stacks - Quillhook shrine, boss: the Curator
  3. The Emberworks - Second Wind shrine, smith, boss: the Hammerwright (gives Meteor)
  4. Starwell - boss: the Echo (gives Eclipse)
  5. The Hushed Orrery - final boss: the Hollow Moon, then the ending
- 18 kinds of creature, 5 bosses, 12 relics, 4 blade upgrades, 3 shops, a smith
- UI: title, 3 save slots, options, key rebinding, pause, map, gear / relics, journal,
  shop, dialogue, ability cards, HUD, touch controls, gamepad, ending screen
- Audio: synthesised SFX + generative music per area
- Installable (manifest, icons, offline service worker)

## Ideas for later
- More secrets behind pale barriers in the early areas (rewards for coming back)
- A map marker system, a boss-rush mode, a harder second journey

## Conventions
- A map cell is 30x17 tiles of 32px. Side doors: rows 11-13. Up/down doors: columns 13-16.
- Jump reach: 3 tiles up, 4-5 tiles across. A dash gap is 8-9 tiles. Second Wind: 5-6 tiles up.
- A player may have the Quillhook or Second Wind but not both from the Emberworks on,
  so every required climb must work with plain jumps (ledges 3 tiles apart).
- Run `node tools/validate.mjs` after editing rooms, and `node tools/reach.mjs --gates`
  to confirm the whole game can still be finished and the ability gates hold.
