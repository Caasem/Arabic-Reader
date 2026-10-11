import { readJSON, writeJSON } from '../utils/storage';

/**
 * Remembers which catalogue entries became library books, so a second visit says "In your library". The key string
 * predates the registry and must not change.
 */
const ADDED_KEY = 'browseLibrary.added';

/** Added-file key -> library book id. Empty when nothing is stored or it cannot be read. */
export function readAdded(): Record<string, string> {
  return readJSON<Record<string, string>>(ADDED_KEY) ?? {};
}

/** Without storage the only cost is losing the "In your library" hint. */
export function rememberAdded(key: string, bookId: string): void {
  writeJSON(ADDED_KEY, { ...readAdded(), [key]: bookId });
}
