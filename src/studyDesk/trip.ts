import { useSyncExternalStore } from 'react';
import type { BookMeta } from '../types';
import { placement, type PullSpot, type PullTarget } from './pullIn';
import type { NewDeskItem } from './types';

/**
 * A capture trip (Go to another book): the reader leaves a page, captures one thing in another book, and
 * comes straight back with it filed where they chose (a margin of the page they left, or the inbox).
 *
 * Kept outside React: the desk host remounts when the reader switches between a PDF and a text book, and the
 * trip has to outlive that. Memory only: a reload ends the trip, and the reader is simply in the other book.
 */
export interface DeskTrip {
  /** The book and desk the capture comes back to. */
  from: BookMeta;
  deskId: string;
  /** Where the capture is filed. */
  target: PullTarget;
  /** The place on the page left behind, for margin targets. */
  spot: PullSpot | null;
  /** The book being visited. */
  to: BookMeta;
  /** Started from the desk document: it opens again on return, on this desk. */
  fromDocument?: string;
}

let trip: DeskTrip | null = null;
/** Said once the reader is back (the host may have remounted in between). */
let note: string | null = null;
/** The desk document to open on return (and the item to show in it), for the book the trip started from. */
let reopen: { bookId: string; deskId: string; itemId?: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startTrip(t: DeskTrip): void {
  trip = t;
  emit();
}

/** Ends the trip; `message` is shown once the reader is back, and a trip from the document opens it again (at `itemId`). */
export function endTrip(message?: string, itemId?: string): DeskTrip | null {
  const was = trip;
  trip = null;
  note = message ?? null;
  reopen = was?.fromDocument ? { bookId: was.from.id, deskId: was.fromDocument, itemId } : null;
  emit();
  return was;
}

export function currentTrip(): DeskTrip | null {
  return trip;
}

/** The document to open in this book on return, once. */
export function takeTripReopen(bookId: string): { deskId: string; itemId?: string } | null {
  if (!reopen || reopen.bookId !== bookId) return null;
  const r = reopen;
  reopen = null;
  return { deskId: r.deskId, itemId: r.itemId };
}

/** The message left for the page the reader came back to, once. */
export function takeTripNote(): string | null {
  const n = note;
  note = null;
  return n;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useDeskTrip = (): DeskTrip | null => useSyncExternalStore(subscribe, () => trip);

/** What a capture made on the trip carries besides its own words and source: its place back home. */
export const tripPlacement = (t: DeskTrip): Pick<NewDeskItem, 'pin' | 'inInbox'> => placement(t.target, t.spot);

export function tripFiledMessage(t: DeskTrip): string {
  const where = t.target === 'inbox' || !t.spot ? 'the inbox' : `the ${t.target} margin`;
  return `Captured from ${t.to.title}, filed in ${where}`;
}
