import { Router } from 'express';
import { MODULE_LIST, isModuleId } from '../../../shared/modules.ts';
import { buildMarketContext } from '../services/marketContext.ts';
import { buildDashboard } from '../services/dashboard.ts';
import { hasKey } from '../config/env.ts';
import { logger } from '../lib/logger.ts';

export const marketRouter = Router();

/**
 * Module metadata is served from the shared registry rather than re-declared,
 * so the client cannot drift from the server's idea of what modules exist.
 */
marketRouter.get('/modules', (_req, res) => {
  res.json({ modules: MODULE_LIST });
});

/**
 * Which providers are actually configured. The client uses this to explain a
 * missing feed honestly ("key not configured") instead of showing a generic
 * error that looks like an outage.
 */
marketRouter.get('/status', (_req, res) => {
  res.json({
    gemini: hasKey('gemini'),
    twelveData: hasKey('twelveData'),
    brsApi: hasKey('brsApi'),
  });
});

marketRouter.get('/context/:moduleId', async (req, res) => {
  const moduleId = req.params.moduleId;
  if (!isModuleId(moduleId)) {
    res.status(400).json({ error: 'unknown_module', messageFa: 'ماژول درخواستی شناخته نشد.' });
    return;
  }
  try {
    const context = await buildMarketContext(moduleId);
    res.json(context);
  } catch (error) {
    logger.error('context build failed', error instanceof Error ? error.message : error);
    res.status(502).json({
      error: 'context_failed',
      messageFa: 'واکشی داده‌های بازار برای این ماژول ناموفق بود. هیچ عدد جایگزینی نمایش داده نمی‌شود.',
    });
  }
});

marketRouter.get('/dashboard', async (req, res) => {
  const raw = typeof req.query.module === 'string' ? req.query.module : 'all';
  const filter = raw === 'all' || isModuleId(raw) ? raw : 'all';
  try {
    const dashboard = await buildDashboard(filter);
    res.json(dashboard);
  } catch (error) {
    logger.error('dashboard build failed', error instanceof Error ? error.message : error);
    res.status(502).json({
      error: 'dashboard_failed',
      messageFa: 'ساخت داشبورد ناموفق بود. لطفاً چند لحظه بعد دوباره تلاش کنید.',
    });
  }
});
