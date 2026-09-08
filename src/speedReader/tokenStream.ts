import ePub from 'epubjs';
import type { NavItem } from 'epubjs';
import { persistenceService } from '../persistence/db';
import { tokenize } from '../reader/tokenizer/arabicTokenizer';
import type { RsvpChapter, RsvpToken } from '../types';

/**
 * Builds the flat, book-order RSVP token stream a Speed Reader session
 * plays through — one entry per whitespace-delimited "word" (kept together
 * with any punctuation directly attached to it in the source, per the RSVP
 * display spec), across every section in the book's spine.
 *
 * Deliberately does *not* go through EpubService/a rendered epub.js
 * `Rendition` — RSVP only ever needs plain text in reading order, not a
 * rendered page, so this opens the epub.js `Book` object directly (same
 * `ePub(buf); await book.ready` epub.js entry point `libraryService` and
 * `EpubService` both use) without ever calling `renderTo()`, and walks
 * `book.spine.spineItems` + `section.load()` the same way
 * `vocabRarity/bookVocabIndex.ts` already does to build its word index —
 * this is the second, established place in the app that talks to a raw
 * epub.js `Book` handle outside `EpubService.ts` for exactly that reason.
 */

export interface TokenStream {
  tokens: RsvpToken[];
  chapters: RsvpChapter[];
}

const cache = new Map<string, Promise<TokenStream>>();

export function invalidateTokenStream(bookId: string): void {
  cache.delete(bookId);
}

export function getTokenStream(bookId: string): Promise<TokenStream> {
  const existing = cache.get(bookId);
  if (existing) return existing;
  const promise = buildTokenStream(bookId);
  cache.set(bookId, promise);
  promise.catch(() => cache.delete(bookId));
  return promise;
}

async function buildTokenStream(bookId: string): Promise<TokenStream> {
  const file = await persistenceService.getBookFile(bookId);
  if (!file) throw new Error('Could not read this book file.');
  const buf = await file.arrayBuffer();
  const book = ePub(buf);
  try {
    await book.ready;

    const nav = await book.loaded.navigation;
    const toc = (nav.toc || []).map(mapNavItem);

    const tokens: RsvpToken[] = [];
    const chapters: RsvpChapter[] = [];

    const spineItems = (
      book.spine as unknown as {
        spineItems: Array<{ href: string; load: (loader: unknown) => Promise<unknown> }>;
      }
    ).spineItems;

    for (const section of spineItems) {
      const startIndex = tokens.length;
      let loaded: Element | Document | null = null;
      try {
        // See bookVocabIndex.ts for why the cast: Section.load() actually
        // resolves with the section's root Element (not a Document) despite
        // its own JSDoc, so `.textContent` on it (or its `.body`, when
        // present) is the reliable way to get the section's full text.
        loaded = (await section.load(book.load.bind(book))) as unknown as Element | Document;
      } catch {
        continue; // one unreadable section shouldn't abort the whole stream
      }
      if (!loaded) continue;

      const bodyEl = (loaded as Document).body ?? (loaded as Element).querySelector?.('body') ?? loaded;
      const text = bodyEl?.textContent || '';

      for (const chunk of text.split(/\s+/)) {
        if (!chunk) continue;
        const subTokens = tokenize(chunk);
        const arabicRun = subTokens.find((t) => t.isArabic);
        tokens.push({
          display: chunk,
          lookupWord: arabicRun?.text,
          sectionHref: section.href,
          globalIndex: tokens.length,
        });
      }

      try {
        (section as unknown as { unload?: () => void }).unload?.();
      } catch {
        // best-effort memory cleanup only
      }

      chapters.push({
        href: section.href,
        label: findTocLabel(toc, section.href) ?? section.href,
        startIndex,
        endIndex: tokens.length,
      });
    }

    return { tokens, chapters };
  } finally {
    book.destroy();
  }
}

interface TocEntry {
  href: string;
  label: string;
  subitems?: TocEntry[];
}

function mapNavItem(item: NavItem): TocEntry {
  return {
    href: item.href,
    label: (item.label || '').trim(),
    subitems: item.subitems?.length ? item.subitems.map(mapNavItem) : undefined,
  };
}

function findTocLabel(toc: TocEntry[], href: string): string | undefined {
  const clean = href.split('#')[0];
  const walk = (items: TocEntry[]): string | undefined => {
    for (const item of items) {
      if (item.href.split('#')[0] === clean) return item.label;
      if (item.subitems) {
        const found = walk(item.subitems);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(toc);
}
