// All the words in the game: items, relics, abilities, characters, lore.
// {jump} {attack} {dash} {spell} {heal} {up} {map} are replaced with the name
// of the key / button on whatever device the player is using.

export const GAME_TITLE = 'MOONWICK';

export const ITEMS = {
  seed: { name: 'Ember Seed', desc: 'A sleeping spark. Gather three and a new ember of health takes root.' },
  vial: { name: 'Dew Vial', desc: 'Holds one more sip of healing dew.' },
  glass: { name: 'Lumen Glass', desc: 'A lens of old moon-glass. You can carry more lumen for spells.' },
  shard: { name: 'Moon Shard', desc: 'A sliver of the fallen moon. A smith could work it into your matchblade.' },
  slot: { name: 'Relic Knot', desc: 'A loop of braided wick. You can bear one more relic.' },
  chart: { name: 'Star Chart', desc: 'The whole lay of this land, inked on old vellum.' },
};

export const RELICS = {
  magnet: { name: 'Mote Magnet', desc: 'Motes fly to you from far away.' },
  longwick: { name: 'Longwick', desc: 'Your matchblade burns longer. Strikes reach further.' },
  quicksip: { name: 'Quick Sip', desc: 'You drink dew much faster.' },
  quickstrike: { name: 'Flint Wrist', desc: 'You recover from each strike sooner.' },
  stoutglass: { name: 'Stout Glass', desc: 'After being hurt, you stay untouchable for longer.' },
  dewdrinker: { name: 'Dew Drinker', desc: 'Strikes refill your vials faster.' },
  brightcore: { name: 'Bright Core', desc: 'Strikes gather more lumen.' },
  thornhide: { name: 'Thornhide', desc: 'Whatever touches you is hurt in return.' },
  lastember: { name: 'Last Ember', desc: 'On your final ember, your blade burns far hotter.' },
  swiftwick: { name: 'Swiftwick', desc: 'You run faster.' },
  moteblossom: { name: 'Mote Blossom', desc: 'Fallen foes leave more motes behind.' },
  steadyflame: { name: 'Steady Flame', desc: 'Blows no longer knock you back.' },
};

export const ABILITIES = {
  dash: { name: 'Comet Dash', how: 'Press {dash} to streak forward, on the ground or in the air.', lore: 'The tail of a fallen star, still warm.' },
  shot: { name: 'Starshot', how: 'Press {spell} to throw a bolt of lumen. Strikes with your blade refill lumen.', lore: 'A seed of light the Warden kept beneath its heart.' },
  grip: { name: 'Quillhook', how: 'Push into a wall to cling and slide down it. Press {jump} to leap off - steer back to climb.', lore: 'Two bent quills that once pinned a map to a wall. They still hold.' },
  djump: { name: 'Second Wind', how: 'Press {jump} again in mid-air to leap a second time.', lore: 'A breath caught in a bellows a thousand years ago.' },
  slam: { name: 'Meteor', how: 'In the air, hold {down} and press {spell} to plunge. Cracked floors shatter.', lore: 'Everything that falls far enough becomes a star.' },
  eclipse: { name: 'Eclipse', how: 'Your dash now passes through foes and pale barriers unharmed.', lore: 'For a moment, you are the shadow the light cannot find.' },
};

export const HINTS = {
  move: 'Move with {left} {right}.  Jump with {jump} - hold it to jump higher.',
  attack: 'Strike with {attack}.  Hold {up} or {down} to strike above or below you.',
  drop: 'Hold {down} and press {jump} to drop through thin ledges.',
  lantern: 'Stand by a lantern and press {up} to rest. Resting saves your journey and refills your embers.',
  heal: 'Press {heal} while standing still to sip dew and mend your embers. Landing strikes slowly refills your vials.',
  pogo: 'Strike downward in mid-air to bounce off foes and thorns.',
  map: 'Press {map} to open your map and gear.',
  breakwall: 'Some walls sound hollow. Strike them.',
  dashgap: 'This gap is too wide to jump. There must be another way...',
  lever: 'Strike the lever.',
  lost: 'When your light goes out, your motes stay behind. Return and touch them to take them back.',
};

// Character dialogue. Each entry returns pages of text based on save flags.
export const NPCS = {
  tallow: {
    name: 'Old Tallow',
    lines(S) {
      if (S.flags.ended) return [
        'Look at that. Look at the ground, little Wick. I have a shadow. I had forgotten I was tall.',
        'The Moon is small yet. It will take a long while to grow. But it is up, and it knows the way home now.',
        'Rest when you like. There are still dark corners down there, and you are the only one who was ever any good at them.',
      ];
      if (!S.flags.met_tallow) return [
        'Ah... a new flame. And such a small one.',
        'I am Tallow. I was a tall candle once, when the Moon still hung where it should.',
        'It fell, little Wick. It fell through the roots of the world and went dark, and the Hush came up to drink what light was left.',
        'You were kindled from the last spark of the lantern-tree. Nobody else is left who can go down there.',
        'Follow the road east into the Gloamwood. Rest at every lantern you find - they will remember you when the dark does not.',
      ];
      if (S.flags.boss_warden && !S.abilities.grip) return [
        'The Warden sleeps at last? It guarded those roots longer than I have been melting.',
        'Below its hall the stairs go down to the Sunken Stacks. Mind the ink. It reads you back.',
      ];
      if (S.abilities.dash) return [
        'You move like a falling star now. Good. The wood is wide and the dark is patient.',
        'West of the old rootway there is a hall of thorns. The Warden waits there. It does not know the Moon is gone.',
      ];
      return [
        'Still here, little flame? The road east, then down. Always down.',
        'And strike the hollow-sounding walls. The wood hides things from those who only walk.',
      ];
    },
  },
  sconce: {
    name: 'Sconce',
    shop: 'sconce',
    lines(S) {
      if (!S.flags.met_sconce) return [
        'Hoy! A customer with legs! Do not just flicker there, come in, come in.',
        'Sconce is the name. Finest wares this side of the dark. Only wares this side of the dark, to be fair.',
        'I take motes. Everything down there drops them - little crumbs of moonlight. Bring me plenty.',
      ];
      return ['Back again? Good. A flame that spends is a flame that lives. Probably.'];
    },
  },
  folio: {
    name: 'Folio',
    shop: 'folio',
    lines(S) {
      if (!S.flags.met_folio) return [
        'Shh. ...Oh, you are not a page. You have legs. Forgive me, it has been some time.',
        'I am Folio. I was a reading lamp, then the lake came in, and now I am mostly a bottle of ink with opinions.',
        'The Curator is above us, through the Spine. It will not let anything leave the Stacks. It has not noticed me because I am very small and I do not rustle.',
        'The Spine cannot be climbed without hooks. The old mapmakers kept theirs in a hall below. You can drop down the Spine to reach it - you just cannot come back the same way until you have them.',
        'I have copied out a few things worth having. For motes, naturally. Ink is not free.',
      ];
      if (S.flags.boss_curator) return ['The Curator is quiet? Truly quiet? Then perhaps... perhaps I will read something aloud tonight. Just a little.'];
      if (S.abilities.grip) return ['You found the hooks! Up the Spine, then. All the way to the top. And if the Curator asks, you never saw me.'];
      return ['Down the Spine, into the hall of hooks, then back the long way round through the Ink Well. Mind the eels.'];
    },
  },
  flint: {
    name: 'Flint',
    smith: true,
    lines(S) {
      if (!S.flags.met_flint) return [
        'Hm. A lantern. Walking. On purpose. Do not see that often any more.',
        'Flint. Smith. I keep this one forge cool enough to work at, which is more than can be said for the rest of the place.',
        'That matchblade of yours is a kitchen match. I can fold moonlight into it, if you bring me a Moon Shard - they came down with the Moon, in the deep places - and enough motes to feed the fire.',
        'East of here a bellows has been holding its breath for a thousand years. Take that breath and you will jump twice. You will need to, if you mean to reach the Forgeheart.',
      ];
      if (S.blade >= 4) return ['That blade is as hot as I can make it. Go and point it at something that deserves it.'];
      if (S.flags.boss_hammerwright) return ['The hammering has stopped. First quiet I have heard in... I do not know how long. Bring shards, little flame. I have time now.'];
      return ['Shard and motes, and I will make that match of yours into something worth swinging.'];
    },
  },
  glint: {
    name: 'Glint',
    shop: 'glint',
    lines(S) {
      if (!S.flags.met_glint) return [
        'Oh! Mind the edges, mind the edges. Everything down here is edges.',
        'I am Glint. I was a window once. Then the Moon came through me, and here I am, in quite a few more pieces than I started with.',
        'The Mirror Pool is below the Glimmer Well. Do not look into it. It looked into me and now there are two of everything I regret.',
        'I sell what washes up. Motes only. I can see my own reflection in them, which is a comfort.',
      ];
      if (S.flags.boss_echo) return ['You walked out of the Mirror Pool and only one of you came back. Good. I was not sure which one it would be.'];
      return ['Edges, edges. Buy something round for a change.'];
    },
  },
  vesper2: {
    name: 'Vesper',
    lines(S) {
      if (S.flags.boss_hollowmoon) return [
        'It is so bright. I had forgotten what my own hands looked like.',
        'Go home, warm one. I think... I think I will follow, this time.',
      ];
      if (!S.flags.met_vesper2) return [
        '...Warm one. You came all the way down.',
        'I told you I was not certain I was looking for the way back. I was not. I was looking for this.',
        'The Moon is past the last lantern. The Hush sits inside it and wears its face. It will show you a sky that is not there.',
        'I could not strike it. I only ever had the dark for company, and it is hard to raise a hand against company.',
        'You are not alone the way I was. Every lantern you lit is still burning behind you. Remember that, when it gets quiet.',
      ];
      return ['Past the last lantern. Do not listen to the sky it shows you.'];
    },
  },
  vesper: {
    name: 'Vesper',
    lines(S) {
      if (!S.flags.met_vesper) return [
        '...Oh. You burn warm. I had forgotten that colour.',
        'I am Vesper. I went down a long time ago and I have not found the way back up. I am not certain I am looking.',
        'There is a shrine east of here where a star fell. The brute that guards it charges at anything that glows. Stand your ground until the very last moment - then do not be there.',
      ];
      if (S.abilities.dash && !S.flags.boss_warden) return ['You took the star\'s tail. Then the thorn hall is open to you. I will not follow. I have seen what waits there.'];
      return ['Go on, warm one. I will keep the dark company a while longer.'];
    },
  },
};

export const TABLETS = {
  well: { title: 'Frost-Bright Stone', text: ['"When the Moon fell it broke, and the pieces that would not go dark sank here."', '"We named the place Starwell. The light pools, and it remembers whoever looks into it."'] },
  mirror: { title: 'Mirror Stone', text: ['"Do not look long into the pool. It keeps what it sees."', '"What it keeps will stand up one day, and want its place back."'] },
  pale: { title: 'Pale Stone', text: ['"The walls of pale light let nothing solid through."', '"Only a shadow passes. Learn to be one, for the length of a breath."'] },
  orrery: { title: 'Brass Stone', text: ['"Here the first lamplighters built a model of the sky, so the Moon would always know its way home."', '"The model still turns. The sky it copied does not."'] },
  gears: { title: 'Engraved Stone', text: ['"We counted a thousand nights by these wheels, and then we stopped counting."', '"If you are reading this by your own light: thank you for coming."'] },
  lastdoor: { title: 'Last Stone', text: ['"The Moon is below. It is not dead. It is only very, very tired."', '"The Hush has wrapped itself around it like a coat. Take the coat off."'] },
  cooling: { title: 'Soot-Black Stone', text: ['"The Emberworks forged the frame that held the Moon in the sky."', '"When it fell, we were told to let the fires die. The fires were not told."'] },
  bellows: { title: 'Brass-Bound Stone', text: ['"The first bellows drew one breath and has been holding it ever since."', '"Take it. Something should finally come of all that waiting."'] },
  works: { title: 'Foreman\'s Stone', text: ['"The Hammerwright does not stop. It was never taught how."', '"It is still forging a new Moon. It has been getting the shape wrong for a thousand years."'] },
  drowned: { title: 'Water-Stained Stone', text: ['"The Stacks held every word ever written by lamplight."', '"When the Moon fell the lake came in after it. The ink ran, and the words went looking for readers."'] },
  pages: { title: 'Catalogue Stone', text: ['"Shelf nine thousand and four: songs for a Moon that is listening."', '"Shelf nine thousand and five: apologies."'] },
  hooks: { title: 'Pinned Stone', text: ['"The mapmakers climbed these shelves on hooks of quill, and never once looked down."', '"The ones who looked down are still there. Mind the ink."'] },
  curator: { title: 'Last Ledger', text: ['"Nothing leaves. Not a page. Not a reader. Not a light."', '"I will keep it all exactly as it was, until the Moon comes back to read it."'] },
  moonfall: { title: 'Weathered Stone', text: ['"On the night the Moon fell, we lit every lamp we owned and it was not enough."', '"So we planted the last flame in the ground, and waited for it to grow."'] },
  warden: { title: 'Root-Bound Stone', text: ['"The Warden was set here to guard the stair until moonrise."', '"No one told it there would be no more moonrises."'] },
  hush: { title: 'Scratched Stone', text: ['"The Hush is not a beast. It is what is left of a place when the light forgets it."', '"Do not fight the quiet. Fight the things it wears."'] },
  starfall: { title: 'Star-Marked Stone', text: ['"Here a star came down beside the Moon, small and furious."', '"Its tail still burns. Take it, if you are quick enough to hold it."'] },
};

export const BESTIARY = {
  hollowmoon: { name: 'The Hollow Moon', desc: 'The Hush, wearing the fallen Moon like a coat. Underneath, something was still trying to shine.' },
  prismite: { name: 'Prismite', desc: 'A beetle grown from cave-glass. Strike it once and it curls into a ball of edges - wait for it to uncurl.' },
  orbiter: { name: 'Orbiter', desc: 'A small sad core that keeps three shards circling it, so that nothing can come close again.' },
  wisp: { name: 'Hush Wisp', desc: 'A breath of the quiet. Walls do not stop it. It can only be struck in the moments it remembers to be real.' },
  lancer: { name: 'Crystal Lancer', desc: 'It levels its lance, waits one heartbeat, and crosses the room. Be above it when it does.' },
  echo: { name: 'The Echo', desc: 'The Mirror Pool looked at you for a long time. Then it stood up.' },
  cinderling: { name: 'Cinderling', desc: 'A coal with legs and no patience. It runs straight at anything cooler than itself.' },
  bellowsback: { name: 'Bellowsback', desc: 'It breathes in for a long moment. Be somewhere else when it breathes out.' },
  emberfly: { name: 'Emberfly', desc: 'It carries slag from the furnaces and lets go of it directly above whoever looks up.' },
  tinknight: { name: 'Tin Knight', desc: 'A suit of plate still walking its rounds. Its hammer is slow. Its hammer is also very large.' },
  hammerwright: { name: 'The Hammerwright', desc: 'Last smith of the Emberworks, still trying to forge a Moon that will stay up.' },
  inkblot: { name: 'Inkblot', desc: 'A paragraph that slid off its page. Strike it and it comes apart into smaller, angrier sentences.' },
  quill: { name: 'Quill', desc: 'It takes careful aim, then writes a single straight line through whatever is standing there.' },
  tome: { name: 'Tomewing', desc: 'A book that learned to fly and forgot how to be quiet. It spits its own letters.' },
  eel: { name: 'Lure Eel', desc: 'It waits under the ink with one small light held out, the way you would hold out a hand.' },
  sentinel: { name: 'Shelf Sentinel', desc: 'It carries a ledger as a shield and will not be argued with from the front.' },
  curator: { name: 'The Curator', desc: 'Keeper of the Sunken Stacks. It loved the library so much that it would not let it end.' },
  mossback: { name: 'Mossback', desc: 'A patient shell of stone and moss. It has walked this same path for a hundred years and resents the interruption.' },
  snuffling: { name: 'Snuffling', desc: 'A scrap of the Hush with a nose for flame. It hops toward anything bright and tries to breathe it in.' },
  kite: { name: 'Kitewing', desc: 'A paper-thin glider that hangs in still air, then dives. It was once a child\'s toy, or wants you to think so.' },
  spitter: { name: 'Thornspitter', desc: 'A bulb that learned to throw its seeds at trespassers. The seeds can be struck from the air.' },
  brute: { name: 'Bramble Brute', desc: 'A knot of thorn and temper. It charges at light until it hits something harder than itself.' },
  warden: { name: 'The Bramble Warden', desc: 'Old Antler, keeper of the root stair. It wears a lantern in its crown so the Moon can find it again.' },
};

export const SHOPS = {
  glint: [
    { id: 'chart_ember', kind: 'chart', area: 'ember', name: 'Chart of the Emberworks', desc: 'Reveals every room of the Emberworks on your map.', price: 110 },
    { id: 'chart_starwell', kind: 'chart', area: 'starwell', name: 'Chart of Starwell', desc: 'Reveals every room of Starwell on your map.', price: 130 },
    { id: 'glass_1', kind: 'glass', name: 'Lumen Glass', desc: 'Carry more lumen for spells.', price: 280 },
    { id: 'seed_3', kind: 'seed', name: 'Ember Seed', desc: 'One third of a new ember of health.', price: 340 },
    { id: 'r_quickstrike', kind: 'relic', relic: 'quickstrike', price: 380 },
    { id: 'vial_2', kind: 'vial', name: 'Dew Vial', desc: 'Carry one more sip of healing dew.', price: 420 },
    { id: 'slot_2', kind: 'slot', name: 'Relic Knot', desc: 'Bear one more relic at a time.', price: 520 },
  ],
  folio: [
    { id: 'chart_stacks', kind: 'chart', area: 'stacks', name: 'Chart of the Sunken Stacks', desc: 'Reveals every room of the Stacks on your map.', price: 90 },
    { id: 'r_brightcore', kind: 'relic', relic: 'brightcore', price: 240 },
    { id: 'seed_2', kind: 'seed', name: 'Ember Seed', desc: 'One third of a new ember of health.', price: 260 },
    { id: 'r_stoutglass', kind: 'relic', relic: 'stoutglass', price: 320 },
  ],
  sconce: [
    { id: 'chart_gloam', kind: 'chart', area: 'gloam', name: 'Chart of the Gloamwood', desc: 'Reveals every room of the Gloamwood on your map.', price: 60 },
    { id: 'r_magnet', kind: 'relic', relic: 'magnet', price: 120 },
    { id: 'vial_1', kind: 'vial', name: 'Dew Vial', desc: 'Carry one more sip of healing dew.', price: 200 },
    { id: 'seed_1', kind: 'seed', name: 'Ember Seed', desc: 'One third of a new ember of health.', price: 180 },
    { id: 'r_dewdrinker', kind: 'relic', relic: 'dewdrinker', price: 260 },
    { id: 'slot_1', kind: 'slot', name: 'Relic Knot', desc: 'Bear one more relic at a time.', price: 340 },
  ],
};

export const INTRO = [
  'The Moon fell on a quiet night.',
  'It sank beneath the roots of the Gloamwood and its light went out.',
  'In Candlestead, the lamplings kept one last spark alive.',
  'Tonight, that spark opened its eyes.',
];

export const ENDING = [
  'The coat of quiet came apart in your hands.',
  'Underneath, the Moon was small and cold and still, very faintly, awake.',
  'You had carried one spark down through the roots of the world. You gave it back.',
  'Far above, in Candlestead, Old Tallow looked up - and for the first time in a thousand years, had a shadow.',
];

export const CREDITS = [
  'MOONWICK',
  'A small light in a large dark.',
  'Every picture and every sound in this game is drawn and played by code, live, in your browser.',
  'Thank you for carrying the flame.',
];
