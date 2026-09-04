import type { IndicatorReading } from '../../../shared/types.ts';

/**
 * Technical indicator math.
 *
 * Rule 4 ("indicator calculations must match their labels") is enforced
 * structurally rather than by review: every public function takes its period as
 * a parameter and DERIVES the human label from that same parameter
 * (`EMA${period}`). There is no code path where a literal label string can drift
 * away from the constant actually used in the smoothing calculation.
 *
 * All functions are pure, accept oldest-first close arrays, and return `null`
 * (never a silently wrong number) when there is not enough history.
 */

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const PERIODS = {
  emaFast: 50,
  emaSlow: 200,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bollinger: 20,
  bollingerStdDev: 2,
} as const;

function hasEnough(values: readonly number[], period: number): boolean {
  return values.length >= period && period > 0;
}

/** Full EMA series, oldest-first. Seeded with an SMA of the first `period` values. */
export function emaSeries(values: readonly number[], period: number): number[] {
  if (!hasEnough(values, period)) return [];
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out: number[] = [seed];
  for (let i = period; i < values.length; i += 1) {
    const price = values[i] as number;
    const prev = out[out.length - 1] as number;
    out.push(price * k + prev * (1 - k));
  }
  return out;
}

export function ema(values: readonly number[], period: number): IndicatorReading {
  const series = emaSeries(values, period);
  return {
    // Label is generated from `period`; it cannot describe a different constant.
    label: `EMA${period}`,
    period,
    value: series.length ? (series[series.length - 1] as number) : null,
  };
}

/** Wilder-smoothed RSI, the standard definition traders expect. */
export function rsi(values: readonly number[], period: number): IndicatorReading {
  const label = `RSI${period}`;
  if (!hasEnough(values, period + 1)) return { label, period, value: null };

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = (values[i] as number) - (values[i - 1] as number);
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = (values[i] as number) - (values[i - 1] as number);
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
  }

  if (avgLoss === 0) return { label, period, value: avgGain === 0 ? 50 : 100 };
  const rs = avgGain / avgLoss;
  return { label, period, value: 100 - 100 / (1 + rs) };
}

export interface MacdReading {
  label: string;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  /** Phase description derived from the numbers, not asserted independently. */
  phase: 'bullish-expanding' | 'bullish-contracting' | 'bearish-expanding' | 'bearish-contracting' | 'unknown';
}

export function macd(
  values: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): MacdReading {
  const label = `MACD(${fastPeriod},${slowPeriod},${signalPeriod})`;
  const empty: MacdReading = {
    label,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    macd: null,
    signal: null,
    histogram: null,
    phase: 'unknown',
  };
  if (!hasEnough(values, slowPeriod + signalPeriod)) return empty;

  const fast = emaSeries(values, fastPeriod);
  const slow = emaSeries(values, slowPeriod);
  // Align the two series on their shared tail (the slow EMA starts later).
  const offset = fast.length - slow.length;
  if (offset < 0) return empty;
  const macdLine = slow.map((slowValue, i) => (fast[i + offset] as number) - slowValue);
  const signalSeries = emaSeries(macdLine, signalPeriod);
  if (!signalSeries.length) return empty;

  const macdValue = macdLine[macdLine.length - 1] as number;
  const signalValue = signalSeries[signalSeries.length - 1] as number;
  const histogram = macdValue - signalValue;

  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = signalSeries[signalSeries.length - 2];
  const prevHistogram =
    prevMacd !== undefined && prevSignal !== undefined ? prevMacd - prevSignal : null;

  let phase: MacdReading['phase'] = 'unknown';
  if (prevHistogram !== null) {
    const widening = Math.abs(histogram) > Math.abs(prevHistogram);
    if (histogram >= 0) phase = widening ? 'bullish-expanding' : 'bullish-contracting';
    else phase = widening ? 'bearish-expanding' : 'bearish-contracting';
  }

  return { label, fastPeriod, slowPeriod, signalPeriod, macd: macdValue, signal: signalValue, histogram, phase };
}

export interface BollingerReading {
  label: string;
  period: number;
  stdDevMultiplier: number;
  upper: number | null;
  middle: number | null;
  lower: number | null;
  /** 0 = at lower band, 1 = at upper band. Null when bands are unavailable. */
  percentB: number | null;
  /** Bandwidth as a fraction of the middle band; low values imply a squeeze. */
  bandwidth: number | null;
}

export function bollinger(
  values: readonly number[],
  period: number,
  stdDevMultiplier: number,
): BollingerReading {
  const label = `Bollinger(${period}, ${stdDevMultiplier}σ)`;
  const empty: BollingerReading = {
    label,
    period,
    stdDevMultiplier,
    upper: null,
    middle: null,
    lower: null,
    percentB: null,
    bandwidth: null,
  };
  if (!hasEnough(values, period)) return empty;

  const window = values.slice(-period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mean + stdDevMultiplier * sd;
  const lower = mean - stdDevMultiplier * sd;
  const last = values[values.length - 1] as number;
  const span = upper - lower;

  return {
    label,
    period,
    stdDevMultiplier,
    upper,
    middle: mean,
    lower,
    percentB: span === 0 ? null : (last - lower) / span,
    bandwidth: mean === 0 ? null : span / mean,
  };
}

/** On-Balance Volume: cumulative signed volume, used to validate breakouts. */
export function obv(candles: readonly Candle[]): { label: string; value: number | null; slope: 'rising' | 'falling' | 'flat' | 'unknown' } {
  const label = 'OBV';
  if (candles.length < 3) return { label, value: null, slope: 'unknown' };
  let total = 0;
  const series: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i] as Candle;
    const previous = candles[i - 1] as Candle;
    if (current.close > previous.close) total += current.volume;
    else if (current.close < previous.close) total -= current.volume;
    series.push(total);
  }
  const lookback = Math.min(10, series.length - 1);
  const recent = series[series.length - 1] as number;
  const past = series[series.length - 1 - lookback] as number;
  const delta = recent - past;
  const scale = Math.max(Math.abs(past), 1);
  const slope = Math.abs(delta) / scale < 0.01 ? 'flat' : delta > 0 ? 'rising' : 'falling';
  return { label, value: recent, slope };
}

export interface FibLevels {
  swingHigh: number;
  swingLow: number;
  direction: 'up' | 'down';
  levels: Array<{ ratio: number; price: number }>;
}

const FIB_RATIOS = [0.382, 0.5, 0.618, 0.786] as const;

/** Retracement levels measured from the dominant swing in `lookback` candles. */
export function fibonacciRetracement(candles: readonly Candle[], lookback = 120): FibLevels | null {
  if (candles.length < 10) return null;
  const window = candles.slice(-Math.min(lookback, candles.length));
  let highIndex = 0;
  let lowIndex = 0;
  window.forEach((candle, index) => {
    if (candle.high > (window[highIndex] as Candle).high) highIndex = index;
    if (candle.low < (window[lowIndex] as Candle).low) lowIndex = index;
  });
  const swingHigh = (window[highIndex] as Candle).high;
  const swingLow = (window[lowIndex] as Candle).low;
  if (swingHigh <= swingLow) return null;
  // Direction is inferred from which extreme printed later: an up-leg retraces
  // downward from the high, a down-leg retraces upward from the low.
  const direction: 'up' | 'down' = highIndex > lowIndex ? 'up' : 'down';
  const range = swingHigh - swingLow;
  const levels = FIB_RATIOS.map((ratio) => ({
    ratio,
    price: direction === 'up' ? swingHigh - range * ratio : swingLow + range * ratio,
  }));
  return { swingHigh, swingLow, direction, levels };
}

export interface StructureReading {
  /** Classical market structure read, or `range` when swings disagree. */
  trend: 'uptrend' | 'downtrend' | 'range' | 'unknown';
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  description: string;
}

/**
 * Swing-based Higher-High/Higher-Low structure detection using fractal pivots.
 * Deliberately conservative: when the last two swings do not agree it reports
 * `range` instead of forcing a directional label.
 */
export function marketStructure(candles: readonly Candle[], pivotStrength = 3): StructureReading {
  if (candles.length < pivotStrength * 2 + 5) {
    return { trend: 'unknown', lastSwingHigh: null, lastSwingLow: null, description: 'insufficient history' };
  }
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = pivotStrength; i < candles.length - pivotStrength; i += 1) {
    const candle = candles[i] as Candle;
    let isHigh = true;
    let isLow = true;
    for (let j = i - pivotStrength; j <= i + pivotStrength; j += 1) {
      if (j === i) continue;
      const other = candles[j] as Candle;
      if (other.high >= candle.high) isHigh = false;
      if (other.low <= candle.low) isLow = false;
    }
    if (isHigh) highs.push(candle.high);
    if (isLow) lows.push(candle.low);
  }

  const lastHigh = highs.at(-1) ?? null;
  const prevHigh = highs.at(-2) ?? null;
  const lastLow = lows.at(-1) ?? null;
  const prevLow = lows.at(-2) ?? null;

  if (lastHigh === null || prevHigh === null || lastLow === null || prevLow === null) {
    return { trend: 'unknown', lastSwingHigh: lastHigh, lastSwingLow: lastLow, description: 'not enough confirmed swings' };
  }

  const higherHigh = lastHigh > prevHigh;
  const higherLow = lastLow > prevLow;

  if (higherHigh && higherLow) {
    return { trend: 'uptrend', lastSwingHigh: lastHigh, lastSwingLow: lastLow, description: 'higher high + higher low' };
  }
  if (!higherHigh && !higherLow) {
    return { trend: 'downtrend', lastSwingHigh: lastHigh, lastSwingLow: lastLow, description: 'lower high + lower low' };
  }
  return {
    trend: 'range',
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    description: 'swings disagree (compression / range)',
  };
}

export interface RsiDivergence {
  kind: 'bullish' | 'bearish' | 'none';
  detail: string;
}

/**
 * Divergence between price extremes and RSI at those extremes over the recent
 * window. Reports `none` rather than guessing when the picture is unclear.
 */
export function rsiDivergence(candles: readonly Candle[], period: number, lookback = 40): RsiDivergence {
  if (candles.length < period + lookback + 2) return { kind: 'none', detail: 'insufficient history' };
  const closes = candles.map((c) => c.close);
  const rsiAt = (endIndex: number): number | null => rsi(closes.slice(0, endIndex + 1), period).value;

  const window = candles.slice(-lookback);
  const offset = candles.length - window.length;
  let highIdx = 0;
  let lowIdx = 0;
  window.forEach((candle, i) => {
    if (candle.high > (window[highIdx] as Candle).high) highIdx = i;
    if (candle.low < (window[lowIdx] as Candle).low) lowIdx = i;
  });

  const lastIndex = candles.length - 1;
  const last = candles[lastIndex] as Candle;
  const rsiNow = rsiAt(lastIndex);
  if (rsiNow === null) return { kind: 'none', detail: 'RSI unavailable' };

  const priorHigh = window[highIdx] as Candle;
  const priorLow = window[lowIdx] as Candle;
  const rsiAtHigh = rsiAt(offset + highIdx);
  const rsiAtLow = rsiAt(offset + lowIdx);

  if (rsiAtHigh !== null && highIdx < window.length - 3 && last.close >= priorHigh.high * 0.995 && rsiNow < rsiAtHigh - 2) {
    return { kind: 'bearish', detail: 'price at/above prior swing high while RSI prints a lower peak' };
  }
  if (rsiAtLow !== null && lowIdx < window.length - 3 && last.close <= priorLow.low * 1.005 && rsiNow > rsiAtLow + 2) {
    return { kind: 'bullish', detail: 'price at/below prior swing low while RSI prints a higher trough' };
  }
  return { kind: 'none', detail: 'no clear divergence in the recent window' };
}

/** Convenience bundle used by every module that analyses a liquid instrument. */
export interface TechnicalSnapshot {
  candleCount: number;
  lastClose: number | null;
  emaFast: IndicatorReading;
  emaSlow: IndicatorReading;
  rsi: IndicatorReading;
  rsiDivergence: RsiDivergence;
  macd: MacdReading;
  bollinger: BollingerReading;
  obv: ReturnType<typeof obv>;
  fibonacci: FibLevels | null;
  structure: StructureReading;
}

export function buildTechnicalSnapshot(candles: readonly Candle[]): TechnicalSnapshot {
  const closes = candles.map((c) => c.close);
  return {
    candleCount: candles.length,
    lastClose: closes.length ? (closes[closes.length - 1] as number) : null,
    emaFast: ema(closes, PERIODS.emaFast),
    emaSlow: ema(closes, PERIODS.emaSlow),
    rsi: rsi(closes, PERIODS.rsi),
    rsiDivergence: rsiDivergence(candles, PERIODS.rsi),
    macd: macd(closes, PERIODS.macdFast, PERIODS.macdSlow, PERIODS.macdSignal),
    bollinger: bollinger(closes, PERIODS.bollinger, PERIODS.bollingerStdDev),
    obv: obv(candles),
    fibonacci: fibonacciRetracement(candles),
    structure: marketStructure(candles),
  };
}
