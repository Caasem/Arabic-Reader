import { libraryService } from '../library/libraryService';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import type { DeskItem } from '../studyDesk/types';
import type { BookMeta } from '../types';
import { isPassage, placeOf } from './passages';
import { closeScreen, readingBook, setThinking } from './state';
import { say } from './say';

export type OpenBook = (book: BookMeta, location?: string) => void;

/**
 * Go to where an item is: close the screen, then scroll the open book there, or open its book (PDF places are scrolled
 * to by the reader host once the pages show; text places open the book at the place). A passage opens its bar.
 */
export async function goToItem(item: DeskItem, onOpenBook?: OpenBook): Promise<void> {
  const place = placeOf(item);
  if (!place) return say('This has no place in a book');
  const select = isPassage(item) ? item.id : null;
  if (readingBook()?.id === place.bookId) {
    closeScreen();
    setThinking({ jump: place, selected: select });
    return;
  }
  const book = (await libraryService.listBooks()).find((b) => b.id === place.bookId);
  if (!book || !onOpenBook) return say('That book is not in the library any more');
  closeScreen();
  const pdf = !!parsePdfLocation(place.location);
  setThinking({ jump: pdf ? place : null, selected: select });
  onOpenBook(book, pdf ? undefined : place.location);
}

/** Open a book by id (hunting a masʾala in the book it was asked in). */
export async function openBookById(bookId: string, onOpenBook?: OpenBook): Promise<boolean> {
  if (readingBook()?.id === bookId) return true;
  const book = (await libraryService.listBooks()).find((b) => b.id === bookId);
  if (!book || !onOpenBook) return false;
  onOpenBook(book);
  return true;
}
