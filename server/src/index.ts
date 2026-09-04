import express from 'express';
import cors from 'cors';
import { env } from './config/env.ts';
import { logger } from './lib/logger.ts';
import { chatRouter } from './routes/chat.ts';
import { marketRouter } from './routes/market.ts';
import { ttsRouter } from './routes/tts.ts';

/**
 * Zentrix API server.
 *
 * Everything that needs a secret happens here: the Gemini calls and the keyed
 * market-data providers. The Vite client only ever talks to `/api/*`, which is
 * what keeps `GEMINI_API_KEY`, `TWELVE_DATA_API_KEY` and `BRSAPI_KEY` out of
 * the browser bundle and out of the network tab.
 */
const app = express();

app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true }));
// Image attachments are base64 in the JSON body, hence the raised limit.
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
});

app.use('/api/market', marketRouter);
app.use('/api/chat', chatRouter);
app.use('/api/tts', ttsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found', messageFa: 'مسیر درخواستی وجود ندارد.' });
});

// Final safety net: never leak a stack trace (which can echo a URL containing a
// key) to the client.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('unhandled error', error instanceof Error ? error.message : error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_error', messageFa: 'خطای غیرمنتظره روی سرور رخ داد.' });
});

app.listen(env.port, () => {
  logger.info(`API listening on http://localhost:${env.port}`);
  const missing = [
    env.geminiApiKey ? null : 'GEMINI_API_KEY',
    env.twelveDataApiKey ? null : 'TWELVE_DATA_API_KEY',
    env.brsApiKey ? null : 'BRSAPI_KEY',
  ].filter((name): name is string => name !== null);
  if (missing.length) {
    logger.warn(`not configured: ${missing.join(', ')} - the affected features will report themselves unavailable`);
  }
});
