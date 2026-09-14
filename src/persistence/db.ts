import Dexie, { type Table } from 'dexie';
import type {
  BookMeta,
  ReadingPosition,
  WordInstance,
  VocabularyItem,
  Highlight,
  Bookmark,
  ReaderPreferences,
  BackupData,
  SpeedReaderPosition,
  SpeedReaderSession,
  ReadingSession,
  PomodoroSession,
} from '../types';
import { initialPreferences, withDefaults } from '../state/defaultPreferences';

/**
 * Local persistence, backed by IndexedDB via Dexie. The only module that
 * knows storage is IndexedDB -- everything else depends on the
 * PersistenceService interface below.
 */
class ArabicReaderDB extends Dexie {
  books!: Table<BookMeta, string>;
  bookFiles!: Table<{ bookId: string; data: Blob }, string>;
  positions!: Table<ReadingPosition, string>;
  wordInstances!: Table<WordInstance & { key: string }, string>;
  vocabulary!: Table<VocabularyItem, string>;
  highlights!: Table<Highlight, string>;
  preferences!: Table<{ id: string } & ReaderPreferences, string>;
  speedReaderPositions!: Table<SpeedReaderPosition, string>;
  speedReaderSessions!: Table<SpeedReaderSession, string>;
  readingSessions!: Table<ReadingSession, string>;
  bookmarks!: Table<Bookmark, string>;
  bookLocations!: Table<{ bookId: string; data: string; total: number }, string>;
  pomodoroSessions!: Table<PomodoroSession, string>;

  constructor() {
    super('arabic-reader');
    this.version(1).stores({
      books: 'id, addedAt, title',
      bookFiles: 'bookId',
      positions: 'bookId',
      // key = `${bookId}::${normalizedForm}`
      wordInstances: 'key, bookId, normalizedForm, lemma',
      vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt',
      highlights: 'id, bookId, createdAt',
      preferences: 'id',
    });
    // v2: Leitner scheduling fields, indexed for "what's due" queries.
    this.version(2)
      .stores({
        vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt, srDueAt',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx
          .table('vocabulary')
          .toCollection()
          .modify((item: VocabularyItem & { srBox?: number; srDueAt?: number }) => {
            if (item.srBox === undefined) item.srBox = 1;
            if (item.srDueAt === undefined) item.srDueAt = now;
          });
      });
    // v3: Leitner -> FSRS. Existing cards are re-seeded as fresh FSRS cards,
    // keeping their old due time so nothing loses its place in the queue.
    this.version(3)
      .stores({
        vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt, fsrsDue',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx
          .table('vocabulary')
          .toCollection()
          .modify((item: VocabularyItem & { srBox?: number; srDueAt?: number }) => {
            if (item.fsrsDue === undefined) {
              item.fsrsDue = item.srDueAt ?? now;
              item.fsrsStability = 0;
              item.fsrsDifficulty = 0;
              item.fsrsScheduledDays = 0;
              item.fsrsLearningSteps = 0;
              item.fsrsReps = 0;
              item.fsrsLapses = 0;
              item.fsrsState = 0; // State.New
            }
          });
      });
    // v4: Speed Reader position + session log.
    this.version(4).stores({
      speedReaderPositions: 'bookId, updatedAt',
      speedReaderSessions: 'id, bookId, endedAt',
    });
    // v5: Reading Dashboard session log (range-scanned on startedAt).
    this.version(5).stores({
      readingSessions: 'id, bookId, startedAt, endedAt',
    });
    // v6: bookmarks.
    this.version(6).stores({
      bookmarks: 'id, bookId, createdAt',
    });
    // v7: cached epub.js locations index per book.
    this.version(7).stores({
      bookLocations: 'bookId',
    });
    // v8: Pomodoro sessions.
    this.version(8).stores({
      pomodoroSessions: 'id, bookId, phase, status, startedAt',
    });
    // v9: compound index for "is this word saved in this book" lookups,
    // which run on every word tap. Index-only change; no data migration.
    this.version(9).stores({
      vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt, fsrsDue, [bookId+surfaceForm]',
    });
  }
}

export const db = new ArabicReaderDB();

export interface TimeBounds {
  since?: number;
  until?: number;
}

export interface PersistenceService {
  // Books
  saveBook(meta: BookMeta, file: Blob): Promise<void>;
  getBooks(): Promise<BookMeta[]>;
  getBook(id: string): Promise<BookMeta | undefined>;
  getBookFile(id: string): Promise<Blob | undefined>;
  deleteBook(id: string): Promise<void>;
  updateBookMeta(id: string, patch: Partial<BookMeta>): Promise<void>;

  // Reading position
  saveReadingPosition(pos: ReadingPosition): Promise<void>;
  getReadingPosition(bookId: string): Promise<ReadingPosition | undefined>;
  /** One read for many books; books with no position are absent. */
  getReadingPositions(bookIds: string[]): Promise<Map<string, ReadingPosition>>;

  // Word instances (encounter/lookup tracking)
  upsertWordInstance(instance: WordInstance): Promise<void>;
  getWordInstance(bookId: string, normalizedForm: string): Promise<WordInstance | undefined>;
  /** Patches an existing instance; a no-op when there isn't one. */
  updateWordInstance(bookId: string, normalizedForm: string, patch: Partial<WordInstance>): Promise<void>;
  getAllWordInstances(): Promise<WordInstance[]>;
  countWordInstances(): Promise<number>;
  countSavedWordInstances(): Promise<number>;
  getWordInstancesBulk(bookId: string, normalizedForms: string[]): Promise<Map<string, WordInstance>>;
  upsertWordInstancesBulk(instances: WordInstance[]): Promise<void>;

  // Vocabulary
  saveVocabularyItem(item: VocabularyItem): Promise<void>;
  getVocabularyItem(id: string): Promise<VocabularyItem | undefined>;
  getVocabulary(): Promise<VocabularyItem[]>;
  getVocabularyForBook(bookId: string): Promise<VocabularyItem[]>;
  /** Every card for this exact surface form in this book. */
  getVocabularyForWord(bookId: string, surfaceForm: string): Promise<VocabularyItem[]>;
  deleteVocabularyItem(id: string): Promise<void>;
  isSaved(surfaceForm: string, bookId: string): Promise<boolean>;
  getDueVocabulary(now: number): Promise<VocabularyItem[]>;

  // Highlights
  saveHighlight(h: Highlight): Promise<void>;
  getHighlight(id: string): Promise<Highlight | undefined>;
  getHighlightsForBook(bookId: string): Promise<Highlight[]>;
  getAllHighlights(): Promise<Highlight[]>;
  deleteHighlight(id: string): Promise<void>;

  // Bookmarks
  saveBookmark(b: Bookmark): Promise<void>;
  getBookmarksForBook(bookId: string): Promise<Bookmark[]>;
  deleteBookmark(id: string): Promise<void>;

  // Cached epub.js locations index (real page numbers)
  saveBookLocations(bookId: string, data: string, total: number): Promise<void>;
  getBookLocations(bookId: string): Promise<{ data: string; total: number } | undefined>;

  // Preferences
  getPreferences(): Promise<ReaderPreferences>;
  savePreferences(prefs: ReaderPreferences): Promise<void>;

  // Backup / restore (put semantics: incoming rows overwrite same-id rows).
  exportBackup(): Promise<BackupData>;
  importBackup(data: BackupData): Promise<{ vocabulary: number; wordInstances: number; highlights: number }>;

  // Speed Reader (RSVP)
  saveSpeedReaderPosition(pos: SpeedReaderPosition): Promise<void>;
  getSpeedReaderPosition(bookId: string): Promise<SpeedReaderPosition | undefined>;
  saveSpeedReaderSession(session: SpeedReaderSession): Promise<void>;
  getSpeedReaderSessions(bookId?: string): Promise<SpeedReaderSession[]>;

  // Reading sessions (Dashboard data source), `startedAt` in [since, until)
  saveReadingSession(session: ReadingSession): Promise<void>;
  getReadingSessions(range?: TimeBounds): Promise<ReadingSession[]>;

  // Pomodoro, `startedAt` in [since, until)
  savePomodoroSession(session: PomodoroSession): Promise<void>;
  getPomodoroSessions(range?: TimeBounds): Promise<PomodoroSession[]>;
}

function wordInstanceKey(bookId: string, normalizedForm: string): string {
  return `${bookId}::${normalizedForm}`;
}

function withoutKey({ key: _key, ...rest }: WordInstance & { key: string }): WordInstance {
  return rest;
}

/** Rows with `startedAt` in [since, until), in startedAt order, via the index. */
function startedAtRange<T>(table: Table<T, string>, range?: TimeBounds): Promise<T[]> {
  if (range?.since === undefined && range?.until === undefined) return table.orderBy('startedAt').toArray();
  return table
    .where('startedAt')
    .between(range.since ?? -Infinity, range.until ?? Infinity, true, false)
    .toArray();
}

class DexiePersistenceService implements PersistenceService {
  async saveBook(meta: BookMeta, file: Blob): Promise<void> {
    await db.transaction('rw', db.books, db.bookFiles, async () => {
      await db.books.put(meta);
      await db.bookFiles.put({ bookId: meta.id, data: file });
    });
  }
  async getBooks(): Promise<BookMeta[]> {
    return db.books.orderBy('addedAt').reverse().toArray();
  }
  async getBook(id: string): Promise<BookMeta | undefined> {
    return db.books.get(id);
  }
  async getBookFile(id: string): Promise<Blob | undefined> {
    return (await db.bookFiles.get(id))?.data;
  }
  async deleteBook(id: string): Promise<void> {
    await db.transaction('rw', db.books, db.bookFiles, db.positions, async () => {
      await db.books.delete(id);
      await db.bookFiles.delete(id);
      await db.positions.delete(id);
    });
  }
  async updateBookMeta(id: string, patch: Partial<BookMeta>): Promise<void> {
    await db.books.update(id, patch);
  }

  async saveReadingPosition(pos: ReadingPosition): Promise<void> {
    await db.positions.put(pos);
  }
  async getReadingPosition(bookId: string): Promise<ReadingPosition | undefined> {
    return db.positions.get(bookId);
  }
  async getReadingPositions(bookIds: string[]): Promise<Map<string, ReadingPosition>> {
    const rows = await db.positions.bulkGet(bookIds);
    const out = new Map<string, ReadingPosition>();
    for (const row of rows) if (row) out.set(row.bookId, row);
    return out;
  }

  async upsertWordInstance(instance: WordInstance): Promise<void> {
    await db.wordInstances.put({ ...instance, key: wordInstanceKey(instance.bookId, instance.normalizedForm) });
  }
  async getWordInstance(bookId: string, normalizedForm: string): Promise<WordInstance | undefined> {
    const row = await db.wordInstances.get(wordInstanceKey(bookId, normalizedForm));
    return row ? withoutKey(row) : undefined;
  }
  async updateWordInstance(bookId: string, normalizedForm: string, patch: Partial<WordInstance>): Promise<void> {
    await db.wordInstances.update(wordInstanceKey(bookId, normalizedForm), patch);
  }
  async getAllWordInstances(): Promise<WordInstance[]> {
    return (await db.wordInstances.toArray()).map(withoutKey);
  }
  async countWordInstances(): Promise<number> {
    return db.wordInstances.count();
  }
  async countSavedWordInstances(): Promise<number> {
    return db.wordInstances.filter((w) => w.saved).count();
  }
  async getWordInstancesBulk(bookId: string, normalizedForms: string[]): Promise<Map<string, WordInstance>> {
    if (normalizedForms.length === 0) return new Map();
    const rows = await db.wordInstances.bulkGet(normalizedForms.map((f) => wordInstanceKey(bookId, f)));
    const out = new Map<string, WordInstance>();
    for (const row of rows) if (row) out.set(row.normalizedForm, withoutKey(row));
    return out;
  }
  async upsertWordInstancesBulk(instances: WordInstance[]): Promise<void> {
    if (instances.length === 0) return;
    await db.wordInstances.bulkPut(instances.map((i) => ({ ...i, key: wordInstanceKey(i.bookId, i.normalizedForm) })));
  }

  async saveVocabularyItem(item: VocabularyItem): Promise<void> {
    await db.vocabulary.put(item);
  }
  async getVocabularyItem(id: string): Promise<VocabularyItem | undefined> {
    return db.vocabulary.get(id);
  }
  async getVocabulary(): Promise<VocabularyItem[]> {
    return db.vocabulary.orderBy('addedAt').reverse().toArray();
  }
  async getVocabularyForBook(bookId: string): Promise<VocabularyItem[]> {
    return db.vocabulary.where('bookId').equals(bookId).toArray();
  }
  async getVocabularyForWord(bookId: string, surfaceForm: string): Promise<VocabularyItem[]> {
    return db.vocabulary.where('[bookId+surfaceForm]').equals([bookId, surfaceForm]).toArray();
  }
  async deleteVocabularyItem(id: string): Promise<void> {
    await db.vocabulary.delete(id);
  }
  async isSaved(surfaceForm: string, bookId: string): Promise<boolean> {
    return (await db.vocabulary.where('[bookId+surfaceForm]').equals([bookId, surfaceForm]).count()) > 0;
  }
  async getDueVocabulary(now: number): Promise<VocabularyItem[]> {
    return db.vocabulary.where('fsrsDue').belowOrEqual(now).toArray();
  }

  async saveHighlight(h: Highlight): Promise<void> {
    await db.highlights.put(h);
  }
  async getHighlight(id: string): Promise<Highlight | undefined> {
    return db.highlights.get(id);
  }
  async getHighlightsForBook(bookId: string): Promise<Highlight[]> {
    return db.highlights.where('bookId').equals(bookId).toArray();
  }
  async getAllHighlights(): Promise<Highlight[]> {
    return db.highlights.orderBy('createdAt').reverse().toArray();
  }
  async deleteHighlight(id: string): Promise<void> {
    await db.highlights.delete(id);
  }

  async saveBookmark(b: Bookmark): Promise<void> {
    await db.bookmarks.put(b);
  }
  async getBookmarksForBook(bookId: string): Promise<Bookmark[]> {
    return db.bookmarks.where('bookId').equals(bookId).sortBy('createdAt');
  }
  async deleteBookmark(id: string): Promise<void> {
    await db.bookmarks.delete(id);
  }

  async saveBookLocations(bookId: string, data: string, total: number): Promise<void> {
    await db.bookLocations.put({ bookId, data, total });
  }
  async getBookLocations(bookId: string): Promise<{ data: string; total: number } | undefined> {
    const row = await db.bookLocations.get(bookId);
    return row ? { data: row.data, total: row.total } : undefined;
  }

  async getPreferences(): Promise<ReaderPreferences> {
    const row = await db.preferences.get('default');
    if (!row) return initialPreferences();
    const { id: _id, ...stored } = row;
    return withDefaults(stored);
  }
  async savePreferences(prefs: ReaderPreferences): Promise<void> {
    await db.preferences.put({ id: 'default', ...prefs });
  }

  async exportBackup(): Promise<BackupData> {
    const [vocabulary, wordInstances, highlights] = await Promise.all([
      db.vocabulary.toArray(),
      this.getAllWordInstances(),
      db.highlights.toArray(),
    ]);
    return { formatVersion: 1, exportedAt: Date.now(), vocabulary, wordInstances, highlights };
  }

  async importBackup(data: BackupData): Promise<{ vocabulary: number; wordInstances: number; highlights: number }> {
    await db.transaction('rw', db.vocabulary, db.wordInstances, db.highlights, async () => {
      if (data.vocabulary.length) await db.vocabulary.bulkPut(data.vocabulary);
      if (data.wordInstances.length) await this.upsertWordInstancesBulk(data.wordInstances);
      if (data.highlights.length) await db.highlights.bulkPut(data.highlights);
    });
    return {
      vocabulary: data.vocabulary.length,
      wordInstances: data.wordInstances.length,
      highlights: data.highlights.length,
    };
  }

  async saveSpeedReaderPosition(pos: SpeedReaderPosition): Promise<void> {
    await db.speedReaderPositions.put(pos);
  }
  async getSpeedReaderPosition(bookId: string): Promise<SpeedReaderPosition | undefined> {
    return db.speedReaderPositions.get(bookId);
  }
  async saveSpeedReaderSession(session: SpeedReaderSession): Promise<void> {
    await db.speedReaderSessions.put(session);
  }
  async getSpeedReaderSessions(bookId?: string): Promise<SpeedReaderSession[]> {
    const rows = bookId
      ? await db.speedReaderSessions.where('bookId').equals(bookId).toArray()
      : await db.speedReaderSessions.toArray();
    return rows.sort((a, b) => b.endedAt - a.endedAt);
  }

  async saveReadingSession(session: ReadingSession): Promise<void> {
    await db.readingSessions.put(session);
  }
  async getReadingSessions(range?: TimeBounds): Promise<ReadingSession[]> {
    return startedAtRange(db.readingSessions, range);
  }

  async savePomodoroSession(session: PomodoroSession): Promise<void> {
    await db.pomodoroSessions.put(session);
  }
  async getPomodoroSessions(range?: TimeBounds): Promise<PomodoroSession[]> {
    return startedAtRange(db.pomodoroSessions, range);
  }
}

export const persistenceService: PersistenceService = new DexiePersistenceService();
