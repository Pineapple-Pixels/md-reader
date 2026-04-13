/** Structured logger — thin wrapper over console with consistent JSON-ish format. */

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  tag: string;
  msg: string;
  [key: string]: unknown;
}

function format(entry: LogEntry): string {
  const { level, tag, msg, ...extra } = entry;
  const ts = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase()}] [${tag}] ${msg}`;
  const keys = Object.keys(extra);
  if (keys.length === 0) return base;
  const data = JSON.stringify(extra);
  return `${base} ${data}`;
}

function log(level: LogLevel, tag: string, msg: string, extra?: Record<string, unknown>): void {
  const entry: LogEntry = { level, tag, msg, ...extra };
  const line = format(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (tag: string, msg: string, extra?: Record<string, unknown>) => log('info', tag, msg, extra),
  warn: (tag: string, msg: string, extra?: Record<string, unknown>) => log('warn', tag, msg, extra),
  error: (tag: string, msg: string, extra?: Record<string, unknown>) => log('error', tag, msg, extra),
};
