import type { ContractFunctionReturnType } from 'viem';
import type { ryokoJourneyAbi } from './abis';
import { SWAMP_COUNT } from './swamps';

/** Mirrors RyokoJourney.Status. Order matters: it is the on-chain enum value. */
export const Status = {
  None: 0,
  Travelling: 1,
  InSwamp: 2,
  Ready: 3,
  Expired: 4,
  Complete: 5,
} as const;
export type StatusValue = (typeof Status)[keyof typeof Status];

export const STATUS_LABEL: Record<StatusValue, string> = {
  0: 'Not travelling',
  1: 'Travelling to the next swamp',
  2: 'Resting in the swamp',
  3: 'Ready to conquer',
  4: 'Missed the deadline',
  5: 'Journey complete',
};

export type JourneyView = ContractFunctionReturnType<typeof ryokoJourneyAbi, 'view', 'getJourney'>;

export interface Timing {
  /** Seconds a Chog must stay in a swamp before conquering. */
  minStay: bigint;
  /** Seconds each leg (one swamp) may take in total. */
  legDuration: bigint;
}

/** One "day" of the journey: a ninth of a leg. 1 day on mainnet, 1 minute on the testnet demo. */
export function dayLength(t: Timing): bigint {
  return t.legDuration / BigInt(SWAMP_COUNT);
}

/** Day of the current leg, 1-9, or null when no leg is running. */
export function legDay(view: JourneyView, nowSec: bigint, t: Timing): number | null {
  if (view.status === Status.None || view.status === Status.Complete) return null;
  const elapsed = nowSec > view.legStartedAt ? nowSec - view.legStartedAt : 0n;
  const day = Number(elapsed / dayLength(t)) + 1;
  return Math.min(Math.max(day, 1), SWAMP_COUNT);
}

type Progress = Pick<JourneyView, 'status' | 'currentSwamp' | 'conquered'>;

/**
 * Swamp the Chog is standing in, 1-9. Between swamps (status Travelling) it is still in the
 * swamp it last conquered; it moves on only when it eats the next ant.
 */
export function displaySwamp(view: Progress): number {
  if (view.status === Status.None) return 1;
  if (view.status === Status.Travelling) return Math.max(1, view.conquered);
  return view.currentSwamp;
}

/** Glow level 0-9: the last swamp the Chog has entered, 9 when complete, 0 before its first ant. */
export function glowLevel(view: Progress): number {
  if (view.status === Status.None) return 0;
  if (view.status === Status.Complete) return SWAMP_COUNT;
  if (view.status === Status.Travelling) return view.conquered;
  return view.currentSwamp;
}

/** Leaderboard order: complete first, then most swamps conquered, fewest restarts, earliest progress. */
export function compareForLeaderboard(a: JourneyView, b: JourneyView): number {
  const ac = a.status === Status.Complete ? 1 : 0;
  const bc = b.status === Status.Complete ? 1 : 0;
  if (ac !== bc) return bc - ac;
  if (a.conquered !== b.conquered) return b.conquered - a.conquered;
  if (a.restarts !== b.restarts) return a.restarts - b.restarts;
  if (ac && bc && a.completedAt !== b.completedAt) return a.completedAt < b.completedAt ? -1 : 1;
  if (a.legStartedAt !== b.legStartedAt) return a.legStartedAt < b.legStartedAt ? -1 : 1;
  return a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0;
}

/** Formats a whole-token amount from wei with thousands separators, e.g. 1000000000000000000000n -> "1,000". */
export function formatTokens(wei: bigint, decimals = 18): string {
  const base = 10n ** BigInt(decimals);
  const whole = wei / base;
  const frac = wei % base;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (frac === 0n) return wholeStr;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2).replace(/0+$/, '');
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

/** Splits a list into batches; the journey batch view is sized for about 100 ids per call. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
