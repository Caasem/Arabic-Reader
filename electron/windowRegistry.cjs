// The list of open windows and the book each shows, run in Electron's main process only. main.cjs owns the real
// windows; this keeps the plain facts about them so they can be unit-tested, and tells listeners when they change.
// Each entry: { id, kind: 'main' | 'light', bookId, title }.

function createWindowRegistry() {
  /** id -> entry, in the order the windows were opened. */
  const entries = new Map();
  const listeners = new Set();
  const list = () => [...entries.values()].map((entry) => ({ ...entry }));
  const changed = () => {
    const snapshot = list();
    for (const listener of listeners) listener(snapshot);
  };

  return {
    list,
    add(id, kind, title) {
      entries.set(id, { id, kind, bookId: null, title });
      changed();
    },
    remove(id) {
      if (entries.delete(id)) changed();
    },
    /** What a window reports it is showing. */
    setBook(id, bookId, title) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.bookId = bookId || null;
      if (title) entry.title = title;
      changed();
    },
    /** Another window (not `exceptId`) that shows this book, or null. */
    findByBook(bookId, exceptId) {
      if (!bookId) return null;
      for (const entry of entries.values()) if (entry.id !== exceptId && entry.kind === 'light' && entry.bookId === bookId) return { ...entry };
      return null;
    },
    mainId() {
      for (const entry of entries.values()) if (entry.kind === 'main') return entry.id;
      return null;
    },
    count: () => entries.size,
    lightCount() {
      let n = 0;
      for (const entry of entries.values()) if (entry.kind === 'light') n++;
      return n;
    },
    /** Calls back with the new list whenever it changes. Returns the unsubscribe. */
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

module.exports = { createWindowRegistry };
