import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModuleId, ResponseLength } from '@shared/modules';
import { requireModuleMeta } from '@shared/modules';
import type { ChatAttachment, ChatTurn, MarketContextBlock } from '@shared/types';
import { ApiError, fetchMarketContext, sendChat } from '../lib/api.ts';
import { useSessions } from '../hooks/useSessions.ts';
import type { AudioPlayerState } from '../hooks/useAudioPlayer.ts';
import { Composer } from './Composer.tsx';
import { DataStatusStrip } from './DataStatusStrip.tsx';
import { LengthSelector } from './LengthSelector.tsx';
import { MessageBubble } from './MessageBubble.tsx';
import { SessionRail } from './SessionRail.tsx';
import { SuggestedPrompts } from './SuggestedPrompts.tsx';

export function ChatPanel({
  moduleId,
  responseLength,
  onResponseLengthChange,
  audio,
  onSpeak,
  onPauseAudio,
}: {
  moduleId: ModuleId;
  responseLength: ResponseLength;
  onResponseLengthChange: (next: ResponseLength) => void;
  audio: AudioPlayerState;
  onSpeak: (messageId: string, text: string, label: string) => void;
  onPauseAudio: () => void;
}) {
  const meta = requireModuleMeta(moduleId);
  const { summaries, active, startSession, selectSession, removeSession, addMessage } = useSessions(moduleId);
  const [context, setContext] = useState<MarketContextBlock | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    try {
      setContext(await fetchMarketContext(moduleId));
      setContextError(null);
    } catch (error) {
      setContext(null);
      setContextError(
        error instanceof ApiError ? error.messageFa : 'واکشی داده‌های بازار این ماژول ناموفق بود.',
      );
    } finally {
      setContextLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [active?.messages.length, sending]);

  const handleSend = async (text: string, attachments: ChatAttachment[]) => {
    if (sending) return;
    setSendError(null);

    const session = active ?? (await startSession());
    const afterUser = await addMessage(session.id, {
      role: 'user',
      text,
      ...(attachments.length ? { attachments } : {}),
    });
    if (!afterUser) return;

    const turns: ChatTurn[] = afterUser.messages.map((message) => ({
      role: message.role,
      text: message.text,
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    }));

    setSending(true);
    try {
      const response = await sendChat({ moduleId, responseLength, turns });
      // The context returned by the server is the exact block the model was
      // given, so it is stored alongside the answer for later inspection.
      setContext(response.context);
      await addMessage(session.id, {
        role: 'model',
        text: response.text,
        contextFields: response.context.fields,
        contextGeneratedAt: response.context.generatedAt,
      });
    } catch (error) {
      setSendError(error instanceof ApiError ? error.messageFa : 'دریافت پاسخ ناموفق بود.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat" style={{ ['--accent' as string]: meta.accent, ['--accent-soft' as string]: meta.accentSoft }}>
      <SessionRail
        summaries={summaries}
        activeId={active?.id ?? null}
        onNew={() => void startSession()}
        onSelect={(id) => void selectSession(id)}
        onDelete={(id) => void removeSession(id)}
      />

      <div className="chat__main">
        <header className="chat__head">
          <div>
            <h1>
              <span className="chat__icon">{meta.icon}</span> {meta.faName}
            </h1>
            <p>{meta.faDescription}</p>
          </div>
          <LengthSelector value={responseLength} onChange={onResponseLengthChange} />
        </header>

        <DataStatusStrip
          context={context}
          loading={contextLoading}
          errorFa={contextError}
          onRefresh={() => void loadContext()}
        />

        <div className="chat__scroll" ref={scrollRef}>
          {!active || active.messages.length === 0 ? (
            <SuggestedPrompts module={meta} onPick={(prompt) => void handleSend(prompt, [])} />
          ) : (
            active.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isSpeaking={audio.messageId === message.id && audio.status === 'playing'}
                isLoadingAudio={audio.messageId === message.id && audio.status === 'loading'}
                onSpeak={() => onSpeak(message.id, message.text, `${meta.faName} · پاسخ زنتریکس`)}
                onPause={onPauseAudio}
              />
            ))
          )}

          {sending ? (
            <div className="chat__thinking">
              زنتریکس در حال تحلیل داده‌های واکشی‌شده است…
            </div>
          ) : null}
        </div>

        {sendError ? <p className="notice notice--warn">{sendError}</p> : null}

        <Composer
          disabled={sending}
          placeholder={`سؤال خود را درباره ${meta.faName} بپرسید…`}
          onSend={(text, attachments) => void handleSend(text, attachments)}
        />
      </div>
    </div>
  );
}
