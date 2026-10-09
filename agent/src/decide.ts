import { maxStay, Status, type JourneyView } from '@ryoko/shared';
import type { Address } from 'viem';

export type Decision =
  | { kind: 'conquer' }
  | { kind: 'travel'; restart: boolean }
  | { kind: 'wait'; reason: string }
  | { kind: 'skip'; reason: string };

export interface DecisionContext {
  agent: Address;
  now: bigint;
  minStay: bigint;
  antPrice: bigint;
  /** $CHOG held by the Chog's account. */
  balance: bigint;
  /** $CHOG the journey contract may spend from the Chog's account. */
  allowance: bigint;
}

/**
 * What the agent should do next for one Chog. Pure: all chain state comes in through
 * `view` and `ctx`, so the rules can be tested without a node.
 */
export function decide(view: JourneyView, ctx: DecisionContext): Decision {
  if (view.agent.toLowerCase() !== ctx.agent.toLowerCase()) return { kind: 'skip', reason: 'not appointed' };

  switch (view.status) {
    case Status.None:
      return { kind: 'skip', reason: 'no journey' };
    case Status.Complete:
      return { kind: 'skip', reason: 'journey complete' };
    case Status.Ready:
      return { kind: 'conquer' };
    case Status.InSwamp:
      return { kind: 'wait', reason: `resting until ${view.readyAt}` };
    case Status.Travelling: {
      // The contract only lets a Chog in if the longest stay (fog) still ends by the deadline.
      if (ctx.now + maxStay(ctx.minStay) > view.deadline) {
        return { kind: 'wait', reason: 'too late to enter; the swamp restarts after the deadline' };
      }
      return feed(ctx, false);
    }
    case Status.Expired:
      return feed(ctx, true);
    default:
      return { kind: 'skip', reason: `unknown status ${String(view.status)}` };
  }
}

function feed(ctx: DecisionContext, restart: boolean): Decision {
  if (ctx.balance < ctx.antPrice) return { kind: 'wait', reason: 'hungry: not enough CHOG for an ant' };
  if (ctx.allowance < ctx.antPrice) return { kind: 'wait', reason: 'CHOG allowance for the journey is too low' };
  return { kind: 'travel', restart };
}
