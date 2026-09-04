import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_MODULE_ID, isModuleId, isResponseLength, type ResponseLength } from '@shared/modules';
import { fetchProviderStatus } from './lib/api.ts';
import { store } from './lib/storage.ts';
import { useAudioPlayer } from './hooks/useAudioPlayer.ts';
import { AudioPlayer } from './components/AudioPlayer.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Sidebar, type ViewId } from './components/Sidebar.tsx';
import type { UiPreferences } from './types.ts';

const PREFS_KEY = 'ui-preferences';

export default function App() {
  const [view, setView] = useState<ViewId>(DEFAULT_MODULE_ID);
  const [responseLength, setResponseLength] = useState<ResponseLength>('medium');
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const audio = useAudioPlayer();

  // Preferences are read through the storage abstraction like everything else.
  useEffect(() => {
    void (async () => {
      const prefs = await store.get<UiPreferences>(PREFS_KEY);
      if (prefs && isResponseLength(prefs.responseLength)) setResponseLength(prefs.responseLength);
      if (prefs && isModuleId(prefs.lastModuleId)) setView(prefs.lastModuleId);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const status = await fetchProviderStatus();
        setGeminiReady(status.gemini);
      } catch {
        setGeminiReady(null);
      }
    })();
  }, []);

  const persist = useCallback(
    (next: Partial<UiPreferences>) => {
      const merged: UiPreferences = {
        responseLength: next.responseLength ?? responseLength,
        lastModuleId: next.lastModuleId ?? (isModuleId(view) ? view : DEFAULT_MODULE_ID),
      };
      void store.set(PREFS_KEY, merged);
    },
    [responseLength, view],
  );

  const onSelectView = (nextView: ViewId) => {
    setView(nextView);
    if (isModuleId(nextView)) persist({ lastModuleId: nextView });
  };

  const onLengthChange = (next: ResponseLength) => {
    setResponseLength(next);
    persist({ responseLength: next });
  };

  return (
    <div className="app">
      <Sidebar view={view} onSelect={onSelectView} geminiReady={geminiReady} />
      <main className="app__main">
        {view === 'dashboard' ? (
          <Dashboard />
        ) : (
          <ChatPanel
            key={view}
            moduleId={view}
            responseLength={responseLength}
            onResponseLengthChange={onLengthChange}
            audio={audio.state}
            onSpeak={(id, text, label) => void audio.play(id, text, label)}
            onPauseAudio={audio.pause}
          />
        )}
      </main>
      <AudioPlayer state={audio.state} onPause={audio.pause} onStop={audio.stop} />
    </div>
  );
}
