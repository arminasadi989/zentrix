type Level = 'info' | 'warn' | 'error';

const SECRET_PATTERN = /(api[_-]?key|token|apikey)=([^&\s]+)/gi;

/** Redacts query-string secrets so keys never reach logs or error responses. */
export function redact(input: string): string {
  return input.replace(SECRET_PATTERN, (_m, k: string) => `${k}=***`);
}

function emit(level: Level, message: string, meta?: unknown): void {
  const line = `[zentrix] ${new Date().toISOString()} ${level.toUpperCase()} ${redact(message)}`;
  const payload = meta === undefined ? '' : ` ${redact(safeStringify(meta))}`;
  if (level === 'error') console.error(line + payload);
  else if (level === 'warn') console.warn(line + payload);
  else console.log(line + payload);
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

export const logger = {
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
