import { describe, expect, it } from 'vitest';
import { resumeFrom } from '../src/resets';

const CHOG = '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763';
const OTHER = '0x095cee07dd861375170b3Bb1EB74D580E6Ff604B';

describe('resumeFrom', () => {
  it('resumes a state written for the same chain and Chog contract', () => {
    expect(resumeFrom({ chainId: 143, chog: CHOG.toLowerCase(), lastBlock: '900' }, 143, CHOG, 1000n)).toBe(900n);
  });

  it('ignores a state from another chain, such as a testnet run', () => {
    expect(resumeFrom({ chainId: 10143, chog: CHOG, lastBlock: '900' }, 143, CHOG, 1000n)).toBeUndefined();
  });

  it('ignores a state for another Chog contract', () => {
    expect(resumeFrom({ chainId: 143, chog: OTHER, lastBlock: '900' }, 143, CHOG, 1000n)).toBeUndefined();
  });

  it('ignores the old format that had no chain id', () => {
    expect(resumeFrom({ lastBlock: '900' }, 143, CHOG, 1000n)).toBeUndefined();
  });

  it('ignores a block ahead of the chain', () => {
    expect(resumeFrom({ chainId: 143, chog: CHOG, lastBlock: '2000' }, 143, CHOG, 1000n)).toBeUndefined();
  });

  it('ignores junk', () => {
    expect(resumeFrom(null, 143, CHOG, 1000n)).toBeUndefined();
    expect(resumeFrom('x', 143, CHOG, 1000n)).toBeUndefined();
    expect(resumeFrom({ chainId: 143, chog: CHOG, lastBlock: '-1' }, 143, CHOG, 1000n)).toBeUndefined();
  });
});
