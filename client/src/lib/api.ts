import type { ModuleId, ResponseLength } from '@shared/modules';
import type {
  ApiErrorBody,
  ChatResponseBody,
  ChatTurn,
  DashboardResponse,
  MarketContextBlock,
} from '@shared/types';

/**
 * Thin client for our own API. There is no third-party endpoint and no API key
 * anywhere in this file - by design, every provider call happens server-side.
 */
export class ApiError extends Error {
  constructor(
    readonly messageFa: string,
    readonly status: number,
  ) {
    super(messageFa);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. مطمئن شوید سرور در حال اجراست.', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(body?.messageFa ?? 'درخواست با خطا مواجه شد.', response.status);
  }
  return (await response.json()) as T;
}

export interface ProviderStatus {
  gemini: boolean;
  twelveData: boolean;
  brsApi: boolean;
}

export function fetchProviderStatus(): Promise<ProviderStatus> {
  return request<ProviderStatus>('/api/market/status');
}

export function fetchMarketContext(moduleId: ModuleId): Promise<MarketContextBlock> {
  return request<MarketContextBlock>(`/api/market/context/${moduleId}`);
}

export function fetchDashboard(filter: ModuleId | 'all'): Promise<DashboardResponse> {
  return request<DashboardResponse>(`/api/market/dashboard?module=${encodeURIComponent(filter)}`);
}

export function sendChat(body: {
  moduleId: ModuleId;
  responseLength: ResponseLength;
  turns: ChatTurn[];
}): Promise<ChatResponseBody> {
  return request<ChatResponseBody>('/api/chat', { method: 'POST', body: JSON.stringify(body) });
}

/** Returns a playable blob for an assistant message. */
export async function synthesize(text: string): Promise<Blob> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(body?.messageFa ?? 'تولید صدا ممکن نشد.', response.status);
  }
  return response.blob();
}
