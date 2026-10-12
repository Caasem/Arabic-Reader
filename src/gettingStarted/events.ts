/**
 * The one-line way for any part of the app to say "the person just did this". Kept free of imports so a call site is
 * `tourEvents.emit('highlight')` and nothing more. The checklist (store.ts) listens from app start.
 */
type Listener = (id: string) => void;
const listeners = new Set<Listener>();

export const tourEvents = {
  emit(id: string): void {
    for (const l of [...listeners]) {
      try {
        l(id);
      } catch {
        // a listener never breaks the action that emitted
      }
    }
  },
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
