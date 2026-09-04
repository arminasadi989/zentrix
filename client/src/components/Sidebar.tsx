import { MODULE_LIST, type ModuleId } from '@shared/modules';

export type ViewId = ModuleId | 'dashboard';

/**
 * Module switcher. Renders `MODULE_LIST`, which is derived from the shared
 * module union - a module cannot be missing from this list without a compile
 * error upstream, which is exactly the bug this structure prevents.
 */
export function Sidebar({
  view,
  onSelect,
  geminiReady,
}: {
  view: ViewId;
  onSelect: (view: ViewId) => void;
  geminiReady: boolean | null;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">Z</span>
        <div>
          <div className="sidebar__title">زنتریکس</div>
          <div className="sidebar__subtitle">تحلیلگر بازارهای مالی</div>
        </div>
      </div>

      <nav className="sidebar__nav">
        <button
          type="button"
          className={`module-item ${view === 'dashboard' ? 'module-item--active' : ''}`}
          onClick={() => onSelect('dashboard')}
          style={{ ['--accent' as string]: '#94a3b8', ['--accent-soft' as string]: 'rgba(148,163,184,0.14)' }}
        >
          <span className="module-item__icon">☰</span>
          <span className="module-item__body">
            <span className="module-item__name">داشبورد بازار</span>
            <span className="module-item__desc">نمای کلی همه بازارها با وضعیت شفاف داده</span>
          </span>
        </button>

        <div className="sidebar__divider">ماژول‌های تحلیلی</div>

        {MODULE_LIST.map((module) => (
          <button
            key={module.id}
            type="button"
            className={`module-item ${view === module.id ? 'module-item--active' : ''}`}
            onClick={() => onSelect(module.id)}
            disabled={module.comingSoon}
            style={{ ['--accent' as string]: module.accent, ['--accent-soft' as string]: module.accentSoft }}
          >
            <span className="module-item__icon">{module.icon}</span>
            <span className="module-item__body">
              <span className="module-item__name">
                {module.faName}
                {module.comingSoon ? <span className="chip chip--muted">به‌زودی</span> : null}
              </span>
              <span className="module-item__desc">{module.faDescription}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        {geminiReady === false ? (
          <div className="notice notice--warn">
            کلید Gemini روی سرور تنظیم نشده است. تحلیل و صداگذاری کار نمی‌کند.
          </div>
        ) : (
          <div className="sidebar__note">
            هر عددی که در این برنامه می‌بینید برچسب منبع دارد. آنچه واکشی نشده باشد، ساخته نمی‌شود.
          </div>
        )}
      </div>
    </aside>
  );
}
