/** Server-side number formatting used only inside prompt/context strings. */
export function fmt(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return Math.round(value).toLocaleString('en-US');
}

export function fmtPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}
