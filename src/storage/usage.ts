import type { Table } from 'dexie';
import { getBlobStore, type BlobStore } from '../blobStore';
import { loadPersonalDictionary } from '../dictionary/providers/personal/store';
import { db } from '../persistence/schema';
import { userFontSizes } from '../readerFont/userFonts';
import { STORAGE_REGISTRY, MAIN_DB } from './registry';

/**
 * What the device holds, grouped the way the Storage screen shows it (docs/features/storage-ux.md). Which
 * tables count as "records" or "caches" comes from the StorageRegistry, so a new table lands in the right group
 * without touching this file. Sizes of Dexie tables are estimates (IndexedDB does not report them): row count
 * times the average size of a sample of rows. Blob sizes are exact.
 */
export type UsageGroupId = 'files' | 'records' | 'packs' | 'caches';

export type ItemKind = 'book' | 'font' | 'dictionary' | 'record' | 'pack' | 'cache';

export interface UsageItem {
  id: string;
  kind: ItemKind;
  label: string;
  bytes: number;
  /** A book that has a file on this device (so "Remove file only" applies). */
  hasFile?: boolean;
}

export interface UsageGroup {
  id: UsageGroupId;
  label: string;
  bytes: number;
  /** Largest first. */
  items: UsageItem[];
}

export interface StorageReport {
  groups: UsageGroup[];
  /** From `navigator.storage.estimate()`; absent where the browser has none. */
  quota?: { usage: number; quota: number };
  persisted?: boolean;
}

export const GROUP_LABELS: Record<UsageGroupId, string> = {
  files: 'Your files',
  records: 'Your records',
  packs: 'Dictionaries and data packs',
  caches: 'Caches',
};

const RECORD_LABELS: Record<string, string> = {
  vocabulary: 'Vocabulary',
  highlights: 'Highlights and notes',
  bookmarks: 'Bookmarks',
  positions: 'Reading positions',
  books: 'Library records',
  preferences: 'Settings',
  speedReaderPositions: 'Speed Reader positions',
  speedReaderSessions: 'Speed Reader history',
  readingSessions: 'Reading history',
  pomodoroSessions: 'Focus sessions',
  wordInstances: 'Word counts',
  sensePicks: 'Meaning picks',
};

const CACHE_LABELS: Record<string, string> = {
  bookLocations: 'Book location indexes',
  crowdPacks: 'Shared-meaning ranking files',
  packParts: 'Unfinished downloads',
};

const SAMPLE_ROWS = 100;
const encoder = new TextEncoder();

/** Row count times the average serialised size of up to 100 rows. Not exact; close enough to show where space goes. */
export async function estimateTableBytes(table: Table): Promise<number> {
  const count = await table.count();
  if (count === 0) return 0;
  const sample = await table.limit(SAMPLE_ROWS).toArray();
  let total = 0;
  for (const row of sample) {
    try {
      const copy = Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([, v]) => !(v instanceof Blob)));
      total += encoder.encode(JSON.stringify(copy)).length + Object.values(row as Record<string, unknown>).reduce<number>((n, v) => n + (v instanceof Blob ? v.size : 0), 0);
    } catch {
      // A row that cannot be serialised is counted as nothing rather than failing the screen.
    }
  }
  return Math.round((total / sample.length) * count);
}

const bySize = (a: UsageItem, b: UsageItem) => b.bytes - a.bytes;
const group = (id: UsageGroupId, items: UsageItem[]): UsageGroup => {
  const sorted = items.filter((i) => i.bytes > 0 || i.kind === 'book' || i.kind === 'pack').sort(bySize);
  return { id, label: GROUP_LABELS[id], bytes: items.reduce((n, i) => n + i.bytes, 0), items: sorted };
};

export interface MeasureDeps {
  blobs?: () => BlobStore;
  fonts?: () => Promise<{ family: string; bytes: number }[]>;
}

export async function measureStorage(deps: MeasureDeps = {}): Promise<StorageReport> {
  const blobs = (deps.blobs ?? getBlobStore)();
  const fonts = deps.fonts ?? userFontSizes;

  // -- Your files: books, fonts, the personal dictionary --------------------------------------------------------
  const titles = new Map((await db.books.toArray()).map((b) => [b.id, b.title]));
  const fileItems = new Map<string, UsageItem>();
  for await (const ref of blobs.list('book')) {
    for (const owner of ref.owners) {
      fileItems.set(owner, { id: owner, kind: 'book', label: titles.get(owner) ?? owner, bytes: ref.size, hasFile: true });
    }
  }
  let legacyBytes = 0;
  for (const row of await db.bookFiles.toArray()) {
    if (fileItems.has(row.bookId)) continue;
    const bytes = row.data instanceof Blob ? row.data.size : 0;
    legacyBytes += bytes;
    fileItems.set(row.bookId, { id: row.bookId, kind: 'book', label: titles.get(row.bookId) ?? row.bookId, bytes, hasFile: true });
  }
  const usage = await blobs.usage();
  const items: UsageItem[] = [...fileItems.values()];
  let fontBytes = 0;
  for (const font of await fonts().catch(() => [])) {
    items.push({ id: font.family, kind: 'font', label: `Font: ${font.family}`, bytes: font.bytes });
    fontBytes += font.bytes;
  }
  const dictionaryBytes = usage.dictionary?.bytes ?? 0;
  if (dictionaryBytes > 0 && (await loadPersonalDictionary().catch(() => undefined))) {
    items.push({ id: 'personal', kind: 'dictionary', label: 'Personal dictionary', bytes: dictionaryBytes });
  }
  const files = group('files', items);
  // Identical books share one blob: the group total is what is stored, not the sum of the rows.
  files.bytes = (usage.book?.bytes ?? 0) + legacyBytes + fontBytes + dictionaryBytes;

  // -- Your records ---------------------------------------------------------------------------------------------
  const recordItems: UsageItem[] = [];
  let bookkeeping = 0;
  const cacheItems: UsageItem[] = [];
  for (const spec of STORAGE_REGISTRY) {
    if (spec.kind !== 'table' || spec.db !== MAIN_DB || spec.id === 'bookFiles') continue;
    const table = db.table(spec.id);
    if (spec.evictable) {
      cacheItems.push({ id: spec.id, kind: 'cache', label: CACHE_LABELS[spec.id] ?? spec.id, bytes: await estimateTableBytes(table) });
    } else if (spec.id === 'packs' || spec.id === 'packMeta') {
      continue; // sizes come from the pack files themselves, below
    } else if (spec.cls === 'A' && spec.exportFormat === 'none') {
      bookkeeping += await estimateTableBytes(table); // sync bookkeeping and crowd state: small, not the reader's to manage
    } else if (spec.cls === 'A' || spec.id === 'wordInstances') {
      recordItems.push({ id: spec.id, kind: 'record', label: RECORD_LABELS[spec.id] ?? spec.id, bytes: await estimateTableBytes(table) });
    }
  }
  if (bookkeeping > 0) recordItems.push({ id: 'bookkeeping', kind: 'record', label: 'Sync bookkeeping', bytes: bookkeeping });

  // -- Dictionaries and data packs ------------------------------------------------------------------------------
  const packItems: UsageItem[] = (await db.packs.toArray()).map((p) => ({ id: p.id, kind: 'pack', label: p.title, bytes: p.size }));
  const packs = group('packs', packItems);
  packs.bytes = usage.pack?.bytes ?? packItems.reduce((n, i) => n + i.bytes, 0);

  const report: StorageReport = { groups: [files, group('records', recordItems), packs, group('caches', cacheItems)] };
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const { usage: used = 0, quota = 0 } = await navigator.storage.estimate();
      if (quota > 0) report.quota = { usage: used, quota };
    }
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) report.persisted = await navigator.storage.persisted();
  } catch {
    // No estimate: the screen hides that part.
  }
  return report;
}

/** Asks the browser not to clear this site's storage under pressure. Returns whether it agreed. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Frees everything the registry marks as an evictable cache. All of it is rebuilt or downloaded again when needed. */
export async function clearCaches(): Promise<void> {
  for (const spec of STORAGE_REGISTRY) {
    if (spec.kind === 'table' && spec.db === MAIN_DB && spec.evictable) await db.table(spec.id).clear();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
