import { recordKey, type AppliedState, type DeviceId, type SeqMap, type SyncEvent, type SyncState } from './types';

export const emptyState = (): SyncState => ({
  applied: { prefix: {}, extra: {} },
  clock: {},
  frontiers: {},
});

// ---------------------------------------------------------------------------
// Applied-set (dedupe)
// ---------------------------------------------------------------------------

export function isApplied(applied: AppliedState, deviceId: DeviceId, seq: number): boolean {
  return seq <= (applied.prefix[deviceId] ?? 0) || (applied.extra[deviceId]?.includes(seq) ?? false);
}

/** Drop extras at or below the prefix, then fold any contiguous run into the prefix. */
function normalise(prefix: number, extra: number[]): { prefix: number; extra: number[] } {
  const sorted = [...new Set(extra)].filter((s) => s > prefix).sort((a, b) => a - b);
  let p = prefix;
  while (sorted.length > 0 && sorted[0] === p + 1) {
    p = sorted.shift() as number;
  }
  return { prefix: p, extra: sorted };
}

function withApplied(applied: AppliedState, deviceId: DeviceId, seq: number): AppliedState {
  const { prefix, extra } = normalise(applied.prefix[deviceId] ?? 0, [...(applied.extra[deviceId] ?? []), seq]);
  const nextExtra = { ...applied.extra };
  if (extra.length > 0) nextExtra[deviceId] = extra;
  else delete nextExtra[deviceId];
  return { prefix: { ...applied.prefix, [deviceId]: prefix }, extra: nextExtra };
}

// ---------------------------------------------------------------------------
// Causality
// ---------------------------------------------------------------------------

/** Strict happened-before between two events. */
export function precedes(a: SyncEvent, b: SyncEvent): boolean {
  if (a.eventId === b.eventId) return false;
  if (a.deviceId === b.deviceId) return a.seq < b.seq;
  return (b.seen[a.deviceId] ?? 0) >= a.seq;
}

/** `e` supersedes `x`: causally after it, or an explicit resolution of it. */
const dominates = (e: SyncEvent, x: SyncEvent): boolean => precedes(x, e) || (e.resolves?.includes(x.eventId) ?? false);

function maxMap(a: SeqMap, b: SeqMap): SeqMap {
  const out: SeqMap = { ...a };
  for (const [d, s] of Object.entries(b)) if (s > (out[d] ?? 0)) out[d] = s;
  return out;
}

// ---------------------------------------------------------------------------
// Frontiers
// ---------------------------------------------------------------------------

const byEventId = (a: SyncEvent, b: SyncEvent): number => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);

/** Maximal elements of `events` (nothing in the set dominates them), deduped and sorted. */
function maximal(events: SyncEvent[]): SyncEvent[] {
  const unique = [...new Map(events.map((e) => [e.eventId, e])).values()];
  return unique.filter((x) => !unique.some((y) => y !== x && dominates(y, x))).sort(byEventId);
}

/**
 * Apply one event. Idempotent, and the resulting state does not depend on the
 * order events arrive in.
 */
export function applyEvent(state: SyncState, e: SyncEvent): SyncState {
  if (isApplied(state.applied, e.deviceId, e.seq)) return state;
  const key = recordKey(e.table, e.recordId);
  const current = state.frontiers[key] ?? [];
  // A late old event that the frontier already supersedes is recorded as applied but not added.
  const frontier = current.some((x) => dominates(x, e)) ? current : maximal([...current, e]);
  return {
    applied: withApplied(state.applied, e.deviceId, e.seq),
    clock: maxMap(maxMap(state.clock, e.seen), { [e.deviceId]: e.seq }),
    frontiers: { ...state.frontiers, [key]: frontier },
  };
}

export const applyAll = (state: SyncState, events: SyncEvent[]): SyncState => events.reduce(applyEvent, state);

/** Join two replica states or snapshots. Commutative, associative and idempotent. */
export function joinStates(a: SyncState, b: SyncState): SyncState {
  const prefix = maxMap(a.applied.prefix, b.applied.prefix);
  const devices = new Set([...Object.keys(a.applied.prefix), ...Object.keys(b.applied.prefix), ...Object.keys(a.applied.extra), ...Object.keys(b.applied.extra)]);
  const extra: Record<DeviceId, number[]> = {};
  const finalPrefix: SeqMap = {};
  for (const d of devices) {
    const n = normalise(prefix[d] ?? 0, [...(a.applied.extra[d] ?? []), ...(b.applied.extra[d] ?? [])]);
    finalPrefix[d] = n.prefix;
    if (n.extra.length > 0) extra[d] = n.extra;
  }
  const frontiers: Record<string, SyncEvent[]> = {};
  for (const key of new Set([...Object.keys(a.frontiers), ...Object.keys(b.frontiers)])) {
    frontiers[key] = maximal([...(a.frontiers[key] ?? []), ...(b.frontiers[key] ?? [])]);
  }
  return { applied: { prefix: finalPrefix, extra }, clock: maxMap(a.clock, b.clock), frontiers };
}

// ---------------------------------------------------------------------------
// Reduction
// ---------------------------------------------------------------------------

/** Total order on events: later wins. `updatedAt`, then `deviceId`, then `eventId`. */
export function compareEvents(a: SyncEvent, b: SyncEvent): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}

export interface Reduced {
  winner: SyncEvent;
  /** Concurrent events that lost; they stay in the frontier until resolved. */
  losers: SyncEvent[];
}

/** Pick the visible value of a record. `better` defaults to the latest-wins key. */
export function reduceFrontier(
  frontier: SyncEvent[],
  better: (a: SyncEvent, b: SyncEvent) => number = compareEvents
): Reduced | null {
  if (frontier.length === 0) return null;
  // Ties in `better` fall back to the total key so the result never depends on order.
  const ranked = [...frontier].sort((a, b) => better(b, a) || compareEvents(b, a));
  return { winner: ranked[0], losers: ranked.slice(1) };
}

// ---------------------------------------------------------------------------
// Local events
// ---------------------------------------------------------------------------

export interface LocalChange {
  table: string;
  recordId: string;
  op: 'put' | 'delete';
  payload: unknown;
  now: number;
  resolves?: string[];
  eventId: string;
}

/** Build the next event this device writes. The caller then applies it like any other. */
export function createLocalEvent(state: SyncState, deviceId: DeviceId, lastUpdatedAt: number, change: LocalChange): SyncEvent {
  const seen: SeqMap = { ...state.clock };
  delete seen[deviceId];
  return {
    eventId: change.eventId,
    deviceId,
    seq: (state.applied.prefix[deviceId] ?? 0) + 1,
    table: change.table,
    recordId: change.recordId,
    op: change.op,
    payload: change.payload,
    updatedAt: Math.max(change.now, lastUpdatedAt + 1),
    seen,
    ...(change.resolves ? { resolves: change.resolves } : {}),
  };
}
