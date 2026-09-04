import { Router } from 'express';
import { TTL, marketCache } from '../lib/cache.ts';
import { GeminiNotConfiguredError, synthesizeSpeech } from '../ai/gemini.ts';
import { logger } from '../lib/logger.ts';
import { createHash } from 'node:crypto';

export const ttsRouter = Router();

/**
 * Read-aloud endpoint. Audio is cached by a hash of the text for an hour so the
 * same assistant message is never re-synthesised (the client also caches the
 * resulting blob URL per message id).
 */
ttsRouter.post('/', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'invalid_request', messageFa: 'متنی برای خواندن ارسال نشده است.' });
    return;
  }

  const key = `tts:${createHash('sha256').update(text).digest('hex')}`;
  try {
    const { value: audio } = await marketCache.wrap(key, TTL.tts, async () => {
      const buffer = await synthesizeSpeech(text);
      return buffer.toString('base64');
    });
    const wav = Buffer.from(audio, 'base64');
    res.setHeader('content-type', 'audio/wav');
    res.setHeader('cache-control', 'private, max-age=3600');
    res.send(wav);
  } catch (error) {
    if (error instanceof GeminiNotConfiguredError) {
      res.status(503).json({ error: 'gemini_not_configured', messageFa: 'کلید Gemini روی سرور تنظیم نشده است.' });
      return;
    }
    logger.error('tts failed', error instanceof Error ? error.message : error);
    res.status(502).json({ error: 'tts_failed', messageFa: 'تولید صدا برای این پیام ممکن نشد.' });
  }
});
