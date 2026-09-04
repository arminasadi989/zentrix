import { useRef, useState } from 'react';
import type { ChatAttachment } from '@shared/types';
import { fileToBase64 } from '../lib/format.ts';

const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function Composer({
  disabled,
  placeholder,
  onSend,
}: {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string, attachments: ChatAttachment[]) => void;
}) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [errorFa, setErrorFa] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
    setErrorFa(null);
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const accepted: ChatAttachment[] = [];
    for (const file of Array.from(files).slice(0, MAX_ATTACHMENTS - attachments.length)) {
      if (!file.type.startsWith('image/')) {
        setErrorFa('فقط تصویر پشتیبانی می‌شود (مثلاً اسکرین‌شات نمودار).');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setErrorFa('حجم تصویر باید کمتر از ۵ مگابایت باشد.');
        continue;
      }
      const encoded = await fileToBase64(file);
      accepted.push(encoded);
    }
    if (accepted.length) {
      setAttachments((prev) => [...prev, ...accepted].slice(0, MAX_ATTACHMENTS));
      setErrorFa(null);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="composer">
      {attachments.length ? (
        <div className="composer__attachments">
          {attachments.map((attachment, index) => (
            <span key={`${attachment.name ?? 'img'}-${index}`} className="composer__chip">
              {attachment.name ?? 'تصویر'}
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                aria-label="حذف پیوست"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {errorFa ? <p className="composer__error">{errorFa}</p> : null}

      <div className="composer__row">
        <button
          type="button"
          className="composer__attach"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
          title="پیوست تصویر نمودار"
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(event) => void onPickFiles(event.target.files)}
        />
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!disabled) submit();
            }
          }}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
        />
        <button type="button" className="composer__send" onClick={submit} disabled={disabled}>
          ارسال
        </button>
      </div>
      <p className="composer__hint">Enter برای ارسال · Shift+Enter برای خط جدید</p>
    </div>
  );
}
