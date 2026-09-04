import { useCallback, useEffect, useState } from 'react';
import type { ModuleId } from '@shared/modules';
import type { ChatSession, SessionSummary, StoredMessage } from '../types.ts';
import * as repository from '../lib/sessions.ts';

/**
 * Owns session state for the active module. Components never talk to storage
 * directly; they call these actions.
 */
export function useSessions(moduleId: ModuleId) {
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [active, setActive] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshList = useCallback(async () => {
    setSummaries(await repository.listSessions(moduleId));
  }, [moduleId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await repository.reconcileIndex();
      const list = await repository.listSessions(moduleId);
      if (cancelled) return;
      setSummaries(list);
      const first = list[0];
      const session = first ? await repository.loadSession(first.id) : null;
      if (cancelled) return;
      setActive(session);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const startSession = useCallback(async () => {
    const session = await repository.createSession(moduleId);
    setActive(session);
    await refreshList();
    return session;
  }, [moduleId, refreshList]);

  const selectSession = useCallback(async (id: string) => {
    const session = await repository.loadSession(id);
    setActive(session);
  }, []);

  const removeSession = useCallback(
    async (id: string) => {
      await repository.deleteSession(id);
      const list = await repository.listSessions(moduleId);
      setSummaries(list);
      if (active?.id === id) {
        const next = list[0];
        setActive(next ? await repository.loadSession(next.id) : null);
      }
    },
    [active?.id, moduleId],
  );

  const addMessage = useCallback(
    async (sessionId: string, message: Omit<StoredMessage, 'id' | 'createdAt'>) => {
      const updated = await repository.appendMessage(sessionId, message);
      if (updated) {
        setActive(updated);
        await refreshList();
      }
      return updated;
    },
    [refreshList],
  );

  return { summaries, active, loading, startSession, selectSession, removeSession, addMessage };
}
