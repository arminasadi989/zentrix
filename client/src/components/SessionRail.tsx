import type { SessionSummary } from '../types.ts';
import { formatDateTime } from '../lib/format.ts';

export function SessionRail({
  summaries,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: {
  summaries: SessionSummary[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rail">
      <button type="button" className="rail__new" onClick={onNew}>
        + گفت‌وگوی جدید
      </button>
      <div className="rail__list">
        {summaries.length === 0 ? (
          <p className="rail__empty">هنوز گفت‌وگویی در این ماژول ندارید.</p>
        ) : (
          summaries.map((session) => (
            <div key={session.id} className={`rail__item ${session.id === activeId ? 'rail__item--active' : ''}`}>
              <button type="button" className="rail__select" onClick={() => onSelect(session.id)}>
                <span className="rail__title">{session.title}</span>
                <span className="rail__meta">
                  {session.messageCount} پیام · {formatDateTime(session.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                className="rail__delete"
                title="حذف گفت‌وگو"
                aria-label="حذف گفت‌وگو"
                onClick={() => onDelete(session.id)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
