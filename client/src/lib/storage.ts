/**
 * Storage abstraction.
 *
 * Consuming code never touches `localStorage` directly and never sees a
 * localStorage-specific detail (string serialisation, key namespacing, quota
 * errors). The interface is async on purpose: swapping this for an HTTP-backed
 * or IndexedDB store later requires no change to business logic or components.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

const NAMESPACE = 'zentrix:v1:';

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

class LocalStorageStore implements KeyValueStore {
  private readonly memoryFallback = new Map<string, string>();

  /** Private browsing modes can throw on access; degrade to memory silently. */
  private get backing(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> | null {
    try {
      const probe = '__zentrix_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.backing ? this.backing.getItem(NAMESPACE + key) : (this.memoryFallback.get(key) ?? null);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt entry: drop it rather than crashing the app on every load.
      await this.delete(key);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify(value);
    const backing = this.backing;
    if (!backing) {
      this.memoryFallback.set(key, serialized);
      return;
    }
    try {
      backing.setItem(NAMESPACE + key, serialized);
    } catch (error) {
      throw new StorageQuotaError(
        error instanceof Error ? error.message : 'could not persist value to local storage',
      );
    }
  }

  async list(prefix: string): Promise<string[]> {
    const backing = this.backing;
    const full = NAMESPACE + prefix;
    if (!backing) {
      return [...this.memoryFallback.keys()].filter((k) => k.startsWith(prefix));
    }
    const keys: string[] = [];
    for (let i = 0; i < backing.length; i += 1) {
      const key = backing.key(i);
      if (key && key.startsWith(full)) keys.push(key.slice(NAMESPACE.length));
    }
    return keys;
  }

  async delete(key: string): Promise<void> {
    const backing = this.backing;
    if (!backing) {
      this.memoryFallback.delete(key);
      return;
    }
    backing.removeItem(NAMESPACE + key);
  }
}

/** The single store instance the app uses. Swap this line to change backends. */
export const store: KeyValueStore = new LocalStorageStore();
