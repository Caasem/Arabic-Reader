/** The one-line hint "Show me" leaves behind, shown by TourHint (an app-level pill that outlives the screen change). */
let current: { text: string; id: number } | null = null;
let counter = 0;
const subscribers = new Set<() => void>();

export const tourHint = {
  get: () => current,
  subscribe(fn: () => void): () => void {
    subscribers.add(fn);
    return () => void subscribers.delete(fn);
  },
  show(text: string): void {
    current = { text, id: ++counter };
    subscribers.forEach((s) => s());
  },
  clear(): void {
    if (!current) return;
    current = null;
    subscribers.forEach((s) => s());
  },
};
