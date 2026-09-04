import { fetchJson, toFiniteNumber } from '../lib/http.ts';
import type { Candle } from '../lib/indicators.ts';

/**
 * Binance public REST API. No key required, so these calls carry no secret and
 * are still proxied server-side to keep caching and rate-limit control in one
 * place. CryptoCompare is deliberately unused (free tier discontinued 2026).
 */
const BASE = 'https://api.binance.com';

export const BINANCE_SOURCE = 'Binance public REST (api.binance.com)';

export interface Ticker24h {
  price: number;
  /** Null when Binance did not supply it - never coerced to 0 ("flat"). */
  changePercent: number | null;
}

export async function fetchTicker24h(symbol: string): Promise<Ticker24h | null> {
  const raw = await fetchJson<{ lastPrice?: string; priceChangePercent?: string }>(
    `${BASE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
  );
  const price = toFiniteNumber(raw.lastPrice);
  const changePercent = toFiniteNumber(raw.priceChangePercent);
  if (price === null) return null;
  return { price, changePercent };
}

export async function fetchSpotPrice(symbol: string): Promise<number | null> {
  const raw = await fetchJson<{ price?: string }>(
    `${BASE}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
  );
  return toFiniteNumber(raw.price);
}

type RawKline = [number, string, string, string, string, string, ...unknown[]];

/**
 * Daily klines. `limit` defaults to 300 so a genuine 200-period EMA can be
 * computed - asking for fewer candles than the slow EMA needs would produce a
 * null EMA200, which is honest but useless.
 */
export async function fetchKlines(symbol: string, interval = '1d', limit = 300): Promise<Candle[] | null> {
  const raw = await fetchJson<RawKline[]>(
    `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
  );
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const candles: Candle[] = [];
  for (const row of raw) {
    const open = toFiniteNumber(row[1]);
    const high = toFiniteNumber(row[2]);
    const low = toFiniteNumber(row[3]);
    const close = toFiniteNumber(row[4]);
    const volume = toFiniteNumber(row[5]);
    if (open === null || high === null || low === null || close === null || volume === null) continue;
    candles.push({ openTime: row[0], open, high, low, close, volume });
  }
  return candles.length ? candles : null;
}

/** BTC dominance is not available from Binance; see marketContext for handling. */
export const CRYPTO_SYMBOLS = {
  BTCUSDT: 'بیت‌کوین',
  ETHUSDT: 'اتریوم',
  SOLUSDT: 'سولانا',
  BNBUSDT: 'بی‌ان‌بی',
} as const;

export type CryptoSymbol = keyof typeof CRYPTO_SYMBOLS;
