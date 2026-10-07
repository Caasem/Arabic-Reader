import type { ReaderPreferences } from '../types';

export const DEFAULT_PREFS: ReaderPreferences = {
  theme: 'light',
  fontSizePct: 100,
  fontFamily: "'Lala', 'Noto Naskh Arabic', 'Amiri', 'Traditional Arabic', serif",
  readingFontAppWide: true,
  lineHeight: 2.1,
  readingWidthPct: 100,
  enabledProviderIds: ['aramorph'],
  dictionaryProviderOrder: [],
  readingFlow: 'paginated',
  continuousScrollEnabled: false,
  showPageBoundaries: false,
  hoverPreviewEnabled: false,
  sentenceContextEnabled: true,
  quickAddShortcutEnabled: false,
  spaceSavesWord: true,
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
  twoColumnEnabled: false,
  dictionaryPanelLayout: 'merged',
  dictionaryPanelSingleProviderId: null,
  dictionaryPopupPinFooter: false,
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  pomodoroAutoCycle: true,
  pomodoroNotification: 'toast',
  pomodoroShowPhaseLabel: true,
  shamelaEnabled: false,
  cleanReaderEnabled: false,
  quietReaderEnabled: true,
  dictionarySearchEnabled: true,
  dictionarySearchStyle: 'floating',
  bookSearchEnabled: true,
  bookVocabEnabled: true,
  noteCardEnabled: true,
  flashCardEnabled: true,
  verbFormsEnabled: true,
  dictionaryPopupCleanLayout: true,
  collapseManyArabicEntries: true,
  savedEntriesFirst: true,
  crowdSharing: false,
  lookEnabled: true,
  lookPalette: 'tan',
  lookCustom: {},
  wasitMatchHighlight: true,
  wasitStructureEnabled: true,
  wasitStructureExamples: 'dim',
};

/** A comfortable line length depends on screen width, so a device with no
 * saved preferences yet starts narrower on tablets and desktops. Once the
 * reader picks a width, their choice always wins. */
function defaultReadingWidthPctForDevice(): number {
  const width = typeof window !== 'undefined' ? window.innerWidth : 0;
  if (width >= 1100) return 65;
  if (width >= 700) return 80;
  return 100;
}

/** Defaults for a device that has never saved preferences. */
export function initialPreferences(): ReaderPreferences {
  return { ...DEFAULT_PREFS, readingWidthPct: defaultReadingWidthPctForDevice() };
}

/** Fills in fields added since the stored preferences were written. */
export function withDefaults(stored: Partial<ReaderPreferences>): ReaderPreferences {
  return { ...DEFAULT_PREFS, ...stored };
}
