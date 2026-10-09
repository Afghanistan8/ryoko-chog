import data from './tiers.json' with { type: 'json' };
import type { NetworkName } from './networks.js';

/**
 * Official Chog Genesis tiers (the "Tier" trait in the metadata), built by
 * scripts/build-tiers.mjs. Index 0 is the most common tier.
 */
export const TIER_NAMES: readonly string[] = data.tiers;

/** How many Chogs have each tier, in TIER_NAMES order. */
export const TIER_COUNTS: readonly number[] = data.counts;

const BY_NETWORK: Record<NetworkName, string> = { mainnet: data.mainnet, testnet: data.testnet };

export function tierName(index: number): string {
  return TIER_NAMES[index] ?? TIER_NAMES[0] ?? 'Common';
}

/** Tier index of a token id from the bundled data (the contract holds the same values). */
export function tierIndexOf(network: NetworkName, tokenId: bigint | number): number {
  const id = Number(tokenId);
  const digits = BY_NETWORK[network];
  if (!Number.isInteger(id) || id < 1 || id > digits.length) return 0;
  return Number(digits[id - 1]);
}

/**
 * Packs a network's tiers into the words RyokoJourney.setTierWords expects:
 * 32 one-byte tiers per word, token id i at byte (i-1) % 32 of word (i-1) / 32.
 */
export function tierWords(network: NetworkName): bigint[] {
  const digits = BY_NETWORK[network];
  const words: bigint[] = [];
  for (let i = 0; i < digits.length; i++) {
    const w = Math.floor(i / 32);
    words[w] = (words[w] ?? 0n) | (BigInt(Number(digits[i])) << BigInt((i % 32) * 8));
  }
  return words;
}
