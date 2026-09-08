import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookMeta, DictionaryLookupResult, ReaderPreferences, RsvpToken, WordInstance } from '../../types';
import { dictionaryManager } from '../../dictionary/DictionaryManager';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { DictionaryPopup } from '../reader/DictionaryPopup';
import { RsvpWord } from './RsvpWord';
import {
  MAX_WPM,
  MIN_WPM,
  WPM_PRESETS,
  formatDuration,
  msPerWord,
  recordSession,
  savePosition,
  type SpeedReaderStream,
} from '../../speedReader/speedReaderService';
import './SpeedReaderFocus.css';

/** Controls fade out after this long with no interaction while playing. */
const INACTIVITY_HIDE_MS = 2600;
const WPM_STEP = 25;
/** How many tokens on either side of the current word to show in Context
 * Mode — small and secondary, per the spec, not a full paragraph. */
const CONTEXT_WINDOW = 9;
/** How many words a "jump" button skips. */
const JUMP_WORDS = 10;

interface PopupState {
  word: string;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
  loading: boolean;
}

export function SpeedReaderFocus({
  book,
  stream,
  startIndex,
  prefs,
  onPrefsChange,
  onExit,
}: {
  book: BookMeta;
  stream: SpeedReaderStream;
  startIndex: number;
  prefs: ReaderPreferences;
  onPrefsChange: (patch: Partial<ReaderPreferences>) => void;
  onExit: () => void;
}) {
  const { tokens, chapters } = stream;
  const clampedStart = Math.min(Math.max(startIndex, 0), Math.max(tokens.length - 1, 0));

  const [index, setIndex] = useState(clampedStart);
  const indexRef = useRef(index);
  indexRef.current = index;

  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(() => Math.min(MAX_WPM, Math.max(MIN_WPM, prefs.speedReaderWpm)));
  const [orpEnabled, setOrpEnabled] = useState(prefs.speedReaderOrpEnabled);
  const [contextEnabled, setContextEnabled] = useState(prefs.speedReaderContextEnabled);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [complete, setComplete] = useState<{ wordsRead: number; durationMs: number; averageWpm: number } | null>(
    null
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const sessionStartRef = useRef(Date.now());
  const wordsReadRef = useRef(0);
  const endedRef = useRef(false);

  const currentToken: RsvpToken | undefined = tokens[index];
  const currentChapter = useMemo(
    () => chapters.find((c) => index >= c.startIndex && index < c.endIndex) ?? chapters[chapters.length - 1],
    [chapters, index]
  );

  // ---------------------------------------------------------------------
  // Playback loop — a self-rescheduling timer rather than setInterval, so
  // a token's own dwell time (msPerWord — longer words / sentence ends get
  // a bit more) can vary tick to tick, and so a WPM change mid-wait takes
  // effect immediately rather than after the current word finishes.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    if (index >= tokens.length) {
      setPlaying(false);
      return;
    }
    const token = tokens[index];
    const delay = msPerWord(wpm, token);
    const timer = window.setTimeout(() => {
      wordsReadRef.current += 1;
      setIndex((i) => i + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, index, tokens, wpm]);

  // Reached the end of the stream while playing — finish the session.
  useEffect(() => {
    if (index >= tokens.length && tokens.length > 0 && !endedRef.current) {
      finishSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, tokens.length]);

  // Persist position as the reader advances (debounced by only writing on
  // pause/exit/every 20 words would be nicer, but IndexedDB puts are cheap
  // and this guarantees "close the app, come back" never loses more than
  // the current word).
  useEffect(() => {
    if (!currentToken) return;
    savePosition(book.id, currentToken.sectionHref, index);
  }, [book.id, currentToken, index]);

  function finishSession() {
    if (endedRef.current) return;
    endedRef.current = true;
    setPlaying(false);
    const durationMs = Date.now() - sessionStartRef.current;
    const wordsRead = wordsReadRef.current;
    const bookProgressPercent = tokens.length > 0 ? Math.min(1, indexRef.current / tokens.length) : 0;
    recordSession({ book, wordsRead, durationMs, bookProgressPercent }).then((session) => {
      setComplete({ wordsRead: session.wordsRead, durationMs: session.durationMs, averageWpm: session.averageWpm });
    });
  }

  // ---------------------------------------------------------------------
  // Fullscreen — best-effort: some environments (embedded iframes, some
  // test runners) refuse the Fullscreen API entirely, which shouldn't
  // block the reading experience itself, just the true-fullscreen chrome.
  // ---------------------------------------------------------------------
  useEffect(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------
  // Auto-hide controls
  // ---------------------------------------------------------------------
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), INACTIVITY_HIDE_MS);
    }
  }, [playing]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [revealControls]);

  useEffect(() => {
    // Pausing always brings controls back and keeps them up — nothing to
    // hide from while not actively reading.
    if (!playing) {
      setControlsVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    } else {
      revealControls();
    }
  }, [playing, revealControls]);

  function handleActivity(e: React.MouseEvent | React.TouchEvent) {
    if (e.type === 'mousemove') {
      revealControls();
      return;
    }
    // A tap on the stage itself (not on a button) toggles controls, matching
    // the "tap to reveal/hide" mobile pattern — but only when it isn't
    // interacting with a control element (those stopPropagation below).
    setControlsVisible((v) => !v);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (playing) hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), INACTIVITY_HIDE_MS);
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  function goTo(next: number) {
    const clamped = Math.min(Math.max(next, 0), Math.max(tokens.length - 1, 0));
    setIndex(clamped);
    if (clamped < tokens.length) endedRef.current = false;
  }
  function stepPrev() {
    goTo(index - 1);
  }
  function stepNext() {
    wordsReadRef.current += 1;
    goTo(index + 1);
  }
  function jumpBack() {
    goTo(index - JUMP_WORDS);
  }
  function jumpForward() {
    goTo(index + JUMP_WORDS);
  }
  function restart() {
    endedRef.current = false;
    wordsReadRef.current = 0;
    sessionStartRef.current = Date.now();
    setComplete(null);
    goTo(clampedStart);
    setPlaying(false);
  }
  function togglePlay() {
    if (index >= tokens.length) {
      restart();
      return;
    }
    setPlaying((p) => !p);
  }

  function changeWpm(next: number) {
    const clamped = Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(next)));
    setWpm(clamped);
    onPrefsChange({ speedReaderWpm: clamped });
  }
  function toggleOrp() {
    setOrpEnabled((v) => {
      onPrefsChange({ speedReaderOrpEnabled: !v });
      return !v;
    });
  }
  function toggleContext() {
    setContextEnabled((v) => {
      onPrefsChange({ speedReaderContextEnabled: !v });
      return !v;
    });
  }

  function handleExit() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onExit();
  }

  // ---------------------------------------------------------------------
  // Dictionary lookup for the current word
  // ---------------------------------------------------------------------
  async function handleWordClick() {
    if (!currentToken?.lookupWord) return;
    const word = currentToken.lookupWord;
    setPlaying(false);
    setPopup({ word, result: null, instance: null, saved: false, loading: true });
    const [result, saved] = await Promise.all([
      dictionaryManager.lookup(word),
      vocabularyService.isSaved(book.id, word),
    ]);
    const morphology = result.morphology?.[0];
    const sentence = contextWindowText(tokens, index, CONTEXT_WINDOW);
    const instance = await vocabularyService.recordLookup(book.id, word, {
      chapterHref: currentToken.sectionHref,
      sentence,
      lemma: morphology?.lemma,
      root: morphology?.root ?? result.entries[0]?.root,
    });
    setPopup({ word, result, instance, saved, loading: false });
  }

  async function handleSave() {
    if (!popup?.result || popup.saved) return;
    await vocabularyService.saveToVocabulary({
      surfaceForm: popup.word,
      entries: popup.result.entries,
      lemma: popup.result.morphology?.[0]?.lemma,
      root: popup.result.morphology?.[0]?.root ?? popup.result.entries[0]?.root,
      pos: popup.result.morphology?.[0]?.pos,
      book,
      chapterHref: currentToken?.sectionHref,
      wordInstance: popup.instance ?? undefined,
    });
    setPopup((p) => (p ? { ...p, saved: true } : p));
  }

  // ---------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (popup) {
        if (e.code === 'Escape') setPopup(null);
        return;
      }
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          revealControls();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPlaying(false);
          stepPrev();
          revealControls();
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPlaying(false);
          stepNext();
          revealControls();
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeWpm(wpm + WPM_STEP);
          revealControls();
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeWpm(wpm - WPM_STEP);
          revealControls();
          break;
        case 'KeyF':
          toggleFullscreen();
          break;
        case 'KeyC':
          setControlsVisible((v) => !v);
          break;
        case 'KeyR':
          restart();
          break;
        case 'Slash':
        case 'KeyH':
          if (e.shiftKey || e.code === 'KeyH') setHelpOpen((v) => !v);
          break;
        case 'Escape':
          handleExit();
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, wpm, playing, popup, tokens.length]);

  // ---------------------------------------------------------------------
  // Derived display data
  // ---------------------------------------------------------------------
  const progressPercent = tokens.length > 0 ? Math.min(1, index / Math.max(1, tokens.length - 1)) : 0;
  const fontScale = currentToken ? scaleForLength([...currentToken.display].length) : 3.2;

  if (tokens.length === 0) {
    return (
      <div className="rsvp-focus" ref={containerRef}>
        <div className="rsvp-focus__empty">
          <p>This book doesn't have any readable text to speed-read.</p>
          <button className="btn btn--primary" onClick={handleExit}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rsvp-focus"
      ref={containerRef}
      onMouseMove={handleActivity}
      onTouchStart={handleActivity}
    >
      <div className={'rsvp-focus__topbar' + (controlsVisible ? '' : ' rsvp-focus__topbar--hidden')}>
        <button className="rsvp-icon-btn" onClick={handleExit} aria-label="Exit Focus Mode" title="Exit (Esc)">
          ×
        </button>
        <div className="rsvp-focus__title">
          <span className="rsvp-focus__book">{book.title}</span>
          {currentChapter && <span className="rsvp-focus__chapter">{currentChapter.label}</span>}
        </div>
        <div className="rsvp-focus__topbar-actions">
          <button
            className="rsvp-icon-btn"
            onClick={() => setHelpOpen((v) => !v)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (H)"
          >
            ?
          </button>
          <button
            className="rsvp-icon-btn"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Display settings"
            title="Display settings"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="rsvp-focus__stage">
        <div className="rsvp-focus__word-zone" onClick={handleWordClick} role="button" tabIndex={-1}>
          {currentToken && <RsvpWord text={currentToken.display} orpEnabled={orpEnabled} fontScale={fontScale} />}
          {orpEnabled && <div className="rsvp-focus__orp-marker" aria-hidden="true" />}
        </div>
        {contextEnabled && currentToken && (
          <div className="rsvp-focus__context" dir="rtl">
            <ContextLine tokens={tokens} index={index} window={CONTEXT_WINDOW} />
          </div>
        )}
      </div>

      <div className={'rsvp-focus__controls' + (controlsVisible ? '' : ' rsvp-focus__controls--hidden')}>
        <div className="rsvp-progress" dir="rtl" onClick={(e) => e.stopPropagation()}>
          <div
            className="rsvp-progress__track"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              // dir="rtl": the track's visual right edge is 0%, left edge is 100%.
              const ratio = 1 - (e.clientX - rect.left) / rect.width;
              goTo(Math.round(ratio * (tokens.length - 1)));
            }}
          >
            <div className="rsvp-progress__fill" style={{ width: `${progressPercent * 100}%` }} />
          </div>
          <div className="rsvp-progress__label">
            {(index + 1).toLocaleString()} / {tokens.length.toLocaleString()} words · {(progressPercent * 100).toFixed(1)}%
          </div>
        </div>

        <div className="rsvp-transport" onClick={(e) => e.stopPropagation()}>
          <button className="rsvp-transport__btn" onClick={restart} aria-label="Restart" title="Restart (R)">
            ⟲
          </button>
          <button className="rsvp-transport__btn" onClick={jumpBack} aria-label="Jump backward" title="Jump back 10 words">
            ⏮
          </button>
          <button
            className="rsvp-transport__btn"
            onClick={() => {
              setPlaying(false);
              stepPrev();
            }}
            aria-label="Previous word"
            title="Previous word (←)"
          >
            ‹
          </button>
          <button className="rsvp-transport__btn rsvp-transport__btn--play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title="Play/Pause (Space)">
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            className="rsvp-transport__btn"
            onClick={() => {
              setPlaying(false);
              stepNext();
            }}
            aria-label="Next word"
            title="Next word (→)"
          >
            ›
          </button>
          <button className="rsvp-transport__btn" onClick={jumpForward} aria-label="Jump forward" title="Jump forward 10 words">
            ⏭
          </button>
        </div>

        <div className="rsvp-wpm" onClick={(e) => e.stopPropagation()}>
          <span className="rsvp-wpm__value">{wpm} WPM</span>
          <input
            type="range"
            min={MIN_WPM}
            max={MAX_WPM}
            step={5}
            value={wpm}
            onChange={(e) => changeWpm(Number(e.target.value))}
            className="rsvp-wpm__slider"
            aria-label="Words per minute"
          />
        </div>
      </div>

      {settingsOpen && (
        <div className="rsvp-panel rsvp-panel--settings" onClick={(e) => e.stopPropagation()}>
          <div className="rsvp-panel__row">
            <span>ORP (recognition-point alignment)</span>
            <label className="rsvp-switch">
              <input type="checkbox" checked={orpEnabled} onChange={toggleOrp} />
              <span className="rsvp-switch__track" />
            </label>
          </div>
          <div className="rsvp-panel__row">
            <span>Show context (surrounding sentence)</span>
            <label className="rsvp-switch">
              <input type="checkbox" checked={contextEnabled} onChange={toggleContext} />
              <span className="rsvp-switch__track" />
            </label>
          </div>
          <div className="rsvp-panel__row rsvp-panel__row--wpm-presets">
            <span>Speed preset</span>
            <div className="rsvp-panel__presets">
              {WPM_PRESETS.map((p) => (
                <button
                  key={p}
                  className={'rsvp-panel__preset' + (wpm === p ? ' rsvp-panel__preset--active' : '')}
                  onClick={() => changeWpm(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <button className="rsvp-panel__close" onClick={() => setSettingsOpen(false)}>
            Done
          </button>
        </div>
      )}

      {helpOpen && (
        <div className="rsvp-panel rsvp-panel--help" onClick={(e) => e.stopPropagation()}>
          <h3>Keyboard shortcuts</h3>
          <ul className="rsvp-shortcut-list">
            <li>
              <kbd>Space</kbd> Play / Pause
            </li>
            <li>
              <kbd>←</kbd> Previous word
            </li>
            <li>
              <kbd>→</kbd> Next word
            </li>
            <li>
              <kbd>↑</kbd> Increase speed
            </li>
            <li>
              <kbd>↓</kbd> Decrease speed
            </li>
            <li>
              <kbd>F</kbd> Toggle fullscreen
            </li>
            <li>
              <kbd>C</kbd> Show / hide controls
            </li>
            <li>
              <kbd>R</kbd> Restart
            </li>
            <li>
              <kbd>Esc</kbd> Exit
            </li>
          </ul>
          <button className="rsvp-panel__close" onClick={() => setHelpOpen(false)}>
            Close
          </button>
        </div>
      )}

      {popup && (
        <DictionaryPopup
          word={popup.word}
          result={popup.result}
          instance={popup.instance}
          saved={popup.saved}
          loading={popup.loading}
          x={window.innerWidth / 2}
          y={window.innerHeight / 2 + 90}
          onClose={() => setPopup(null)}
          onSave={handleSave}
        />
      )}

      {complete && (
        <div className="rsvp-summary" onClick={(e) => e.stopPropagation()}>
          <div className="rsvp-summary__card">
            <h2>Session Complete</h2>
            <dl className="rsvp-summary__stats">
              <div>
                <dt>Words read</dt>
                <dd>{complete.wordsRead.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Reading time</dt>
                <dd>{formatDuration(complete.durationMs)}</dd>
              </div>
              <div>
                <dt>Average speed</dt>
                <dd>{complete.averageWpm} WPM</dd>
              </div>
              <div>
                <dt>Book progress</dt>
                <dd>{Math.round(Math.min(1, index / Math.max(1, tokens.length)) * 100)}%</dd>
              </div>
            </dl>
            <div className="rsvp-summary__actions">
              <button className="btn btn--ghost" onClick={restart}>
                Read again
              </button>
              <button className="btn btn--primary" onClick={handleExit}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Font size (rem) for the central word — long words shrink a bit so they
 * still fit comfortably on one line instead of wrapping or overflowing. */
function scaleForLength(letters: number): number {
  if (letters <= 6) return 4.2;
  if (letters <= 10) return 3.4;
  if (letters <= 14) return 2.7;
  return 2.1;
}

/** The bounds of the same-section token window either side of `index` used
 * by both Context Mode's display and the sentence saved with a lookup. */
function contextWindowBounds(tokens: RsvpToken[], index: number, windowSize: number): { start: number; end: number } {
  const current = tokens[index];
  let start = index;
  let end = index;
  if (!current) return { start, end };
  while (start > 0 && index - start < windowSize && tokens[start - 1].sectionHref === current.sectionHref) start--;
  while (end < tokens.length - 1 && end - index < windowSize && tokens[end + 1].sectionHref === current.sectionHref) end++;
  return { start, end };
}

/** Plain-text version of the context window — used as the saved
 * sentence-context for a dictionary lookup (same shape the normal Reader's
 * `extractSentence` produces: an ellipsis-bounded snippet). */
function contextWindowText(tokens: RsvpToken[], index: number, windowSize: number): string {
  if (!tokens[index]) return '';
  const { start, end } = contextWindowBounds(tokens, index, windowSize);
  const before = start > 0 ? '… ' : '';
  const after = end < tokens.length - 1 ? ' …' : '';
  return before + tokens.slice(start, end + 1).map((t) => t.display).join(' ') + after;
}

/** Renders the Context Mode line with the current word visually picked out
 * from the rest of the surrounding sentence, per the spec's "the current
 * word should be visually identified." */
function ContextLine({ tokens, index, window: windowSize }: { tokens: RsvpToken[]; index: number; window: number }) {
  const { start, end } = contextWindowBounds(tokens, index, windowSize);
  const before = start > 0;
  const after = end < tokens.length - 1;
  return (
    <>
      {before && <span className="rsvp-focus__context-ellipsis">… </span>}
      {tokens.slice(start, end + 1).map((t) => (
        <span
          key={t.globalIndex}
          className={t.globalIndex === index ? 'rsvp-focus__context-current' : undefined}
        >
          {t.display}{' '}
        </span>
      ))}
      {after && <span className="rsvp-focus__context-ellipsis">…</span>}
    </>
  );
}
