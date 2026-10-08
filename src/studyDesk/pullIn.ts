import { getBlobStore } from '../blobStore';
import { annotationService } from '../reader/annotations/annotationService';
import type { BookMeta } from '../types';
import { vocabularyService } from '../vocabulary';
import { listItems, updateItem } from './deskStore';
import type { DeskItem, DeskSource, NewDeskItem } from './types';
import { capture, itemTitle, looksArabic, TYPE_LABEL } from './useDesk';

/**
 * Pull in (Alt+U): saved highlights, vocabulary words and desk items from other books, brought onto the
 * current desk as new items, placed in a margin of the open page or in the inbox. The original stays where it
 * was; the new item's `source` points back to it.
 */

export type PullKind = 'highlight' | 'word' | 'item';
export type PullTarget = 'left' | 'right' | 'inbox';

export interface PullCandidate {
  key: string;
  kind: PullKind;
  /** The main line: the highlighted words, the word, the item's title. */
  text: string;
  /** A second line: the note, the meaning, the item's body. */
  detail?: string;
  ar: boolean;
  /** Where it came from, shown on the row. */
  from: string;
  /** What the new item is made of. */
  input: NewDeskItem;
  /** A desk item's image, shared with the copy. */
  imageHash?: string;
  at: number;
}

export const KIND_LABEL: Record<PullKind, string> = { highlight: 'Highlight', word: 'Word', item: 'Desk item' };

/** Everything that can be pulled in while `book` is open. Newest first. */
export async function listPullCandidates(book: BookMeta): Promise<PullCandidate[]> {
  const [highlights, words, items] = await Promise.all([
    annotationService.listAll().catch(() => []),
    vocabularyService.list().catch(() => []),
    listItems().catch(() => [] as DeskItem[]),
  ]);
  const out: PullCandidate[] = [];
  for (const h of highlights) {
    const text = h.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const source: DeskSource = { bookId: h.bookId, bookTitle: h.bookTitle, location: h.cfiRange, chapterLabel: h.chapterLabel };
    out.push({
      key: 'h:' + h.id,
      kind: 'highlight',
      text,
      detail: h.note || undefined,
      ar: looksArabic(text),
      from: h.bookId === book.id ? h.chapterLabel || 'This book' : h.bookTitle,
      input: { type: 'quote', text, body: h.note || undefined, ar: looksArabic(text), source },
      at: h.createdAt,
    });
  }
  for (const w of words) {
    const text = w.surfaceForm.trim();
    if (!text) continue;
    out.push({
      key: 'w:' + w.id,
      kind: 'word',
      text,
      detail: w.meaning || undefined,
      ar: looksArabic(text),
      from: w.bookId === book.id ? 'This book' : w.bookTitle,
      input: { type: 'concept', text, body: w.meaning || undefined, ar: looksArabic(text), source: { bookId: w.bookId, bookTitle: w.bookTitle, location: w.location } },
      at: w.addedAt,
    });
  }
  for (const i of items) {
    // Desk items from other books only: this book's are already on its pages and desk.
    if (!i.source?.bookId || i.source.bookId === book.id) continue;
    if (i.fromMargin && !i.text && !i.body && !i.imageHash) continue;
    out.push({
      key: 'i:' + i.id,
      kind: 'item',
      text: itemTitle(i),
      detail: i.text ? i.body?.split('\n')[0] || undefined : undefined,
      ar: !!i.ar,
      from: `${i.source.bookTitle ?? 'Another book'} · ${TYPE_LABEL[i.type]}`,
      input: { type: i.type === 'line' ? 'note' : i.type, text: i.text, body: i.body, ar: i.ar, source: i.source, reviewId: i.reviewId },
      imageHash: i.imageHash,
      at: i.createdAt,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Case-insensitive match on every word typed, against the text, detail and origin. */
export function filterCandidates(all: PullCandidate[], query: string): PullCandidate[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return all;
  return all.filter((c) => {
    const hay = `${c.text} ${c.detail ?? ''} ${c.from}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Margin placement for the new item: the place on the page and the side. */
export interface PullSpot {
  bookId: string;
  location: string;
}

function placement(target: PullTarget, spot: PullSpot | null): Pick<NewDeskItem, 'pin' | 'inInbox'> {
  if (target === 'inbox' || !spot) return { inInbox: true };
  return { inInbox: false, pin: { bookId: spot.bookId, location: spot.location, side: target } };
}

/** Brings a candidate onto the desk. */
export async function pullIn(book: BookMeta, deskId: string, c: PullCandidate, target: PullTarget, spot: PullSpot | null): Promise<DeskItem> {
  const item = await capture(book, deskId, { ...c.input, ...placement(target, spot) });
  if (c.imageHash && (await getBlobStore().pin(c.imageHash, 'desk', item.id))) await updateItem(item.id, { imageHash: c.imageHash });
  return item;
}

/** An image file from the device, as a screenshot item. */
export async function pullInImage(book: BookMeta, deskId: string, file: Blob, target: PullTarget, spot: PullSpot | null): Promise<DeskItem> {
  return capture(book, deskId, { type: 'capture', text: '', ...placement(target, spot) }, file);
}

export const isImageFile = (f: File | Blob | null | undefined): f is File => !!f && /^image\//.test(f.type);
