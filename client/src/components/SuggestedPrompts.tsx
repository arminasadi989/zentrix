import type { ModuleMeta } from '@shared/modules';

export function SuggestedPrompts({ module, onPick }: { module: ModuleMeta; onPick: (prompt: string) => void }) {
  return (
    <div className="suggest">
      <h3>از کجا شروع کنیم؟</h3>
      <p className="suggest__lead">
        این پیشنهادها مخصوص «{module.faName}» است و با روش تحلیلی همین ماژول هم‌خوانی دارد.
      </p>
      <div className="suggest__list">
        {module.suggestedPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onPick(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
