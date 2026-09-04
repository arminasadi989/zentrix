import { env } from '../config/env.ts';
import { UpstreamError, fetchJson, toFiniteNumber } from '../lib/http.ts';
import type { Candle } from '../lib/indicators.ts';

/**
 * Twelve Data free tier (800 requests/day). The key lives only in
 * `process.env` on the server; the browser calls our `/api/market/*` routes.
 */
const BASE = 'https://api.twelvedata.com';

export const TWELVE_DATA_SOURCE = 'Twelve Data free tier (api.twelvedata.com)';

/** The five majors the forex module analyses, with Farsi labels. */
export const FOREX_PAIRS = {
  'EUR/USD': 'یورو / دلار',
  'GBP/USD': 'پوند / دلار',
  'USD/JPY': 'دلار / ین',
  'USD/CHF': 'دلار / فرانک',
  'AUD/USD': 'دلار استرالیا / دلار',
} as const;

export type ForexPair = keyof typeof FOREX_PAIRS;

/** Benchmark pair whose full technical picture is injected into the prompt. */
export const FOREX_BENCHMARK: ForexPair = 'EUR/USD';

function requireKey(): string {
  if (!env.twelveDataApiKey) {
    throw new UpstreamError('TWELVE_DATA_API_KEY is not configured', null, BASE);
  }
  return env.twelveDataApiKey;
}

interface TwelveDataError {
  status?: string;
  message?: string;
  code?: number;
}

function assertOk(payload: TwelveDataError, url: string): void {
  if (payload.status === 'error') {
    // Rate-limit and bad-symbol responses arrive with HTTP 200, so they must be
    // detected from the body or they would be treated as valid data.
    throw new UpstreamError(payload.message ?? 'Twelve Data error response', payload.code ?? null, url);
  }
}

export interface ForexQuote {
  price: number;
  changePercent: number | null;
}

export async function fetchForexQuote(pair: ForexPair): Promise<ForexQuote | null> {
  const url = `${BASE}/quote?symbol=${encodeURIComponent(pair)}&apikey=${requireKey()}`;
  const raw = await fetchJson<TwelveDataError & { close?: string; percent_change?: string }>(url);
  assertOk(raw, '/quote');
  const price = toFiniteNumber(raw.close);
  if (price === null) return null;
  return { price, changePercent: toFiniteNumber(raw.percent_change) };
}

/** Fallback endpoint when only the spot price is required (cheaper payload). */
export async function fetchForexPrice(pair: ForexPair): Promise<number | null> {
  const url = `${BASE}/price?symbol=${encodeURIComponent(pair)}&apikey=${requireKey()}`;
  const raw = await fetchJson<TwelveDataError & { price?: string }>(url);
  assertOk(raw, '/price');
  return toFiniteNumber(raw.price);
}

/**
 * Daily time series, newest-first from the API, returned oldest-first so it can
 * feed the same indicator functions as Binance klines. 300 points is enough for
 * a genuine EMA200.
 */
export async function fetchForexSeries(pair: ForexPair, outputsize = 300): Promise<Candle[] | null> {
  const url = `${BASE}/time_series?symbol=${encodeURIComponent(pair)}&interval=1day&outputsize=${outputsize}&apikey=${requireKey()}`;
  const raw = await fetchJson<
    TwelveDataError & {
      values?: Array<{ datetime?: string; open?: string; high?: string; low?: string; close?: string; volume?: string }>;
    }
  >(url);
  assertOk(raw, '/time_series');
  const values = raw.values;
  if (!Array.isArray(values) || values.length === 0) return null;

  const candles: Candle[] = [];
  for (const row of [...values].reverse()) {
    const open = toFiniteNumber(row.open);
    const high = toFiniteNumber(row.high);
    const low = toFiniteNumber(row.low);
    const close = toFiniteNumber(row.close);
    if (open === null || high === null || low === null || close === null) continue;
    candles.push({
      openTime: row.datetime ? Date.parse(row.datetime) : 0,
      open,
      high,
      low,
      close,
      // Spot FX has no consolidated volume; 0 is the honest value here and the
      // prompt tells the model volume analysis is not meaningful for FX.
      volume: toFiniteNumber(row.volume) ?? 0,
    });
  }
  return candles.length ? candles : null;
}
