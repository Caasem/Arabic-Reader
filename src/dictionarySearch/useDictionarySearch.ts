import { useEffect, useState } from 'react';
import { dictionaryManager } from '../dictionary';
import type { DictionaryLookupResult } from '../types';

const DEBOUNCE_MS = 150;

export interface DictionarySearchState {
  loading: boolean;
  result: DictionaryLookupResult | null;
}

interface Settled {
  word: string;
  result: DictionaryLookupResult | null;
}

/** Looks the typed word up in every enabled dictionary, as-you-type. */
export function useDictionarySearch(query: string): DictionarySearchState {
  const [settled, setSettled] = useState<Settled>({ word: '', result: null });
  const word = query.trim();

  useEffect(() => {
    if (!word) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      dictionaryManager
        .lookup(word)
        .then((result) => !stale && setSettled({ word, result }))
        .catch(() => !stale && setSettled({ word, result: null }));
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [word]);

  if (!word) return { loading: false, result: null };
  // Keep showing the last result while the next one loads.
  return { loading: settled.word !== word, result: settled.result };
}
