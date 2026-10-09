import { describe, expect, it } from 'vitest';
import { Status, type JourneyView } from '@ryoko/shared';
import { decide, type DecisionContext } from '../src/decide';

const AGENT = '0x00000000000000000000000000000000000000Aa';
const PRICE = 1000n * 10n ** 18n;

function view(over: Partial<JourneyView>): JourneyView {
  return {
    tokenId: 1n,
    holder: '0x0000000000000000000000000000000000000001',
    account: '0x0000000000000000000000000000000000000002',
    agent: AGENT,
    status: Status.Travelling,
    conquered: 0,
    currentSwamp: 1,
    journeyId: 1n,
    startedAt: 1000n,
    legStartedAt: 1000n,
    enteredAt: 0n,
    readyAt: 0n,
    deadline: 1000n + 540n,
    completedAt: 0n,
    ants: 0,
    restarts: 0,
    burned: 0n,
    name: '',
    tier: 0,
    swampEvent: 0,
    rushed: false,
    ...over,
  };
}

const ctx: DecisionContext = { agent: AGENT, now: 1000n, minStay: 120n, antPrice: PRICE, balance: PRICE, allowance: PRICE };

describe('decide', () => {
  it('skips Chogs that appointed another agent', () => {
    expect(decide(view({ agent: '0x0000000000000000000000000000000000000BBb' }), ctx).kind).toBe('skip');
  });

  it('matches the agent address case-insensitively', () => {
    expect(decide(view({}), { ...ctx, agent: AGENT.toLowerCase() as `0x${string}` }).kind).toBe('travel');
  });

  it('skips Chogs with no journey or a finished one', () => {
    expect(decide(view({ status: Status.None }), ctx).kind).toBe('skip');
    expect(decide(view({ status: Status.Complete }), ctx).kind).toBe('skip');
  });

  it('conquers when ready', () => {
    expect(decide(view({ status: Status.Ready }), ctx)).toEqual({ kind: 'conquer' });
  });

  it('waits while resting in the swamp', () => {
    expect(decide(view({ status: Status.InSwamp }), ctx).kind).toBe('wait');
  });

  it('travels when fed and in time', () => {
    expect(decide(view({}), ctx)).toEqual({ kind: 'travel', restart: false });
  });

  it('travels exactly when the longest stay (fog) still fits before the deadline', () => {
    // minStay 120 -> longest stay 150
    expect(decide(view({}), { ...ctx, now: 1000n + 540n - 150n }).kind).toBe('travel');
    expect(decide(view({}), { ...ctx, now: 1000n + 540n - 149n }).kind).toBe('wait');
  });

  it('waits when hungry or the allowance is too low', () => {
    const hungry = decide(view({}), { ...ctx, balance: PRICE - 1n });
    expect(hungry.kind).toBe('wait');
    expect(hungry.kind === 'wait' && hungry.reason).toMatch(/^hungry/);
    expect(decide(view({}), { ...ctx, allowance: 0n }).kind).toBe('wait');
  });

  it('restarts an expired swamp when fed', () => {
    expect(decide(view({ status: Status.Expired }), { ...ctx, now: 5000n })).toEqual({ kind: 'travel', restart: true });
    expect(decide(view({ status: Status.Expired }), { ...ctx, now: 5000n, balance: 0n }).kind).toBe('wait');
  });
});
