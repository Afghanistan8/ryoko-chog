type Level = 'info' | 'warn' | 'error';

function write(level: Level, msg: string, data?: Record<string, unknown>): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`;
  const extra = data
    ? ' ' + JSON.stringify(data, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))
    : '';
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line + extra);
}

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => write('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write('error', msg, data),
};

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'shortMessage' in err && typeof err.shortMessage === 'string') {
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}
