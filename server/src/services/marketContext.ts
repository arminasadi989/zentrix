import { MODULES, type ModuleId } from '../../../shared/modules.ts';
import type { DataPoint, MarketContextBlock, Provenance } from '../../../shared/types.ts';
import { TTL, marketCache } from '../lib/cache.ts';
import { PROVENANCE_EN, PROVENANCE_FA, isUsable, resolveDataPoint } from '../lib/dataPoint.ts';
import { PERIODS, buildTechnicalSnapshot, type TechnicalSnapshot } from '../lib/indicators.ts';
import { BINANCE_SOURCE, CRYPTO_SYMBOLS, fetchKlines, fetchTicker24h, type CryptoSymbol } from '../providers/binance.ts';
import { FNG_SOURCE, fetchFearGreed } from '../providers/fearGreed.ts';
import {
  BRSAPI_SOURCE,
  BRS_ALIASES,
  BRS_LABELS_FA,
  TSE_ALIASES,
  TSE_LABELS_FA,
  fetchGoldCurrencyPayload,
  fetchTsePayload,
  pickQuote,
  pickTseSymbol,
  type BrsQuote,
  type TseSymbol,
} from '../providers/brsapi.ts';
import {
  FOREX_BENCHMARK,
  FOREX_PAIRS,
  TWELVE_DATA_SOURCE,
  fetchForexQuote,
  fetchForexSeries,
  type ForexPair,
} from '../providers/twelveData.ts';
import { fmt, fmtInt, fmtPercent } from './format.ts';

/**
 * Builds the "live market data" block injected into the system instruction.
 *
 * Two invariants hold across every module:
 *  1. Every line states its own provenance in words the model is instructed to
 *     respect, so the model is never told that a static or missing number is
 *     live (Rule 3 / Definition of Done item 3).
 *  2. A failed fetch produces an explicit "UNAVAILABLE - do not state a number"
 *     line. Nothing is back-filled with a plausible-looking figure.
 */

interface ContextField {
  key: string;
  faLabel: string;
  display: string;
  provenance: Provenance;
  source: string;
}

class ContextBuilder {
  private readonly lines: string[] = [];
  private readonly fields: ContextField[] = [];

  section(title: string): this {
    this.lines.push('', `## ${title}`);
    return this;
  }

  /** Adds a numeric field, deriving both the prompt line and the UI badge. */
  point(args: {
    key: string;
    faLabel: string;
    enLabel: string;
    point: DataPoint<number>;
    digits?: number;
    suffix?: string;
  }): this {
    const { key, faLabel, enLabel, point, digits = 2, suffix = '' } = args;
    const rendered = point.value === null ? 'n/a' : `${fmt(point.value, digits)}${suffix}`;
    this.lines.push(`- ${enLabel}: ${rendered} [${PROVENANCE_EN[point.provenance]}${point.note ? ` | ${point.note}` : ''}]`);
    this.fields.push({
      key,
      faLabel,
      display: point.value === null ? '—' : `${point.value.toLocaleString('fa-IR', { maximumFractionDigits: digits })}${suffix}`,
      provenance: point.provenance,
      source: point.source,
    });
    return this;
  }

  /** Adds a free-form line that is not a single numeric field. */
  note(text: string): this {
    this.lines.push(`- ${text}`);
    return this;
  }

  /** Registers a non-numeric field for the UI data-status strip. */
  status(field: ContextField): this {
    this.fields.push(field);
    return this;
  }

  build(moduleId: ModuleId): MarketContextBlock {
    return {
      moduleId,
      text: this.lines.join('\n').trim(),
      fields: this.fields,
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Renders a technical snapshot as prompt lines. Labels come from the readings. */
function renderSnapshot(builder: ContextBuilder, instrument: string, snapshot: TechnicalSnapshot, digits: number): void {
  const { emaFast, emaSlow, rsi, macd, bollinger, obv, fibonacci, structure, rsiDivergence } = snapshot;
  builder.note(`${instrument} candles analysed: ${snapshot.candleCount} daily closes`);
  builder.note(`${instrument} last close: ${fmt(snapshot.lastClose, digits)}`);
  builder.note(`${instrument} ${emaFast.label}: ${fmt(emaFast.value, digits)} (period actually used: ${emaFast.period})`);
  builder.note(`${instrument} ${emaSlow.label}: ${fmt(emaSlow.value, digits)} (period actually used: ${emaSlow.period})`);
  builder.note(`${instrument} ${rsi.label}: ${fmt(rsi.value, 1)} | divergence: ${rsiDivergence.kind} (${rsiDivergence.detail})`);
  builder.note(
    `${instrument} ${macd.label}: macd ${fmt(macd.macd, 4)}, signal ${fmt(macd.signal, 4)}, histogram ${fmt(macd.histogram, 4)}, phase ${macd.phase}`,
  );
  builder.note(
    `${instrument} ${bollinger.label}: upper ${fmt(bollinger.upper, digits)}, mid ${fmt(bollinger.middle, digits)}, lower ${fmt(bollinger.lower, digits)}, %B ${fmt(bollinger.percentB, 2)}, bandwidth ${fmt(bollinger.bandwidth, 4)}`,
  );
  builder.note(`${instrument} OBV: ${fmtInt(obv.value)} (10-candle slope: ${obv.slope})`);
  builder.note(`${instrument} market structure: ${structure.trend} (${structure.description})`);
  if (fibonacci) {
    const levels = fibonacci.levels.map((l) => `${l.ratio}: ${fmt(l.price, digits)}`).join(', ');
    builder.note(
      `${instrument} Fibonacci retracement of the ${fibonacci.direction}-leg (${fmt(fibonacci.swingLow, digits)} → ${fmt(fibonacci.swingHigh, digits)}): ${levels}`,
    );
  } else {
    builder.note(`${instrument} Fibonacci levels: UNAVAILABLE (no clean dominant swing in the window)`);
  }
}

// ---------------------------------------------------------------------------
// Shared fetch helpers (cached, provenance-tagged)
// ---------------------------------------------------------------------------

async function cryptoTicker(symbol: CryptoSymbol): Promise<DataPoint<number>> {
  return resolveDataPoint({
    cacheKey: `binance:ticker:${symbol}`,
    ttlMs: TTL.cryptoPrice,
    source: BINANCE_SOURCE,
    fetcher: async () => (await fetchTicker24h(symbol))?.price ?? null,
  });
}

async function btcSnapshot(): Promise<{ snapshot: TechnicalSnapshot | null; provenance: Provenance }> {
  try {
    const { value, fromCache } = await marketCache.wrap(`binance:klines:BTCUSDT:1d`, TTL.cryptoKlines, async () => {
      const candles = await fetchKlines('BTCUSDT', '1d', 300);
      return candles ? buildTechnicalSnapshot(candles) : null;
    });
    if (!value) return { snapshot: null, provenance: 'unavailable' };
    return { snapshot: value, provenance: fromCache ? 'cached' : 'live' };
  } catch {
    return { snapshot: null, provenance: 'unavailable' };
  }
}

async function forexQuote(pair: ForexPair): Promise<DataPoint<number>> {
  return resolveDataPoint({
    cacheKey: `twelvedata:quote:${pair}`,
    ttlMs: TTL.forexPrice,
    source: TWELVE_DATA_SOURCE,
    fetcher: async () => (await fetchForexQuote(pair))?.price ?? null,
  });
}

async function benchmarkForexSnapshot(): Promise<{ snapshot: TechnicalSnapshot | null; provenance: Provenance }> {
  try {
    const { value, fromCache } = await marketCache.wrap(
      `twelvedata:series:${FOREX_BENCHMARK}`,
      TTL.forexSeries,
      async () => {
        const candles = await fetchForexSeries(FOREX_BENCHMARK, 300);
        return candles ? buildTechnicalSnapshot(candles) : null;
      },
    );
    if (!value) return { snapshot: null, provenance: 'unavailable' };
    return { snapshot: value, provenance: fromCache ? 'cached' : 'live' };
  } catch {
    return { snapshot: null, provenance: 'unavailable' };
  }
}

type BrsAliasKey = keyof typeof BRS_ALIASES;

/** One shared payload per TTL: every domestic instrument reads from it. */
async function brsQuote(key: BrsAliasKey): Promise<DataPoint<number>> {
  return resolveDataPoint({
    cacheKey: `brsapi:goldcurrency:${key}`,
    ttlMs: TTL.brsGoldCurrency,
    source: BRSAPI_SOURCE,
    fetcher: async () => {
      const { value: items } = await marketCache.wrap('brsapi:goldcurrency:payload', TTL.brsGoldCurrency, () =>
        fetchGoldCurrencyPayload(),
      );
      const quote: BrsQuote | null = pickQuote(items, BRS_ALIASES[key]);
      return quote?.price ?? null;
    },
  });
}

type TseAliasKey = keyof typeof TSE_ALIASES;

async function tseQuote(key: TseAliasKey): Promise<DataPoint<number>> {
  return resolveDataPoint({
    cacheKey: `brsapi:tse:${key}`,
    ttlMs: TTL.tse,
    source: BRSAPI_SOURCE,
    fetcher: async () => {
      const { value: items } = await marketCache.wrap('brsapi:tse:payload', TTL.tse, () => fetchTsePayload());
      const symbol: TseSymbol | null = pickTseSymbol(items, TSE_ALIASES[key]);
      return symbol?.price ?? null;
    },
  });
}

async function tseRealMoneyFlow(key: TseAliasKey): Promise<DataPoint<number>> {
  return resolveDataPoint({
    cacheKey: `brsapi:tse:flow:${key}`,
    ttlMs: TTL.tse,
    source: BRSAPI_SOURCE,
    fetcher: async () => {
      const { value: items } = await marketCache.wrap('brsapi:tse:payload', TTL.tse, () => fetchTsePayload());
      return pickTseSymbol(items, TSE_ALIASES[key])?.realMoneyFlow ?? null;
    },
  });
}

// ---------------------------------------------------------------------------
// Coin bubble maths (gold module)
// ---------------------------------------------------------------------------

const TROY_OUNCE_GRAMS = 31.1035;
/** Emami coin: 8.133 g gross at 900 fineness => 7.3197 g of pure gold. */
const EMAMI_GROSS_GRAMS = 8.133;
const EMAMI_FINENESS = 0.9;

export interface CoinBubble {
  meltValueToman: number;
  marketPriceToman: number;
  bubbleToman: number;
  bubblePercent: number;
  pureGrams: number;
}

/** Pure function so the calculation can be explained (and tested) verbatim. */
export function computeEmamiBubble(args: {
  ounceUsd: number;
  usdToman: number;
  coinMarketToman: number;
}): CoinBubble {
  const pureGrams = EMAMI_GROSS_GRAMS * EMAMI_FINENESS;
  const usdPerGram = args.ounceUsd / TROY_OUNCE_GRAMS;
  const meltValueToman = usdPerGram * pureGrams * args.usdToman;
  const bubbleToman = args.coinMarketToman - meltValueToman;
  return {
    meltValueToman,
    marketPriceToman: args.coinMarketToman,
    bubbleToman,
    bubblePercent: meltValueToman === 0 ? 0 : (bubbleToman / meltValueToman) * 100,
    pureGrams,
  };
}

// ---------------------------------------------------------------------------
// Per-module builders
// ---------------------------------------------------------------------------

async function buildCryptoContext(): Promise<MarketContextBlock> {
  const symbols = Object.keys(CRYPTO_SYMBOLS) as CryptoSymbol[];
  const [tickers, fearGreedPoint, btc] = await Promise.all([
    Promise.all(symbols.map((s) => cryptoTicker(s))),
    resolveDataPoint({
      cacheKey: 'fng:latest',
      ttlMs: TTL.fearGreed,
      source: FNG_SOURCE,
      fetcher: async () => {
        const result = await fetchFearGreed();
        return result ? result.value : null;
      },
    }),
    btcSnapshot(),
  ]);

  const fngClassification = await resolveDataPoint<string>({
    cacheKey: 'fng:classification',
    ttlMs: TTL.fearGreed,
    source: FNG_SOURCE,
    fetcher: async () => (await fetchFearGreed())?.classification ?? null,
  });

  const builder = new ContextBuilder();
  builder.section('Spot prices (USDT pairs)');
  symbols.forEach((symbol, index) => {
    const point = tickers[index];
    if (!point) return;
    builder.point({
      key: symbol,
      faLabel: CRYPTO_SYMBOLS[symbol],
      enLabel: symbol,
      point,
      digits: symbol === 'BTCUSDT' ? 0 : 2,
    });
  });

  builder.section('Sentiment');
  builder.point({ key: 'fng', faLabel: 'شاخص ترس و طمع', enLabel: 'Crypto Fear & Greed Index', point: fearGreedPoint, digits: 0 });
  builder.note(
    `Fear & Greed classification: ${fngClassification.value ?? 'n/a'} [${PROVENANCE_EN[fngClassification.provenance]}]`,
  );

  builder.section('BTC/USDT daily technicals (computed from Binance klines)');
  if (btc.snapshot) {
    renderSnapshot(builder, 'BTC/USDT', btc.snapshot, 0);
    builder.status({
      key: 'btc-technicals',
      faLabel: 'تحلیل تکنیکال بیت‌کوین',
      display: `${btc.snapshot.candleCount} کندل روزانه`,
      provenance: btc.provenance,
      source: BINANCE_SOURCE,
    });
  } else {
    builder.note('BTC daily technicals: UNAVAILABLE - the kline request failed. Do not state indicator values for BTC in this answer; say the technical feed is temporarily down.');
    builder.status({
      key: 'btc-technicals',
      faLabel: 'تحلیل تکنیکال بیت‌کوین',
      display: '—',
      provenance: 'unavailable',
      source: BINANCE_SOURCE,
    });
  }

  builder.section('Context with no free live feed');
  builder.note(
    'Bitcoin dominance and halving-cycle phase: NOT A LIVE FEED in this build. Describe them from your own current general knowledge, and say explicitly that these two items are not live figures.',
  );
  builder.status({
    key: 'dominance-cycle',
    faLabel: 'دامیننس بیت‌کوین و فاز چرخه هاوینگ',
    display: 'از دانش مدل',
    provenance: 'model-knowledge',
    source: 'Gemini general knowledge',
  });

  return builder.build('crypto');
}

async function buildForexContext(): Promise<MarketContextBlock> {
  const pairs = Object.keys(FOREX_PAIRS) as ForexPair[];
  const [quotes, benchmark] = await Promise.all([
    Promise.all(pairs.map((p) => forexQuote(p))),
    benchmarkForexSnapshot(),
  ]);

  const builder = new ContextBuilder();
  builder.section('Spot prices for the five majors');
  pairs.forEach((pair, index) => {
    const point = quotes[index];
    if (!point) return;
    builder.point({ key: pair, faLabel: FOREX_PAIRS[pair], enLabel: pair, point, digits: pair === 'USD/JPY' ? 3 : 5 });
  });

  builder.section(`${FOREX_BENCHMARK} daily technicals (benchmark pair, computed from Twelve Data time series)`);
  if (benchmark.snapshot) {
    renderSnapshot(builder, FOREX_BENCHMARK, benchmark.snapshot, 5);
    builder.note('Spot FX has no consolidated volume, so OBV/volume confirmation is not a valid confluence factor here - do not count it as one.');
    builder.status({
      key: 'eurusd-technicals',
      faLabel: 'تکنیکال یورو/دلار',
      display: `${benchmark.snapshot.candleCount} کندل روزانه`,
      provenance: benchmark.provenance,
      source: TWELVE_DATA_SOURCE,
    });
  } else {
    builder.note(
      `${FOREX_BENCHMARK} technicals: UNAVAILABLE - the time-series request failed or the free-tier limit was reached. Do not state indicator values; say the feed is temporarily unavailable.`,
    );
    builder.status({
      key: 'eurusd-technicals',
      faLabel: 'تکنیکال یورو/دلار',
      display: '—',
      provenance: 'unavailable',
      source: TWELVE_DATA_SOURCE,
    });
  }

  builder.section('Monetary policy context - NOT A LIVE FEED');
  builder.note(
    'No free API in this build supplies current policy rates, forward guidance, DXY level or the economic calendar. Compose this layer from your own current general knowledge, state clearly that it is not a live feed, and never present a specific rate figure as freshly fetched.',
  );
  builder.note(
    'Cover: relative hawkish/dovish stance and cycle position of the Fed, ECB, BOJ, SNB and BOE; the expected forward trajectory of divergence rather than absolute levels; DXY correlation; and proximity to NFP/CPI/central-bank meetings as elevated-risk timing.',
  );
  builder.status({
    key: 'policy',
    faLabel: 'واگرایی سیاست پولی و تقویم اقتصادی',
    display: 'از دانش مدل',
    provenance: 'model-knowledge',
    source: 'Gemini general knowledge',
  });

  return builder.build('forex');
}

async function buildIrCurrencyContext(): Promise<MarketContextBlock> {
  const [usd, eur, aed, nima] = await Promise.all([
    brsQuote('usd'),
    brsQuote('eur'),
    brsQuote('aed'),
    brsQuote('nima'),
  ]);

  const builder = new ContextBuilder();
  builder.section('Free-market rates (Toman)');
  builder.point({ key: 'usd', faLabel: BRS_LABELS_FA.usd, enLabel: 'USD/IRT free market', point: usd, digits: 0 });
  builder.point({ key: 'eur', faLabel: BRS_LABELS_FA.eur, enLabel: 'EUR/IRT free market', point: eur, digits: 0 });
  builder.point({ key: 'aed', faLabel: BRS_LABELS_FA.aed, enLabel: 'AED/IRT free market', point: aed, digits: 0 });

  builder.section('Official / NIMA-SANA rate');
  if (isUsable(nima)) {
    builder.point({ key: 'nima', faLabel: BRS_LABELS_FA.nima, enLabel: 'NIMA USD', point: nima, digits: 0 });
    if (isUsable(usd)) {
      const spread = ((usd.value - nima.value) / nima.value) * 100;
      builder.note(`Free-market premium over NIMA: ${fmtPercent(spread)} (computed from the two fetched rates above)`);
    }
  } else {
    builder.note(
      'NIMA/SANA rate: UNAVAILABLE from the provider in this request. Discuss the official/free-market spread qualitatively and say the official figure could not be fetched - do not state a number for it.',
    );
    builder.status({
      key: 'nima',
      faLabel: BRS_LABELS_FA.nima,
      display: '—',
      provenance: 'unavailable',
      source: BRSAPI_SOURCE,
    });
  }

  builder.section('Macro and policy context - NOT A LIVE FEED');
  builder.note(
    'Domestic inflation, money-supply (نقدینگی) growth, sanctions trajectory, oil-export revenue and CBI intervention behaviour are not available from a free live API here. Compose them from your own current general knowledge and say explicitly that they are not live figures.',
  );
  builder.note(
    'Do not apply RSI/MACD-style technical analysis to this market as if it were a deep exchange-traded instrument; use psychological levels in Toman terms instead.',
  );
  builder.status({
    key: 'macro',
    faLabel: 'تورم، نقدینگی، تحریم‌ها و مداخله بانک مرکزی',
    display: 'از دانش مدل',
    provenance: 'model-knowledge',
    source: 'Gemini general knowledge',
  });

  return builder.build('ir-currency');
}

async function buildGoldContext(): Promise<MarketContextBlock> {
  const [ounce, gram18k, emami, bahar, usd] = await Promise.all([
    brsQuote('goldOunce'),
    brsQuote('gram18k'),
    brsQuote('coinEmami'),
    brsQuote('coinBahar'),
    brsQuote('usd'),
  ]);

  const builder = new ContextBuilder();
  builder.section('Global gold');
  builder.point({
    key: 'ounce',
    faLabel: BRS_LABELS_FA.goldOunce,
    enLabel: 'XAU/USD spot ounce',
    point: ounce,
    digits: 2,
    suffix: ' USD',
  });

  builder.section('Iranian domestic gold market (Toman)');
  builder.point({ key: 'gram18k', faLabel: BRS_LABELS_FA.gram18k, enLabel: '18k gram', point: gram18k, digits: 0 });
  builder.point({ key: 'emami', faLabel: BRS_LABELS_FA.coinEmami, enLabel: 'Emami coin', point: emami, digits: 0 });
  builder.point({ key: 'bahar', faLabel: BRS_LABELS_FA.coinBahar, enLabel: 'Bahar Azadi coin', point: bahar, digits: 0 });
  builder.point({
    key: 'usd',
    faLabel: BRS_LABELS_FA.usd,
    enLabel: 'USD/IRT free market (bubble input)',
    point: usd,
    digits: 0,
  });

  builder.section('Coin bubble calculation');
  if (isUsable(ounce) && isUsable(usd) && isUsable(emami)) {
    const bubble = computeEmamiBubble({ ounceUsd: ounce.value, usdToman: usd.value, coinMarketToman: emami.value });
    builder.note(
      `Emami coin melt value = (ounce ${fmt(ounce.value, 2)} USD / ${TROY_OUNCE_GRAMS} g) × ${bubble.pureGrams.toFixed(4)} g pure gold × ${fmtInt(usd.value)} Toman/USD = ${fmtInt(bubble.meltValueToman)} Toman. This is COMPUTED from the three fetched values above, not fetched directly.`,
    );
    builder.note(
      `Bubble = market ${fmtInt(bubble.marketPriceToman)} − melt ${fmtInt(bubble.meltValueToman)} = ${fmtInt(bubble.bubbleToman)} Toman (${fmtPercent(bubble.bubblePercent)} of melt value). Coin spec used: ${EMAMI_GROSS_GRAMS} g gross at ${EMAMI_FINENESS * 1000} fineness.`,
    );
    builder.note(
      'Treat the bubble size itself as an analytical input: historically wide bubbles have been less stable. Explain the arithmetic step by step whenever the user asks how it was derived.',
    );
    builder.status({
      key: 'bubble',
      faLabel: 'حباب سکه امامی',
      display: `${bubble.bubblePercent.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`,
      provenance: ounce.provenance === 'live' && usd.provenance === 'live' && emami.provenance === 'live' ? 'live' : 'cached',
      source: `${BRSAPI_SOURCE} (محاسبه‌شده)`,
    });
  } else {
    builder.note(
      'Coin bubble: NOT CALCULABLE this request - at least one of ounce price, free-market USD rate or coin price is unavailable. Say so instead of estimating a bubble figure.',
    );
    builder.status({
      key: 'bubble',
      faLabel: 'حباب سکه امامی',
      display: '—',
      provenance: 'unavailable',
      source: BRSAPI_SOURCE,
    });
  }

  builder.section('Gold macro context - NOT A LIVE FEED');
  builder.note(
    'Real (inflation-adjusted) interest rates, DXY level, central-bank gold purchases and current geopolitical risk premium are not fetched from a live feed in this build. Compose them from your own current general knowledge and say so.',
  );
  builder.note(
    'Full daily OHLC history for XAU/USD is not available from this provider tier, so classical indicator values for the ounce cannot be computed here. If you discuss ounce technicals, base them on your general knowledge of recent structure and flag that they are not computed from a live series.',
  );
  builder.status({
    key: 'gold-macro',
    faLabel: 'نرخ بهره واقعی، شاخص دلار و تقاضای پناهگاه امن',
    display: 'از دانش مدل',
    provenance: 'model-knowledge',
    source: 'Gemini general knowledge',
  });

  return builder.build('gold');
}

async function buildTseContext(): Promise<MarketContextBlock> {
  const keys = Object.keys(TSE_ALIASES) as Array<keyof typeof TSE_ALIASES>;
  const [quotes, indexFlow] = await Promise.all([
    Promise.all(keys.map((k) => tseQuote(k))),
    tseRealMoneyFlow('fooladMobarakeh'),
  ]);

  const builder = new ContextBuilder();
  builder.section('Tehran Stock Exchange - fetched values');
  keys.forEach((key, index) => {
    const point = quotes[index];
    if (!point) return;
    builder.point({ key, faLabel: TSE_LABELS_FA[key], enLabel: key, point, digits: 0 });
  });

  builder.section('Market structure / liquidity');
  if (isUsable(indexFlow)) {
    builder.point({
      key: 'real-money-flow',
      faLabel: `جریان پول حقیقی (${TSE_LABELS_FA.fooladMobarakeh})`,
      enLabel: 'Net real-money flow proxy (Foolad)',
      point: indexFlow,
      digits: 0,
    });
    builder.note('This is a single-symbol proxy, not whole-market real-money flow. Do not generalise it to the entire market without saying that is what you are doing.');
  } else {
    builder.note(
      'Net real-money (حقیقی) flow: UNAVAILABLE from the provider in this request. Discuss the concept if relevant, but state no figure.',
    );
    builder.status({
      key: 'real-money-flow',
      faLabel: 'جریان پول حقیقی',
      display: '—',
      provenance: 'unavailable',
      source: BRSAPI_SOURCE,
    });
  }

  builder.section('Scope of the live claim - read carefully');
  builder.note(
    'Only the price/index levels listed above are fetched. Per-symbol technical history (EMA/RSI/MACD/Bollinger series) is NOT fetched within free-tier limits, so any per-symbol technical detail must be presented as derived from your general knowledge, not from a live series. Say this explicitly when you give technical detail on an individual symbol.',
  );
  builder.note(
    `Daily price-band limits constrain single-session moves on the TSE, so breakout/reversal logic calibrated to unconstrained markets overstates significance here. Frame such claims accordingly. Reference indicator periods if you discuss them: EMA${PERIODS.emaFast}/EMA${PERIODS.emaSlow}, RSI${PERIODS.rsi}.`,
  );
  builder.status({
    key: 'symbol-technicals',
    faLabel: 'تکنیکال تک‌نماد',
    display: 'از دانش مدل',
    provenance: 'model-knowledge',
    source: 'Gemini general knowledge',
  });

  builder.section('Fundamental context - NOT A LIVE FEED');
  builder.note(
    'P/E levels, NAV of holding companies, Codal disclosures and industry-level Rial-devaluation sensitivity are not fetched live here. Compose from your general knowledge and label it as such.',
  );

  return builder.build('tse');
}

/**
 * Exhaustive dispatch over `ModuleId` (Rule 2). Adding a module to the union
 * without adding a builder here is a compile-time error, not a runtime
 * `undefined` render.
 */
export async function buildMarketContext(moduleId: ModuleId): Promise<MarketContextBlock> {
  switch (moduleId) {
    case 'crypto':
      return buildCryptoContext();
    case 'forex':
      return buildForexContext();
    case 'ir-currency':
      return buildIrCurrencyContext();
    case 'gold':
      return buildGoldContext();
    case 'tse':
      return buildTseContext();
    default: {
      const exhaustive: never = moduleId;
      throw new Error(`No market-context builder for module: ${String(exhaustive)}`);
    }
  }
}

/** Human-readable header prepended to the injected block. */
export function renderContextForPrompt(block: MarketContextBlock): string {
  const meta = MODULES[block.moduleId];
  const legend = Object.entries(PROVENANCE_FA)
    .map(([key]) => key)
    .join(' | ');
  return [
    '# LIVE MARKET DATA CONTEXT',
    `Module: ${meta.id} (${meta.faName})`,
    `Assembled at: ${block.generatedAt} (UTC)`,
    '',
    'Every line below carries an explicit provenance tag in square brackets.',
    `Possible tags: ${legend}.`,
    'Rules you must follow when using this block:',
    '1. Only describe a number as current/live if its tag says LIVE.',
    '2. If a tag says UNAVAILABLE, state that the feed is unavailable instead of giving a number.',
    '3. If a tag says NOT A LIVE FEED, you may use your own knowledge but must tell the user that part is not live data.',
    '4. Never invent a value that is missing here.',
    block.text,
  ].join('\n');
}
