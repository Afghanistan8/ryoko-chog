import { describe, expect, it } from 'vitest';
import { nameProblem, formatTokens, displaySwamp, glowLevel, Status } from '@ryoko/shared';
import { formatDuration, chogLabel } from '../src/format';

describe('formatDuration', () => {
  it('drops zero parts and keeps two units at most', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(125)).toBe('2m 05s');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(2 * 86400)).toBe('2d');
    expect(formatDuration(9 * 86400 + 3 * 3600)).toBe('9d 3h');
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('nameProblem mirrors the contract rules', () => {
  it.each(['Gnarlo', 'Sir Squelch 2', 'abc', 'ABCDEFGHIJKLMNOP'])('accepts %s', (n) => {
    expect(nameProblem(n)).toBeNull();
  });
  it.each(['ab', 'seventeen chars x', ' Lead', 'Trail ', 'Two  spaces', 'Bad-dash', 'under_score', 'Frog\u{1F438}'])(
    'rejects %s',
    (n) => {
      expect(nameProblem(n)).not.toBeNull();
    },
  );
});

describe('display helpers', () => {
  it('formats token amounts', () => {
    expect(formatTokens(1000n * 10n ** 18n)).toBe('1,000');
    expect(formatTokens(1234500000000000000000n)).toBe('1,234.5');
    expect(formatTokens(0n)).toBe('0');
  });

  it('keeps a Chog in its last swamp until it eats the next ant', () => {
    expect(displaySwamp({ status: Status.Travelling, currentSwamp: 4, conquered: 3 })).toBe(3);
    expect(displaySwamp({ status: Status.Travelling, currentSwamp: 1, conquered: 0 })).toBe(1);
    expect(displaySwamp({ status: Status.InSwamp, currentSwamp: 4, conquered: 3 })).toBe(4);
    expect(glowLevel({ status: Status.Travelling, currentSwamp: 1, conquered: 0 })).toBe(0);
    expect(glowLevel({ status: Status.Ready, currentSwamp: 4, conquered: 3 })).toBe(4);
    expect(glowLevel({ status: Status.Complete, currentSwamp: 9, conquered: 9 })).toBe(9);
    expect(glowLevel({ status: Status.None, currentSwamp: 0, conquered: 0 })).toBe(0);
  });

  it('labels unnamed Chogs by number', () => {
    expect(chogLabel('', 7n)).toBe('Chog #7');
    expect(chogLabel('Gnarlo', 7n)).toBe('Gnarlo');
  });
});

describe('formatSpan', () => {
  it('writes lengths of time in words, up to two units', async () => {
    const { formatSpan } = await import('../src/format');
    expect(formatSpan(172800)).toBe('2 days');
    expect(formatSpan(777600)).toBe('9 days');
    expect(formatSpan(86400 + 43200)).toBe('1 day 12 hours');
    expect(formatSpan(86400 + 60)).toBe('1 day');
    expect(formatSpan(60)).toBe('1 minute');
    expect(formatSpan(3600 + 120 + 5)).toBe('1 hour 2 minutes');
    expect(formatSpan(45)).toBe('45 seconds');
    expect(formatSpan(0)).toBe('0 seconds');
    expect(formatSpan(-5n)).toBe('0 seconds');
  });
});
