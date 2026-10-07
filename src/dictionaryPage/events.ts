import type { BookMeta } from '../types';

/** What to show: a word, from a book (or none), optionally on one dictionary's tab. */
export interface DictionaryPageRequest {
  word: string;
  book?: BookMeta;
  providerId?: string;
}

const EVENT = 'arabic-reader:open-dictionary-page';

/** Asks App to show the full-page dictionary; readers and Alt+D call this without importing App. */
export function openDictionaryPage(request: DictionaryPageRequest): void {
  window.dispatchEvent(new CustomEvent<DictionaryPageRequest>(EVENT, { detail: request }));
}

export function onOpenDictionaryPage(listener: (request: DictionaryPageRequest) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<DictionaryPageRequest>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
