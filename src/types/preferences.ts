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
export interface TouchGestureBindings {
  singleTap: TouchDictionaryAction;
  doubleTap: TouchDictionaryAction;
  hold: TouchDictionaryAction;
}

export interface ReaderPreferences {
  theme: ReaderTheme;
  fontSizePct: number; // 100 = default
  fontFamily: string;
  lineHeight: number;
  readingWidthPct: number; // 100 = default column width
  /** Dictionary provider ids currently switched on. */
  enabledProviderIds: string[];
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
  /** Last AnkiConnect deck name used. */
  ankiDeckName: string;
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
}
