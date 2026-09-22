import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookMeta, Highlight, HighlightColor } from '../../types';
import { usePreferences } from '../../state/PreferencesContext';
import { annotationService } from '../../reader/annotations';
import { vocabularyService } from '../../vocabulary';
import type { SelectionInfo } from '../../reader/epub/EpubService';
import type { ReadingSessionTracker } from '../../reader/session';
import { observeWordsSeen } from '../../reader/session';
import { distinctWordsIn, wrapArabicWords } from '../../reader/wordInteraction/wrapWords';
import { applyWordStyle, refreshWordStyles } from '../../reader/wordInteraction/wordStyle';
import { anchorOf, type HostRect } from '../../reader/wordInteraction/rectInHost';
import {
  attachSectionInteractions,
  createGestureState,
  type SectionInteractionHandlers,
} from '../../reader/wordInteraction/sectionInteractions';
import { useEpubReader } from './hooks/useEpubReader';
import { useSavedWords } from './hooks/useSavedWords';
import { useHoverPreview } from './hooks/useHoverPreview';
import { useWordLookups } from './hooks/useWordLookups';
import { useBookmarks } from './hooks/useBookmarks';
import { useBookHighlights } from './hooks/useBookHighlights';
import { useBookSearch, type SearchMode } from './hooks/useBookSearch';
import { ReaderTopbar } from './ReaderTopbar';
import { ReaderFooter } from './ReaderFooter';
import { TocPanel } from './TocPanel';
import { BookmarksPanel } from './BookmarksPanel';
import { SearchOverlay } from './SearchOverlay';
import { DictionaryPopup } from './DictionaryPopup';
import { DictionaryBubble } from './DictionaryBubble';
import { FootnotePopup } from './FootnotePopup';
import { HoverPreview } from './HoverPreview';
import { VocabLevels } from './VocabLevels';
import { SelectionToolbar } from './SelectionToolbar';
import { QuickSettingsPopover } from './QuickSettingsPopover';
import { VocabularyEditModal } from './VocabularyEditModal';
import { PomodoroTimer } from '../pomodoro/PomodoroTimer';
import { saveCleanFocus } from '../../cleanReader/cleanFocus';
import './Reader.css';

type Panel = 'toc' | 'bookmarks' | 'search' | null;

interface FootnoteState {
  href: string;
  sectionHref: string;
  x: number;
  y: number;
  loading: boolean;
  html: string | null;
  failed: boolean;
}

interface ReaderProps {
  book: BookMeta;
  onBack: () => void;
  /** The Vocabulary Levels panel, driven by the "Vocab Levels" nav tab. */
  vocabPanelOpen?: boolean;
  onVocabPanelOpenChange?: (open: boolean) => void;
  /** Opens at this CFI instead of the saved position (library search result). */
  initialCfiOverride?: string;
  /** Switches the open book -- for library search results in another book. */
  onOpenBookAt?: (book: BookMeta, cfi?: string) => void;
}

// The general ResizeObserver that re-paginated after sibling panels (TOC,
// Bookmarks, Vocab Levels) resized the reading column is disabled on the
// manual-reading-width-slider experiment: opening or closing a panel no
// longer flashes, but can leave text mis-paginated until the next resize.
// Only the reading-width setting triggers a resize (see below).
const RESIZE_ON_PANEL_TOGGLE = false;

export function Reader({
  book,
  onBack,
  vocabPanelOpen = false,
  onVocabPanelOpenChange,
  initialCfiOverride,
  onOpenBookAt,
}: ReaderProps) {
  const { prefs, resolvedTheme, updatePrefs } = usePreferences();
  const prefsRef = useRef(prefs);
  const themeRef = useRef(resolvedTheme);
  useLayoutEffect(() => {
    prefsRef.current = prefs;
    themeRef.current = resolvedTheme;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<ReadingSessionTracker | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [pomodoroOpen, setPomodoroOpen] = useState(false);
  const [vocabPanelCollapsed, setVocabPanelCollapsed] = useState(false);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [footnote, setFootnote] = useState<FootnoteState | null>(null);
  const [atSectionScrollEnd, setAtSectionScrollEnd] = useState(false);
  const [gestureState] = useState(createGestureState);

  const hover = useHoverPreview();
  const savedWords = useSavedWords(book.id, containerRef);
  const lookups = useWordLookups({ book, trackerRef, savedWords, prefsRef, onLookupStart: hover.dismiss });
  const { bookmarks, add: addBookmark, remove: removeBookmark } = useBookmarks(book);
  const bookHighlights = useBookHighlights(book.id);

  // Section listeners are attached once per rendered section; they call
  // through this ref so they always reach the latest handlers.
  const handlersRef = useRef<SectionInteractionHandlers | null>(null);
  const [sectionHandlers] = useState<SectionInteractionHandlers>(() => {
    const current = () => handlersRef.current!;
    return {
      prefs: () => current().prefs(),
      pageDirection: () => current().pageDirection(),
      onWordClick: (target) => current().onWordClick(target),
      onTouchAction: (action, target) => current().onTouchAction(action, target),
      onBackgroundClick: () => current().onBackgroundClick(),
      onDoubleTap: () => current().onDoubleTap(),
      onHoverStart: (word, element) => current().onHoverStart(word, element),
      onHoverEnd: () => current().onHoverEnd(),
      onSwipe: (direction) => current().onSwipe(direction),
      onFootnoteClick: (anchor, doc, sectionHref, rect) => current().onFootnoteClick(anchor, doc, sectionHref, rect),
      onActivity: () => current().onActivity(),
      onScrollEndChange: (atEnd) => current().onScrollEndChange(atEnd),
      onKeyDown: (e) => current().onKeyDown(e),
      onPointer: {
        down: (e) => current().onPointer.down(e),
        move: (e) => current().onPointer.move(e),
        up: () => current().onPointer.up(),
      },
    };
  });

  const { serviceRef, currentLocationRef, ready, error, toc, bookHandle, location } = useEpubReader({
    book,
    containerRef,
    trackerRef,
    prefsRef,
    themeRef,
    initialCfiOverride,
    reopenKey: prefs.readingFlow === 'scrolled' && prefs.continuousScrollEnabled ? 'continuous' : 'default',
    onSectionRendered(doc, sectionHref) {
      applyWordStyle(doc, themeRef.current === 'dark');
      wrapArabicWords(doc);
      savedWords.applyTo(doc);
      observeWordsSeen(doc, sectionHref, (key) => trackerRef.current?.recordWordSeen(key));
      // Once per section per session, so re-renders don't inflate encounter counts.
      if (trackerRef.current?.isFirstVisit(sectionHref) ?? true) {
        void vocabularyService.recordEncounters(book.id, distinctWordsIn(doc), sectionHref);
      }
      attachSectionInteractions(doc, sectionHref, sectionHandlers, gestureState);
    },
    onRelocated: () => hover.dismiss(),
    onSelected(info) {
      lookups.closeAll();
      hover.dismiss();
      setSelection(info);
    },
  });

  async function openFootnote(anchor: HTMLAnchorElement, doc: Document, sectionHref: string, rect: HostRect) {
    hover.dismiss();
    const href = anchor.getAttribute('href') || '';
    setFootnote({ href, sectionHref, ...anchorOf(rect), loading: true, html: null, failed: false });
    const content = await serviceRef.current?.loadFootnote(anchor, doc, sectionHref);
    // Don't resurrect a note that was dismissed or replaced while loading.
    setFootnote((prev) =>
      !prev || prev.href !== href
        ? prev
        : { ...prev, loading: false, html: content?.html ?? null, failed: !content }
    );
  }

  const latestHandlers: SectionInteractionHandlers = {
    prefs: () => prefsRef.current,
    pageDirection: () => serviceRef.current?.getCurrentDirection() ?? 'rtl',
    onWordClick: (target) => void lookups.openPopup(target),
    onTouchAction: (action, target) => lookups.runTouchAction(action, target),
    // The bubble's backdrop is click-through, so taps elsewhere dismiss it here.
    onBackgroundClick: () => lookups.closeBubble(),
    onDoubleTap: () => lookups.closeBubble(),
    onHoverStart: hover.schedule,
    onHoverEnd: hover.dismiss,
    onSwipe: (direction) => {
      hover.dismiss();
      lookups.closeBubble();
      if (direction === 'next') serviceRef.current?.next();
      else serviceRef.current?.prev();
    },
    onFootnoteClick: (anchor, doc, sectionHref, rect) => void openFootnote(anchor, doc, sectionHref, rect),
    onActivity: () => trackerRef.current?.recordActivity(),
    onScrollEndChange: setAtSectionScrollEnd,
    onKeyDown: (e) => {
      // Escape inside the book reaches overlays listening on the host window.
      if (e.key === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else void lookups.handleQuickAddKey(e);
    },
    onPointer: { down: () => {}, move: () => {}, up: () => {} },
  };
  useLayoutEffect(() => {
    handlersRef.current = latestHandlers;
  });

  // Quick-add from the host page (e.g. right after closing a popup).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') handlersRef.current?.onKeyDown(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Interacting with the reader chrome counts as reading activity too.
  useEffect(() => {
    const record = () => trackerRef.current?.recordActivity();
    window.addEventListener('mousemove', record);
    window.addEventListener('click', record);
    window.addEventListener('keydown', record);
    return () => {
      window.removeEventListener('mousemove', record);
      window.removeEventListener('click', record);
      window.removeEventListener('keydown', record);
    };
  }, []);

  // Reading preferences apply live. Keyed on just what epub.js uses:
  // re-applying themes for unrelated preferences would force re-layouts.
  const readingPrefsKey = [
    prefs.fontSizePct,
    prefs.lineHeight,
    prefs.fontFamily,
    prefs.readingFlow,
    prefs.pageDirection,
    prefs.twoColumnEnabled,
    resolvedTheme,
  ].join('|');
  useEffect(() => {
    if (ready) serviceRef.current?.applyPreferences(prefsRef.current, themeRef.current);
  }, [ready, readingPrefsKey, serviceRef]);

  useEffect(() => {
    if (ready) refreshWordStyles(containerRef.current, resolvedTheme === 'dark');
  }, [ready, resolvedTheme]);

  useEffect(() => {
    if (!RESIZE_ON_PANEL_TOGGLE || !ready || !containerRef.current) return;
    const container = containerRef.current;
    let debounce: number | null = null;
    let lastSize = { w: container.clientWidth, h: container.clientHeight };
    const observer = new ResizeObserver(() => {
      if (debounce !== null) window.clearTimeout(debounce);
      // Past the side panels' width transition, so the settled size is measured.
      debounce = window.setTimeout(() => {
        const size = { w: container.clientWidth, h: container.clientHeight };
        if (size.w === lastSize.w && size.h === lastSize.h) return;
        lastSize = size;
        serviceRef.current?.resize();
      }, 200);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (debounce !== null) window.clearTimeout(debounce);
    };
  }, [ready, serviceRef]);

  // The reading-width setting resizes the column immediately (CSS) and
  // re-paginates once dragging settles. Window resizes reach epub.js directly.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => serviceRef.current?.resize(), 150);
    return () => window.clearTimeout(timer);
  }, [ready, prefs.readingWidthPct, serviceRef]);

  const searchOpenBook = useCallback(
    async (query: string, options: { mode: SearchMode; pageOnly: boolean }) => {
      const svc = serviceRef.current;
      if (!svc) return [];
      return svc.search(query, { mode: options.mode, sectionHref: options.pageOnly ? svc.getCurrentSectionHref() : undefined });
    },
    [serviceRef]
  );

  const search = useBookSearch({
    book,
    open: panel === 'search',
    liveSearchEnabled: prefs.liveSearchEnabled,
    historyEnabled: prefs.searchHistoryEnabled,
    searchOpenBook,
    goToCfi: (cfi) => serviceRef.current?.goTo(cfi),
    openBookAt: onOpenBookAt,
  });

  const togglePanel = (next: Exclude<Panel, null>) => setPanel((current) => (current === next ? null : next));

  async function handleAddBookmark() {
    const loc = currentLocationRef.current;
    if (!loc) return;
    await addBookmark({
      cfi: loc.cfi,
      percent: loc.percent,
      pageLabel: serviceRef.current?.getPageLabel(loc.cfi),
      chapterHref: loc.chapterHref,
      chapterLabel: loc.chapterLabel,
    });
  }

  async function handleHighlightPick(color: HighlightColor) {
    if (!selection) return;
    const svc = serviceRef.current;
    const sectionHref = svc?.getCurrentSectionHref();
    const created = await annotationService.create({
      book,
      cfiRange: selection.cfiRange,
      text: selection.text,
      color,
      chapterHref: sectionHref,
      chapterLabel: svc?.getChapterLabelFor(sectionHref),
    });
    bookHighlights.added(created);
    svc?.renderHighlight(selection.cfiRange, color);
    svc?.clearSelection();
    setSelection(null);
  }

  function dismissSelection() {
    serviceRef.current?.clearSelection();
    setSelection(null);
  }

  async function recolorHighlight(highlight: Highlight, color: HighlightColor) {
    if (highlight.color === color) return;
    const updated = await annotationService.updateColor(highlight, color);
    bookHighlights.replaced(updated);
    serviceRef.current?.renderHighlight(updated.cfiRange, color);
  }

  async function removeHighlight(highlight: Highlight) {
    await annotationService.remove(highlight.id);
    bookHighlights.removed(highlight.id);
    serviceRef.current?.removeHighlight(highlight.cfiRange);
  }

  const showEndIndicator = prefs.showPageBoundaries && (prefs.readingFlow === 'paginated' ? location.atPageEnd : atSectionScrollEnd);
  const { popup, bubble, editing } = lookups;

  return (
    <div className="reader">
      <ReaderTopbar
        chapterLabel={location.chapterLabel}
        bookmarkCount={bookmarks.length}
        onBack={onBack}
        onToggleQuickSettings={() => setQuickSettingsOpen((open) => !open)}
        onTogglePomodoro={() => setPomodoroOpen((open) => !open)}
        onSwitchToCleanReader={() => updatePrefs({ cleanReaderEnabled: true })}
        onEnterCleanFocus={() => {
          saveCleanFocus(true);
          updatePrefs({ cleanReaderEnabled: true });
        }}
        onToggleSearch={() => togglePanel('search')}
        onAddBookmark={handleAddBookmark}
        onToggleBookmarks={() => togglePanel('bookmarks')}
        onToggleToc={() => togglePanel('toc')}
      />

      {quickSettingsOpen && <QuickSettingsPopover onClose={() => setQuickSettingsOpen(false)} />}
      {pomodoroOpen && <PomodoroTimer book={book} onClose={() => setPomodoroOpen(false)} />}

      <div className="reader__body">
        {panel === 'toc' && (
          <TocPanel
            items={toc}
            onSelect={(href) => {
              serviceRef.current?.goTo(href);
              setPanel(null);
            }}
          />
        )}

        {panel === 'search' && (
          <SearchOverlay
            search={search}
            liveSearchEnabled={prefs.liveSearchEnabled}
            historyEnabled={prefs.searchHistoryEnabled}
            onClose={() => setPanel(null)}
          />
        )}

        {panel === 'bookmarks' && (
          <BookmarksPanel
            bookmarks={bookmarks}
            highlights={bookHighlights.highlights}
            onAdd={handleAddBookmark}
            onOpen={({ cfi }) => {
              serviceRef.current?.goTo(cfi);
              setPanel(null);
            }}
            onRemove={removeBookmark}
            onRecolorHighlight={(highlight, color) => void recolorHighlight(highlight, color)}
            onRemoveHighlight={(highlight) => void removeHighlight(highlight)}
            onClose={() => setPanel(null)}
          />
        )}

        <div className="reader__stage">
          {error && <div className="reader__error">{error}</div>}
          {!ready && !error && <div className="reader__loading">Opening book…</div>}
          <div className="reader__epub-frame" style={{ width: `${prefs.readingWidthPct}%` }}>
            <div className="reader__epub" ref={containerRef} />
          </div>
          {/* End-of-page indicator: a plain, language-neutral divider that fades
              rather than mounting, so it never shifts the layout. */}
          <div className={'reader__end-indicator' + (showEndIndicator ? ' reader__end-indicator--visible' : '')} />
        </div>

        {vocabPanelOpen && (
          <VocabLevels
            book={book}
            bookHandle={bookHandle}
            collapsed={vocabPanelCollapsed}
            onToggleCollapse={() => setVocabPanelCollapsed((collapsed) => !collapsed)}
            onClose={() => onVocabPanelOpenChange?.(false)}
            onJumpToWord={(sectionHref, word, indexInSection) => {
              hover.dismiss();
              lookups.closeAll();
              setFootnote(null);
              void serviceRef.current?.goToWordOccurrence(sectionHref, word, indexInSection);
            }}
          />
        )}
      </div>

      <ReaderFooter
        pageLabel={location.pageLabel}
        percent={location.percent}
        onNext={() => serviceRef.current?.next()}
        onPrev={() => serviceRef.current?.prev()}
      />

      {selection && <SelectionToolbar x={selection.x} y={selection.y} onPick={handleHighlightPick} onDismiss={dismissSelection} />}

      {popup && (
        <DictionaryPopup
          word={popup.word}
          result={popup.result}
          instance={popup.instance}
          saved={popup.saved}
          loading={popup.loading}
          x={popup.x}
          y={popup.y}
          wordRect={popup.wordRect}
          sizePct={prefs.dictionaryPopupSizePct}
          onClose={lookups.closePopup}
          onSave={() => void lookups.togglePopupSave()}
          onSaveEntry={(entry) => void lookups.savePopupEntry(entry)}
          onSaveSelection={(entry, text) => void lookups.savePopupSelection(entry, text)}
          onEdit={lookups.startEditing}
        />
      )}

      {editing && (
        <VocabularyEditModal
          bookId={book.id}
          word={editing.word}
          alreadySaved={editing.saved}
          fallbackMeaning={editing.result?.entries[0]?.senses[0]?.gloss ?? ''}
          fallbackSentence={editing.instance?.sentence}
          onCancel={lookups.cancelEditing}
          onSave={lookups.saveEdit}
        />
      )}

      {bubble && (
        <DictionaryBubble
          word={bubble.word}
          result={bubble.result}
          loading={bubble.loading}
          saved={bubble.saved}
          x={bubble.x}
          y={bubble.y}
          onOpenFull={lookups.expandBubble}
          onSave={() => void lookups.saveBubble()}
          onDismiss={lookups.closeBubble}
        />
      )}

      {footnote && (
        <FootnotePopup
          loading={footnote.loading}
          html={footnote.html}
          failed={footnote.failed}
          x={footnote.x}
          y={footnote.y}
          onClose={() => setFootnote(null)}
          onGoToNote={() => {
            serviceRef.current?.goToFootnote(footnote.href, footnote.sectionHref);
            setFootnote(null);
          }}
        />
      )}

      {hover.preview && <HoverPreview gloss={hover.preview.gloss} x={hover.preview.x} y={hover.preview.y} />}

      {lookups.quickAddToast && (
        <div className="reader__quick-add-toast" role="status">
          {lookups.quickAddToast}
        </div>
      )}

      {lookups.touchToast && (
        <div className="reader__quick-add-toast reader__touch-toast" role="status">
          <span>{lookups.touchToast.message}</span>
          {lookups.touchToast.undo && (
            <button className="reader__touch-toast-undo" onClick={() => void lookups.undoQuickSave()}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
