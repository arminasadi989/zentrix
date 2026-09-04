/**
 * Wire types shared by client and server. Kept free of runtime dependencies so
 * both a Vite bundle and a Node process can import them without side effects.
 */
import type { ModuleId, ResponseLength } from './modules';

/**
 * Where a displayed or prompt-injected number actually came from.
 *
 * Rule 3: nothing static is ever labeled "live". Every numeric field that
 * crosses the wire carries its own provenance, and the UI badge plus the text
 * injected into the model's context are both derived from this value rather
 * than from a hand-written string.
 *
 * - `live`             fetched from the upstream API during this request
 * - `cached`           fetched recently, served from the server cache
 * - `stale-fallback`   upstream failed; last known good value, age disclosed
 * - `unavailable`      no trustworthy value exists (value is null)
 * - `model-knowledge`  no free live feed exists; the model must supply it from
 *                      its own general knowledge and say so
 */
export type Provenance = 'live' | 'cached' | 'stale-fallback' | 'unavailable' | 'model-knowledge';

export interface DataPoint<T = number> {
  value: T | null;
  provenance: Provenance;
  /** Human-readable upstream name, e.g. "Binance /api/v3/ticker/24hr". */
  source: string;
  /** ISO timestamp of the underlying fetch, null when there is no value. */
  fetchedAt: string | null;
  /** Optional caveat surfaced in the UI tooltip and in the prompt context. */
  note?: string;
}

export interface DashboardRow {
  id: string;
  moduleId: ModuleId;
  /** Farsi instrument label. */
  faLabel: string;
  symbol: string;
  unitFa: string;
  price: DataPoint;
  /** 24h (or session) percentage change; independent provenance from price. */
  changePercent: DataPoint;
  /** Decimal places to render the price with. */
  precision: number;
}

export interface DashboardResponse {
  rows: DashboardRow[];
  generatedAt: string;
  /** Derived from the rows themselves, never hand-written. */
  footerFa: string;
}

/** A labeled indicator value. The label is derived from the period constant. */
export interface IndicatorReading {
  label: string;
  period: number;
  value: number | null;
}

export interface MarketContextBlock {
  moduleId: ModuleId;
  /** Rendered text injected into the system instruction. */
  text: string;
  /** Structured provenance summary, shown in the UI "data status" strip. */
  fields: Array<{ key: string; faLabel: string; display: string; provenance: Provenance; source: string }>;
  generatedAt: string;
}

export interface ChatAttachment {
  /** Base64 payload without the data: prefix. */
  data: string;
  mimeType: string;
  name?: string;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  attachments?: ChatAttachment[];
}

export interface ChatRequestBody {
  moduleId: ModuleId;
  responseLength: ResponseLength;
  /** Full conversation, oldest first, including the new user turn last. */
  turns: ChatTurn[];
}

export interface ChatResponseBody {
  text: string;
  moduleId: ModuleId;
  context: MarketContextBlock;
  model: string;
}

export interface ApiErrorBody {
  error: string;
  /** Farsi message safe to render directly to the user. */
  messageFa: string;
}
