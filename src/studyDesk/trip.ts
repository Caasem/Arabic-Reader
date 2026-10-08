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
}

let trip: DeskTrip | null = null;
/** Said once the reader is back (the host may have remounted in between). */
let note: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startTrip(t: DeskTrip): void {
  trip = t;
  emit();
}

/** Ends the trip; `message` is shown once the reader is back. */
export function endTrip(message?: string): DeskTrip | null {
  const was = trip;
  trip = null;
  note = message ?? null;
  emit();
  return was;
}

export function currentTrip(): DeskTrip | null {
  return trip;
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
