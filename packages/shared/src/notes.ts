import type { Traits } from './metadata';
import { EVENT_INFO, type SwampEventValue } from './events';

/**
 * Field notes the agent posts when a Chog conquers a swamp.
 * Written from fixed lines plus the Chog's own traits, so no AI service or API key is needed.
 * Every note starts with "Swamp N conquered." and fits the on-chain limit of 140 bytes.
 */

export const MAX_NOTE_BYTES = 140;

const SWAMP_LINES: readonly (readonly string[])[] = [
  [
    'The mud is warm and it hums.',
    'Ate my first ant. No regrets.',
    'Reeds tickled the whole way through.',
    'The moon watched. I waved.',
  ],
  [
    'The lilies smelled of old socks.',
    'Every pad I stood on sank a little.',
    'Rot is just compost with ambition.',
    'A frog judged my form. Rude.',
  ],
  [
    'Fireflies argued over my hat.',
    'Followed the brightest firefly. Bad idea.',
    'Counted 400 fireflies, then lost count.',
    'The fen glows. So do I, a bit.',
  ],
  [
    'The mangrove roots tried to keep me.',
    'Climbed a root. Fell off a root.',
    'Something in the water blinked.',
    'Teal water, teal thoughts.',
  ],
  [
    'Sneezed spores for a whole day.',
    'A toadstool winked at me.',
    'Did not eat the glowing ones. Mostly.',
    'The hollow hums in violet.',
  ],
  [
    'The fog was so thick I met myself.',
    'Lost my feet in the mist. Found them.',
    'Walked in circles. Very scenic circles.',
    'Heard my name in the fog. Kept going.',
  ],
  [
    'The peat bubbled my name. Rude.',
    'Embers in the mud, fire in the belly.',
    'Stepped in the dark part. All dark parts.',
    'The mire is black but I am not afraid.',
  ],
  [
    'Rang a drowned bell. Nobody answered.',
    'Prayed to the candle windows. They flickered.',
    'The arches remember someone. Not me.',
    'Swam through the nave. Holy mud.',
  ],
  [
    'I glow gold now. Do not look directly.',
    'The light broke through. So did I.',
    'Nine swamps. One Chog. Zero dry socks.',
    'Golden mud is still mud. Worth it.',
  ],
];

interface TraitLine {
  trait: string;
  template: string;
}

const TRAIT_LINES: readonly TraitLine[] = [
  { trait: 'Head', template: 'My {v} stayed dry. Mostly.' },
  { trait: 'Head', template: 'Kept the {v} on the whole time.' },
  { trait: 'Body', template: 'The {v} smells like bog now.' },
  { trait: 'Body', template: 'Worth ruining a {v} for.' },
  { trait: 'Eyes', template: 'Saw it all with {v} eyes.' },
  { trait: 'Mouth', template: 'Finished with a {v} face.' },
  { trait: 'Accessory', template: 'The {v} came along for the ride.' },
  { trait: 'Aura', template: 'My aura ({v}) scared the leeches.' },
  { trait: 'Tier', template: 'Not bad for a {v} Chog.' },
];

const GENERIC_LINES: readonly string[] = [
  'Onward.',
  'Feet wet, spirit dry.',
  'Next swamp, please.',
  'Another ant would be nice.',
];

/** Words that must never be repeated in a public note, even if a trait contains them. */
const BLOCKED = /(retard|nigg|fag|rape|nazi|kike|tranny|chink|spic)/i;
const PLAIN_ASCII = /^[\x20-\x7e]+$/;
const EMPTY_VALUE = /^(none|no|yes|base|origin|normal)$/i;

/** A trait value that is safe and meaningful to quote, lower-cased, or undefined. */
export function safeTraitValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v || v.length > 24 || !PLAIN_ASCII.test(v) || BLOCKED.test(v) || EMPTY_VALUE.test(v)) return undefined;
  return v.toLowerCase();
}

/** Deterministic 32-bit hash so the same Chog and swamp always get the same note. */
function hash(parts: readonly (number | bigint | string)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x2c;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export interface NoteInput {
  swamp: number;
  tokenId: bigint;
  journeyId: bigint;
  restarts: number;
  traits?: Traits;
  /** The swamp's event; a notable one replaces the trait line. */
  event?: SwampEventValue;
  /** Whether the Chog rushed this swamp. */
  rushed?: boolean;
}

export function writeNote({ swamp, tokenId, journeyId, restarts, traits = {}, event, rushed }: NoteInput): string {
  if (!Number.isInteger(swamp) || swamp < 1 || swamp > 9) throw new Error(`swamp must be 1-9, got ${swamp}`);
  const seed = hash([tokenId, journeyId, swamp, restarts]);
  const head = `Swamp ${swamp} conquered.`;
  const lines = SWAMP_LINES[swamp - 1]!;
  const swampLine = lines[seed % lines.length]!;

  const usable = TRAIT_LINES.map((l) => ({ l, v: safeTraitValue(traits[l.trait]) })).filter((x) => x.v);
  const eventLine = event !== undefined ? EVENT_INFO[event]?.noteLine : '';
  let tail: string;
  if (eventLine) {
    tail = eventLine;
  } else if (rushed) {
    tail = 'Ran most of the way.';
  } else if (usable.length > 0) {
    const pick = usable[(seed >>> 8) % usable.length]!;
    tail = pick.l.template.replace('{v}', pick.v!);
  } else {
    tail = GENERIC_LINES[(seed >>> 8) % GENERIC_LINES.length]!;
  }

  const full = `${head} ${swampLine} ${tail}`;
  if (byteLength(full) <= MAX_NOTE_BYTES) return full;
  const short = `${head} ${swampLine}`;
  return byteLength(short) <= MAX_NOTE_BYTES ? short : head;
}
