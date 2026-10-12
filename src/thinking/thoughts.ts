import { formatCleanLocation, parseCleanLocation } from '../readerCore/location';
import { formatPdfLocation, parsePdfLocation } from '../studyDesk/pageGeometry';
import type { DeskItem, DeskPin, NewDeskItem } from '../studyDesk/types';
import { looksArabic } from '../studyDesk/useDesk';
import type { BookMeta } from '../types';

/**
 * Where a thought on a passage sits: level with the passage's start, as a Ḥāshiya note does (a level on a PDF page, a
 * zero-length place in the text), so it shows beside the passage in the margin without drawing a second box.
 */
export function thoughtPlace(passage: DeskItem): string | undefined {
  const loc = passage.source?.location;
  const pdf = parsePdfLocation(loc);
  if (pdf) return formatPdfLocation(pdf.page, 0, pdf.y, 1, 0);
  const clean = parseCleanLocation(loc);
  return clean ? formatCleanLocation({ chapter: clean.chapter, start: clean.start, end: clean.start }) : loc;
}

/** What a new thought on a passage is: a Ḥāshiya note beside it, tied to its place. */
export function newThought(passage: DeskItem, book: BookMeta, text: string, opts: { claim?: boolean; links?: string[]; toInbox?: boolean } = {}): NewDeskItem {
  const location = thoughtPlace(passage);
  const pin: DeskPin | undefined = location ? { bookId: book.id, location, side: 'right' } : undefined;
  return {
    type: 'note',
    text: '',
    body: text.trim(),
    ar: looksArabic(text),
    source: { bookId: book.id, bookTitle: book.title, location, chapterLabel: passage.source?.chapterLabel },
    pin,
    fromMargin: true,
    inInbox: !!opts.toInbox,
    ...(opts.claim ? { move: 'claim' as const } : {}),
    ...(opts.links?.length ? { links: opts.links } : {}),
  };
}
