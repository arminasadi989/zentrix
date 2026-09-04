import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Secrets are loaded from the repo-root `.env` exactly once, here, and are only
 * ever read through this module (Rule 8). Nothing in this file - or anything
 * that imports it - is reachable from the client bundle: the Vite app talks to
 * this server over `/api` and never sees a key.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env') });

function optional(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  // Treat the placeholder values from .env.example as "not configured" so the
  // app degrades honestly instead of firing doomed requests.
  if (!trimmed || trimmed.startsWith('your_')) return null;
  return trimmed;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  geminiApiKey: optional('GEMINI_API_KEY'),
  twelveDataApiKey: optional('TWELVE_DATA_API_KEY'),
  brsApiKey: optional('BRSAPI_KEY'),
} as const;

export type ProviderKeyName = 'gemini' | 'twelveData' | 'brsApi';

export function hasKey(name: ProviderKeyName): boolean {
  switch (name) {
    case 'gemini':
      return env.geminiApiKey !== null;
    case 'twelveData':
      return env.twelveDataApiKey !== null;
    case 'brsApi':
      return env.brsApiKey !== null;
    default: {
      // Exhaustiveness guard (Rule 2): adding a provider without handling it
      // here fails the build rather than silently returning false.
      const exhaustive: never = name;
      throw new Error(`Unhandled provider key: ${String(exhaustive)}`);
    }
  }
}
