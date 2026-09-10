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
} from '../types';

/**
 * Local persistence, backed by IndexedDB via Dexie.
 *
 * This is intentionally the *only* file in the app that knows it's running
 * in a browser with IndexedDB available. Everything else talks to the
 * PersistenceService interface below, so a React Native client can later
 * supply a SQLite- or MMKV-backed implementation of the same interface
 * without touching business logic.
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

  constructor() {
    super('arabic-reader');
    this.version(1).stores({
      books: 'id, addedAt, title',
      bookFiles: 'bookId',
      positions: 'bookId',
      // key = `${bookId}::${normalizedForm}` so lookups per book are O(1)
      wordInstances: 'key, bookId, normalizedForm, lemma',
      vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt',
      highlights: 'id, bookId, createdAt',
      preferences: 'id',
    });
    // v2: adds an index on `srDueAt` so "what's due for review" is an
    // indexed range query instead of a full-table scan — existing rows get
    // srBox/srDueAt filled in by the upgrade so they're due immediately
    // (rather than missing the field and never showing up in a review).
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
    // v3: swaps the Leitner-box scheduler (srBox/srDueAt, v2) for FSRS —
    // see vocabularyService.ts. There's no way to reconstruct real FSRS
    // state (stability/difficulty) from Leitner history, so existing rows
    // are simply re-seeded as fresh FSRS cards, preserving only their old
    // due timestamp (srDueAt) so an item already due doesn't lose its
    // place in the queue. The old srBox/srDueAt fields are left in place
    // on existing rows (harmless, just unused) rather than stripped —
    // Dexie's `modify` only adds fields here, it doesn't delete them.
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
    // v4: adds the Speed Reader (RSVP) feature's own tables — a per-book
    // resume position (word-index based, distinct from the normal Reader's
    // CFI-based ReadingPosition) and a log of completed sessions (used for
    // the "Session Complete" summary and lifetime average WPM). Purely
    // additive — no migration needed for existing rows in other tables.
    this.version(4).stores({
      speedReaderPositions: 'bookId, updatedAt',
      speedReaderSessions: 'id, bookId, endedAt',
    });
    // v5: the Reading Dashboard's data source — a log of normal-Reader
    // sessions (see ReadingSession in types/index.ts). Indexed on
    // `startedAt` since the Dashboard's every query — the heatmap, the
    // trend charts, the Today/Week/Month/90d/All-time filter — is a range
    // scan over this field. Purely additive.
    this.version(5).stores({
      readingSessions: 'id, bookId, startedAt, endedAt',
    });
    // v6: bookmarks -- explicit, reader-placed markers at a precise
    // location, independent of both the automatic per-book ReadingPosition
    // and of highlights. Purely additive.
    this.version(6).stores({
      bookmarks: 'id, bookId, createdAt',
    });
    // v7: cached epub.js `locations` index per book (see EpubService) --
    // generating it walks the entire book's text, so it's worth persisting
    // the result (epub.js's own serialized form, via `.save()`/`.load()`)
    // rather than recomputing it every time the book is opened. Purely
    // additive, and small relative to the book file itself (an array of
    // CFIs, not the text).
    this.version(7).stores({
      bookLocations: 'bookId',
    });
  }
}

export const db = new ArabicReaderDB();

// ---------------------------------------------------------------------------
// PersistenceService — the abstraction the rest of the app depends on.
// ---------------------------------------------------------------------------

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

  // Word instances (encounter/lookup tracking)
  upsertWordInstance(instance: WordInstance): Promise<void>;
  getWordInstance(bookId: string, normalizedForm: string): Promise<WordInstance | undefined>;
  getWordInstancesByLemma(lemma: string): Promise<WordInstance[]>;
  getAllWordInstances(): Promise<WordInstance[]>;
  /** Batch form of getWordInstance — one IndexedDB round-trip for many
   * forms instead of one per form. Missing forms are simply absent from
   * the returned map. */
  getWordInstancesBulk(bookId: string, normalizedForms: string[]): Promise<Map<string, WordInstance>>;
  /** Batch form of upsertWordInstance — writes all given instances in a
   * single transaction instead of one transaction per instance. */
  upsertWordInstancesBulk(instances: WordInstance[]): Promise<void>;

  // Vocabulary
  saveVocabularyItem(item: VocabularyItem): Promise<void>;
  getVocabulary(): Promise<VocabularyItem[]>;
  getVocabularyForBook(bookId: string): Promise<VocabularyItem[]>;
  deleteVocabularyItem(id: string): Promise<void>;
  isSaved(surfaceForm: string, bookId: string): Promise<boolean>;
  getDueVocabulary(now: number): Promise<VocabularyItem[]>;

  // Highlights
  saveHighlight(h: Highlight): Promise<void>;
  getHighlightsForBook(bookId: string): Promise<Highlight[]>;
  getAllHighlights(): Promise<Highlight[]>;
  deleteHighlight(id: string): Promise<void>;

  // Bookmarks
  saveBookmark(b: Bookmark): Promise<void>;
  getBookmarksForBook(bookId: string): Promise<Bookmark[]>;
  deleteBookmark(id: string): Promise<void>;

  // Cached epub.js locations index (see EpubService) -- for real page numbers.
  saveBookLocations(bookId: string, data: string, total: number): Promise<void>;
  getBookLocations(bookId: string): Promise<{ data: string; total: number } | undefined>;

  // Preferences
  getPreferences(): Promise<ReaderPreferences>;
  savePreferences(prefs: ReaderPreferences): Promise<void>;

  // Backup / restore (see Settings → Backup)
  exportBackup(): Promise<BackupData>;
  /** Upserts every row in the backup (put semantics — an incoming row
   * overwrites a local row with the same id/key). Returns how many of
   * each kind were written. */
  importBackup(data: BackupData): Promise<{ vocabulary: number; wordInstances: number; highlights: number }>;

  // Speed Reader (RSVP)
  saveSpeedReaderPosition(pos: SpeedReaderPosition): Promise<void>;
  getSpeedReaderPosition(bookId: string): Promise<SpeedReaderPosition | undefined>;
  saveSpeedReaderSession(session: SpeedReaderSession): Promise<void>;
  getSpeedReaderSessions(bookId?: string): Promise<SpeedReaderSession[]>;

  // Reading sessions (normal Reader — Dashboard data source)
  saveReadingSession(session: ReadingSession): Promise<void>;
  /** All sessions with `startedAt` in [since, until) — the one query shape
   * every Dashboard range filter and chart needs, so range filtering lives
   * here rather than being re-implemented per caller. Omit `since`/`until`
   * for the full unbounded history ("All time"). */
  getReadingSessions(range?: { since?: number; until?: number }): Promise<ReadingSession[]>;
}

const DEFAULT_PREFS: ReaderPreferences = {
  theme: 'light',
  fontSizePct: 100,
  fontFamily: "'Noto Naskh Arabic', 'Amiri', 'Traditional Arabic', serif",
  lineHeight: 2.1,
  readingWidthPct: 100,
  // AraMorph (the real, bundled dictionary) is the default; the mock demo
  // dictionaries are still registered and can be re-enabled in Settings.
  enabledProviderIds: ['aramorph'],
  readingFlow: 'paginated',
  hoverPreviewEnabled: false,
  // On by default — a saved word without the sentence it came from is much
  // less useful for review later; still toggleable in Settings for anyone
  // who'd rather not capture surrounding text.
  sentenceContextEnabled: true,
  quickAddShortcutEnabled: false,
  ankiDeckName: 'Arabic Vocabulary',
  speedReaderWpm: 300,
  speedReaderOrpEnabled: true,
  speedReaderContextEnabled: false,
  touchGestures: { singleTap: 'bubble', doubleTap: 'quickSave', hold: 'none' },
  pageDirection: 'auto',
  dictionaryPopupSizePct: 100,
  liveSearchEnabled: true,
  searchHistoryEnabled: true,
  morphDisplayStyle: 'caption',
};

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
    const row = await db.bookFiles.get(id);
    return row?.data;
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

  async upsertWordInstance(instance: WordInstance): Promise<void> {
    const key = `${instance.bookId}::${instance.normalizedForm}`;
    await db.wordInstances.put({ ...instance, key });
  }
  async getWordInstance(bookId: string, normalizedForm: string): Promise<WordInstance | undefined> {
    const key = `${bookId}::${normalizedForm}`;
    const row = await db.wordInstances.get(key);
    if (!row) return undefined;
    const { key: _key, ...rest } = row;
    return rest;
  }
  async getWordInstancesByLemma(lemma: string): Promise<WordInstance[]> {
    const rows = await db.wordInstances.where('lemma').equals(lemma).toArray();
    return rows.map(({ key: _key, ...rest }) => rest);
  }
  async getAllWordInstances(): Promise<WordInstance[]> {
    const rows = await db.wordInstances.toArray();
    return rows.map(({ key: _key, ...rest }) => rest);
  }
  async getWordInstancesBulk(bookId: string, normalizedForms: string[]): Promise<Map<string, WordInstance>> {
    if (normalizedForms.length === 0) return new Map();
    const keys = normalizedForms.map((f) => `${bookId}::${f}`);
    const rows = await db.wordInstances.bulkGet(keys);
    const out = new Map<string, WordInstance>();
    rows.forEach((row) => {
      if (!row) return;
      const { key: _key, ...rest } = row;
      out.set(rest.normalizedForm, rest);
    });
    return out;
  }
  async upsertWordInstancesBulk(instances: WordInstance[]): Promise<void> {
    if (instances.length === 0) return;
    const rows = instances.map((instance) => ({ ...instance, key: `${instance.bookId}::${instance.normalizedForm}` }));
    await db.wordInstances.bulkPut(rows);
  }

  async saveVocabularyItem(item: VocabularyItem): Promise<void> {
    await db.vocabulary.put(item);
  }
  async getVocabulary(): Promise<VocabularyItem[]> {
    return db.vocabulary.orderBy('addedAt').reverse().toArray();
  }
  async getVocabularyForBook(bookId: string): Promise<VocabularyItem[]> {
    return db.vocabulary.where('bookId').equals(bookId).toArray();
  }
  async deleteVocabularyItem(id: string): Promise<void> {
    await db.vocabulary.delete(id);
  }
  async isSaved(surfaceForm: string, bookId: string): Promise<boolean> {
    const count = await db.vocabulary
      .where('bookId')
      .equals(bookId)
      .filter((v) => v.surfaceForm === surfaceForm)
      .count();
    return count > 0;
  }
  async getDueVocabulary(now: number): Promise<VocabularyItem[]> {
    return db.vocabulary.where('fsrsDue').belowOrEqual(now).toArray();
  }

  async saveHighlight(h: Highlight): Promise<void> {
    await db.highlights.put(h);
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
    if (!row) return DEFAULT_PREFS;
    const { id: _id, ...rest } = row;
    // Merge over defaults so preferences saved before a new field existed
    // (e.g. enabledProviderIds) don't come back missing it.
    return { ...DEFAULT_PREFS, ...rest };
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
      if (data.vocabulary?.length) await db.vocabulary.bulkPut(data.vocabulary);
      if (data.wordInstances?.length) {
        await db.wordInstances.bulkPut(
          data.wordInstances.map((w) => ({ ...w, key: `${w.bookId}::${w.normalizedForm}` }))
        );
      }
      if (data.highlights?.length) await db.highlights.bulkPut(data.highlights);
    });
    return {
      vocabulary: data.vocabulary?.length ?? 0,
      wordInstances: data.wordInstances?.length ?? 0,
      highlights: data.highlights?.length ?? 0,
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
  async getReadingSessions(range?: { since?: number; until?: number }): Promise<ReadingSession[]> {
    let collection = db.readingSessions.orderBy('startedAt');
    if (range?.since !== undefined || range?.until !== undefined) {
      const since = range?.since ?? -Infinity;
      const until = range?.until ?? Infinity;
      collection = collection.filter((s) => s.startedAt >= since && s.startedAt < until);
    }
    return collection.toArray();
  }
}

export const persistenceService: PersistenceService = new DexiePersistenceService();
