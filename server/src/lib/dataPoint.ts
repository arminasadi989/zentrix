import type { DataPoint, Provenance } from '../../../shared/types.ts';
import { marketCache } from './cache.ts';
import { logger } from './logger.ts';

/**
 * The one place a `DataPoint` is allowed to be created from a network call.
 *
 * Provenance is assigned by this function based on what actually happened, so
 * no caller can hand-label a value "live" (Rule 3):
 *   fresh network response -> `live`
 *   served from fresh cache -> `cached`
 *   upstream failed, old value exists -> `stale-fallback` with disclosed age
 *   upstream failed, nothing cached -> `unavailable` with value === null
 */
export async function resolveDataPoint<T>(args: {
  cacheKey: string;
  ttlMs: number;
  source: string;
  fetcher: () => Promise<T | null>;
}): Promise<DataPoint<T>> {
  const { cacheKey, ttlMs, source, fetcher } = args;

  try {
    const { value, fromCache } = await marketCache.wrap<{ value: T | null; at: string } | null>(
      cacheKey,
      ttlMs,
      async () => {
        const fetched = await fetcher();
        if (fetched === null) return null;
        return { value: fetched, at: new Date().toISOString() };
      },
    );

    if (value === null || value.value === null) {
      return unavailable<T>(source, 'upstream returned no usable value for this field');
    }

    return {
      value: value.value,
      provenance: fromCache ? 'cached' : 'live',
      source,
      fetchedAt: value.at,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    logger.warn(`dataPoint failed (${cacheKey}): ${reason}`);

    const stale = marketCache.getStale<{ value: T | null; at: string } | null>(cacheKey);
    if (stale && stale.value && stale.value.value !== null) {
      const ageMinutes = Math.max(1, Math.round((Date.now() - stale.storedAt) / 60_000));
      return {
        value: stale.value.value,
        provenance: 'stale-fallback',
        source,
        fetchedAt: stale.value.at,
        note: `آخرین مقدار موفق، حدود ${ageMinutes} دقیقه پیش دریافت شده (اتصال فعلی به منبع برقرار نشد)`,
      };
    }
    return unavailable<T>(source, 'منبع داده در دسترس نیست');
  }
}

export function unavailable<T>(source: string, note: string): DataPoint<T> {
  return { value: null, provenance: 'unavailable', source, fetchedAt: null, note };
}

/**
 * For fields that genuinely have no free live feed (e.g. current policy rates).
 * We never invent a number: the value stays null and the model is explicitly
 * told to supply the qualitative picture from its own knowledge and say so.
 */
export function modelKnowledge<T>(source: string, note: string): DataPoint<T> {
  return { value: null, provenance: 'model-knowledge', source, fetchedAt: null, note };
}

export function isUsable<T>(point: DataPoint<T> | undefined): point is DataPoint<T> & { value: T } {
  return Boolean(point && point.value !== null);
}

export const PROVENANCE_FA: Record<Provenance, string> = {
  live: 'زنده',
  cached: 'زنده (کش کوتاه)',
  'stale-fallback': 'داده قدیمی',
  unavailable: 'در دسترس نیست',
  'model-knowledge': 'دانش عمومی مدل',
};

/** English wording used inside the prompt context block. */
export const PROVENANCE_EN: Record<Provenance, string> = {
  live: 'LIVE (fetched now)',
  cached: 'LIVE (server cache, seconds-to-minutes old)',
  'stale-fallback': 'STALE FALLBACK - upstream failed, this is an older value',
  unavailable: 'UNAVAILABLE - do not state a number for this field',
  'model-knowledge': 'NOT A LIVE FEED - compose from your own current general knowledge and say so',
};
