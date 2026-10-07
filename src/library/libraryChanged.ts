/**
 * "The set of books, or which of them have a file here, changed behind the Library's back": the Storage screen
 * removing a file or a book, an import restoring books. The Library stays mounted under Settings, so it listens
 * and reloads. Carries no data; the Library asks the database again.
 */
const listeners = new Set<() => void>();

export function onLibraryChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function notifyLibraryChanged(): void {
  listeners.forEach((listener) => listener());
}
