import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DictionaryBubble } from '../components/reader/DictionaryBubble';
import { DictionaryPopup } from '../components/reader/DictionaryPopup';
import { HoverPreview } from '../components/reader/HoverPreview';
import { QuickSettingsPopover } from '../components/reader/QuickSettingsPopover';
import { ReaderFooter } from '../components/reader/ReaderFooter';
import { TocPanel } from '../components/reader/TocPanel';
import { VocabularyEditModal } from '../components/reader/VocabularyEditModal';
import { useHoverPreview } from '../components/reader/hooks/useHoverPreview';
import { useWordLookups } from '../components/reader/hooks/useWordLookups';
import { IconBack, IconContents, IconFocus } from '../components/shared/icons';
import { logDiagnostic } from '../diagnostics/diagnosticsLog';
import { libraryService } from '../library/libraryService';
import { ReadingSessionTracker } from '../reader/session/ReadingSessionTracker';
import { createGestureState, attachSectionInteractions, type SectionInteractionHandlers, type WordTarget } from '../reader/wordInteraction/sectionInteractions';
import { distinctWordsIn, wrapArabicWords } from '../reader/wordInteraction/wrapWords';
import { usePreferences } from '../state/PreferencesContext';
import { SAVED_WORD_COLOR } from '../theme/tokens';
import type { BookMeta, TocItem } from '../types';
import { vocabularyService } from '../vocabulary/vocabularyService';
import { chapterHtml } from './chapterHtml';
import { loadCleanFocus, saveCleanFocus } from './cleanFocus';
import { loadCleanPosition, saveCleanPosition } from './cleanPosition';
import { elementAsDocument } from './elementAsDocument';
import { parseCleanEpub, type CleanBook } from './parseCleanEpub';
import { useCleanSavedWords } from './useCleanSavedWords';
import './cleanReader.css';

/** Base reading size at 100%; the shared font-size preference scales it. */
const BASE_FONT_PX = 22;
const MAX_TEXT_WIDTH_PX = 900;
const SAVE_DEBOUNCE_MS = 300;

/**
 * Plain-text reading mode: the book is reduced to paragraphs and headings and
 * drawn straight into the page (no iframes, pagination or book CSS), while the
 * same word-tap dictionary, vocabulary and reading-time tracking apply.
 * Highlights, bookmarks and in-book search are epub-position based and are not
 * available here.
 */
export function CleanReader({
  book,
  onBack,
  onFocusChromeChange,
}: {
  book: BookMeta;
  onBack(): void;
  /** Lets the app hide its own sidebar while the text fills the screen. */
  onFocusChromeChange?(hidden: boolean): void;
}) {
  const { prefs, resolvedTheme, updatePrefs } = usePreferences();
  const prefsRef = useRef(prefs);
  useLayoutEffect(() => {
    prefsRef.current = prefs;
  });

  const [clean, setClean] = useState<CleanBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  // Focus: nothing but the text on screen; arrows navigate, Esc leaves.
  // Starts true when Classic Mode's own Focus button switched readers.
  const [focus, setFocus] = useState(loadCleanFocus);
  const focusRef = useRef(focus);
  const [showExitHint, setShowExitHint] = useState(focus);

  const stageRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const trackerRef = useRef<ReadingSessionTracker | null>(null);
  const chapterRef = useRef(0);
  const scrollRatioRef = useRef(0);
  const restoreScrollRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const stepChapterRef = useRef<(delta: number) => void>(() => {});
  const [gestureState] = useState(createGestureState);

  const hover = useHoverPreview();
  const savedWords = useCleanSavedWords(book.id, articleRef);
  const lookups = useWordLookups({ book, trackerRef, savedWords, prefsRef, onLookupStart: hover.dismiss });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await libraryService.getBookFile(book.id);
        if (!file) throw new Error('Could not read this book file.');
        const parsed = await parseCleanEpub(file);
        if (cancelled) return;
        const saved = loadCleanPosition(book.id);
        const start = Math.min(saved.chapter, parsed.chapters.length - 1);
        const startPercent = (start + saved.scroll) / parsed.chapters.length;
        chapterRef.current = start;
        restoreScrollRef.current = saved.scroll;
        const tracker = new ReadingSessionTracker(book.id, book.title, startPercent);
        tracker.start();
        trackerRef.current = tracker;
        setProgress(startPercent);
        setChapter(start);
        setClean(parsed);
      } catch (e) {
        if (cancelled) return;
        logDiagnostic('error', 'reader', `Could not open "${book.title}" in clean mode`, e);
        setError(e instanceof Error ? e.message : 'Could not open this book.');
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      void trackerRef.current?.finish();
      trackerRef.current = null;
    };
  }, [book.id, book.title]);

  const html = useMemo(() => (clean ? chapterHtml(clean.chapters[chapter]) : ''), [clean, chapter]);
  const total = clean?.chapters.length ?? 0;

  // Runs after React has written the chapter's HTML: make its words tappable,
  // then restore (or reset) the scroll position.
  useLayoutEffect(() => {
    const article = articleRef.current;
    const stage = stageRef.current;
    if (!article || !stage || !clean) return;
    wrapArabicWords(article);
    savedWords.repaint();
    const sectionHref = `clean:${chapter}`;
    if (trackerRef.current?.isFirstVisit(sectionHref) ?? true) {
      void vocabularyService.recordEncounters(book.id, distinctWordsIn(article), sectionHref);
    }
    const restore = restoreScrollRef.current;
    restoreScrollRef.current = null;
    stage.scrollTop = restore === null ? 0 : restore * Math.max(0, stage.scrollHeight - stage.clientHeight);
    // The page itself never scrolls, so the up/down/space keys only scroll the text while it has focus.
    stage.focus({ preventScroll: true });
  }, [html, clean, chapter, book.id, savedWords]);

  const withChapter = (target: WordTarget): WordTarget => ({ ...target, sectionHref: `clean:${chapterRef.current}` });

  const handlersRef = useRef<SectionInteractionHandlers | null>(null);
  const [sectionHandlers] = useState<SectionInteractionHandlers>(() => {
    const current = () => handlersRef.current!;
    return {
      prefs: () => current().prefs(),
      pageDirection: () => 'rtl',
      onWordClick: (target) => current().onWordClick(target),
      onTouchAction: (action, target) => current().onTouchAction(action, target),
      onBackgroundClick: () => current().onBackgroundClick(),
      onDoubleTap: () => current().onDoubleTap(),
      onHoverStart: (word, element) => current().onHoverStart(word, element),
      onHoverEnd: () => current().onHoverEnd(),
      onSwipe: (direction) => current().onSwipe(direction),
      onFootnoteClick: () => {},
      onActivity: () => current().onActivity(),
      onScrollEndChange: () => {},
      onKeyDown: () => {},
      onPointer: { down: () => {}, move: () => {}, up: () => {} },
    };
  });
  useLayoutEffect(() => {
    handlersRef.current = {
      // Swipes turn epub pages; here the text scrolls, so never treat them as page turns.
      // Swipes only turn chapters in Focus, where there are no buttons to do it.
      prefs: () => ({ ...prefsRef.current, readingFlow: focusRef.current ? 'paginated' : 'scrolled' }),
      pageDirection: () => 'rtl',
      onWordClick: (target) => void lookups.openPopup(withChapter(target)),
      onTouchAction: (action, target) => lookups.runTouchAction(action, withChapter(target)),
      onBackgroundClick: () => lookups.closeBubble(),
      onDoubleTap: () => lookups.closeBubble(),
      onHoverStart: hover.schedule,
      onHoverEnd: hover.dismiss,
      onSwipe: (direction) => stepChapterRef.current(direction === 'next' ? 1 : -1),
      onFootnoteClick: () => {},
      onActivity: () => trackerRef.current?.recordActivity(),
      onScrollEndChange: () => {},
      onKeyDown: () => {},
      onPointer: { down: () => {}, move: () => {}, up: () => {} },
    };
  });

  useEffect(() => {
    const article = articleRef.current;
    if (article) attachSectionInteractions(elementAsDocument(article), 'clean', sectionHandlers, gestureState);
  }, [sectionHandlers, gestureState]);

  // Quick-add shortcut and reader activity come from the page itself (there is
  // no separate document for keystrokes to be trapped in).
  const lookupsRef = useRef(lookups);
  useLayoutEffect(() => {
    lookupsRef.current = lookups;
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      trackerRef.current?.recordActivity();
      // The text is right-to-left, so "forward" is the left arrow.
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !typing && !lookupsRef.current.editing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        stepChapterRef.current(e.key === 'ArrowLeft' ? 1 : -1);
        return;
      }
      if (e.key === 'Escape') {
        const l = lookupsRef.current;
        // Escape closes an open popup first; only a bare Escape leaves Focus.
        if (focusRef.current && !l.popup && !l.bubble && !l.editing) setFocus(false);
        return;
      }
      void lookupsRef.current.handleQuickAddKey(e);
    };
    const record = () => trackerRef.current?.recordActivity();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', record);
    window.addEventListener('click', record);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', record);
      window.removeEventListener('click', record);
    };
  }, []);

  useLayoutEffect(() => {
    focusRef.current = focus;
  });
  useEffect(() => {
    saveCleanFocus(focus);
    onFocusChromeChange?.(focus);
  }, [focus, onFocusChromeChange]);
  useEffect(() => {
    if (!showExitHint) return;
    const timer = window.setTimeout(() => setShowExitHint(false), 3500);
    return () => window.clearTimeout(timer);
  }, [showExitHint]);

  function enterFocus() {
    setTocOpen(false);
    setQuickSettingsOpen(false);
    setShowExitHint(true);
    setFocus(true);
  }
  useEffect(() => () => onFocusChromeChange?.(false), [onFocusChromeChange]);

  const goToChapter = useCallback(
    (index: number) => {
      if (!clean) return;
      const next = Math.max(0, Math.min(clean.chapters.length - 1, index));
      chapterRef.current = next;
      restoreScrollRef.current = null;
      scrollRatioRef.current = 0;
      saveCleanPosition(book.id, { chapter: next, scroll: 0 });
      setProgress(next / clean.chapters.length);
      setChapter(next);
      setTocOpen(false);
      lookupsRef.current.closeAll();
      hover.dismiss();
    },
    [clean, book.id, hover]
  );

  useEffect(() => {
    stepChapterRef.current = (delta) => goToChapter(chapterRef.current + delta);
  }, [goToChapter]);

  function handleScroll() {
    const stage = stageRef.current;
    if (!stage || !clean) return;
    const max = stage.scrollHeight - stage.clientHeight;
    const ratio = max > 0 ? Math.min(1, stage.scrollTop / max) : 0;
    scrollRatioRef.current = ratio;
    const percent = (chapterRef.current + ratio) / clean.chapters.length;
    setProgress(percent);
    trackerRef.current?.recordPercent(percent);
    hover.dismiss();
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveCleanPosition(book.id, { chapter: chapterRef.current, scroll: scrollRatioRef.current });
    }, SAVE_DEBOUNCE_MS);
  }

  const tocItems: TocItem[] = useMemo(
    () => (clean?.chapters ?? []).map((c, i) => ({ href: String(i), label: c.title })),
    [clean]
  );

  const { popup, bubble, editing } = lookups;
  const savedColor = SAVED_WORD_COLOR[resolvedTheme === 'dark' ? 'dark' : 'light'];

  return (
    <div className="reader">
      {!focus && (
      <header className="reader__topbar">
        <button className="reader__back" onClick={onBack}>
          <IconBack size={14} /> Library
        </button>
        <div className="reader__chapter" dir="auto">
          {clean?.chapters[chapter]?.title}
        </div>
        <div className="reader__topbar-actions">
          <button
            className="reader__toc-toggle"
            onClick={() => setQuickSettingsOpen((open) => !open)}
            aria-label="Font and appearance"
            title="Font and appearance"
            style={{ fontFamily: 'serif', fontWeight: 600 }}
          >
            Aa
          </button>
          <button
            className="reader__toc-toggle"
            onClick={() => updatePrefs({ cleanReaderEnabled: false })}
            title="Switch back to the original reader"
          >
            Original view
          </button>
          <button className="reader__toc-toggle" onClick={enterFocus} title="Focus (Esc to exit)">
            <IconFocus size={14} /> Focus
          </button>
          <button className="reader__toc-toggle" onClick={() => setTocOpen((open) => !open)}>
            <IconContents size={14} /> Contents
          </button>
        </div>
      </header>
      )}

      {!focus && quickSettingsOpen && <QuickSettingsPopover onClose={() => setQuickSettingsOpen(false)} />}

      <div className="reader__body">
        {!focus && tocOpen && <TocPanel items={tocItems} onSelect={(href) => goToChapter(Number(href))} />}

        <div className="clean-reader__stage" ref={stageRef} tabIndex={-1} onScroll={handleScroll}>
          {error && <div className="reader__error">{error}</div>}
          {!clean && !error && <div className="reader__loading">Opening book…</div>}
          <article
            ref={articleRef}
            className="clean-reader__text"
            dir="rtl"
            lang="ar"
            style={
              {
                width: `${prefs.readingWidthPct}%`,
                maxWidth: MAX_TEXT_WIDTH_PX,
                fontFamily: `'Lotus', ${prefs.fontFamily}`,
                fontSize: `${(BASE_FONT_PX * prefs.fontSizePct) / 100}px`,
                lineHeight: prefs.lineHeight,
                '--saved-word-color': savedColor,
              } as React.CSSProperties
            }
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      {focus ? (
        <>
          {total > 0 && <div className="clean-reader__counter">{chapter + 1} / {total}</div>}
          {showExitHint && <div className="clean-reader__hint">← → to turn chapters · Esc to exit</div>}
        </>
      ) : (
      <ReaderFooter
          pageLabel={total ? `${chapter + 1} / ${total}` : undefined}
          percent={progress}
          onNext={() => goToChapter(chapter + 1)}
          onPrev={() => goToChapter(chapter - 1)}
        />
      )}

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
