import { logger } from './logger.ts';

interface Entry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

/**
 * Tiny in-process TTL cache with an explicit "stale" tier.
 *
 * Two distinct reads matter for honesty:
 *  - `get`      fresh value, safe to describe as current (provenance `cached`)
 *  - `getStale` expired value kept only as a labeled fallback when upstream
 *               fails (provenance `stale-fallback`, age disclosed to the user)
 *
 * Keeping the tiers separate is what lets the API report *why* a number is on
 * screen instead of quietly presenting an old number as live.
 */
export class TtlCache {
  private readonly store = new Map<string, Entry<unknown>>();

  constructor(private readonly maxEntries = 500) {}

  get<T>(key: string): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) return null;
    return hit.value as T;
  }

  getStale<T>(key: string): { value: T; storedAt: number } | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    return { value: hit.value as T, storedAt: hit.storedAt };
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    const now = Date.now();
    this.store.set(key, { value, storedAt: now, expiresAt: now + ttlMs });
  }

  /**
   * Single-flight fetch: coalesces concurrent misses for the same key so a
   * dashboard refresh cannot multiply our free-tier request count.
   */
  async wrap<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<{ value: T; fromCache: boolean }> {
    const fresh = this.get<T>(key);
    if (fresh !== null) return { value: fresh, fromCache: true };

    const inflight = this.inflight.get(key);
    if (inflight) return { value: (await inflight) as T, fromCache: true };

    const promise = fetcher()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value as unknown;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    const value = (await promise) as T;
    return { value, fromCache: false };
  }

  private readonly inflight = new Map<string, Promise<unknown>>();
}

export const marketCache = new TtlCache();

/**
 * TTLs are tuned to stay far inside the free tiers documented in the spec:
 * Twelve Data 800 req/day and BrsApi ~1,500 req/day. At these intervals a
 * single user polling continuously stays roughly an order of magnitude under
 * both ceilings.
 */
export const TTL = {
  cryptoPrice: 15_000,
  cryptoKlines: 60_000,
  fearGreed: 15 * 60_000,
  forexPrice: 120_000,
  forexSeries: 15 * 60_000,
  brsGoldCurrency: 120_000,
  tse: 180_000,
  tts: 60 * 60_000,
} as const;

export function logCacheOutcome(label: string, fromCache: boolean): void {
  logger.info(`cache ${fromCache ? 'HIT' : 'MISS'} ${label}`);
}
