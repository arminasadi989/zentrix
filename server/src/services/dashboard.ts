import { MODULES, MODULE_IDS, type ModuleId } from '../../../shared/modules.ts';
import type { DashboardResponse, DashboardRow, DataPoint, Provenance } from '../../../shared/types.ts';
import { TTL, marketCache } from '../lib/cache.ts';
import { unavailable } from '../lib/dataPoint.ts';
import { BINANCE_SOURCE, CRYPTO_SYMBOLS, fetchTicker24h, type CryptoSymbol } from '../providers/binance.ts';
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
} from '../providers/brsapi.ts';
import { FOREX_PAIRS, TWELVE_DATA_SOURCE, fetchForexQuote, type ForexPair } from '../providers/twelveData.ts';

/**
 * Dashboard rows.
 *
 * Section 9's critical requirement: price and change-percentage provenance are
 * tracked SEPARATELY per row. A row whose price is live but whose change
 * percentage the upstream did not supply is never badged "live" wholesale - the
 * price badge says live and the change cell says unavailable. Nothing is
 * fabricated to fill a column, so there is no "simulated number" path at all:
 * a missing figure renders as an em dash with an explicit reason.
 */

/** Derives a change DataPoint from the same fetch that produced the price. */
function changeFrom(price: DataPoint<number>, value: number | null, source: string): DataPoint<number> {
  if (value === null) {
    return unavailable<number>(source, 'این منبع درصد تغییر را برای این ردیف ارائه نمی‌کند');
  }
  return { value, provenance: price.provenance, source, fetchedAt: price.fetchedAt };
}

/**
 * One upstream call per symbol serves both cells: fetching price and change
 * separately would double our request count and could pair figures taken from
 * two different instants.
 */
async function cryptoRow(symbol: CryptoSymbol): Promise<DashboardRow> {
  let price: DataPoint<number>;
  let changePercent: DataPoint<number>;
  try {
    const { value: ticker, fromCache } = await marketCache.wrap(`dash:binance:${symbol}`, TTL.cryptoPrice, () =>
      fetchTicker24h(symbol),
    );
    if (!ticker) {
      const note = 'پاسخ بایننس برای این نماد قابل استفاده نبود';
      price = unavailable<number>(BINANCE_SOURCE, note);
      changePercent = unavailable<number>(BINANCE_SOURCE, note);
    } else {
      price = {
        value: ticker.price,
        provenance: fromCache ? 'cached' : 'live',
        source: BINANCE_SOURCE,
        fetchedAt: new Date().toISOString(),
      };
      changePercent = changeFrom(price, ticker.changePercent, BINANCE_SOURCE);
    }
  } catch {
    const note = 'اتصال به بایننس برقرار نشد';
    price = unavailable<number>(BINANCE_SOURCE, note);
    changePercent = unavailable<number>(BINANCE_SOURCE, note);
  }

  return {
    id: `crypto:${symbol}`,
    moduleId: 'crypto',
    faLabel: CRYPTO_SYMBOLS[symbol],
    symbol,
    unitFa: 'دلار',
    price,
    changePercent,
    precision: symbol === 'BTCUSDT' ? 0 : 2,
  };
}

async function forexRow(pair: ForexPair): Promise<DashboardRow> {
  const cacheKey = `dash:twelvedata:${pair}`;
  const quote = await marketCache
    .wrap(cacheKey, TTL.forexPrice, () => fetchForexQuote(pair))
    .then(
      (result) => ({ ok: true as const, ...result }),
      () => ({ ok: false as const, value: null, fromCache: false }),
    );

  const price: DataPoint<number> = quote.ok && quote.value
    ? {
        value: quote.value.price,
        provenance: quote.fromCache ? 'cached' : 'live',
        source: TWELVE_DATA_SOURCE,
        fetchedAt: new Date().toISOString(),
      }
    : unavailable<number>(TWELVE_DATA_SOURCE, 'نرخ لحظه‌ای در دسترس نیست (احتمال اتمام سهمیه رایگان)');

  const changePercent =
    quote.ok && quote.value
      ? changeFrom(price, quote.value.changePercent, TWELVE_DATA_SOURCE)
      : unavailable<number>(TWELVE_DATA_SOURCE, 'درصد تغییر در دسترس نیست');

  return {
    id: `forex:${pair}`,
    moduleId: 'forex',
    faLabel: FOREX_PAIRS[pair],
    symbol: pair,
    unitFa: '',
    price,
    changePercent,
    precision: pair === 'USD/JPY' ? 3 : 5,
  };
}

type BrsRowSpec = {
  id: string;
  moduleId: Extract<ModuleId, 'ir-currency' | 'gold'>;
  aliasKey: keyof typeof BRS_ALIASES;
  unitFa: string;
  precision: number;
};

/** Farsi labels come from the shared registry in the provider, never re-typed. */
const BRS_ROWS: readonly BrsRowSpec[] = [
  { id: 'usd', moduleId: 'ir-currency', aliasKey: 'usd', unitFa: 'تومان', precision: 0 },
  { id: 'eur', moduleId: 'ir-currency', aliasKey: 'eur', unitFa: 'تومان', precision: 0 },
  { id: 'aed', moduleId: 'ir-currency', aliasKey: 'aed', unitFa: 'تومان', precision: 0 },
  { id: 'ounce', moduleId: 'gold', aliasKey: 'goldOunce', unitFa: 'دلار', precision: 2 },
  { id: 'gram18k', moduleId: 'gold', aliasKey: 'gram18k', unitFa: 'تومان', precision: 0 },
  { id: 'emami', moduleId: 'gold', aliasKey: 'coinEmami', unitFa: 'تومان', precision: 0 },
  { id: 'bahar', moduleId: 'gold', aliasKey: 'coinBahar', unitFa: 'تومان', precision: 0 },
];

async function brsRow(spec: BrsRowSpec): Promise<DashboardRow> {
  const load = async () => {
    const { value: items, fromCache } = await marketCache.wrap('brsapi:goldcurrency:payload', TTL.brsGoldCurrency, () =>
      fetchGoldCurrencyPayload(),
    );
    return { quote: pickQuote(items, BRS_ALIASES[spec.aliasKey]), fromCache };
  };

  let price: DataPoint<number>;
  let changePercent: DataPoint<number>;
  try {
    const { quote, fromCache } = await load();
    if (!quote) {
      const note = 'این نماد در پاسخ فعلی منبع پیدا نشد';
      price = unavailable<number>(BRSAPI_SOURCE, note);
      changePercent = unavailable<number>(BRSAPI_SOURCE, note);
    } else {
      const provenance: Provenance = fromCache ? 'cached' : 'live';
      price = { value: quote.price, provenance, source: BRSAPI_SOURCE, fetchedAt: new Date().toISOString() };
      changePercent = changeFrom(price, quote.changePercent, BRSAPI_SOURCE);
    }
  } catch {
    const note = 'اتصال به منبع داده داخلی برقرار نشد';
    price = unavailable<number>(BRSAPI_SOURCE, note);
    changePercent = unavailable<number>(BRSAPI_SOURCE, note);
  }

  return {
    id: `${spec.moduleId}:${spec.id}`,
    moduleId: spec.moduleId,
    faLabel: BRS_LABELS_FA[spec.aliasKey],
    symbol: spec.id,
    unitFa: spec.unitFa,
    price,
    changePercent,
    precision: spec.precision,
  };
}

const TSE_ROWS: ReadonlyArray<keyof typeof TSE_ALIASES> = [
  'index',
  'fooladMobarakeh',
  'petrochemicalPersianGulf',
  'mobinOne',
  'bankMellat',
];

async function tseRow(aliasKey: keyof typeof TSE_ALIASES): Promise<DashboardRow> {
  let price: DataPoint<number>;
  let changePercent: DataPoint<number>;
  try {
    const { value: items, fromCache } = await marketCache.wrap('brsapi:tse:payload', TTL.tse, () => fetchTsePayload());
    const symbol = pickTseSymbol(items, TSE_ALIASES[aliasKey]);
    if (!symbol) {
      const note = 'نماد در پاسخ فعلی منبع TSETMC یافت نشد';
      price = unavailable<number>(BRSAPI_SOURCE, note);
      changePercent = unavailable<number>(BRSAPI_SOURCE, note);
    } else {
      const provenance: Provenance = fromCache ? 'cached' : 'live';
      price = { value: symbol.price, provenance, source: BRSAPI_SOURCE, fetchedAt: new Date().toISOString() };
      changePercent = changeFrom(price, symbol.changePercent, BRSAPI_SOURCE);
    }
  } catch {
    const note = 'اتصال به سرویس TSETMC برقرار نشد';
    price = unavailable<number>(BRSAPI_SOURCE, note);
    changePercent = unavailable<number>(BRSAPI_SOURCE, note);
  }

  return {
    id: `tse:${aliasKey}`,
    moduleId: 'tse',
    faLabel: TSE_LABELS_FA[aliasKey],
    symbol: aliasKey,
    unitFa: aliasKey === 'index' ? 'واحد' : 'ریال',
    price,
    changePercent,
    precision: 0,
  };
}

/**
 * Footer copy is DERIVED from the rows that were actually produced, so it can
 * never claim a category is fully live after that category's fetch failed.
 */
function buildFooter(rows: readonly DashboardRow[]): string {
  const perModule = MODULE_IDS.map((moduleId) => {
    const scoped = rows.filter((row) => row.moduleId === moduleId);
    if (!scoped.length) return null;
    const livePrices = scoped.filter((r) => r.price.provenance === 'live' || r.price.provenance === 'cached').length;
    const liveChanges = scoped.filter(
      (r) => r.changePercent.provenance === 'live' || r.changePercent.provenance === 'cached',
    ).length;
    const name = MODULES[moduleId].faName;
    if (livePrices === 0) return `${name}: بدون داده (منبع در دسترس نیست)`;
    if (livePrices === scoped.length && liveChanges === scoped.length) return `${name}: قیمت و درصد تغییر هر دو زنده`;
    if (liveChanges === 0) return `${name}: قیمت زنده، درصد تغییر بدون منبع`;
    return `${name}: قیمت ${livePrices} از ${scoped.length} ردیف زنده، درصد تغییر ${liveChanges} از ${scoped.length} ردیف زنده`;
  }).filter((line): line is string => line !== null);

  return [
    'وضعیت صداقت داده‌ها:',
    ...perModule,
    'هیچ عددی در این جدول ساختگی نیست؛ هر مقداری که واکشی نشده باشد با خط تیره نمایش داده می‌شود.',
  ].join(' • ');
}

export async function buildDashboard(filter: ModuleId | 'all'): Promise<DashboardResponse> {
  const cryptoSymbols = Object.keys(CRYPTO_SYMBOLS) as CryptoSymbol[];
  const forexPairs = Object.keys(FOREX_PAIRS) as ForexPair[];

  const wanted = (moduleId: ModuleId): boolean => filter === 'all' || filter === moduleId;

  const tasks: Array<Promise<DashboardRow>> = [
    ...(wanted('crypto') ? cryptoSymbols.map(cryptoRow) : []),
    ...(wanted('forex') ? forexPairs.map(forexRow) : []),
    ...BRS_ROWS.filter((spec) => wanted(spec.moduleId)).map(brsRow),
    ...(wanted('tse') ? TSE_ROWS.map(tseRow) : []),
  ];

  const settled = await Promise.allSettled(tasks);
  const rows = settled
    .filter((result): result is PromiseFulfilledResult<DashboardRow> => result.status === 'fulfilled')
    .map((result) => result.value);

  return { rows, generatedAt: new Date().toISOString(), footerFa: buildFooter(rows) };
}
