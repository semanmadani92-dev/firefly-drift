# Moonwick - progress notes

Working rule: commit and push after every meaningful step, so nothing is lost if a
session stops. When resuming, read this file and `git log` first.

## Done
- Engine: fixed-step loop, tile collision, camera, room transitions on a world grid
- Art: rim-lit procedural terrain, decoration, parallax backdrops, darkness + light pass, particles
- Wick: run, variable jump, coyote time, strike (side / up / down + bounce), dash,
  wall grip, double jump, Starshot, Meteor slam, dew healing, hurt / death / lost light
- Enemies (Gloamwood): Mossback, Snuffling, Kitewing, Thornspitter, Bramble Brute
- Boss: The Bramble Warden (two phases)
- World: Candlestead village + Gloamwood (12 rooms, 20 map cells)
- UI: title, 3 save slots, options, key rebinding, pause, map, gear / relics, journal,
  shop, dialogue, ability cards, HUD, touch controls, gamepad
- Audio: synthesised SFX + generative music per area

## Next (in order)
1. Playtest pass on area 1 (balance, bugs), PWA files (manifest, icons, offline)
2. Put the playable build on `main`
3. Area 2: The Sunken Stacks (west of the Warden) - Thorn Grip, new enemies, boss
4. Area 3: Emberworks (east, behind the Starshot crystal) - Second Wind, boss gives Meteor
5. Area 4: Starwell - Eclipse dash, boss
6. Area 5: The Hushed Orrery - final boss, ending
7. Smith (blade upgrades), more relics, more secrets in old areas

## Conventions
- A map cell is 30x17 tiles of 32px. Side doors: rows 11-13. Up/down doors: columns 13-16.
- Jump reach: 3 tiles up, 4-5 tiles across. A dash gap is 8-9 tiles. Second Wind: 5-6 tiles up.
- Run `node tools/validate.mjs` after editing rooms.
