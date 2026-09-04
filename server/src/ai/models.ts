/**
 * Model identifiers, verified against Google's published model list at build
 * time rather than guessed.
 *
 * - `gemini-3.5-flash` is a stable, generally-available model (GA since
 *   2026-05-19) and is the model this app is specified to use for analysis.
 * - TTS is a separate model family: `generateContent` with an AUDIO response
 *   modality is only supported by the *-tts models, so text-to-speech cannot
 *   reuse the chat model. `gemini-3.1-flash-tts-preview` is the current
 *   TTS-capable model; `gemini-2.5-flash-preview-tts` remains as a documented
 *   fallback if the preview model is unavailable on a given key.
 */
export const CHAT_MODEL = 'gemini-3.5-flash';

export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const TTS_MODEL_FALLBACK = 'gemini-2.5-flash-preview-tts';

/**
 * Gemini 3.x models enforce parameter conventions more strictly than 2.x and
 * Google's guidance is to leave sampling temperature at its default of 1.0 for
 * this family; lowering it degrades reasoning quality on analytical tasks. The
 * value is kept as an explicit named constant rather than hidden, so it can be
 * tuned deliberately.
 */
export const CHAT_TEMPERATURE = 1;

/** Prebuilt voice used for read-aloud. Persian output is supported. */
export const TTS_VOICE = 'Kore';

/** Raw PCM parameters the TTS models return; needed to build a WAV container. */
export const TTS_PCM = { sampleRate: 24_000, channels: 1, bitsPerSample: 16 } as const;
