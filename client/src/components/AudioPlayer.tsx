import type { AudioPlayerState } from '../hooks/useAudioPlayer.ts';

/**
 * Floating player so read-aloud keeps playing while the user keeps chatting or
 * switches modules.
 */
export function AudioPlayer({
  state,
  onPause,
  onStop,
}: {
  state: AudioPlayerState;
  onPause: () => void;
  onStop: () => void;
}) {
  if (state.status === 'idle' || state.messageId === null) return null;

  return (
    <div className="player" role="status">
      <span className="player__icon">🔊</span>
      <div className="player__body">
        <span className="player__label">{state.label}</span>
        <span className="player__status">
          {state.status === 'loading'
            ? 'در حال تولید صدا…'
            : state.status === 'playing'
              ? 'در حال پخش'
              : state.status === 'paused'
                ? 'متوقف شده'
                : (state.errorFa ?? 'خطا در پخش')}
        </span>
      </div>
      {state.status === 'playing' ? (
        <button type="button" onClick={onPause}>
          توقف
        </button>
      ) : null}
      <button type="button" className="player__close" onClick={onStop} aria-label="بستن پخش‌کننده">
        ×
      </button>
    </div>
  );
}
