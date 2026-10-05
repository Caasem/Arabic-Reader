import type { SyncEvent } from './types';

/**
 * On-disk format of the synced folder (docs/specs/storage-and-sync.md, section 5).
 * Pure: parsing and building text only. Every file carries `formatVersion` so
 * a later version (for example with encryption) can be told apart.
 */

export const FORMAT_VERSION = 1;

export interface BatchFile {
  formatVersion: typeof FORMAT_VERSION;
  kind: 'batch';
  deviceId: string;
  batchId: string;
  /** Declared event count; a mismatch means the file was only partly synced. */
  count: number;
  events: SyncEvent[];
}

/** `<deviceId>/batch-<firstSeq>-<lastSeq>-<batchId>.json` */
export const batchPath = (deviceId: string, firstSeq: number, lastSeq: number, batchId: string): string =>
  `${deviceId}/batch-${firstSeq}-${lastSeq}-${batchId}.json`;

export function parseBatchPath(path: string): { deviceId: string; firstSeq: number; lastSeq: number; batchId: string } | null {
  const m = /^([^/]+)\/batch-(\d+)-(\d+)-([^/]+)\.json$/.exec(path);
  return m ? { deviceId: m[1], firstSeq: Number(m[2]), lastSeq: Number(m[3]), batchId: m[4] } : null;
}

export function encodeBatch(deviceId: string, batchId: string, events: SyncEvent[]): string {
  const file: BatchFile = { formatVersion: FORMAT_VERSION, kind: 'batch', deviceId, batchId, count: events.length, events };
  return JSON.stringify(file);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isValidEvent(e: unknown, tables: readonly string[]): e is SyncEvent {
  if (!isObject(e)) return false;
  return (
    typeof e.eventId === 'string' &&
    typeof e.deviceId === 'string' &&
    Number.isInteger(e.seq) &&
    (e.seq as number) >= 1 &&
    typeof e.table === 'string' &&
    tables.includes(e.table) &&
    typeof e.recordId === 'string' &&
    (e.op === 'put' || e.op === 'delete') &&
    typeof e.updatedAt === 'number' &&
    isObject(e.seen) &&
    Object.values(e.seen).every((n) => typeof n === 'number') &&
    (e.resolves === undefined || (Array.isArray(e.resolves) && e.resolves.every((r) => typeof r === 'string'))) &&
    'payload' in e
  );
}

export type ParsedBatch =
  | { ok: true; batch: BatchFile }
  | { ok: false; reason: 'unreadable' | 'incomplete' | 'newer-version' | 'invalid' };

/**
 * Parse a batch file. Anything wrong is reported, never thrown, so the caller
 * can skip the file and retry on the next sync (a partly synced cloud file is
 * normal). `expectedDeviceId` is the folder the file was found in: events that
 * claim another device are rejected.
 */
export function parseBatch(text: string, expectedDeviceId: string, tables: readonly string[]): ParsedBatch {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (!isObject(raw) || raw.kind !== 'batch') return { ok: false, reason: 'invalid' };
  if (typeof raw.formatVersion === 'number' && raw.formatVersion > FORMAT_VERSION) return { ok: false, reason: 'newer-version' };
  if (raw.formatVersion !== FORMAT_VERSION || !Array.isArray(raw.events) || typeof raw.batchId !== 'string') {
    return { ok: false, reason: 'invalid' };
  }
  if (raw.count !== raw.events.length) return { ok: false, reason: 'incomplete' };
  if (raw.deviceId !== expectedDeviceId) return { ok: false, reason: 'invalid' };
  if (!raw.events.every((e) => isValidEvent(e, tables) && e.deviceId === expectedDeviceId)) return { ok: false, reason: 'invalid' };
  return { ok: true, batch: raw as unknown as BatchFile };
}
