export function createRequestCache<T>(limit = 256, now = Date.now) {
  const entries = new Map<string, { value?: T; expiresAt: number; pending?: Promise<T> }>();
  return {
    get(key: string, ttlMs: number, load: () => Promise<T>, cacheable: (value: T) => boolean = () => true): Promise<T> {
      const existing = entries.get(key);
      if (existing) {
        entries.delete(key);
        entries.set(key, existing);
        if (existing.pending) return existing.pending;
        if (existing.expiresAt > now()) return Promise.resolve(existing.value as T);
      }
      const entry: { value?: T; expiresAt: number; pending?: Promise<T> } = { expiresAt: 0 };
      const pending = Promise.resolve().then(load).then((value) => {
        entry.value = value;
        entry.expiresAt = cacheable(value) ? now() + ttlMs : 0;
        return value;
      }).finally(() => {
        delete entry.pending;
        if (entry.expiresAt <= now() && entries.get(key) === entry) entries.delete(key);
        for (const [oldKey, oldEntry] of entries) {
          if (entries.size <= limit) break;
          if (!oldEntry.pending) entries.delete(oldKey);
        }
      });
      entry.pending = pending;
      entries.set(key, entry);
      return pending;
    },
  };
}
