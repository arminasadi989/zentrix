import type { MarketContextBlock } from '@shared/types';
import { formatTime, isFetched } from '../lib/format.ts';
import { ProvenanceBadge } from './ProvenanceBadge.tsx';

/**
 * Shows exactly what the model will be given for the next question in this
 * module, with per-field provenance. This is the user's direct check on the
 * app's honesty claim, not a decorative header.
 */
export function DataStatusStrip({
  context,
  loading,
  errorFa,
  onRefresh,
}: {
  context: MarketContextBlock | null;
  loading: boolean;
  errorFa: string | null;
  onRefresh: () => void;
}) {
  const fetchedCount = context?.fields.filter((field) => isFetched(field.provenance)).length ?? 0;
  const total = context?.fields.length ?? 0;

  return (
    <section className="strip">
      <header className="strip__head">
        <h2>داده‌های ورودی تحلیل</h2>
        <div className="strip__actions">
          {context ? (
            <span className="strip__summary">
              {fetchedCount} از {total} مورد واکشی‌شده · آخرین به‌روزرسانی {formatTime(context.generatedAt)}
            </span>
          ) : null}
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? 'در حال واکشی…' : 'به‌روزرسانی'}
          </button>
        </div>
      </header>

      {errorFa ? <p className="notice notice--warn">{errorFa}</p> : null}

      {context ? (
        <ul className="strip__grid">
          {context.fields.map((field) => (
            <li key={field.key}>
              <span className="strip__label">{field.faLabel}</span>
              <span className="strip__value">{field.display}</span>
              <ProvenanceBadge provenance={field.provenance} />
            </li>
          ))}
        </ul>
      ) : (
        !errorFa && <p className="strip__placeholder">در حال آماده‌سازی داده‌های بازار…</p>
      )}
    </section>
  );
}
