import type { Provenance } from '@shared/types';

/** Farsi number formatting for the UI. Values are never invented here. */
export function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('fa-IR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Badge copy per provenance, defined once. Exhaustive over the union so a new
 * provenance value cannot render as an unlabeled badge (Rule 2).
 */
export interface ProvenanceLabel {
  short: string;
  tone: 'live' | 'cached' | 'stale' | 'none' | 'model';
  explanation: string;
}

export function provenanceLabel(provenance: Provenance): ProvenanceLabel {
  switch (provenance) {
    case 'live':
      return { short: 'زنده', tone: 'live', explanation: 'همین لحظه از منبع اصلی واکشی شد.' };
    case 'cached':
      return {
        short: 'زنده (کش)',
        tone: 'cached',
        explanation: 'واکشی واقعی، اما از کش چند ثانیه‌ای تا چند دقیقه‌ای سرور خوانده شد.',
      };
    case 'stale-fallback':
      return {
        short: 'داده قدیمی',
        tone: 'stale',
        explanation: 'اتصال به منبع برقرار نشد؛ این آخرین مقدار موفق است و لحظه‌ای نیست.',
      };
    case 'unavailable':
      return {
        short: 'بدون داده',
        tone: 'none',
        explanation: 'مقداری واکشی نشد و هیچ عدد جایگزینی ساخته نشده است.',
      };
    case 'model-knowledge':
      return {
        short: 'دانش مدل',
        tone: 'model',
        explanation: 'برای این مورد فید زنده رایگان وجود ندارد؛ مدل از دانش عمومی خود استفاده می‌کند.',
      };
    default: {
      const exhaustive: never = provenance;
      throw new Error(`Unhandled provenance: ${String(exhaustive)}`);
    }
  }
}

/** True only when the figure is genuinely fetched data. */
export function isFetched(provenance: Provenance): boolean {
  return provenance === 'live' || provenance === 'cached';
}

export async function fileToBase64(file: File): Promise<{ data: string; mimeType: string; name: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { data: btoa(binary), mimeType: file.type, name: file.name };
}
