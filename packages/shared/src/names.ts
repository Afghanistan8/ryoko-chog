/**
 * Mirrors RyokoJourney's on-chain name rules: 3-16 characters of letters, digits and single
 * spaces, with no leading or trailing space. Uniqueness ignores case and is checked on-chain.
 */
const NAME_RULE = /^(?=.{3,16}$)[A-Za-z0-9]+( [A-Za-z0-9]+)*$/;

export function nameProblem(name: string): string | null {
  if (name.length < 3) return 'Use at least 3 characters.';
  if (name.length > 16) return 'Use at most 16 characters.';
  if (/^ | $/.test(name)) return 'Remove the space at the start or end.';
  if (/ {2}/.test(name)) return 'Use single spaces only.';
  if (!NAME_RULE.test(name)) return 'Use letters, numbers and spaces only.';
  return null;
}
