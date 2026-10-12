import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DictionaryEntry, DictionaryLookupResult, WordInstance, WordOcrInfo, WordRarity } from '../../types';
import { getWordRarity, isRarityDataReady, TIER_LABELS } from '../../vocabRarity/rarity';
import { normalize } from '../../reader/tokenizer/arabicTokenizer';
import { usePreferences } from '../../state/PreferencesContext';
import { IconEdit, IconChevronLeft, IconChevronRight, IconBook, IconMaximize } from '../shared/icons';
import { buildEntryTokens, reconstructSelection, type ExampleEntryTokens } from './definitionTokens';
import { findMatchedEntries, scrollToFirstMatches } from '../../wasitMatch';
import { entriesAboutWord } from '../../dictionary/subEntries/match';
import { FOLD_ABOVE, visibleEntryIndexes } from '../../dictionary/entryFeatures';
import { entryLanguage } from '../../dictionary/providerTraits';
import { traitsOf } from '../../dictionary/providerTraits';
import { annotateEntry } from '../../wasitStructure';
import { arabicEntriesStartFolded, EntryDock, entryGist, groupLabel, type DockItem } from '../../popupClean';
import { dictionaryManager } from '../../dictionary';
import { AddDictionaryPanel } from '../../popupAddDictionary';
import { SentenceInBook } from './dictionaryPopup/SentenceInBook';
import { OcrNote } from './dictionaryPopup/OcrNote';
import { EditableWord } from './dictionaryPopup/EditableWord';
import { groupEntriesByProvider } from './dictionaryPopup/entryGroups';
import { useTokenSelection } from './dictionaryPopup/useTokenSelection';
import { hasRichSenses, renderGroupList, type EntryListContext } from './dictionaryPopup/entryList';
import './DictionaryPopup.css';

const VIEWPORT_MARGIN = 12;

/** A mouse or trackpad (so probably a keyboard): only then is a key hint worth showing. */
const hasFinePointer = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
const WORD_GAP = 14;

// Below this, there isn't room for a genuine two-column side-by-side split
// (see the popup's own width cap, calc(100vw - 24px)) -- Split falls back
// to a tab switcher between dictionaries instead of expanding sideways.
const NARROW_BREAKPOINT_PX = 480;

// See the matching constant/comment in DictionaryBubble.tsx -- iOS Safari's
// trailing synthetic 'click' for the tap that opened this popup can land on
// this backdrop (freshly inserted at that exact screen point, in the host
// document rather than the epub iframe's) and immediately dismiss the popup
// the same tap just opened. Ignoring a dismiss-click in the first instant
// after mount avoids that without delaying a genuine later dismiss tap.
const IGNORE_DISMISS_MS = 400;

export function DictionaryPopup({
  word,
  result: lookedUp,
  instance,
  saved,
  loading,
  x,
  y,
  wordRect,
  sizePct = 100,
  onClose,
  onSave,
  onSaveEntry,
  onUnsaveEntry,
  onSaveSelection,
  onEdit,
  onSaveEntries,
  onMaximise,
  onEditWord,
  ocr,
  page = false,
}: {
  word: string;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
  loading: boolean;
  /** Fallback anchor point (word's horizontal center, top edge) used only
   * when `wordRect` isn't supplied -- kept so any caller that hasn't been
   * updated to measure the word's full rect still gets *a* position. */
  x: number;
  y: number;
  /** The tapped `.ar-word` element's own `getBoundingClientRect()` (already
   * adjusted for the epub.js iframe's own offset, same as x/y above) --
   * lets recalcPosition below place the popup above/below/beside the word
   * without covering it, rather than just centering on a single point. */
  wordRect?: { top: number; bottom: number; left: number; right: number };
  /** Settings → "Dictionary popup size" -- 100 = the popup's normal size. */
  sizePct?: number;
  onClose: () => void;
  /** The main "Save Vocabulary" button — saves every entry the lookup found
   * onto one card (see vocabularyService.saveToVocabulary). Toggles: a
   * second press un-saves the word entirely (every card for it). */
  onSave: () => void;
  /** Per-entry "+" — saves just that one entry as its own card, for when a
   * word has more than one genuinely distinct meaning and the reader only
   * wants the one they're looking at. */
  onSaveEntry?: (entry: DictionaryEntry) => void | Promise<string | null | void>;
  /** Pressing a saved entry's "+" again: removes the card that save made (the id `onSaveEntry` resolved with). */
  onUnsaveEntry?: (itemId: string) => void | Promise<void>;
  /** For a long entry (Al-Wasit's paragraphs commonly run several
   * sub-senses together) where only part of it is relevant -- saves just
   * the text the reader selected, instead of the whole entry. */
  onSaveSelection?: (entry: DictionaryEntry, selectedText: string) => void;
  /** Opens the compact edit modal for this word's saved (or not-yet-saved)
   * card. */
  onEdit?: () => void;
  /** Clean layout: a "+" on the Al-Wasit heading that saves all of its entries as one card. */
  onSaveEntries?: (entries: DictionaryEntry[]) => void;
  /** Opens this word in the full-page dictionary (src/dictionaryPage); the header button and F. */
  onMaximise?: () => void;
  /** Drawn inside the full-page dictionary: in the page's flow, full width, no backdrop or close button. */
  page?: boolean;
  /** When given, the headword can be clicked and corrected in place; the popup then shows the corrected word's entry. */
  onEditWord?: (word: string) => void;
  /** For a word read from a scanned page: how sure the read is and what else it may have been. */
  ocr?: WordOcrInfo;
}) {
  const { prefs, updatePrefs } = usePreferences();

  // "Add a dictionary" (src/popupAddDictionary): turning one on re-runs this word's lookup here,
  // so the new section appears without the reader having to tap the word again.
  const [addOpen, setAddOpen] = useState(false);
  const [refreshed, setRefreshed] = useState<DictionaryLookupResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const result = refreshed ?? lookedUp;
  useEffect(() => {
    setRefreshed(null);
    setAddOpen(false);
  }, [word]);
  const maximiseRef = useRef(onMaximise);
  maximiseRef.current = onMaximise;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if ((key !== 'd' && key !== 'f') || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (key === 'f') {
        if (!maximiseRef.current) return;
        e.preventDefault();
        maximiseRef.current();
        return;
      }
      e.preventDefault();
      setAddOpen((o) => !o);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  async function addDictionary(id: string) {
    const next = Array.from(new Set([...prefs.enabledProviderIds, id]));
    updatePrefs({ enabledProviderIds: next });
    dictionaryManager.setEnabledProviders(next);
    setAddOpen(false);
    setRefreshing(true);
    try {
      setRefreshed(await dictionaryManager.lookup(word));
    } finally {
      setRefreshing(false);
    }
  }

  // Purely local, resets whenever the popup moves to a new word -- not
  // meant to track "is this permanently saved" (that's `saved`, computed
  // from vocabularyService for the word as a whole), just enough feedback
  // that tapping a per-entry "+" visibly did something.
  const [savedEntryKeys, setSavedEntryKeys] = useState<Set<number>>(new Set());
  // The card each per-entry "+" made, so pressing it again can remove just that one.
  const entryItemIds = useRef<Map<number, string>>(new Map());
  // Clean layout (src/popupClean): which verb entries have their other forms open.
  const clean = prefs.dictionaryPopupCleanLayout;
  const [openForms, setOpenForms] = useState<Set<number>>(new Set());
  // Clean layout: Arabic entries the reader flipped from how they started (open, or folded when there are many).
  const [foldedEntries, setFoldedEntries] = useState<Set<number>>(new Set());
  // Dictionaries whose long list the reader opened with "Show all N entries".
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Clean layout: dictionaries whose whole section was saved from its heading.
  const [savedGroups, setSavedGroups] = useState<Set<string>>(new Set());
  // Entries whose examples are all shown (the rest show the first few).
  const [expandedExamples, setExpandedExamples] = useState<Set<number>>(new Set());
  useEffect(() => {
    setExpandedExamples(new Set());
    setSavedEntryKeys(new Set());
    entryItemIds.current.clear();
    setSavedGroups(new Set());
    setFoldedEntries(new Set());
    setExpandedGroups(new Set());
  }, [word]);
  const morphology = result?.morphology?.[0];

  // Rarity badge — a small, best-effort enrichment on top of the dictionary
  // lookup, not the popup's main purpose, so it fails silently (no badge)
  // rather than blocking or erroring the rest of the popup if the
  // vocabulary-rarity dataset isn't enabled yet (see Settings).
  const [rarity, setRarity] = useState<WordRarity | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRarity(null);
    isRarityDataReady().then((ready) => {
      if (!ready || cancelled) return;
      getWordRarity(normalize(word), morphology?.pos, morphology?.lemma).then((r) => {
        if (!cancelled) setRarity(r);
      });
    });
    return () => {
      cancelled = true;
    };
    // morphology arrives asynchronously alongside `result` -- re-running
    // once it's in gets the complexity-aware, lemma-fallback tier instead of
    // a surface-form-only one computed before the analysis was ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, morphology?.pos, morphology?.lemma]);

  // Settings → "Multiple dictionaries" (see DictionaryPanelLayout): 'merged'
  // stacks every provider's entries in one list (unchanged, longstanding
  // behavior); 'split' rearranges that *same* information into two columns
  // (or a tab switcher below NARROW_BREAKPOINT_PX, where there's no room
  // for a real side-by-side split); 'single' filters down to one chosen
  // provider. Nothing is ever hidden by 'merged' or 'split' -- only
  // 'single' actually removes information from view.
  const allGroups = groupEntriesByProvider(result?.entries ?? []);
  const canSplit = allGroups.length > 1;
  // Clean layout: one dock tab per root article of a dictionary cut into forms (a word with several roots has several).
  const dockItems: DockItem[] = allGroups
    .filter((g) => traitsOf(g.providerId).articles === 'forms')
    .flatMap((g) => g.entries.filter(({ entry }, k) => k === 0 || entry.articleKey !== g.entries[k - 1].entry.articleKey))
    .map(({ entry, index }) => ({
      index,
      headword: entry.root ?? entry.headword,
      gist: entryGist(entry.senses[0]?.gloss ?? ''),
    }));
  const effectiveLayout: 'merged' | 'split' | 'single' =
    prefs.dictionaryPanelLayout === 'single' ? 'single' : prefs.dictionaryPanelLayout === 'split' && canSplit ? 'split' : 'merged';

  const singleGroups =
    effectiveLayout === 'single'
      ? allGroups.filter((g) => g.providerId === prefs.dictionaryPanelSingleProviderId).length > 0
        ? allGroups.filter((g) => g.providerId === prefs.dictionaryPanelSingleProviderId)
        : allGroups.slice(0, 1)
      : [];
  const [primaryGroup, ...restGroups] = allGroups;
  const secondaryGroups = restGroups;

  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX}px)`).matches);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX}px)`);
    const apply = () => setIsNarrow(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  // Which dictionary's entries the narrow-screen tab switcher currently
  // shows -- resets to the first provider whenever the popup moves to a
  // new word, same as savedEntryKeys above.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  useEffect(() => {
    setActiveTab(null);
  }, [word]);
  const activeTabId = activeTab ?? primaryGroup?.providerId;

  // Split view: each column scrolls independently (a long Al-Wasit entry
  // shouldn't force AraMorph's shorter column to match its height) --
  // except a narrow strip along the *inner* edge (the one touching the
  // shared divider between them), which scrolls both together so the two
  // stay aligned for side-by-side comparison. Primary renders first in DOM
  // (rightmost in this RTL layout) so its inner edge is its left; secondary
  // renders second (leftmost) so its inner edge is its right.
  const SYNC_ZONE_PX = 28;
  const primaryColRef = useRef<HTMLDivElement>(null);
  const secondaryColRef = useRef<HTMLDivElement>(null);
  function handleColumnWheel(e: React.WheelEvent<HTMLDivElement>, isPrimary: boolean) {
    const selfEl = isPrimary ? primaryColRef.current : secondaryColRef.current;
    const otherEl = isPrimary ? secondaryColRef.current : primaryColRef.current;
    if (!selfEl) return;
    const rect = selfEl.getBoundingClientRect();
    const inSyncZone = isPrimary ? e.clientX - rect.left < SYNC_ZONE_PX : rect.right - e.clientX < SYNC_ZONE_PX;
    if (inSyncZone) {
      e.preventDefault();
      selfEl.scrollTop += e.deltaY;
      if (otherEl) otherEl.scrollTop += e.deltaY;
    }
    // Outer zone: no-op here -- native per-column scrolling already handles it.
  }

  // Viewport-safe positioning: rather than guessing the popup's size ahead
  // of time (the old approach — a fixed height estimate — could still clip
  // a genuinely tall entry list, and didn't account for the size
  // preference at all), render it invisibly first, measure its *actual*
  // rendered box, then place it so it's fully on-screen. Vertical overflow
  // past that still scrolls inside the popup (see .dict-popup's
  // max-height/overflow-y in the stylesheet) rather than growing off-screen.
  const popupRef = useRef<HTMLDivElement>(null);

  // Entries about the tapped word: what a long list folds down to, and what starts open when the rest fold.
  const aboutEntries = useMemo(() => (result ? entriesAboutWord(result.entries, word, result.morphology) : new Set<number>()), [result, word]);
  // Entries on show (a long list shows only a few of its entries) that satisfy `test`.
  const shownCount = (test: (e: DictionaryEntry) => boolean) =>
    allGroups.reduce((n, g) => {
      const indexes = g.entries.map((e) => e.index);
      const shown = g.entries.length > FOLD_ABOVE && !expandedGroups.has(g.providerId) ? visibleEntryIndexes(indexes, aboutEntries) : indexes;
      return n + shown.filter((i) => result && test(result.entries[i])).length;
    }, 0);
  // Too many Arabic entries on show start folded to their headword row, and so do too many Baranov-style ones.
  const startFolded = clean && arabicEntriesStartFolded(shownCount((e) => entryLanguage(e) === 'ar'), prefs.collapseManyArabicEntries);
  const startFoldedExamples = clean && arabicEntriesStartFolded(shownCount((e) => hasRichSenses(e.providerId)), prefs.collapseManyArabicEntries);

  // An entry's text as word tokens (sense by sense, then each example) for picking words to save, cut the first time
  // it is wanted: Lane's articles are huge, and only the entries on show are ever asked for.
  const tokenCache = useMemo(() => new WeakMap<DictionaryEntry, ExampleEntryTokens>(), []);
  const tokensFor = useCallback(
    (entryIdx: number): ExampleEntryTokens | undefined => {
      const entry = result?.entries[entryIdx];
      if (!entry) return undefined;
      let tokens = tokenCache.get(entry);
      if (!tokens) {
        tokens = buildEntryTokens(entry);
        tokenCache.set(entry, tokens);
      }
      return tokens;
    },
    [result, tokenCache],
  );

  // Which senses of the root dictionaries' articles are the word that was looked up (see wasitMatch).
  const wasitMatches = useMemo(() => {
    if (!prefs.wasitMatchHighlight || !result) return new Map<number, Set<number>>();
    return findMatchedEntries(result.entries, word, result.morphology);
  }, [result, word, prefs.wasitMatchHighlight]);

  // Al-Wasit's internal structure (see wasitStructure); null = render plain.
  const wasitStructure = useMemo(() => {
    const map = new Map<number, ReturnType<typeof annotateEntry>>();
    if (!prefs.wasitStructureEnabled) return map;
    result?.entries.forEach((e, i) => {
      if (traitsOf(e.providerId).structure) map.set(i, annotateEntry(e, prefs.wasitLabelsEnabled));
    });
    return map;
  }, [result, prefs.wasitStructureEnabled, prefs.wasitLabelsEnabled]);

const {    tokenSelections,    activeSelectionEntry,    activeSelectionCount,    activeSelection,    clearEntrySelection,    handleTokenPointerDown,    handleTokensPointerMove,  } = useTokenSelection(word, tokensFor);
  /** The main "Save Vocabulary" (and its header-shortcut twin) button's
   * click handler -- when a selection is active, saves *only* that
   * selection instead of the whole lookup, so the safety this feature
   * promises ("won't accidentally save more than intended") actually
   * covers every save path, not just the per-entry one. */
  function handleMainSave() {
    if (activeSelectionEntry !== null && activeSelection && activeSelection.size > 0 && onSaveSelection) {
      const entry = result?.entries[activeSelectionEntry];
      const tokens = tokensFor(activeSelectionEntry);
      if (entry && tokens) {
        onSaveSelection(entry, reconstructSelection(tokens.flat, activeSelection));
        clearEntrySelection(activeSelectionEntry);
        return;
      }
    }
    onSave();
  }

  const [style, setStyle] = useState<{ left: number; top: number; visibility: 'hidden' | 'visible' }>({
    left: x,
    top: y,
    visibility: 'hidden',
  });

  const recalcPosition = useCallback(() => {
    const el = popupRef.current;
    if (!el || page) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampLeft = (left: number) => Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vw - rect.width - VIEWPORT_MARGIN));
    const clampTop = (top: number) => Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vh - rect.height - VIEWPORT_MARGIN));

    if (wordRect) {
      // Word-aware placement: below the word, then above, then beside it,
      // each tried only if the popup would land fully on-screen there --
      // the last resort (clamp only) is the one place this can still cover
      // the word, same graceful-degradation the feature accepts for small
      // screens/Split layout's narrower columns rather than never showing
      // a usable popup at all.
      const centerLeft = clampLeft((wordRect.left + wordRect.right) / 2 - rect.width / 2);

      const belowTop = wordRect.bottom + WORD_GAP;
      if (belowTop + rect.height <= vh - VIEWPORT_MARGIN) {
        setStyle({ left: centerLeft, top: belowTop, visibility: 'visible' });
        return;
      }

      const aboveTop = wordRect.top - WORD_GAP - rect.height;
      if (aboveTop >= VIEWPORT_MARGIN) {
        setStyle({ left: centerLeft, top: aboveTop, visibility: 'visible' });
        return;
      }

      // Neither direction has room (a short landscape viewport, typically)
      // -- shift beside the word instead, vertically centered on it. This
      // app's own chrome is RTL, so "forward" is the left side (matching
      // e.g. the reader footer's Next button already being on the left) --
      // tried first, then the right, whichever actually has room for the
      // popup's width.
      const sideTop = clampTop((wordRect.top + wordRect.bottom) / 2 - rect.height / 2);
      const spaceLeft = wordRect.left - VIEWPORT_MARGIN;
      const spaceRight = vw - VIEWPORT_MARGIN - wordRect.right;
      if (spaceLeft >= rect.width + WORD_GAP) {
        setStyle({ left: wordRect.left - WORD_GAP - rect.width, top: sideTop, visibility: 'visible' });
        return;
      }
      if (spaceRight >= rect.width + WORD_GAP) {
        setStyle({ left: wordRect.right + WORD_GAP, top: sideTop, visibility: 'visible' });
        return;
      }

      // Popup doesn't fit anywhere without covering the word (a small
      // screen, or a narrow Split-layout column) -- fall back to simply
      // keeping it fully on-screen, word visibility no longer guaranteed.
      setStyle({ left: centerLeft, top: clampTop(wordRect.top), visibility: 'visible' });
      return;
    }

    // No measured word rect (a caller that only has a point, not the
    // element itself) -- the old point-based heuristic: prefer above the
    // point, then below, then vertically centered on it, always clamped.
    const left = clampLeft(x - rect.width / 2);
    const fitsAbove = y - WORD_GAP - rect.height >= VIEWPORT_MARGIN;
    let top: number;
    if (fitsAbove) {
      top = y - WORD_GAP - rect.height;
    } else {
      const fitsBelow = y + WORD_GAP + rect.height <= vh - VIEWPORT_MARGIN;
      top = fitsBelow ? y + WORD_GAP : clampTop(y - rect.height / 2);
    }
    setStyle({ left, top: clampTop(top), visibility: 'visible' });
  }, [x, y, wordRect]);

  useLayoutEffect(() => {
    recalcPosition();
    // Re-measure whenever the word, loading state, or size preference
    // changes the popup's content/size, the target point moves, or Split
    // toggles (which changes the popup's own width). The Split->width
    // change is animated (~300ms CSS transition, see .dict-popup--split),
    // so this call catches the *start* of that resize -- the transitionend
    // handler on the popup element below catches the settled end of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, loading, result, x, y, wordRect, sizePct, effectiveLayout, isNarrow]);

  // Land on the looked-up word: once per result (and per Split tab), scroll each scroll container to the
  // first sub-entry coloured as matching it, unless it is already in view (see wasitMatch).
  const landedRef = useRef<{ result: unknown; view: string } | null>(null);
  useEffect(() => {
    const el = popupRef.current;
    if (!el || !prefs.subEntryScroll || loading || refreshing || !result || (!page && style.visibility !== 'visible')) return;
    const view = `${effectiveLayout}:${activeTabId ?? ''}`;
    if (landedRef.current?.result === result && landedRef.current.view === view) return;
    landedRef.current = { result, view };
    // The popup opens at its top: a match whose first line is already on screen (the lists fold to it) is left be.
    // The full-page dictionary keeps scrolling to bring the whole match into view.
    scrollToFirstMatches(el, { startIsEnough: !page });
  }, [result, wasitMatches, loading, refreshing, prefs.subEntryScroll, style.visibility, page, effectiveLayout, activeTabId]);

  const scale = sizePct / 100;

  const mountedAtRef = useRef(0);
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);
  function handleBackdropClick() {
    if (Date.now() - mountedAtRef.current < IGNORE_DISMISS_MS) return;
    onClose();
  }

  function toggleSplit() {
    updatePrefs({ dictionaryPanelLayout: prefs.dictionaryPanelLayout === 'split' ? 'merged' : 'split' });
  }
  const entryListContext: EntryListContext = {
    word,
    clean,
    prefs,
    wasitStructure,
    wasitMatches,
    tokensFor,
    tokenSelections,
    startFolded,
    startFoldedExamples,
    foldedEntries,
    setFoldedEntries,
    aboutEntries,
    expandedGroups,
    setExpandedGroups,
    savedGroups,
    setSavedGroups,
    savedEntryKeys,
    setSavedEntryKeys,
    entryItemIds,
    openForms,
    setOpenForms,
    expandedExamples,
    setExpandedExamples,
    onSaveEntry,
    onUnsaveEntry,
    onSaveEntries,
    onSaveSelection,
    clearEntrySelection,
    handleTokenPointerDown,
    handleTokensPointerMove,
  };

  const footer = (
    <>
      <div className="dict-popup__stats">
        <span>
          {instance?.encounterCount ?? 1} encounter{(instance?.encounterCount ?? 1) === 1 ? '' : 's'}
        </span>
        <span className="dict-popup__stats-dot">·</span>
        <span>
          {instance?.lookupCount ?? 1} lookup{(instance?.lookupCount ?? 1) === 1 ? '' : 's'}
        </span>
      </div>

      <div className="dict-popup__actions">
        <button
          className={
            'dict-popup__save' + (saved ? ' dict-popup__save--saved' : '') + (activeSelectionCount > 0 ? ' dict-popup__save--selection' : '')
          }
          onClick={handleMainSave}
          title={
            activeSelectionCount > 0
              ? `Will save only the ${activeSelectionCount} selected word${activeSelectionCount === 1 ? '' : 's'}, not the full definition`
              : undefined
          }
        >
          {activeSelectionCount > 0
            ? `Save selection (${activeSelectionCount})`
            : saved
              ? '✓ Vocabulary'
              : 'Save Vocabulary'}
        </button>
        {onEdit && (
          <button className="dict-popup__edit" onClick={onEdit}>
            Edit
          </button>
        )}
        {prefs.spaceSavesWord && !saved && hasFinePointer() && <span className="dict-popup__shortcut">Space</span>}
        {prefs.quickAddShortcutEnabled && <span className="dict-popup__shortcut">Ctrl Shift A</span>}
      </div>
    </>
  );

  return (
    <div className={page ? 'dict-popup-page' : 'dict-popup-backdrop'} onClick={page ? undefined : handleBackdropClick}>
      <div
        ref={popupRef}
        className={
          'dict-popup' +
          (clean ? ' dict-popup--clean' : '') +
          (page ? ' dict-popup--page' : '') +
          (effectiveLayout === 'split' && !isNarrow && !page ? ' dict-popup--split' : '') +
          (prefs.dictionaryPopupPinFooter && !page ? ' dict-popup--pinned-footer' : '')
        }
        style={page ? undefined : { left: style.left, top: style.top, visibility: style.visibility, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'width') recalcPosition();
        }}
      >
        {clean && !isNarrow && dockItems.length > 1 && (
          <EntryDock
            items={dockItems}
            popupRef={popupRef}
            scale={scale}
            onJump={(i) => {
              // Open the entry the tab points at, whether its list is folded and whether entries started folded or open.
              const group = allGroups.find((g) => g.entries.some((e) => e.index === i));
              if (group) setExpandedGroups((prev) => new Set(prev).add(group.providerId));
              setFoldedEntries((prev) => {
                const next = new Set(prev);
                if (startFolded && !aboutEntries.has(i)) next.add(i);
                else next.delete(i);
                return next;
              });
            }}
          />
        )}

        {canSplit && effectiveLayout !== 'single' && !page && (
          <button
            className="dict-popup__chevron"
            onClick={toggleSplit}
            aria-label={effectiveLayout === 'split' ? 'Show one dictionary column' : 'Compare dictionaries side by side'}
            title={effectiveLayout === 'split' ? 'Collapse' : 'Compare dictionaries'}
          >
            {effectiveLayout === 'split' ? <IconChevronRight size={13} /> : <IconChevronLeft size={13} />}
          </button>
        )}

      {addOpen && (
        <AddDictionaryPanel
          providers={dictionaryManager.getProviders()}
          enabledIds={prefs.enabledProviderIds}
          onAdd={addDictionary}
          onClose={() => setAddOpen(false)}
        />
      )}

      <div className="dict-popup__scroll">
        {!page && (
          <button className="dict-popup__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}

        {/* Quick-access header shortcuts, alongside the full "Save
            Vocabulary"/"Edit" buttons in the footer below -- these exist for
            reaching either action without scrolling down past a long entry
            list, not as a replacement for the footer pair. */}
        <div className="dict-popup__header-actions">
          <button
            className={'dict-popup__header-btn' + (activeSelectionCount > 0 ? ' dict-popup__header-btn--selection' : '')}
            onClick={handleMainSave}
            aria-label={activeSelectionCount > 0 ? `Save just the ${activeSelectionCount} selected words` : 'Add to vocabulary'}
            title={activeSelectionCount > 0 ? 'Will save only the selected words, not the full definition' : 'Add to vocabulary'}
          >
            +
          </button>
          {onEdit && (
            <button className="dict-popup__header-btn" onClick={onEdit} aria-label="Edit" title="Edit">
              <IconEdit size={12} />
            </button>
          )}
          <button
            className="dict-popup__header-btn"
            onClick={() => setAddOpen((o) => !o)}
            aria-label="Add a dictionary"
            aria-expanded={addOpen}
            title="Add a dictionary (D)"
          >
            <IconBook size={12} />
          </button>
          {onMaximise && (
            <button className="dict-popup__header-btn" onClick={onMaximise} aria-label="Open in full page" title="Open in full page (F)">
              <IconMaximize size={12} />
            </button>
          )}
        </div>

        <div className="dict-popup__word">
          {onEditWord ? <EditableWord key={word} word={word} suspect={!!ocr?.suspect} onCommit={onEditWord} /> : word}
          {rarity && (
            <span className={'dict-popup__rarity dict-popup__rarity--' + rarity.tier}>
              {TIER_LABELS[rarity.tier]}
              {rarity.percentile !== null ? ` · top ${Math.max(1, Math.round((1 - rarity.percentile) * 100))}%` : ' · not in frequency list'}
            </span>
          )}
        </div>

        {ocr && onEditWord && <OcrNote ocr={ocr} onPick={onEditWord} />}

        {(loading || refreshing) && <div className="dict-popup__loading">Looking up…</div>}

        {!loading && !refreshing && result?.failedProviders?.length ? (
          <div className="dict-popup__provider-error" role="status">
            Couldn't load: {result.failedProviders.map((p) => p.name).join(', ')}
          </div>
        ) : null}

        {!loading && !refreshing && !result?.entries.length && <div className="dict-popup__empty">No entry found for this word yet.</div>}

        {!loading && !refreshing && result?.entries.length ? (
          effectiveLayout === 'split' ? (
            isNarrow ? (
              <>
                <div className="dict-popup__tabs">
                  {allGroups.map((g) => (
                    <button
                      key={g.providerId}
                      className={'dict-popup__tab' + (g.providerId === activeTabId ? ' dict-popup__tab--active' : '')}
                      onClick={() => setActiveTab(g.providerId)}
                    >
                      {clean ? groupLabel(g) : g.providerName}
                    </button>
                  ))}
                </div>
                {renderGroupList(entryListContext, allGroups.filter((g) => g.providerId === activeTabId))}
              </>
            ) : (
              <div className="dict-popup__split-cols">
                <div className="dict-popup__split-col" ref={primaryColRef} onWheel={(e) => handleColumnWheel(e, true)}>
                  {renderGroupList(entryListContext, primaryGroup ? [primaryGroup] : [])}
                </div>
                <div className="dict-popup__split-col" ref={secondaryColRef} onWheel={(e) => handleColumnWheel(e, false)}>
                  {renderGroupList(entryListContext, secondaryGroups)}
                </div>
              </div>
            )
          ) : effectiveLayout === 'single' ? (
            renderGroupList(entryListContext, singleGroups)
          ) : (
            renderGroupList(entryListContext, allGroups)
          )
        ) : null}

        {instance?.sentence && <SentenceInBook sentence={instance.sentence} word={word} />}

        {/* Settings → "Pin Save/Edit buttons": unpinned (default), this
            stays right here and scrolls away with a long entry list, same
            as always. Pinned, it renders outside .dict-popup__scroll
            instead (below), fixed at the bottom regardless of scroll. */}
        {!prefs.dictionaryPopupPinFooter && footer}
      </div>
      {prefs.dictionaryPopupPinFooter && <div className="dict-popup__footer-pinned">{footer}</div>}
      </div>
    </div>
  );
}
