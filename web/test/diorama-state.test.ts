import { describe, expect, it } from 'vitest';
import { Status, type JourneyView } from '@ryoko/shared';
import { journeyToDiorama, swampState } from '../src/diorama/state';

function view(over: Partial<JourneyView>): JourneyView {
  return {
    tokenId: 1n,
    holder: '0x0000000000000000000000000000000000000001',
    account: '0x0000000000000000000000000000000000000002',
    agent: '0x0000000000000000000000000000000000000003',
    status: Status.Travelling,
    conquered: 0,
    currentSwamp: 1,
    journeyId: 1n,
    startedAt: 0n,
    legStartedAt: 0n,
    enteredAt: 0n,
    readyAt: 0n,
    deadline: 0n,
    completedAt: 0n,
    ants: 0,
    restarts: 0,
    burned: 0n,
    name: 'ox6214',
    tier: 0,
    swampEvent: 0,
    rushed: false,
    ...over,
  };
}
const opts = { name: 'ox6214', glowName: 'Spore violet', antsInWallet: 2 };

describe('journeyToDiorama', () => {
  it('shows a Chog with no journey on swamp 1, unlit', () => {
    const s = journeyToDiorama(view({ status: Status.None }), opts);
    expect(s).toMatchObject({ started: false, conquered: 0, chogAt: 0, target: 0, glow: 0, complete: false, antsComing: false });
    expect(swampState(s, 0)).toBe('locked');
  });

  it('keeps the Chog on its last swamp while it travels to the next', () => {
    const s = journeyToDiorama(view({ status: Status.Travelling, conquered: 4, currentSwamp: 5, ants: 4 }), opts);
    expect(s.chogAt).toBe(3);
    expect(s.target).toBe(4);
    expect(s.glow).toBe(4);
    expect(s.antsComing).toBe(true);
    expect(swampState(s, 3)).toBe('done');
    expect(swampState(s, 4)).toBe('now');
    expect(swampState(s, 5)).toBe('locked');
    expect(s.subtitle).toBe('Heading for swamp 5');
  });

  it('puts the Chog on the swamp it entered', () => {
    const s = journeyToDiorama(view({ status: Status.InSwamp, conquered: 4, currentSwamp: 5, ants: 5 }), opts);
    expect(s.chogAt).toBe(4);
    expect(s.target).toBe(4);
    expect(s.glow).toBe(5);
    expect(s.antsComing).toBe(false);
    expect(s.subtitle).toBe('Spore violet glow · swamp 5');
  });

  it('marches ants only when the Chog has food in its wallet', () => {
    expect(journeyToDiorama(view({ status: Status.Travelling }), { ...opts, antsInWallet: 0 }).antsComing).toBe(false);
    expect(journeyToDiorama(view({ status: Status.Expired, conquered: 2, currentSwamp: 3 }), opts).antsComing).toBe(true);
  });

  it('marks a finished journey gold on swamp 9 with every swamp done', () => {
    const s = journeyToDiorama(view({ status: Status.Complete, conquered: 9, currentSwamp: 9, ants: 10 }), opts);
    expect(s).toMatchObject({ complete: true, chogAt: 8, target: 8, glow: 9, conquered: 9 });
    for (let i = 0; i < 9; i++) expect(swampState(s, i)).toBe('done');
    expect(s.subtitle).toBe('Gold · journey complete');
  });
});

describe('journeyToDiorama swamp events', () => {
  it('shows a notable event and a rush instead of the glow name', () => {
    const s = journeyToDiorama(view({ status: Status.InSwamp, currentSwamp: 3, conquered: 2, swampEvent: 5, rushed: true }), opts);
    expect(s.subtitle).toBe('Relic · rushed · swamp 3');
  });

  it('keeps the glow name for calm waters', () => {
    const s = journeyToDiorama(view({ status: Status.InSwamp, currentSwamp: 3, conquered: 2, swampEvent: 1 }), opts);
    expect(s.subtitle).toBe('Spore violet glow · swamp 3');
  });
});
