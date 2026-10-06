/**
 * "A local change was saved and captured for sync." The write layer raises it
 * after the transaction commits; the sync scheduler listens and starts its
 * debounce. It carries no data: the outbox is the source of truth.
 */
const listeners = new Set<() => void>();

export function onLocalSyncChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function signalLocalSyncChange(): void {
  listeners.forEach((listener) => listener());
}
