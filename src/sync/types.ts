/**
 * Types for the folder-sync merge engine. See docs/specs/storage-and-sync.md.
 * Everything under src/sync/ is pure (no IndexedDB, no I/O) so the merge rules
 * can be property-tested in isolation.
 */

export type DeviceId = string;

/** Highest `seq` known per device, e.g. a vector clock or a dedupe prefix. */
export type SeqMap = Record<DeviceId, number>;

export interface SyncEvent {
  eventId: string;
  deviceId: DeviceId;
  /** Monotonic per device, starting at 1. */
  seq: number;
  table: string;
  recordId: string;
  op: 'put' | 'delete';
  /** Full record after the change (the tombstone for a delete). */
  payload: unknown;
  /** Display and "latest wins" policy only; ordering uses `seen`. */
  updatedAt: number;
  /**
   * Causal clock of the writing device, excluding itself: for each other device,
   * the highest `seq` the writer causally depends on (its own applied events
   * plus everything those events depended on).
   */
  seen: SeqMap;
  /** Event ids this event resolves; they leave the frontier whatever their causality. */
  resolves?: string[];
}

/** Which events are already applied. The only dedupe test is `isApplied`. */
export interface AppliedState {
  /** All events 1..prefix[d] from device d are applied. */
  prefix: SeqMap;
  /** Applied seqs above prefix[d] (a gap sits below them), ascending. */
  extra: Record<DeviceId, number[]>;
}

/** Everything a replica (or a snapshot) knows. Pure data, JSON-serialisable. */
export interface SyncState {
  applied: AppliedState;
  /** Causal clock: componentwise max of every applied event's clock. */
  clock: SeqMap;
  /** Per record (see `recordKey`): the maximal unresolved events, sorted by eventId. */
  frontiers: Record<string, SyncEvent[]>;
}

export const recordKey = (table: string, recordId: string): string => `${table}\u0000${recordId}`;
