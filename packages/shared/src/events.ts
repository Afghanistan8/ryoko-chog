/** Mirrors RyokoJourney.SwampEvent. Order matters: it is the on-chain enum value. */
export const SwampEvent = {
  None: 0,
  Calm: 1,
  Shortcut: 2,
  Fog: 3,
  AntNest: 4,
  Relic: 5,
} as const;
export type SwampEventValue = (typeof SwampEvent)[keyof typeof SwampEvent];

/** Bit the contract adds to an event record when the Chog rushed that swamp. */
export const RUSHED_FLAG = 0x80;
/** Ants a rush costs, on top of the ant eaten to enter. */
export const RUSH_ANTS = 2;

export interface EventInfo {
  label: string;
  /** What happened, for the Chog page. */
  line: string;
  /** Effect in plain words. */
  effect: string;
  /** Short line for the field note. Empty for calm. */
  noteLine: string;
}

export const EVENT_INFO: Record<SwampEventValue, EventInfo> = {
  0: { label: 'Not entered', line: '', effect: '', noteLine: '' },
  1: { label: 'Calm waters', line: 'Nothing stirred. A quiet swamp.', effect: 'Normal stay.', noteLine: '' },
  2: {
    label: 'Shortcut',
    line: 'Found a shortcut through the reeds.',
    effect: 'A quarter of the stay shorter.',
    noteLine: 'Found a shortcut.',
  },
  3: {
    label: 'Lost in the fog',
    line: 'Wandered in circles in thick fog.',
    effect: 'A quarter of the stay longer.',
    noteLine: 'Got lost in the fog.',
  },
  4: {
    label: 'Ant nest',
    line: 'Stumbled on a nest of wild ants.',
    effect: 'Its own ant was not eaten.',
    noteLine: 'Found wild ants. Free lunch.',
  },
  5: {
    label: 'Relic',
    line: 'Dug a relic out of the mud.',
    effect: 'A keepsake for this journey.',
    noteLine: 'Found a relic in the mud!',
  },
};

export interface SwampRecord {
  event: SwampEventValue;
  rushed: boolean;
}

/** Splits an `eventsOf` entry into the event and whether the Chog rushed. */
export function decodeEventRecord(raw: number): SwampRecord {
  const event = raw & ~RUSHED_FLAG;
  return {
    event: (event >= 0 && event <= 5 ? event : 0) as SwampEventValue,
    rushed: (raw & RUSHED_FLAG) !== 0,
  };
}

/** Event odds out of 100 for a tier index, exactly as RyokoJourney.rollEvent. */
export function eventOdds(tier: number): Record<Exclude<SwampEventValue, 0>, number> {
  const t = Math.min(Math.max(Math.trunc(tier), 0), 5);
  return {
    5: 3 + t,
    4: 7 + t,
    2: 15 + 2 * t,
    3: 25 - 4 * t,
    1: 50,
  };
}

/** The longest a stay can be: the minimum stay plus fog. Mirrors RyokoJourney.maxStay. */
export function maxStay(minStay: bigint): bigint {
  return minStay + minStay / 4n;
}

/** How much a rush cuts off a stay: half the minimum stay (one day on mainnet). */
export function rushCut(minStay: bigint): bigint {
  return minStay / 2n;
}
