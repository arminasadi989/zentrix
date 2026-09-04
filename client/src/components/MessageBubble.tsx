import type { StoredMessage } from '../types.ts';
import { formatTime } from '../lib/format.ts';
import { MarkdownLite } from './MarkdownLite.tsx';
import { ProvenanceBadge } from './ProvenanceBadge.tsx';

export function MessageBubble({
  message,
  isSpeaking,
  isLoadingAudio,
  onSpeak,
  onPause,
}: {
  message: StoredMessage;
  isSpeaking: boolean;
  isLoadingAudio: boolean;
  onSpeak: () => void;
  onPause: () => void;
}) {
  const isUser = message.role === 'user';
  return (
    <article className={`bubble ${isUser ? 'bubble--user' : 'bubble--model'}`}>
      <header className="bubble__head">
        <span className="bubble__author">{isUser ? 'شما' : 'زنتریکس'}</span>
        <span className="bubble__time">{formatTime(message.createdAt)}</span>
        {!isUser ? (
          <button
            type="button"
            className="bubble__speak"
            onClick={isSpeaking ? onPause : onSpeak}
            disabled={isLoadingAudio}
          >
            {isLoadingAudio ? 'در حال تولید صدا…' : isSpeaking ? '⏸ توقف' : '🔊 خواندن پاسخ'}
          </button>
        ) : null}
      </header>

      {message.attachments?.length ? (
        <div className="bubble__attachments">
          {message.attachments.map((attachment, index) => (
            <img
              key={`${message.id}-att-${index}`}
              src={`data:${attachment.mimeType};base64,${attachment.data}`}
              alt={attachment.name ?? 'تصویر پیوست'}
            />
          ))}
        </div>
      ) : null}

      <div className="bubble__body">
        <MarkdownLite text={message.text} />
      </div>

      {message.contextFields?.length ? (
        <details className="bubble__context">
          <summary>داده‌هایی که این پاسخ بر آن تکیه دارد</summary>
          <ul>
            {message.contextFields.map((field) => (
              <li key={`${message.id}-${field.key}`}>
                <span className="ctx__label">{field.faLabel}</span>
                <span className="ctx__value">{field.display}</span>
                <ProvenanceBadge provenance={field.provenance} />
                <span className="ctx__source">{field.source}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
