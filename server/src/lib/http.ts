import { logger, redact } from './logger.ts';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * JSON fetch with a hard timeout and a typed failure mode. Every external call
 * in this app goes through here so that no provider can hang a request or
 * throw an untyped error into a route handler.
 */
export async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...(options.headers ?? {}) },
    });
    if (!response.ok) {
      throw new UpstreamError(`HTTP ${response.status} from upstream`, response.status, redact(url));
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    const reason = error instanceof Error ? error.message : 'unknown error';
    logger.warn(`upstream fetch failed: ${redact(url)} (${reason})`);
    throw new UpstreamError(reason, null, redact(url));
  } finally {
    clearTimeout(timeout);
  }
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    // Iranian providers occasionally return thousands separators or Persian digits.
    const normalized = value
      .replace(/[\u066C,]/g, '')
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
