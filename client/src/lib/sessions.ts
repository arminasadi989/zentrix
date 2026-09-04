import type { ModuleId } from '@shared/modules';
import { store } from './storage.ts';
import type { ChatSession, SessionSummary, StoredMessage } from '../types.ts';

/**
 * Session repository built on the storage abstraction. All persistence rules
 * (key layout, index maintenance, title derivation) live here so components
 * only ever deal with domain objects.
 */
const SESSION_PREFIX = 'session:';
const INDEX_KEY = 'session-index';

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readIndex(): Promise<SessionSummary[]> {
  return (await store.get<SessionSummary[]>(INDEX_KEY)) ?? [];
}

async function writeIndex(index: SessionSummary[]): Promise<void> {
  await store.set(INDEX_KEY, index);
}

function summarize(session: ChatSession): SessionSummary {
  return {
    id: session.id,
    moduleId: session.moduleId,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}

/** First user message, trimmed, is the session title - matching user intuition. */
function deriveTitle(session: ChatSession): string {
  const firstUser = session.messages.find((m) => m.role === 'user' && m.text.trim());
  if (!firstUser) return 'گفت‌وگوی جدید';
  const text = firstUser.text.trim().replace(/\s+/g, ' ');
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

export async function listSessions(moduleId: ModuleId): Promise<SessionSummary[]> {
  const index = await readIndex();
  return index
    .filter((entry) => entry.moduleId === moduleId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadSession(id: string): Promise<ChatSession | null> {
  return store.get<ChatSession>(sessionKey(id));
}

export async function createSession(moduleId: ModuleId): Promise<ChatSession> {
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: newId(),
    moduleId,
    title: 'گفت‌وگوی جدید',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await store.set(sessionKey(session.id), session);
  await writeIndex([summarize(session), ...(await readIndex())]);
  return session;
}

export async function appendMessage(
  sessionId: string,
  message: Omit<StoredMessage, 'id' | 'createdAt'> & Partial<Pick<StoredMessage, 'id' | 'createdAt'>>,
): Promise<ChatSession | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;

  const stored: StoredMessage = {
    id: message.id ?? newId(),
    createdAt: message.createdAt ?? new Date().toISOString(),
    role: message.role,
    text: message.text,
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    ...(message.contextFields ? { contextFields: message.contextFields } : {}),
    ...(message.contextGeneratedAt ? { contextGeneratedAt: message.contextGeneratedAt } : {}),
  };

  const updated: ChatSession = {
    ...session,
    messages: [...session.messages, stored],
    updatedAt: stored.createdAt,
  };
  updated.title = deriveTitle(updated);

  await store.set(sessionKey(updated.id), updated);
  const index = await readIndex();
  const withoutSelf = index.filter((entry) => entry.id !== updated.id);
  await writeIndex([summarize(updated), ...withoutSelf]);
  return updated;
}

export async function deleteSession(id: string): Promise<void> {
  await store.delete(sessionKey(id));
  await writeIndex((await readIndex()).filter((entry) => entry.id !== id));
}

/** Removes index entries whose payload has gone missing (e.g. cleared storage). */
export async function reconcileIndex(): Promise<void> {
  const index = await readIndex();
  const existing = new Set((await store.list(SESSION_PREFIX)).map((k) => k.slice(SESSION_PREFIX.length)));
  const cleaned = index.filter((entry) => existing.has(entry.id));
  if (cleaned.length !== index.length) await writeIndex(cleaned);
}
