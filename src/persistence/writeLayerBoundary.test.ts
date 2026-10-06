import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYNCED_TABLES } from './syncedTables';

/**
 * Nothing may write to a synced table except the write layer: a direct
 * `db.vocabulary.put(...)` would change a row without creating its sync event.
 */
const WRITE_METHODS = 'put|bulkPut|add|bulkAdd|update|bulkUpdate|delete|bulkDelete|clear|modify';
const names = Object.keys(SYNCED_TABLES).join('|');
const direct = new RegExp(`\\b(?:db|tx)\\.(?:table\\(['"])?(?:${names})(?:['"]\\))?\\.(?:${WRITE_METHODS})\\(`);

const ALLOWED = new Set(['writeLayer.ts', 'syncControl.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('write-layer boundary', () => {
  it('has no direct writes to synced tables outside the write layer', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.resolve(__dirname, '..'))) {
      if (ALLOWED.has(path.basename(file))) continue;
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (direct.test(line)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('would catch a direct write', () => {
    expect(direct.test("await db.vocabulary.put(item);")).toBe(true);
    expect(direct.test("await tx.table('highlights').modify(fn);")).toBe(true);
    expect(direct.test("await db.bookFiles.put(x);")).toBe(false);
  });
});
