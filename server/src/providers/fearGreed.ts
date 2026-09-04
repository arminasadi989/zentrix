import { fetchJson, toFiniteNumber } from '../lib/http.ts';

export const FNG_SOURCE = 'alternative.me Fear & Greed Index';

export interface FearGreed {
  value: number;
  classification: string;
}

/**
 * Crypto Fear & Greed Index. The classification string is taken from the API
 * response rather than re-derived locally, so the label and value can never
 * disagree with the source.
 */
export async function fetchFearGreed(): Promise<FearGreed | null> {
  const raw = await fetchJson<{ data?: Array<{ value?: string; value_classification?: string }> }>(
    'https://api.alternative.me/fng/?limit=1',
  );
  const first = raw.data?.[0];
  if (!first) return null;
  const value = toFiniteNumber(first.value);
  if (value === null || !first.value_classification) return null;
  return { value, classification: first.value_classification };
}
