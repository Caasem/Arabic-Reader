import { persistenceService } from '../persistence';
import { getFilesBridge } from '../sync/desktopBridge';
import type { BookMeta } from '../types';
import { notifyLibraryChanged } from '../library/libraryChanged';

/** The hash of the file a book opened in place stands for: a PDF's `pdf.originalHash`, an EPUB's `fileHash`. */
export function inPlaceHash(book: BookMeta): string | undefined {
  return book.pdf?.originalHash ?? book.fileHash;
}

/**
 * Gives a book opened in place a copy in the library: the file goes into the BlobStore where a library book's file
 * lives (a PDF in the `pdf` namespace, an EPUB in `book`), and the `inPlace` mark goes. The record and everything on
 * it stay. A PDF keeps its `reflow` ('skipped': pages only).
 */
export async function promoteInPlace(book: BookMeta, file: Blob): Promise<BookMeta> {
  if (book.pdf) await persistenceService.savePdfOriginal(book.id, file, { pages: book.pdf.pages, reflow: book.pdf.reflow });
  else await persistenceService.saveBookFile(book.id, file);
  await persistenceService.clearBookInPlace(book.id);
  notifyLibraryChanged();
  return (await persistenceService.getBook(book.id)) ?? book;
}

/** "Add to library" for a book opened in place: reads the file where it sits, then copies it in. */
export async function addToLibrary(book: BookMeta): Promise<BookMeta> {
  const hash = inPlaceHash(book);
  const bytes = hash ? await getFilesBridge()?.readByHash(hash) : null;
  if (!bytes) throw new Error("The file isn't where it was, so it can't be added. Use Find it… in the Library first.");
  const type = book.pdf ? 'application/pdf' : 'application/epub+zip';
  return promoteInPlace(book, new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
}
