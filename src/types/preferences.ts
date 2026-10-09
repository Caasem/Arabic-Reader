/** 'dark' is labeled "Night" in the UI; 'system' follows the OS live. */
export type ReaderTheme = 'light' | 'dark' | 'sepia' | 'system';

export type ReadingFlow = 'paginated' | 'scrolled';

/** Page-turn direction. 'auto' uses the book's declared direction (RTL if none). */
export type PageDirection = 'auto' | 'rtl' | 'ltr';

/** How a dictionary entry shows a root/citation form that differs from its
 * headword: a small caption line, or small badges. */
export type MorphDisplayStyle = 'caption' | 'badges';

/** How the dictionary popup arranges several providers' results: 'merged'
 * stacks them, 'split' shows them side by side (a switcher on narrow
 * screens), 'single' shows only one provider (see
 * `dictionaryPanelSingleProviderId`). */
export type DictionaryPanelLayout = 'merged' | 'split' | 'single';

export type PomodoroNotification = 'toast' | 'sound' | 'silent';

/**
 * What a touch gesture on a word does: 'bubble' shows the condensed
 * definition bubble, 'quickSave' saves straight to vocabulary with a toast,
 * 'openDictionary' opens the full popup, and 'none' disables the gesture
 * (a single or double tap then falls through to the ordinary click).
 */
export type TouchDictionaryAction = 'bubble' | 'quickSave' | 'openDictionary' | 'none';

/**
 * A single tap fires instantly -- never delayed to wait for a possible
 * second tap. A double tap is a second tap on the same word shortly after,
 * and runs in addition to the first tap's action. Hold is off by default
 * because a long-press also starts text selection (for highlighting).
 */
/** A shelf the reader made in the Library ("Hadith", "Grammar"…). A book can sit on several. */
export interface LibraryShelf {
  id: string;
  name: string;
  /** A swatch colour (hex) for the shelf's dot. */
  color: string;
  bookIds: string[];
}

export type LibrarySort = 'lastRead' | 'added' | 'title' | 'progress';

export interface TouchGestureBindings {
  singleTap: TouchDictionaryAction;
  doubleTap: TouchDictionaryAction;
  hold: TouchDictionaryAction;
}

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontSizePct: number; // 100 = default
  /** CSS font stack for book text, picked in Settings -> Font (src/readerFont). */
  fontFamily: string;
  /** Also use `fontFamily` for Arabic text outside the book (dictionary, vocabulary, review). */
  readingFontAppWide: boolean;
  lineHeight: number;
  readingWidthPct: number; // 100 = default column width
  /** Dictionary provider ids currently switched on. */
  enabledProviderIds: string[];
  /** Dictionary ids in the order their entries appear in the popup (Settings -> Dictionaries). Empty = registration order. */
  dictionaryProviderOrder: string[];
  readingFlow: ReadingFlow;
  /** Scrolling layout only. Off: scrolling stops at each chapter's end. On:
   * chapters flow into one continuous feed. Changing it reopens the book,
   * since epub.js can't swap view managers on a live rendition. */
  continuousScrollEnabled: boolean;
  /** A subtle divider at the end of the page (Paged) or chapter (Scrolling). */
  showPageBoundaries: boolean;
  /** A condensed translation on mouse hover, in addition to the popup on click. */
  hoverPreviewEnabled: boolean;
  /** Capture the containing sentence with each lookup, for vocabulary cards,
   * Review, and Anki. */
  sentenceContextEnabled: boolean;
  /** Ctrl+Shift+A saves the most recently looked-up word. */
  quickAddShortcutEnabled: boolean;
  /** With a word's dictionary open, Space saves it (never un-saves). */
  spaceSavesWord: boolean;
  /** The full-page dictionary: the popup's maximise button and F, Alt+D's Full page, the Dictionary nav item (src/dictionaryPage). */
  dictionaryFullPageEnabled: boolean;
  /** Last AnkiConnect deck name used. */
  ankiDeckName: string;
  /** Sync to Anki every 15 minutes while the app is open and Anki is reachable. */
  ankiAutoSync: boolean;
  /** Delete the Anki note when its card is removed in the app. */
  ankiRemoveDeleted: boolean;
  /** Last Speed Reader words-per-minute. */
  speedReaderWpm: number;
  /** Align each word's recognition point to a fixed marker (RSVP). */
  speedReaderOrpEnabled: boolean;
  /** Show the surrounding sentence under the RSVP word. */
  speedReaderContextEnabled: boolean;
  /** Touch devices only; a mouse click always opens the full popup. */
  touchGestures: TouchGestureBindings;
  pageDirection: PageDirection;
  /** Dictionary popup size, 100 = normal. The popup still stays on screen. */
  dictionaryPopupSizePct: number;
  /** Search as you type; off = search on submit. */
  liveSearchEnabled: boolean;
  /** Remember recent in-book searches. */
  searchHistoryEnabled: boolean;
  morphDisplayStyle: MorphDisplayStyle;
  /** Two-page spread in Paged layout, forced on/off regardless of width. */
  twoColumnEnabled: boolean;
  dictionaryPanelLayout: DictionaryPanelLayout;
  /** The provider shown in 'single' layout; null = whichever comes first. */
  dictionaryPanelSingleProviderId: string | null;
  /** Keep the popup's stats line and Save/Edit buttons pinned to its bottom. */
  dictionaryPopupPinFooter: boolean;
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
  /** On: the next phase starts on its own. Off: the timer waits at 00:00. */
  pomodoroAutoCycle: boolean;
  pomodoroNotification: PomodoroNotification;
  /** Show "Work"/"Break" above the countdown. */
  pomodoroShowPhaseLabel: boolean;
  /** Enable Shamela Library integration (beta). */
  shamelaEnabled: boolean;
  /** Read books as plain text instead of in the epub reader (beta). */
  cleanReaderEnabled: boolean;
  /** The redesigned reader (src/quietReader): clean text, one dock, the dictionary in the margin. Off: the readers above. */
  quietReaderEnabled: boolean;
  /** Press D in either reader to search the dictionary. */
  dictionarySearchEnabled: boolean;
  /** How the D-key search is laid out; touch screens always get the sheet. */
  dictionarySearchStyle: 'floating' | 'palette' | 'drawer' | 'sheet';
  /** Press Alt+S in the epub reader to search the whole book (src/bookSearch). */
  bookSearchEnabled: boolean;
  /** Press Alt+V to list the words saved from the open book (src/bookVocab). */
  bookVocabEnabled: boolean;
  /** Press Alt+N to write a note on the selection, in a floating card (src/noteCard). */
  noteCardEnabled: boolean;
  /** Press Alt+F to write a flashcard of your own, in a floating card (src/flashCard). */
  flashCardEnabled: boolean;
  /** The study desk (src/studyDesk): inbox (Alt+I), concept (Alt+C), region capture (Alt+X), desk documents. */
  studyDeskEnabled: boolean;
  /** Notes in the reader's margins (Alt+M), part of the study desk. */
  studyDeskMargins: 'both' | 'right' | 'left' | 'off';
  /** Which margin notes appear in the desk document. */
  studyDeskMarginsInDocument: 'all' | 'chosen' | 'none';
  /** Margin notes go to the inbox when you leave them (auto) or only when you send them (ask). */
  studyDeskMarginsToInbox: 'ask' | 'auto';
  /** Ink and sketches (src/annotate): write on the page (Alt+W) and a sketch sheet beside it (Alt+K). */
  annotateEnabled: boolean;
  /** Show a verb's form (I-X) and its root's other verbs in the dictionary popup (src/verbForms). */
  verbFormsEnabled: boolean;
  /** The aligned, roomier dictionary popup layout (src/popupClean). Off restores the classic popup. */
  dictionaryPopupCleanLayout: boolean;
  /** Clean popup: start the Arabic definitions folded when there are more than two of them. */
  collapseManyArabicEntries: boolean;
  /** Entries the reader saved for a word in a book come first in their dictionary next time (src/sensePicks). No setting shows it yet. */
  savedEntriesFirst: boolean;
  /** Share which entries I save, and use the rankings other readers' saves produce (src/crowdSync). Off by default. */
  crowdSharing: boolean;
  /** The redesign (src/look): softer cards, serif headings, fuller colour scheme. */
  lookEnabled: boolean;
  /** Which preset palette the look starts from. */
  lookPalette: string;
  /** Colours the person picked over the preset, by role (hex). */
  lookCustom: Partial<Record<'bg' | 'surface' | 'ink' | 'accent' | 'secondary' | 'highlight' | 'warning', string>>;
  /** Prototype: colour the Al-Wasit sense matching the looked-up word. */
  wasitMatchHighlight: boolean;
  /** Prototype: draw Al-Wasit's internal structure in the popup. */
  wasitStructureEnabled: boolean;
  wasitStructureExamples: 'dim' | 'normal';
  /** The reader's own shelves in the Library. */
  libraryShelves: LibraryShelf[];
  libraryView: 'grid' | 'list';
  librarySort: LibrarySort;
  /** Minutes of reading a day the Library's "Today" ring counts towards. */
  dailyGoalMinutes: number;
  /** Show one of your highlights at the top of the Library. */
  libraryShowQuote: boolean;
  /** Show streak, today's minutes, words saved and cards due in the Library. */
  libraryShowHabits: boolean;
  /** Browse library: show Clean / Some errors / Poor scan on each result, read from a sample of the book's text. Off by default. */
  browseShowQuality: boolean;
}
