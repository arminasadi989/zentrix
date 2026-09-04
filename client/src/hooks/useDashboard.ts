import { useCallback, useEffect, useState } from 'react';
import type { ModuleId } from '@shared/modules';
import type { DashboardResponse } from '@shared/types';
import { ApiError, fetchDashboard } from '../lib/api.ts';

/**
 * Polls the dashboard on a deliberately relaxed interval. The server caches
 * upstream responses, so this interval controls UI freshness rather than
 * upstream request volume - but keeping it slow is still the polite default for
 * free-tier providers.
 */
const REFRESH_MS = 60_000;

export function useDashboard(filter: ModuleId | 'all', enabled: boolean) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [errorFa, setErrorFa] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchDashboard(filter));
      setErrorFa(null);
    } catch (error) {
      setErrorFa(error instanceof ApiError ? error.messageFa : 'دریافت داده‌های داشبورد ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  return { data, errorFa, loading, reload: load };
}
