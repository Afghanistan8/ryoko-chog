import { describe, expect, it } from 'vitest';
import {
  decodeEventRecord,
  eventOdds,
  maxStay,
  rushCut,
  SwampEvent,
  tierIndexOf,
  tierWords,
  TIER_COUNTS,
  TIER_NAMES,
  writeNote,
} from '@ryoko/shared';
import tiersData from '../../packages/shared/src/tiers.json';

describe('swamp events', () => {
  it('odds always add up to 100 and favour rarer tiers', () => {
    for (let t = 0; t <= 7; t++) {
      const o = eventOdds(t);
      expect(Object.values(o).reduce((a, b) => a + b, 0)).toBe(100);
      expect(o[SwampEvent.Calm]).toBe(50);
    }
    expect(eventOdds(4)[SwampEvent.Relic]).toBeGreaterThan(eventOdds(0)[SwampEvent.Relic]);
    expect(eventOdds(4)[SwampEvent.Fog]).toBeLessThan(eventOdds(0)[SwampEvent.Fog]);
    expect(eventOdds(9)).toEqual(eventOdds(5));
  });

  it('decodes event records with the rush flag', () => {
    expect(decodeEventRecord(0)).toEqual({ event: 0, rushed: false });
    expect(decodeEventRecord(5)).toEqual({ event: 5, rushed: false });
    expect(decodeEventRecord(0x80 | 3)).toEqual({ event: 3, rushed: true });
    expect(decodeEventRecord(0x7f)).toEqual({ event: 0, rushed: false });
  });

  it('matches the contract timing rules', () => {
    expect(maxStay(172800n)).toBe(216000n); // 2.5 days
    expect(rushCut(172800n)).toBe(86400n); // 1 day
    expect(maxStay(120n)).toBe(150n);
  });
});

describe('notes with events', () => {
  it('mention notable events and always fit on chain', () => {
    const traits = { Head: 'A Very Long Hat Name Here', Body: 'Yellow 143 Jersey', Tier: 'Legendary' };
    for (let swamp = 1; swamp <= 9; swamp++) {
      for (const event of [0, 1, 2, 3, 4, 5] as const) {
        for (const rushed of [false, true]) {
          const note = writeNote({ swamp, tokenId: 1462n, journeyId: 7n, restarts: 2, traits, event, rushed });
          expect(new TextEncoder().encode(note).length).toBeLessThanOrEqual(140);
          expect(note.startsWith(`Swamp ${swamp} conquered.`)).toBe(true);
        }
      }
    }
    expect(writeNote({ swamp: 3, tokenId: 1n, journeyId: 1n, restarts: 0, event: SwampEvent.Relic })).toContain('relic');
    expect(writeNote({ swamp: 3, tokenId: 1n, journeyId: 1n, restarts: 0, event: SwampEvent.Calm, rushed: true })).toContain(
      'Ran most of the way.',
    );
  });
});

describe('tier data', () => {
  it('is the real, complete Chog Genesis data (not the placeholder)', () => {
    expect(tiersData.complete).toBe(true);
    expect(tiersData.mainnet).toHaveLength(1969);
    expect(tiersData.testnet).toHaveLength(1969);
    expect(TIER_COUNTS.reduce((a, b) => a + b, 0)).toBe(1969);
    expect(TIER_NAMES.length).toBeGreaterThan(1);
  });

  it('packs tiers into contract words exactly as RyokoJourney.tierOf reads them', () => {
    for (const net of ['mainnet', 'testnet'] as const) {
      const words = tierWords(net);
      expect(words).toHaveLength(62);
      for (const id of [1, 2, 31, 32, 33, 64, 1000, 1969]) {
        const i = id - 1;
        const byte = Number((words[Math.floor(i / 32)]! >> BigInt((i % 32) * 8)) & 0xffn);
        expect(byte).toBe(tierIndexOf(net, id));
      }
    }
  });
});
