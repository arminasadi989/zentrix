import { env } from '../config/env.ts';
import { UpstreamError, fetchJson, toFiniteNumber } from '../lib/http.ts';

/**
 * BrsApi.ir - Iranian free-market currency, gold ounce, gold coin and TSE data.
 * Free tier ~1,500 requests/day, so responses are cached for minutes.
 *
 * Iranian data providers restructure endpoints periodically. Rather than
 * hard-failing on one shape, the parsers below are defensive: they accept
 * several documented response layouts and key spellings, and any symbol that
 * cannot be located is reported as unavailable instead of being substituted.
 */
const GOLD_CURRENCY_URL = 'https://BrsApi.ir/Api/Market/Gold_Currency.php';
const TSE_URL = 'https://BrsApi.ir/Api/Tsetmc/AllSymbols.php';

export const BRSAPI_SOURCE = 'BrsApi.ir (Gold_Currency / TSETMC endpoints)';

function requireKey(): string {
  if (!env.brsApiKey) throw new UpstreamError('BRSAPI_KEY is not configured', null, 'BrsApi.ir');
  return env.brsApiKey;
}

export interface BrsQuote {
  /** Price in the unit the provider reports (Toman for domestic items). */
  price: number;
  changePercent: number | null;
  /** Provider's own name/date fields, kept for transparency in the UI. */
  name: string;
  unit: string | null;
}

interface RawItem {
  symbol?: string;
  name?: string;
  name_en?: string;
  price?: unknown;
  value?: unknown;
  change_percent?: unknown;
  change_price?: unknown;
  unit?: string;
  date?: string;
  time?: string;
}

interface GoldCurrencyPayload {
  gold?: RawItem[];
  currency?: RawItem[];
  cryptocurrency?: RawItem[];
  // Some documented revisions nest everything under `data`.
  data?: { gold?: RawItem[]; currency?: RawItem[] };
}

function flatten(payload: GoldCurrencyPayload): RawItem[] {
  return [
    ...(payload.gold ?? []),
    ...(payload.currency ?? []),
    ...(payload.data?.gold ?? []),
    ...(payload.data?.currency ?? []),
  ];
}

let lastPayload: { at: number; items: RawItem[] } | null = null;

/**
 * One upstream call serves every domestic instrument. Callers ask for symbols
 * by a set of accepted aliases; the shared payload is fetched once per TTL by
 * the cache layer above this module.
 */
export async function fetchGoldCurrencyPayload(): Promise<RawItem[]> {
  const url = `${GOLD_CURRENCY_URL}?key=${requireKey()}`;
  const raw = await fetchJson<GoldCurrencyPayload>(url, { timeoutMs: 10_000 });
  const items = flatten(raw);
  if (!items.length) throw new UpstreamError('BrsApi returned an unrecognised payload shape', null, 'BrsApi.ir');
  lastPayload = { at: Date.now(), items };
  return items;
}

function normalize(text: string): string {
  return text
    .replace(/[\u200c\u200f\u200e]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[یي]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .trim()
    .toLowerCase();
}

/** Finds an item by any accepted alias. Returns null when absent - no guessing. */
export function pickQuote(items: readonly RawItem[], aliases: readonly string[]): BrsQuote | null {
  const wanted = aliases.map(normalize);
  for (const item of items) {
    const candidates = [item.symbol, item.name, item.name_en].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    const match = candidates.some((candidate) => wanted.includes(normalize(candidate)));
    if (!match) continue;
    const price = toFiniteNumber(item.price) ?? toFiniteNumber(item.value);
    if (price === null) continue;
    return {
      price,
      changePercent: toFiniteNumber(item.change_percent),
      name: item.name ?? item.symbol ?? aliases[0] ?? 'unknown',
      unit: item.unit ?? null,
    };
  }
  return null;
}

/**
 * Alias tables. Multiple spellings are listed because the provider has shipped
 * different symbol keys over time; an unmatched instrument degrades to
 * "unavailable" rather than falling back to a similar-looking symbol.
 */
export const BRS_ALIASES = {
  usd: ['USD', 'دلار', 'دلار آمریکا', 'US Dollar'],
  eur: ['EUR', 'یورو', 'Euro'],
  aed: ['AED', 'درهم', 'درهم امارات', 'UAE Dirham'],
  goldOunce: ['XAUUSD', 'ONS', 'انس طلا', 'انس', 'Gold Ounce'],
  gram18k: ['IR_GOLD_18K', 'طلا 18 عیار', 'گرم طلای 18 عیار', 'طلای 18 عیار'],
  coinEmami: ['IR_COIN_EMAMI', 'سکه امامی', 'سکه'],
  coinBahar: ['IR_COIN_BAHAR', 'سکه بهار آزادی'],
  coinHalf: ['IR_COIN_HALF', 'نیم سکه'],
  coinQuarter: ['IR_COIN_QUARTER', 'ربع سکه'],
  nima: ['NIMA_USD', 'دلار نیما', 'نیما'],
} as const;

export type BrsAliasKey = keyof typeof BRS_ALIASES;

/**
 * Farsi labels for these instruments, defined once (Rule 1). Both the dashboard
 * rows and the prompt-context builder import this record instead of hard-coding
 * their own copies, which is how the two views are guaranteed to name the same
 * instrument the same way.
 */
export const BRS_LABELS_FA: Record<BrsAliasKey, string> = {
  usd: 'دلار آمریکا (آزاد)',
  eur: 'یورو (آزاد)',
  aed: 'درهم امارات',
  goldOunce: 'انس طلای جهانی',
  gram18k: 'گرم طلای ۱۸ عیار',
  coinEmami: 'سکه امامی',
  coinBahar: 'سکه بهار آزادی',
  coinHalf: 'نیم سکه',
  coinQuarter: 'ربع سکه',
  nima: 'دلار نیما (رسمی)',
};

export interface TseSymbol {
  name: string;
  price: number;
  changePercent: number | null;
  /** Net real-money (حقیقی) flow in Rial when the provider supplies it. */
  realMoneyFlow: number | null;
}

interface RawTseItem {
  l18?: string;
  name?: string;
  symbol?: string;
  pc?: unknown;
  pl?: unknown;
  price?: unknown;
  plp?: unknown;
  change_percent?: unknown;
  buy_i_volume?: unknown;
  sell_i_volume?: unknown;
  money_flow?: unknown;
}

/**
 * TSE symbols + overall index. The spec flags that this provider occasionally
 * restructures its TSETMC endpoints: the parser therefore accepts both the
 * flat-array and `{ data: [...] }` shapes and reports a clear upstream error
 * (surfaced as "unavailable" upstream of here) instead of failing silently.
 */
export async function fetchTsePayload(): Promise<RawTseItem[]> {
  const url = `${TSE_URL}?key=${requireKey()}`;
  const raw = await fetchJson<RawTseItem[] | { data?: RawTseItem[] }>(url, { timeoutMs: 12_000 });
  const items = Array.isArray(raw) ? raw : (raw.data ?? []);
  if (!items.length) throw new UpstreamError('TSETMC endpoint returned no rows', null, 'BrsApi.ir');
  return items;
}

export function pickTseSymbol(items: readonly RawTseItem[], aliases: readonly string[]): TseSymbol | null {
  const wanted = aliases.map(normalize);
  for (const item of items) {
    const candidates = [item.l18, item.name, item.symbol].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    if (!candidates.some((c) => wanted.includes(normalize(c)))) continue;
    const price = toFiniteNumber(item.pl) ?? toFiniteNumber(item.price) ?? toFiniteNumber(item.pc);
    if (price === null) continue;
    const buy = toFiniteNumber(item.buy_i_volume);
    const sell = toFiniteNumber(item.sell_i_volume);
    return {
      name: candidates[0] as string,
      price,
      changePercent: toFiniteNumber(item.plp) ?? toFiniteNumber(item.change_percent),
      realMoneyFlow: toFiniteNumber(item.money_flow) ?? (buy !== null && sell !== null ? buy - sell : null),
    };
  }
  return null;
}

export const TSE_ALIASES = {
  index: ['شاخص کل', 'TEDPIX', 'شاخص'],
  fooladMobarakeh: ['فولاد'],
  petrochemicalPersianGulf: ['فارس'],
  mobinOne: ['همراه'],
  bankMellat: ['وبملت'],
  chadormalu: ['کچاد'],
} as const;

export type TseAliasKey = keyof typeof TSE_ALIASES;

/** Farsi labels for the TSE instruments - same single-source rule as above. */
export const TSE_LABELS_FA: Record<TseAliasKey, string> = {
  index: 'شاخص کل بورس',
  fooladMobarakeh: 'فولاد مبارکه',
  petrochemicalPersianGulf: 'پتروشیمی خلیج فارس',
  mobinOne: 'همراه اول',
  bankMellat: 'بانک ملت',
  chadormalu: 'چادرملو',
};

/** Exposed for diagnostics only; never used as a data source for the UI. */
export function lastPayloadAge(): number | null {
  return lastPayload ? Date.now() - lastPayload.at : null;
}
