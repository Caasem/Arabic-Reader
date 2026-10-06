import { compareEvents } from './merge';
import type { SyncEvent } from './types';

/**
 * Per-table "which concurrent edit is visible" rules. Each returns a positive
 * number when `a` is better than `b`; ties fall through to the total event key
 * in `reduceFrontier`, so the result never depends on arrival order.
 */

const num = (e: SyncEvent, field: string): number => {
  const v = (e.payload as Record<string, unknown> | null)?.[field];
  return typeof v === 'number' ? v : -Infinity;
};

type Better = (a: SyncEvent, b: SyncEvent) => number;

/** Furthest point wins: reading progress should never move backwards because of a sync. */
const furthest =
  (field: string): Better =>
  (a, b) => {
    const d = num(a, field) - num(b, field);
    return Number.isNaN(d) ? 0 : d;
  };

/** Sessions are append-mostly; the version that ran longest (latest end) is the more complete one. */
const sessionBetter: Better = (a, b) => {
  const d = num(a, 'endedAt') - num(b, 'endedAt');
  return d !== 0 && !Number.isNaN(d) ? d : compareEvents(a, b);
};

export function betterFor(table: string): Better {
  switch (table) {
    case 'positions':
      return furthest('percent');
    case 'speedReaderPositions':
      return furthest('globalIndex');
    case 'readingSessions':
    case 'speedReaderSessions':
    case 'pomodoroSessions':
      return sessionBetter;
    default:
      return compareEvents;
  }
}
