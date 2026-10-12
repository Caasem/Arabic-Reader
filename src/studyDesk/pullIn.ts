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
  /** The book it came from, for grouping. */
  bookId?: string;
  bookTitle?: string;
  /** Where in that book (a chapter, the kind of desk item), shown under the book's heading. */
  where?: string;
  /** A copy is already on the desk being pulled into. */
  onDesk?: boolean;
  /** What the new item is made of. */
  input: NewDeskItem;
  /** A desk item's image, shared with the copy. */
  imageHash?: string;
  at: number;
}

export const KIND_LABEL: Record<PullKind, string> = { highlight: 'Highlight', word: 'Word', item: 'Desk item' };

/** Everything that can be pulled in while `book` is open. Newest first. With `deskId`, copies already on that desk are marked. */
export async function listPullCandidates(book: BookMeta, deskId?: string): Promise<PullCandidate[]> {
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
      bookId: h.bookId,
      bookTitle: h.bookTitle,
      where: h.chapterLabel || undefined,
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
      bookId: w.bookId,
      bookTitle: w.bookTitle,
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
      bookId: i.source.bookId,
      bookTitle: i.source.bookTitle,
      where: TYPE_LABEL[i.type],
      input: { type: i.type === 'line' ? 'note' : i.type, text: i.text, body: i.body, ar: i.ar, source: i.source, reviewId: i.reviewId },
      imageHash: i.imageHash,
      at: i.createdAt,
    });
  }
  if (deskId) {
    const here = new Set(items.filter((i) => i.deskId === deskId).map((i) => onDeskKey(i.text, i.source?.location)));
    for (const c of out) if (here.has(onDeskKey(c.input.text, c.input.source?.location))) c.onDesk = true;
  }
  return out.sort((a, b) => b.at - a.at);
}

const onDeskKey = (text: string, location?: string) => `${text.trim()}|${location ?? ''}`;

const MARKS = /[\u064B-\u065F\u0670\u0640]/;

/**
 * Text folded for searching: lower case, without ḥarakāt or tatweel, with the hamza seats of alif (أ إ آ ٱ) as ا,
 * ى as ي and ة as ه. `map[i]` is the index in `s` of the folded text's character `i`.
 */
export function foldForSearch(s: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (MARKS.test(ch)) continue;
    text += ch === 'أ' || ch === 'إ' || ch === 'آ' || ch === 'ٱ' ? 'ا' : ch === 'ى' ? 'ي' : ch === 'ة' ? 'ه' : ch.toLowerCase();
    map.push(i);
  }
  return { text, map };
}

const terms = (query: string) => foldForSearch(query).text.split(/\s+/).filter(Boolean);

/** Every word typed must match the text, detail or origin; ḥarakāt and hamza seats are ignored (اعراب finds الإعراب). */
export function filterCandidates(all: PullCandidate[], query: string): PullCandidate[] {
  const ts = terms(query);
  if (!ts.length) return all;
  return all.filter((c) => {
    const hay = foldForSearch(`${c.text} ${c.detail ?? ''} ${c.from} ${c.where ?? ''}`).text;
    return ts.every((t) => hay.includes(t));
  });
}

/** Where each word typed first appears in `s`, as [start, end) ranges of `s`, sorted and not overlapping. Trailing ḥarakāt are included. */
export function matchRanges(s: string, query: string): [number, number][] {
  const f = foldForSearch(s);
  const out: [number, number][] = [];
  for (const t of terms(query)) {
    const at = f.text.indexOf(t);
    if (at < 0) continue;
    let end = f.map[at + t.length - 1] + 1;
    while (end < s.length && MARKS.test(s[end])) end++;
    out.push([f.map[at], end]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

export interface PullGroup {
  key: string;
  /** The book's title; empty for the open book. */
  title: string;
  here: boolean;
  items: PullCandidate[];
}

/** The candidates by book: the open book first, then the others, the most recently added to first. Order inside a group is kept. */
export function groupCandidates(list: PullCandidate[], bookId: string): PullGroup[] {
  const groups = new Map<string, PullGroup>();
  for (const c of list) {
    const here = c.bookId === bookId;
    const key = here ? '' : (c.bookId ?? c.bookTitle ?? '?');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, title: here ? '' : (c.bookTitle ?? 'Another book'), here, items: [] }));
    g.items.push(c);
  }
  const newest = (g: PullGroup) => Math.max(...g.items.map((c) => c.at));
  return [...groups.values()].sort((a, b) => (a.here !== b.here ? (a.here ? -1 : 1) : newest(b) - newest(a)));
}

/** Margin placement for the new item: the place on the page and the side. */
export interface PullSpot {
  bookId: string;
  location: string;
}

/** Where a new item goes: pinned in a margin of the page `spot` names, or into the inbox. */
export function placement(target: PullTarget, spot: PullSpot | null): Pick<NewDeskItem, 'pin' | 'inInbox'> {
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
