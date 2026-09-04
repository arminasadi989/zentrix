import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { synthesize } from '../lib/api.ts';

export interface AudioPlayerState {
  /** Message id currently loaded in the player, if any. */
  messageId: string | null;
  label: string;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  errorFa: string | null;
}

/**
 * Read-aloud player.
 *
 * A single <audio> element lives for the lifetime of the app so playback keeps
 * running while the user navigates or keeps typing. Synthesised blobs are cached
 * per message id, so re-playing a message never re-hits the TTS model.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef(new Map<string, string>());
  const [state, setState] = useState<AudioPlayerState>({
    messageId: null,
    label: '',
    status: 'idle',
    errorFa: null,
  });

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    const onEnded = () => setState((prev) => ({ ...prev, status: 'idle' }));
    const onPause = () => setState((prev) => (prev.status === 'playing' ? { ...prev, status: 'paused' } : prev));
    const onPlay = () => setState((prev) => ({ ...prev, status: 'playing' }));
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      audio.pause();
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
      for (const url of cacheRef.current.values()) URL.revokeObjectURL(url);
      cacheRef.current.clear();
    };
  }, []);

  const play = useCallback(async (messageId: string, text: string, label: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.messageId === messageId && state.status === 'paused') {
      await audio.play().catch(() => undefined);
      return;
    }

    setState({ messageId, label, status: 'loading', errorFa: null });
    try {
      let url = cacheRef.current.get(messageId);
      if (!url) {
        const blob = await synthesize(text);
        url = URL.createObjectURL(blob);
        cacheRef.current.set(messageId, url);
      }
      audio.src = url;
      await audio.play();
      setState({ messageId, label, status: 'playing', errorFa: null });
    } catch (error) {
      const messageFa =
        error && typeof error === 'object' && 'messageFa' in error
          ? String((error as { messageFa: string }).messageFa)
          : 'پخش صدا ممکن نشد.';
      setState({ messageId, label, status: 'error', errorFa: messageFa });
    }
  }, [state.messageId, state.status]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setState({ messageId: null, label: '', status: 'idle', errorFa: null });
  }, []);

  return useMemo(() => ({ state, play, pause, stop }), [state, play, pause, stop]);
}
