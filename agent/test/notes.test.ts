import { describe, expect, it } from 'vitest';
import { MAX_NOTE_BYTES, safeTraitValue, writeNote, traitsOf, ipfsToHttp } from '@ryoko/shared';

const byteLength = (s: string) => new TextEncoder().encode(s).length;

describe('writeNote', () => {
  it('starts with the conquered swamp and fits the on-chain limit for every swamp and seed', () => {
    const traits = {
      Head: 'Orange Bucket Cap',
      Body: 'White Pure Shirt',
      Eyes: 'Gradient visor',
      Mouth: 'Rainbow Puke',
      Accessory: 'Red Candle',
      Aura: 'Burning Aura',
      Tier: 'Epic',
    };
    for (let swamp = 1; swamp <= 9; swamp++) {
      for (let id = 1n; id <= 300n; id++) {
        for (const t of [traits, {}]) {
          const note = writeNote({ swamp, tokenId: id, journeyId: 7n, restarts: Number(id % 3n), traits: t });
          expect(note.startsWith(`Swamp ${swamp} conquered.`)).toBe(true);
          expect(byteLength(note)).toBeLessThanOrEqual(MAX_NOTE_BYTES);
          expect(note).toMatch(/^[\x20-\x7e]+$/);
        }
      }
    }
  });

  it('is deterministic', () => {
    const input = { swamp: 4, tokenId: 1462n, journeyId: 3n, restarts: 0, traits: { Head: 'Peace hat' } };
    expect(writeNote(input)).toBe(writeNote(input));
  });

  it('never quotes blocked or junk trait values', () => {
    const traits = { Eyes: 'Green Retard', Head: 'RETARD Cap', Body: 'None', Accessory: 'x'.repeat(30) };
    for (let id = 1n; id <= 200n; id++) {
      const note = writeNote({ swamp: 2, tokenId: id, journeyId: 1n, restarts: 0, traits });
      expect(note.toLowerCase()).not.toContain('retard');
      expect(note).not.toContain('xxxxxxxx');
      expect(note.toLowerCase()).not.toContain('none');
    }
  });

  it('rejects swamps outside 1-9', () => {
    expect(() => writeNote({ swamp: 0, tokenId: 1n, journeyId: 1n, restarts: 0 })).toThrow();
    expect(() => writeNote({ swamp: 10, tokenId: 1n, journeyId: 1n, restarts: 0 })).toThrow();
  });
});

describe('metadata helpers', () => {
  it('cleans trait values', () => {
    expect(safeTraitValue('  Peace   hat ')).toBe('peace hat');
    expect(safeTraitValue('Origin')).toBeUndefined();
    expect(safeTraitValue('Retard Cap')).toBeUndefined();
    expect(safeTraitValue('Frog \u{1F438}')).toBeUndefined();
  });

  it('reads attributes and rewrites ipfs links', () => {
    expect(traitsOf({ attributes: [{ trait_type: 'Head', value: 'MCGA Cap' }, { value: 'orphan' }] })).toEqual({
      Head: 'MCGA Cap',
    });
    expect(ipfsToHttp('ipfs://bafy/1462.json', 'https://gateway.pinata.cloud/ipfs/')).toBe(
      'https://gateway.pinata.cloud/ipfs/bafy/1462.json',
    );
  });
});
