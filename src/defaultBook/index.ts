import { libraryService } from '../library/libraryService';

/**
 * Adds the bundled default book (al-Akhbar al-Tiwal by al-Dinawari, from Shamela:
 * public/default-book.epub) to the library once per browser, so there is
 * something to read straight away. Removing the book later does not bring it
 * back. To take this feature out: delete this folder and the one call in Library.tsx
 * (and public/default-book.epub).
 */
const FLAG = 'arabic-reader:defaultBook:9760';
const TITLE = 'الأخبار الطوال';

function flagged(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return true; // storage blocked: never loop on adding it
  }
}

function setFlag(): void {
  try {
    localStorage.setItem(FLAG, '1');
  } catch {
    // nothing to do
  }
}

/** True when the book was added just now. */
export async function ensureDefaultBook(): Promise<boolean> {
  if (flagged()) return false;
  try {
    const books = await libraryService.listBooks();
    if (books.some((b) => b.title.includes(TITLE))) {
      setFlag();
      return false;
    }
    const res = await fetch(`${import.meta.env.BASE_URL}default-book.epub`);
    if (!res.ok) return false;
    const file = new File([await res.blob()], `${TITLE}.epub`, { type: 'application/epub+zip' });
    await libraryService.importEpub(file);
    setFlag();
    return true;
  } catch {
    return false; // try again next launch
  }
}
