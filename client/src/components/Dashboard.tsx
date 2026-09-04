import { useState } from 'react';
import { MODULE_LIST, requireModuleMeta, type ModuleId } from '@shared/modules';
import { formatNumber, formatPercent, formatTime, isFetched } from '../lib/format.ts';
import { useDashboard } from '../hooks/useDashboard.ts';
import { ProvenanceBadge } from './ProvenanceBadge.tsx';

type Filter = ModuleId | 'all';

/**
 * Market dashboard.
 *
 * Price and change-percentage badges are rendered independently per row, so a
 * row where only the price was fetched is never presented as wholly live. The
 * footer note is supplied by the server and derived from the rows themselves.
 */
export function Dashboard() {
  const [filter, setFilter] = useState<Filter>('all');
  const { data, errorFa, loading, reload } = useDashboard(filter, true);

  return (
    <div className="dash">
      <header className="dash__head">
        <div>
          <h1>داشبورد بازار</h1>
          <p className="dash__lead">
            نمای کلی پنج بازار. هر سلول برچسب منبع خودش را دارد؛ قیمت و درصد تغییر جداگانه ارزیابی می‌شوند.
          </p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={loading}>
          {loading ? 'در حال واکشی…' : 'به‌روزرسانی'}
        </button>
      </header>

      <div className="dash__filters">
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
          style={{ ['--accent' as string]: '#94a3b8' }}
        >
          همه بازارها
        </button>
        {MODULE_LIST.map((module) => (
          <button
            key={module.id}
            type="button"
            className={filter === module.id ? 'active' : ''}
            onClick={() => setFilter(module.id)}
            style={{ ['--accent' as string]: module.accent }}
          >
            {module.faName}
          </button>
        ))}
      </div>

      {errorFa ? <p className="notice notice--warn">{errorFa}</p> : null}

      <div className="table">
        <div className="table__row table__row--head">
          <span>نماد</span>
          <span>قیمت</span>
          <span>وضعیت قیمت</span>
          <span>تغییر</span>
          <span>وضعیت تغییر</span>
          <span>زمان</span>
        </div>

        {(data?.rows ?? []).map((row) => {
          const meta = requireModuleMeta(row.moduleId);
          return (
            <div
              key={row.id}
              className="table__row"
              style={{ ['--accent' as string]: meta.accent, ['--accent-soft' as string]: meta.accentSoft }}
            >
              <span className="table__symbol">
                <span className="table__dot" />
                <span>
                  {row.faLabel}
                  <em>{row.symbol}</em>
                </span>
              </span>
              <span className={isFetched(row.price.provenance) ? '' : 'muted'}>
                {formatNumber(row.price.value, row.precision)}
                {row.unitFa ? <em> {row.unitFa}</em> : null}
              </span>
              <span>
                <ProvenanceBadge provenance={row.price.provenance} note={row.price.note} />
              </span>
              <span
                className={
                  row.changePercent.value === null
                    ? 'muted'
                    : row.changePercent.value > 0
                      ? 'up'
                      : row.changePercent.value < 0
                        ? 'down'
                        : ''
                }
              >
                {formatPercent(row.changePercent.value)}
              </span>
              <span>
                <ProvenanceBadge provenance={row.changePercent.provenance} note={row.changePercent.note} />
              </span>
              <span className="muted">{formatTime(row.price.fetchedAt)}</span>
            </div>
          );
        })}

        {!data && !errorFa ? <div className="table__empty">در حال واکشی داده‌ها…</div> : null}
      </div>

      <footer className="dash__footer">{data?.footerFa ?? 'وضعیت داده‌ها پس از اولین واکشی نمایش داده می‌شود.'}</footer>
    </div>
  );
}
