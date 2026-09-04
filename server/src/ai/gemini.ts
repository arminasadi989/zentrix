import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.ts';
import { logger } from '../lib/logger.ts';
import { CHAT_MODEL, CHAT_TEMPERATURE, TTS_MODEL, TTS_MODEL_FALLBACK, TTS_PCM, TTS_VOICE } from './models.ts';
import type { ChatAttachment, ChatTurn } from '../../../shared/types.ts';

/**
 * The ONLY place the Gemini SDK is instantiated, and it lives server-side.
 * `GEMINI_API_KEY` is read from `process.env` here and nowhere else, so no key
 * can reach the client bundle (Rule 8 / Definition of Done item 1).
 */
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not configured on the server');
    this.name = 'GeminiNotConfiguredError';
  }
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.geminiApiKey) throw new GeminiNotConfiguredError();
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);

function attachmentToPart(attachment: ChatAttachment): Part | null {
  if (!ALLOWED_IMAGE_TYPES.has(attachment.mimeType)) return null;
  // Base64 expands by 4/3; reject oversized payloads before they hit the API.
  if (attachment.data.length * 0.75 > MAX_ATTACHMENT_BYTES) return null;
  return { inlineData: { mimeType: attachment.mimeType, data: attachment.data } };
}

/**
 * Maps our stored conversation onto Gemini's `contents` format so multi-turn
 * context is preserved, with image attachments as `inlineData` parts alongside
 * the text of the same turn.
 */
export function toGeminiContents(turns: readonly ChatTurn[]): Array<{ role: 'user' | 'model'; parts: Part[] }> {
  return turns
    .map((turn) => {
      const parts: Part[] = [];
      if (turn.text.trim()) parts.push({ text: turn.text });
      for (const attachment of turn.attachments ?? []) {
        const part = attachmentToPart(attachment);
        if (part) parts.push(part);
      }
      return { role: turn.role, parts };
    })
    .filter((content) => content.parts.length > 0);
}

export async function generateAnalysis(args: {
  systemInstruction: string;
  turns: readonly ChatTurn[];
}): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: toGeminiContents(args.turns),
    config: {
      systemInstruction: args.systemInstruction,
      temperature: CHAT_TEMPERATURE,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    // A blocked or empty candidate must surface as an error, not as an empty
    // assistant bubble that looks like the model had nothing to say.
    throw new Error('Gemini returned no text candidate (possibly blocked or truncated)');
  }
  return text;
}

/** Minimal RIFF/WAVE header so the browser can play raw PCM from the TTS model. */
function pcmToWav(pcm: Buffer): Buffer {
  const { sampleRate, channels, bitsPerSample } = TTS_PCM;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function requestSpeech(model: string, text: string): Promise<Buffer | null> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: `این متن را با لحنی آرام و حرفه‌ای بخوان:\n\n${text}` }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!inline?.data) return null;
  return pcmToWav(Buffer.from(inline.data, 'base64'));
}

/** TTS input is capped: the models have a 32k-token session limit. */
const MAX_TTS_CHARS = 6_000;

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const trimmed = text.slice(0, MAX_TTS_CHARS);
  try {
    const audio = await requestSpeech(TTS_MODEL, trimmed);
    if (audio) return audio;
    throw new Error('primary TTS model returned no audio part');
  } catch (error) {
    logger.warn(`TTS primary model failed, trying fallback: ${error instanceof Error ? error.message : 'unknown'}`);
    const audio = await requestSpeech(TTS_MODEL_FALLBACK, trimmed);
    if (!audio) throw new Error('no TTS model returned audio for this text');
    return audio;
  }
}

export { CHAT_MODEL };
