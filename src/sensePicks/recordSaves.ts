import type { BookMeta, DictionaryEntry, DictionaryLookupResult } from '../types';
import { persistenceService } from '../persistence/db';
import { bookKey, entryKey, lemmaKey, normalizeText, senseKey } from './keys';
import { entryMatchingMeaning, senseContainingWords } from './matching';
import { applyPicks } from './rank';

/**
 * The reader's own saves, kept as picks (docs/specs/crowd-sense-ranking.md, section 10.5). Nothing here is
 * drawn anywhere. Every function swallows its own errors: recording a pick must never get in the way of saving a word.
 */
type BookRef = Pick<BookMeta, 'title' | 'author' | 'language'>;

function context(book: BookRef, word: string, result: DictionaryLookupResult): { bookKey: string; lemmaKey: string } | null {
  if (!book.title) return null;
  const morphology = result.morphology?.[0];
  return { bookKey: bookKey(book), lemmaKey: lemmaKey(morphology?.lemma ?? word, morphology?.pos) };
}

async function guarded(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch {
    // A pick is a convenience; losing one is fine.
  }
}

/** The round + on one entry. */
export function recordEntrySave(book: BookRef, word: string, result: DictionaryLookupResult | null, entry: DictionaryEntry): Promise<void> {
  return guarded(async () => {
    const ctx = result && context(book, word, result);
    if (!ctx) return;
    await persistenceService.setSensePick({ ...ctx, providerId: entry.providerId, entryKey: entryKey(entry), source: 'entry' });
  });
}

/** Saving picked words from one entry: names the meaning too when the words sit inside exactly one. */
export function recordSelectionSave(
  book: BookRef,
  word: string,
  result: DictionaryLookupResult | null,
  entry: DictionaryEntry,
  selected: string,
): Promise<void> {
  return guarded(async () => {
    const ctx = result && context(book, word, result);
    if (!ctx) return;
    const sense = senseContainingWords(entry, selected);
    await persistenceService.setSensePick({
      ...ctx,
      providerId: entry.providerId,
      entryKey: entryKey(entry),
      senseKey: sense ? senseKey(entry.providerId, entry.headword, sense) : null,
      source: 'selection',
    });
  });
}

/**
 * Editing the card's meaning and saving. Counts only when the reader changed the text the app prefilled,
 * because the prefilled one is the app's choice, not theirs.
 */
export function recordEditSave(
  book: BookRef,
  word: string,
  result: DictionaryLookupResult | null,
  prefilled: string,
  meaning: string,
): Promise<void> {
  return guarded(async () => {
    const ctx = result && context(book, word, result);
    if (!ctx || normalizeText(meaning) === normalizeText(prefilled)) return;
    const match = entryMatchingMeaning(result.entries, meaning);
    if (!match) return;
    await persistenceService.setSensePick({
      ...ctx,
      providerId: match.entry.providerId,
      entryKey: entryKey(match.entry),
      senseKey: match.sense ? senseKey(match.entry.providerId, match.entry.headword, match.sense) : null,
      source: 'edit',
    });
  });
}

/** Removing the saved word takes back every pick the reader made for it in this book. */
export function forgetWordPicks(book: BookRef, word: string, result: DictionaryLookupResult | null): Promise<void> {
  return guarded(async () => {
    const ctx = result && context(book, word, result);
    if (ctx) await persistenceService.clearWordPicks(ctx.bookKey, ctx.lemmaKey);
  });
}

/** The lookup with the entries the reader saved for this word in this book moved to the top of their dictionary. */
export async function rankByPicks(book: BookRef, word: string, result: DictionaryLookupResult): Promise<DictionaryLookupResult> {
  try {
    const ctx = context(book, word, result);
    if (!ctx) return result;
    const rows = await persistenceService.getSensePicks(ctx.bookKey, ctx.lemmaKey);
    const ranked = applyPicks(result.entries, rows);
    return ranked.entries === result.entries ? result : { ...result, entries: ranked.entries };
  } catch {
    return result;
  }
}
