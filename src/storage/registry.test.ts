import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBackup } from '../persistence/backup';
import { db } from '../persistence/schema';
import { SYNCED_TABLES } from '../persistence/syncedTables';
import { MAIN_DB, STORAGE_REGISTRY, type StoreSpec, storeSpec, syncedMainTables, tableSpec } from './registry';

const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/**
 * The databases declared by `class X extends Dexie` in the source, with the
 * tables their latest version keeps (a later `table: null` drops one).
 */
function declaredDexieDatabases(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!/extends Dexie\b/.test(text)) return out;
  const name = /super\(\s*(?:name\s*=\s*)?'([^']+)'\s*\)/.exec(text)?.[1] ?? /constructor\(name = '([^']+)'\)/.exec(text)?.[1];
  if (!name) return out;
  const tables = new Set<string>();
  for (const block of text.matchAll(/\.stores\(\{([\s\S]*?)\}\)/g)) {
    for (const [, key, value] of block[1].matchAll(/(\w+)\s*:\s*('[^']*'|null)/g)) {
      if (value === 'null') tables.delete(key);
      else tables.add(key);
    }
  }
  out.set(name, tables);
  return out;
}

function databasesInSource(): Map<string, Set<string>> {
  const all = new Map<string, Set<string>>();
  for (const file of sourceFiles(SRC)) {
    for (const [name, tables] of declaredDexieDatabases(readFileSync(file, 'utf8'))) all.set(name, tables);
  }
  return all;
}

describe('StorageRegistry', () => {
  it('declares every table of the main database, and nothing that is not there', () => {
    const actual = db.tables.map((t) => t.name).sort();
    const undeclared = actual.filter((name) => !tableSpec(MAIN_DB, name));
    expect(undeclared, 'add these tables to src/storage/registry.ts').toEqual([]);
    const declared = STORAGE_REGISTRY.filter((s) => s.kind === 'table' && s.db === MAIN_DB).map((s) => s.id).sort();
    expect(declared).toEqual(actual);
  });

  it('declares every table of every other IndexedDB database the app opens', () => {
    const found = databasesInSource();
    expect(found.has(MAIN_DB)).toBe(true); // the scan itself works
    const undeclared: string[] = [];
    for (const [name, tables] of found) {
      for (const t of tables) if (!tableSpec(name, t)) undeclared.push(`${name}/${t}`);
    }
    expect(undeclared, 'add these tables to src/storage/registry.ts').toEqual([]);

    const tableName = (s: StoreSpec) => (s.db === MAIN_DB ? s.id : s.id.slice(s.db!.length + 1));
    const stale = STORAGE_REGISTRY.filter((s) => s.kind === 'table' && !found.get(s.db!)?.has(tableName(s)));
    expect(stale.map((s) => s.id), 'declared but no longer opened anywhere').toEqual([]);
  });

  it('finds no IndexedDB opened outside a Dexie class it can read', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      // The pre-migration backup opens the main database without a schema, to read it as it is.
      if (/indexedDB\.open\(/.test(text) || (/new Dexie\(/.test(text) && !file.endsWith('preMigrationBackup.ts'))) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch an undeclared table in a new database', () => {
    const found = declaredDexieDatabases(`class X extends Dexie { constructor() { super('arabic-reader-new');
      this.version(1).stores({ things: 'id', old: 'id' }); this.version(2).stores({ old: null }); } }`);
    expect([...found.get('arabic-reader-new')!]).toEqual(['things']);
    expect(tableSpec('arabic-reader-new', 'things')).toBeUndefined();
  });

  it('agrees with SYNCED_TABLES', () => {
    expect(syncedMainTables().sort()).toEqual(Object.keys(SYNCED_TABLES).sort());
  });

  it('agrees with the backup format', () => {
    // The tables a backup carries are exactly the ones the registry marks inBackup.
    const backup = parseBackup({ vocabulary: [] }).data;
    const carried = Object.keys(backup).filter((k) => Array.isArray((backup as unknown as Record<string, unknown>)[k])).sort();
    const inBackup = STORAGE_REGISTRY.filter((s) => s.inBackup).map((s) => s.id).sort();
    expect(inBackup).toEqual(carried);
  });

  it('keeps the rules between classes', () => {
    for (const s of STORAGE_REGISTRY) {
      const where = s.id;
      // Only user records move between devices (class B later, through the reader's own folder only).
      if (s.syncs) expect(s.cls, where).toBe('A');
      // A and B are only ever removed by the reader.
      if (s.cls === 'A' || s.cls === 'B') expect(s.evictable, where).toBe(false);
      // A full export takes the reader's data out: records as JSON, files as themselves.
      if (s.cls === 'A' && s.exportFormat !== 'none') expect(s.exportFormat, where).toBe('json');
      if (s.cls === 'C' || s.cls === 'D') expect(s.exportFormat, where).toBe('none');
      if (s.evictable) expect(['L', 'C', 'D'], where).toContain(s.cls);
    }
  });

  it('has unique ids', () => {
    const ids = STORAGE_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(storeSpec('vocabulary')?.cls).toBe('A');
  });
});
