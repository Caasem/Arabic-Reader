/**
 * Core data model. Kept framework-agnostic (no React, no browser-only types
 * beyond what a mobile client written in React Native could also express)
 * so the same shapes can be reused by a future native client.
 */

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export type BookFormat = 'epub' | 'mobi';

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  language?: string;
  format: BookFormat;
  coverDataUrl?: string;
  addedAt: number;
  /** Bytes of the (already-normalized-to-epub) source file, stored separately in blob storage. */
  sizeBytes: number;
  /** Total locations/chars used to compute reading progress, filled in after first open. */
  totalLocations?: number;
}

export interface ReadingPosition {
  bookId: string;
  cfi: string;
  percent: number; // 0..1
  chapterHref?: string;
  chapterLabel?: string;
  updatedAt: number;
}

export interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
}

// ---------------------------------------------------------------------------
// Tokenisation / word instances
// ---------------------------------------------------------------------------

/**
 * One occurrence of an Arabic token as rendered on the page. This is
 * intentionally distinct from a VocabularyItem: the same lemma can surface
 * as many different WordInstances (different inflections, different books).
 */
export interface WordInstance {
  surfaceForm: string;
  /** Buckwalter-transliterated, diacritics stripped — used as a lookup key. */
  normalizedForm: string;
  lemma?: string;
  root?: string;

  bookId: string;
  chapterHref?: string;

  sentence?: string;
  paragraph?: string;
  location?: string; // CFI or similar stable locator

  encounterCount: number;
  lookupCount: number;

  firstSeenAt: number;
  lastSeenAt: number;
  firstLookupAt?: number;
  lastLookupAt?: number;

  saved: boolean;
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

export interface DictionaryEntrySense {
  gloss: string;
  pos?: string; // part of speech, e.g. "noun", "verb"
  gender?: string;
  notes?: string;
}

export interface DictionaryEntry {
  providerId: string;
  providerName: string;
  headword: string; // as shown, vocalized if available
  senses: DictionaryEntrySense[];
  root?: string;
  /** The word's own citation/dictionary form (e.g. كاتَبَ for a matched
   * كاتَبْتُهُ) -- distinct from `root`, which is the bare consonant
   * skeleton (كتب) shared by every word derived from it. Absent when the
   * provider has no lemma data for this entry. */
  lemma?: string;
}

export interface MorphologicalAnalysis {
  surfaceForm: string;
  lemma: string;
  root?: string;
  pos?: string;
  form?: string; // verb form I-X, etc.
  tense?: string;
  person?: string;
  gender?: string;
  number?: string;
}

export interface DictionaryLookupResult {
  word: string;
  entries: DictionaryEntry[];
  morphology?: MorphologicalAnalysis[];
}

export interface DictionaryProvider {
  id: string;
  name: string;
  lookup(word: string): Promise<DictionaryEntry[]>;
}

export interface MorphologyProvider {
  id: string;
  analyze(word: string): Promise<MorphologicalAnalysis[]>;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type MasteryLevel = 'new' | 'learning' | 'known' | 'mastered';

export interface VocabularyItem {
  id: string;
  surfaceForm: string;
  lemma?: string;
  root?: string;
  pos?: string;
  /** Short primary gloss shown in list views -- either one specific entry's
   * senses (see `selectedEntryIndex`) or, when the word had more than one
   * distinct entry and the reader chose to keep them all, every entry's
   * senses joined together. */
  meaning: string;
  /** Full set of dictionary entries captured at save time (reference, not a copy-of-truth). */
  entries: DictionaryEntry[];
  /** Index into `entries` that `meaning`/`root`/`pos` currently reflect.
   * `undefined` means "all of them" (the combined `meaning` above covers
   * every entry) -- the Vocabulary tab lets a reader switch between a
   * single specific entry and this combined view after the fact. */
  selectedEntryIndex?: number;

  bookId: string;
  bookTitle: string;
  chapterHref?: string;
  sentence?: string;
  location?: string;

  addedAt: number;
  firstLookupAt?: number;
  lastLookupAt?: number;
  lookupCount: number;
  encounterCount: number;

  mastery: MasteryLevel;
  successfulRecalls: number;
  lastReviewedAt?: number;

  // -----------------------------------------------------------------------
  // FSRS (Free Spaced Repetition Scheduler) state — the same algorithm
  // Anki itself defaults to as of Anki 23.10, replacing the simpler
  // Leitner-box scheduler this app shipped with initially (v0.5.0). Field
  // shapes mirror ts-fsrs's `Card` type directly (see vocabularyService.ts)
  // so converting to/from the library's own scheduler is a straight
  // field-for-field mapping rather than a translation layer.
  // -----------------------------------------------------------------------

  /** Timestamp this item next becomes due for review. */
  fsrsDue: number;
  /** How many days it currently takes for recall probability to drop to
   * ~90% — FSRS's core "how well is this actually remembered" number. */
  fsrsStability: number;
  /** 1-10, how inherently hard this card is to remember, independent of
   * how recently it was reviewed. */
  fsrsDifficulty: number;
  fsrsScheduledDays: number;
  fsrsLearningSteps: number;
  fsrsReps: number;
  fsrsLapses: number;
  /** ts-fsrs State enum: 0 = New, 1 = Learning, 2 = Review, 3 = Relearning. */
  fsrsState: number;
  fsrsLastReview?: number;

  /** Whether this item has been pushed to Anki via AnkiConnect, so repeat
   * syncs don't create duplicate notes. */
  syncedToAnki?: boolean;

  notes?: string;
}

// ---------------------------------------------------------------------------
// Backup / export-import
// ---------------------------------------------------------------------------

/** Full portable backup of everything that would otherwise be trapped in
 * one browser's IndexedDB — saved vocabulary, per-word encounter/lookup
 * tracking, and highlights. Reading positions and book files themselves
 * are intentionally not included (large, and not the point of a vocab
 * backup) — see Settings → Backup. */
export interface BackupData {
  formatVersion: 1;
  exportedAt: number;
  vocabulary: VocabularyItem[];
  wordInstances: WordInstance[];
  highlights: Highlight[];
}

// ---------------------------------------------------------------------------
// Annotations / highlights
// ---------------------------------------------------------------------------

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'purple' | 'red';

export interface Highlight {
  id: string;
  bookId: string;
  bookTitle: string;
  cfiRange: string;
  text: string;
  color: HighlightColor;
  note?: string;
  chapterHref?: string;
  chapterLabel?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

/** A precise reading location the reader has explicitly marked -- distinct
 * from ReadingPosition (the one automatic "where I left off" per book) and
 * from Highlight (a marked *span of text*, with a colour/note). A book can
 * have any number of these, including more than one on the same page. */
export interface Bookmark {
  id: string;
  bookId: string;
  bookTitle: string;
  cfi: string;
  percent: number; // 0..1, at the time the bookmark was made
  /** "Page N of Total" once epub.js's locations index has generated for
   * this book (see EpubService.getPageLabel/generateLocations) -- an
   * approximation (epub.js splits by character count, not real print
   * layout), but a genuine page reference, not just a percentage. Falls
   * back to a percent label ("62%") if the bookmark was made before that
   * background generation finished. */
  locationLabel: string;
  chapterHref?: string;
  chapterLabel?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** 'dark' is shown to the reader as "Night" (Settings/QuickSettings label
 * only — the stored value/CSS selector stay 'dark' so nothing needs a data
 * migration); 'system' follows the OS's prefers-color-scheme live rather
 * than being resolved once at load. */
export type ReaderTheme = 'light' | 'dark' | 'sepia' | 'system';

export type ReadingFlow = 'paginated' | 'scrolled';

/** RTL/LTR page-turn direction. 'auto' derives it from the open book (its
 * OPF spine `page-progression-direction`, same source EpubService already
 * reads) — RTL/LTR explicitly override that per reader preference. */
export type PageDirection = 'auto' | 'rtl' | 'ltr';

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontSizePct: number; // 100 = default
  fontFamily: string;
  lineHeight: number;
  readingWidthPct: number; // 100 = default column width
  /** Dictionary provider ids currently switched on (Dictionary switching UI). */
  enabledProviderIds: string[];
  /** Page-flip vs continuous vertical scroll. */
  readingFlow: ReadingFlow;
  /** Show a condensed translation preview on hover, in addition to the full
   * popup on click/tap. Off by default — opt-in via Settings. */
  hoverPreviewEnabled: boolean;
  /** Capture the containing sentence when a word is looked up/saved, shown
   * on the vocabulary card and used as review/Anki-card context. Off by
   * default — opt-in via Settings. */
  sentenceContextEnabled: boolean;
  /** Enable the quick-add keyboard shortcut (Ctrl+Shift+A) that saves the
   * most recently looked-up word straight to vocabulary without opening
   * the popup's "Add" button. Off by default — opt-in via Settings. */
  quickAddShortcutEnabled: boolean;
  /** Last deck name used/typed for AnkiConnect sync — remembered purely as
   * a convenience default for next time. */
  ankiDeckName: string;
  /** Last words-per-minute setting used in the Speed Reader — remembered
   * across sessions so playback resumes at a familiar pace. */
  speedReaderWpm: number;
  /** Optimal Recognition Point mode — keeps each word's approximate
   * recognition letter aligned to a fixed central marker instead of just
   * centering the whole word. On by default (the point of RSVP). */
  speedReaderOrpEnabled: boolean;
  /** Show the surrounding sentence under the RSVP word, current word
   * highlighted. Off by default — the Speed Reader's default view is
   * deliberately just the word, nothing else. */
  speedReaderContextEnabled: boolean;
  /** Which action each touch gesture on a word triggers (Reader only —
   * these have no effect for mouse clicks, which always open the full
   * dictionary popup as before). See TouchGestureBindings. */
  touchGestures: TouchGestureBindings;
  /** Page-turn direction, independent of the app's own RTL chrome. */
  pageDirection: PageDirection;
  /** Dictionary popup size, 100 = normal. Independent of viewport-collision
   * handling — this is the reader's *intended* size; positioning logic
   * still keeps it fully on-screen regardless. */
  dictionaryPopupSizePct: number;
  /** Search-as-you-type in the in-book search overlay. Off = search only
   * runs on submit. */
  liveSearchEnabled: boolean;
  /** Remember recent in-book searches for reuse. */
  searchHistoryEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Touch dictionary gestures (Android/touch devices)
// ---------------------------------------------------------------------------

/**
 * What a touch gesture on a word does. 'bubble' shows the condensed
 * DictionaryBubble (definition + a "+" to save); 'quickSave' looks the word
 * up and saves it straight to vocabulary with no bubble, just a brief
 * toast; 'openDictionary' skips the bubble and opens the same full
 * DictionaryPopup a mouse click does; 'none' disables the gesture entirely,
 * which for Single tap/Double tap falls back to the ordinary click
 * behavior (full popup) since nothing intercepts the browser's own
 * synthetic click in that case.
 */
export type TouchDictionaryAction = 'bubble' | 'quickSave' | 'openDictionary' | 'none';

/**
 * Single tap always fires instantly — there is no artificial delay to wait
 * and see whether a second tap follows (that delay would slow down every
 * tap just to detect the rare double-tap). Double tap instead means "a
 * second tap on the same word shortly after the first" — it fires *in
 * addition to* whatever the first tap already triggered, not instead of it.
 * Hold (long-press) is off by default because a long-press is also how
 * touch text selection starts (for highlighting) — enabling it trades that
 * away in favor of whatever action is assigned here.
 */
export interface TouchGestureBindings {
  singleTap: TouchDictionaryAction;
  doubleTap: TouchDictionaryAction;
  hold: TouchDictionaryAction;
}

// ---------------------------------------------------------------------------
// Speed Reader (RSVP)
// ---------------------------------------------------------------------------

/** One displayable unit in the RSVP stream — usually a single word, with
 * any punctuation that was directly attached to it in the source text kept
 * intact (see speedReader/tokenStream.ts for exactly how these are cut).
 * `lookupWord` is the bare Arabic surface form suitable for a dictionary
 * lookup (matches the same `.ar-word[data-word]` convention the normal
 * Reader uses) — undefined for tokens with no Arabic content (pure Latin,
 * digits, standalone punctuation), which are still displayed but aren't
 * clickable. */
export interface RsvpToken {
  display: string;
  lookupWord?: string;
  sectionHref: string;
  globalIndex: number;
}

export interface RsvpChapter {
  href: string;
  label: string;
  startIndex: number;
  endIndex: number; // exclusive
}

/** Where the reader last left off in the Speed Reader for a given book —
 * separate from the normal Reader's ReadingPosition (CFI-based) since RSVP
 * position is a word index into a flattened token stream, not a page. */
export interface SpeedReaderPosition {
  bookId: string;
  sectionHref: string;
  globalIndex: number;
  updatedAt: number;
}

/** A completed (or abandoned-but-ended) Speed Reader session, kept for the
 * "Session Complete" summary and for computing a lifetime average WPM. */
export interface SpeedReaderSession {
  id: string;
  bookId: string;
  bookTitle: string;
  wordsRead: number;
  durationMs: number;
  averageWpm: number;
  bookProgressPercent: number; // 0..1, at the end of the session
  endedAt: number;
}

// ---------------------------------------------------------------------------
// Reading sessions (normal Reader — the Dashboard's data source)
// ---------------------------------------------------------------------------

/**
 * One span of normal (non-Speed-Reader) reading, logged by the Reader
 * component itself (see Reader.tsx's session-tracking effect) so the
 * Dashboard has something real to compute reading time, WPM, streaks, and
 * the activity heatmap from — none of that existed anywhere before this.
 *
 * Deliberately mirrors `SpeedReaderSession`'s shape rather than inventing a
 * different one, and deliberately does NOT duplicate anything vocabulary/
 * word-instance related — `lookupCount` here is just this session's own
 * tally (kept because `WordInstance.lookupCount` is overwritten in place
 * and has no daily history), everything else vocab-side is still read live
 * from `wordInstances`/`vocabulary` by the stats layer.
 */
export interface ReadingSession {
  id: string;
  bookId: string;
  bookTitle: string;
  startedAt: number;
  endedAt: number;
  /** Wall-clock time between startedAt/endedAt, minus any stretch where the
   * reader was idle (no scroll/click/keydown/page-turn) past the idle
   * cutoff — see IDLE_TIMEOUT_MS in Reader.tsx. This, not the raw
   * endedAt-startedAt span, is what "reading time" means throughout the
   * Dashboard. */
  activeDurationMs: number;
  /** Best-effort count of Arabic words rendered on screen during this
   * session (summed per section as epub.js renders it) — an estimate, not
   * an exact "words the eye passed over" count, but a real one derived
   * from the same .ar-word instrumentation the rest of the reader uses,
   * not a guess from percent-complete deltas alone. */
  wordsRead: number;
  /** Dictionary lookups (word taps that resolved a lookup — bubble,
   * popup, or quick-save) performed during this session. */
  lookupCount: number;
  startPercent: number;
  endPercent: number;
}

// ---------------------------------------------------------------------------
// Vocabulary rarity (CAMeL Arabic Frequency Lists — see public/frequency-data)
// ---------------------------------------------------------------------------

/** A word's difficulty band, derived from its rank in the MSA frequency
 * list. `unlisted` means the word never appeared in the 11.4M-word source
 * list at all (proper nouns, typos, extremely obscure vocabulary) — kept
 * distinct from `advanced` since "not found" and "found but very rare"
 * are different claims. */
export type VocabTier = 'beginner' | 'intermediate' | 'advanced' | 'unlisted';

export interface WordRarity {
  word: string;
  /** 1-based frequency rank (1 = most common word in the list), or null if unlisted. */
  rank: number | null;
  /** 0..1, share of the list at least this common (1 = most common), or null if unlisted. */
  percentile: number | null;
  tier: VocabTier;
}

/** One distinct word found while scanning a book's full text, with every
 * place it occurs so the Vocabulary Levels view can jump to (and step
 * through) each one. */
export interface BookVocabWord {
  word: string;
  count: number;
  /** Locations of occurrences, capped per word so very common function
   * words don't blow up memory — `count` is always the true total even
   * when `occurrences` is capped. */
  occurrences: WordOccurrenceLocation[];
  rarity: WordRarity;
}

export interface WordOccurrenceLocation {
  sectionHref: string;
  /** This word's 0-based position among *its own* occurrences within that section (not all words). */
  indexInSection: number;
}
