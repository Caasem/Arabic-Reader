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
import { db, type TimeBounds } from './schema';
import * as books from './booksRepo';
import * as wordInstances from './wordInstancesRepo';
import * as vocabulary from './vocabularyRepo';
import * as highlights from './highlightsRepo';
import * as bookmarks from './bookmarksRepo';
import * as preferences from './preferencesRepo';
import * as backup from './backupExportRepo';
import * as speedReader from './speedReaderRepo';
import * as readingSessions from './sessionsRepo';
import * as pomodoro from './pomodoroRepo';

export { db };
export type { TimeBounds };

/**
 * The single interface every caller depends on. Storage lives in `schema.ts`
 * (the Dexie schema/migrations); the actual read/write logic is split by
 * domain across the repo modules in this folder (booksRepo, vocabularyRepo,
 * etc.) and assembled into this one facade below.
 */
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

export const persistenceService: PersistenceService = {
  ...books,
  ...wordInstances,
  ...vocabulary,
  ...highlights,
  ...bookmarks,
  ...preferences,
  ...backup,
  ...speedReader,
  ...readingSessions,
  ...pomodoro,
};
