import ePub from 'epubjs';
import { persistenceService } from '../persistence';
import { tokenize } from '../reader/tokenizer/arabicTokenizer';
import { findTocLabel, forEachSpineSection, mapNavItems, sectionBody } from '../reader/epub/epubInternals';
import type { RsvpChapter, RsvpToken } from '../types';

/**
 * The flat, book-order RSVP token stream: one token per whitespace-delimited
 * chunk (punctuation kept attached), across every spine section. Needs only
 * plain text, so the book is parsed without rendering anything.
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
  const book = ePub(await file.arrayBuffer());
  try {
    await book.ready;
    const toc = mapNavItems((await book.loaded.navigation).toc);
    const tokens: RsvpToken[] = [];
    const chapters: RsvpChapter[] = [];

    await forEachSpineSection(book, (section, doc) => {
      const startIndex = tokens.length;
      for (const chunk of (sectionBody(doc)?.textContent ?? '').split(/\s+/)) {
        if (!chunk) continue;
        tokens.push({
          display: chunk,
          lookupWord: tokenize(chunk).find((t) => t.isArabic)?.text,
          sectionHref: section.href,
          globalIndex: tokens.length,
        });
      }
      chapters.push({
        href: section.href,
        label: findTocLabel(toc, section.href) ?? section.href,
        startIndex,
        endIndex: tokens.length,
      });
    });

    return { tokens, chapters };
  } finally {
    book.destroy();
  }
}
