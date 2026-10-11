import { chapterText } from '../readerCore/chapterHtml';
import { NOTE_MARKER, type CleanBook, type CleanChapter } from '../readerCore/parseCleanEpub';

/** A parsed book plus the per-chapter text the reader searches and positions against. */
export interface BookModel {
  book: CleanBook;
  /** chapterText(chapter, { notes: true }) for each chapter. */
  texts: string[];
  chars: number[];
  /** Per chapter: where each heading/paragraph starts in its text, plus the text's end. */
  paragraphs: number[][];
}

function blockText(text: string, chapter: CleanChapter): string {
  return text.replace(NOTE_MARKER, (_, index: string) => chapter.notes?.[Number(index)]?.label ?? String(Number(index) + 1));
}

/** Mirrors chapterText's walk to find block boundaries. */
function paragraphBounds(chapter: CleanChapter): number[] {
  const bounds = [0];
  let blocks = chapter.blocks;
  let at = 0;
  if (blocks[0]?.t === 'h') {
    at += blockText(blocks[0].s, chapter).length;
    blocks = blocks.slice(1);
  } else {
    at += chapter.title.length;
  }
  bounds.push(at);
  for (const b of blocks) {
    if (b.t === 'h' || b.t === 'p') at += blockText(b.s, chapter).length;
    else if (b.t === 'brk') at += 5;
    else continue;
    bounds.push(at);
  }
  return bounds;
}

export function buildBookModel(book: CleanBook): BookModel {
  const texts = book.chapters.map((c) => chapterText(c, { notes: true }));
  return {
    book,
    texts,
    chars: texts.map((t) => t.length),
    paragraphs: book.chapters.map(paragraphBounds),
  };
}
