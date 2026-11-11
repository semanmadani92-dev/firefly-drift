// Every room in the world, gathered in one list.
import { GLOAMWOOD } from './gloamwood.js';
import { STACKS } from './stacks.js';
import { EMBER } from './ember.js';
import { STARWELL } from './starwell.js';
import { ORRERY } from './orrery.js';

export const START_ROOM = 'v0';
export const TITLE_ROOM = 'title';
export const ALL_ROOMS = [...GLOAMWOOD, ...STACKS, ...EMBER, ...STARWELL, ...ORRERY];
