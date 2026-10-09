export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Seconds to a compact duration: "2d 4h", "3h 12m", "4m 05s", "12s". */
export function formatDuration(totalSeconds: bigint | number): string {
  let s = Math.max(0, Math.floor(Number(totalSeconds)));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d > 0) return h === 0 ? `${d}d` : `${d}d ${h}h`;
  if (h > 0) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  if (m > 0) return s === 0 ? `${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** A length of time for a sentence: "2 days", "1 day 12 hours", "1 minute". Up to two units. */
export function formatSpan(totalSeconds: bigint | number): string {
  let s = Math.max(0, Math.floor(Number(totalSeconds)));
  const units: [string, number][] = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  const parts: string[] = [];
  for (const [name, size] of units) {
    const n = Math.floor(s / size);
    s -= n * size;
    if (n > 0) parts.push(`${n} ${name}${n === 1 ? '' : 's'}`);
    else if (parts.length > 0) break;
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(' ') : '0 seconds';
}

export function chogLabel(name: string, tokenId: bigint): string {
  return name || `Chog #${tokenId}`;
}

export function errorText(err: unknown): string {
  if (err && typeof err === 'object') {
    if ('shortMessage' in err && typeof err.shortMessage === 'string') return err.shortMessage;
    if ('message' in err && typeof err.message === 'string') return err.message.split('\n')[0] ?? 'Something went wrong';
  }
  return 'Something went wrong';
}
