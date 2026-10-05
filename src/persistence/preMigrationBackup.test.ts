import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BackupVerificationError,
  MigrationBlockedError,
  buildBackup,
  digestTable,
  ensureBackupBeforeMigration,
  verifyBackupText,
  type BackupSink,
} from './preMigrationBackup';

async function seed(version: number, rows = true): Promise<void> {
  await Dexie.delete('arabic-reader');
  const d = new Dexie('arabic-reader');
  d.version(version).stores({ vocabulary: 'id, addedAt', highlights: 'id', bookFiles: 'bookId' });
  if (rows) {
    await d.table('vocabulary').bulkPut([
      { id: 'v1', surfaceForm: 'كتاب', addedAt: 1 },
      { id: 'v2', surfaceForm: 'قلم', addedAt: 2 },
    ]);
    await d.table('highlights').put({ id: 'h1', text: 'x', note: undefined });
    await d.table('bookFiles').put({ bookId: 'b', data: 'big' });
  }
  d.close();
}

function memorySink(over: Partial<BackupSink> = {}): BackupSink & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    kind: 'file',
    save: async (name, text) => void files.set(name, text),
    readBack: async (name) => files.get(name) as string,
    ...over,
  };
}

beforeEach(() => seed(9));

describe('digestTable', () => {
  it('ignores key order and undefined fields, and notices real changes', async () => {
    expect(await digestTable([{ a: 1, b: 2 }])).toBe(await digestTable([{ b: 2, a: 1, c: undefined }]));
    expect(await digestTable([{ a: 1 }])).not.toBe(await digestTable([{ a: 2 }]));
    expect(await digestTable([{ a: 1 }, { a: 2 }])).not.toBe(await digestTable([{ a: 2 }, { a: 1 }]));
  });
});

describe('ensureBackupBeforeMigration', () => {
  it('does nothing when there is no database, it is already v10, or it is empty', async () => {
    await Dexie.delete('arabic-reader');
    expect((await ensureBackupBeforeMigration({ sink: memorySink() })).status).toBe('not-needed');
    await seed(10);
    expect((await ensureBackupBeforeMigration({ sink: memorySink() })).status).toBe('not-needed');
    await seed(9, false);
    expect((await ensureBackupBeforeMigration({ sink: memorySink() })).status).toBe('not-needed');
  });

  it('writes a backup of every user table, leaves out file blobs, and verifies the read-back', async () => {
    const sink = memorySink();
    const outcome = await ensureBackupBeforeMigration({ sink, now: 1_700_000_000_000 });
    expect(outcome).toMatchObject({ status: 'backed-up', verifiedReadBack: true });
    const saved = JSON.parse([...sink.files.values()][0]);
    expect(saved.fromVersion).toBe(9);
    expect(saved.tables.vocabulary).toHaveLength(2);
    expect(saved.tables.highlights).toHaveLength(1);
    expect(saved.tables.bookFiles).toBeUndefined();
    // The old database itself is untouched.
    const d = new Dexie('arabic-reader');
    await d.open();
    expect(d.verno).toBe(9);
    d.close();
  });

  it('blocks the upgrade when the written file does not match (row counts equal, contents differ)', async () => {
    const sink = memorySink({
      readBack: async () => {
        const [text] = [...sink.files.values()];
        const bad = JSON.parse(text);
        bad.tables.vocabulary[0].surfaceForm = 'changed';
        return JSON.stringify(bad);
      },
    });
    await expect(ensureBackupBeforeMigration({ sink })).rejects.toBeInstanceOf(MigrationBlockedError);
  });

  it('blocks when the sink cannot save', async () => {
    const sink = memorySink({ save: async () => Promise.reject(new Error('disk full')) });
    await expect(ensureBackupBeforeMigration({ sink })).rejects.toThrow(/disk full/);
  });

  it('blocks when the user says the file was not saved', async () => {
    await expect(ensureBackupBeforeMigration({ sink: memorySink(), confirmSaved: async () => false })).rejects.toBeInstanceOf(
      MigrationBlockedError,
    );
  });

  it('continues only when the user explicitly confirms going on without a backup', async () => {
    const sink = memorySink({ save: async () => Promise.reject(new Error('no')) });
    const outcome = await ensureBackupBeforeMigration({ sink, confirmWithoutBackup: async () => true });
    expect(outcome).toMatchObject({ status: 'skipped' });
    await expect(ensureBackupBeforeMigration({ sink, confirmWithoutBackup: async () => false })).rejects.toBeInstanceOf(
      MigrationBlockedError,
    );
  });

  it('labels a browser-storage copy as convenience-only, never as a backup', async () => {
    const outcome = await ensureBackupBeforeMigration({ sink: memorySink({ kind: 'convenience' }) });
    expect(outcome.status).toBe('convenience-only');
  });
});

describe('verifyBackupText', () => {
  it('rejects unreadable and incomplete files', async () => {
    const backup = await buildBackup({ fromVersion: 9, tables: { vocabulary: [{ id: 'v1' }] } }, 1);
    await expect(verifyBackupText('not json', backup)).rejects.toBeInstanceOf(BackupVerificationError);
    await expect(verifyBackupText(JSON.stringify({ ...backup, tables: {} }), backup)).rejects.toThrow(/missing tables/);
    await expect(verifyBackupText(JSON.stringify(backup), backup)).resolves.toBeUndefined();
  });
});
