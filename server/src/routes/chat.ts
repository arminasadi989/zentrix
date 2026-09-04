import { Router } from 'express';
import { isModuleId, isResponseLength } from '../../../shared/modules.ts';
import type { ChatRequestBody, ChatResponseBody, ChatTurn } from '../../../shared/types.ts';
import { CHAT_MODEL, GeminiNotConfiguredError, generateAnalysis } from '../ai/gemini.ts';
import { composeSystemInstruction } from '../prompts/index.ts';
import { buildMarketContext } from '../services/marketContext.ts';
import { logger } from '../lib/logger.ts';

export const chatRouter = Router();

const MAX_TURNS = 40;
const MAX_TEXT_CHARS = 8_000;

function parseBody(body: unknown): ChatRequestBody | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'بدنه درخواست نامعتبر است.' };
  const candidate = body as Partial<ChatRequestBody>;
  if (!isModuleId(candidate.moduleId)) return { error: 'ماژول درخواستی شناخته نشد.' };
  if (!isResponseLength(candidate.responseLength)) return { error: 'طول پاسخ انتخاب‌شده نامعتبر است.' };
  if (!Array.isArray(candidate.turns) || candidate.turns.length === 0) {
    return { error: 'گفت‌وگو خالی است.' };
  }

  const turns: ChatTurn[] = [];
  for (const raw of candidate.turns.slice(-MAX_TURNS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const turn = raw as Partial<ChatTurn>;
    if (turn.role !== 'user' && turn.role !== 'model') continue;
    const text = typeof turn.text === 'string' ? turn.text.slice(0, MAX_TEXT_CHARS) : '';
    const attachments = Array.isArray(turn.attachments)
      ? turn.attachments.filter(
          (a) => typeof a?.data === 'string' && typeof a?.mimeType === 'string' && a.data.length > 0,
        )
      : undefined;
    if (!text && !attachments?.length) continue;
    turns.push({ role: turn.role, text, ...(attachments?.length ? { attachments } : {}) });
  }

  if (!turns.length) return { error: 'پیام قابل پردازشی یافت نشد.' };
  const last = turns[turns.length - 1];
  if (!last || last.role !== 'user') return { error: 'آخرین پیام باید از سمت کاربر باشد.' };

  return { moduleId: candidate.moduleId, responseLength: candidate.responseLength, turns };
}

chatRouter.post('/', async (req, res) => {
  const parsed = parseBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: 'invalid_request', messageFa: parsed.error });
    return;
  }

  try {
    // The live-data block is fetched immediately before the model call, so what
    // the model is told is current genuinely is current for this request.
    const context = await buildMarketContext(parsed.moduleId);
    const systemInstruction = composeSystemInstruction({
      moduleId: parsed.moduleId,
      context,
      responseLength: parsed.responseLength,
    });

    const text = await generateAnalysis({ systemInstruction, turns: parsed.turns });
    const payload: ChatResponseBody = { text, moduleId: parsed.moduleId, context, model: CHAT_MODEL };
    res.json(payload);
  } catch (error) {
    if (error instanceof GeminiNotConfiguredError) {
      res.status(503).json({
        error: 'gemini_not_configured',
        messageFa: 'کلید Gemini روی سرور تنظیم نشده است. فایل .env را کامل کنید.',
      });
      return;
    }
    logger.error('chat failed', error instanceof Error ? error.message : error);
    res.status(502).json({
      error: 'chat_failed',
      messageFa: 'دریافت پاسخ از مدل ناموفق بود. لطفاً دوباره تلاش کنید.',
    });
  }
});
