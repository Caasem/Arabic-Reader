import { useEffect, useState } from 'react';
import { libraryService } from '../../library/libraryService';
import { usePreferences } from '../../state/PreferencesContext';
import type { BookMeta, RsvpChapter, SpeedReaderPosition } from '../../types';
import {
  formatDuration,
  getLifetimeAverageWpm,
  getResumePosition,
  getSessions,
  loadStream,
  type SpeedReaderStream,
} from '../../speedReader/speedReaderService';
import type { SpeedReaderSession } from '../../types';
import { SpeedReaderFocus } from './SpeedReaderFocus';
import './SpeedReader.css';

/**
 * Entry point for the Speed Reader section (nav tab "Speed Reader"). Before
 * dropping into Fullscreen Focus Mode, the reader picks a book, chapter,
 * and starting position — resuming where they left off is offered whenever
 * a saved position exists. Once launched, `SpeedReaderFocus` owns the
 * actual RSVP playback; this component just hands it a `stream` + start
 * index and gets the position back on exit so "Speed Reader ↔ normal
 * reading" can hand off cleanly without losing place.
 */
export function SpeedReader() {
  const { prefs, updatePrefs } = usePreferences();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [selectedBook, setSelectedBook] = useState<BookMeta | null>(null);

  const [stream, setStream] = useState<SpeedReaderStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [resumePos, setResumePos] = useState<SpeedReaderPosition | undefined>(undefined);
  const [selectedChapterHref, setSelectedChapterHref] = useState<string | null>(null);
  const [lifetimeAvgWpm, setLifetimeAvgWpm] = useState<number | null>(null);

  const [launch, setLaunch] = useState<{ stream: SpeedReaderStream; startIndex: number } | null>(null);

  useEffect(() => {
    libraryService.listBooks().then((list) => {
      setBooks(list);
      setLoadingBooks(false);
    });
    getLifetimeAverageWpm().then(setLifetimeAvgWpm);
  }, []);

  async function pickBook(book: BookMeta) {
    setSelectedBook(book);
    setStream(null);
    setStreamError(null);
    setSelectedChapterHref(null);
    setLoadingStream(true);
    try {
      const [s, pos] = await Promise.all([loadStream(book.id), getResumePosition(book.id)]);
      setStream(s);
      setResumePos(pos);
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : 'Could not read this book.');
    } finally {
      setLoadingStream(false);
    }
  }

  function backToBooks() {
    setSelectedBook(null);
    setStream(null);
    setStreamError(null);
    setResumePos(undefined);
    setSelectedChapterHref(null);
  }

  function startFrom(index: number) {
    if (!stream) return;
    setLaunch({ stream, startIndex: index });
  }

  function handleExitFocus() {
    setLaunch(null);
    // Refresh resume position + lifetime average so the setup screen
    // reflects where the session left off if the user comes straight back.
    if (selectedBook) getResumePosition(selectedBook.id).then(setResumePos);
    getLifetimeAverageWpm().then(setLifetimeAvgWpm);
  }

  if (launch && selectedBook) {
    return (
      <SpeedReaderFocus
        book={selectedBook}
        stream={launch.stream}
        startIndex={launch.startIndex}
        prefs={prefs}
        onPrefsChange={updatePrefs}
        onExit={handleExitFocus}
      />
    );
  }

  return (
    <div className="speed-reader-setup">
      <header className="speed-reader-setup__header">
        <div>
          <h1>Speed Reader</h1>
          <p className="speed-reader-setup__subtitle">
            Read fast, with almost nothing on screen but the word — one Arabic word at a time, centered, at your own pace.
          </p>
        </div>
        {lifetimeAvgWpm !== null && lifetimeAvgWpm > 0 && (
          <div className="speed-reader-setup__lifetime">
            <span className="speed-reader-setup__lifetime-value">{lifetimeAvgWpm}</span>
            <span className="speed-reader-setup__lifetime-label">avg WPM</span>
          </div>
        )}
      </header>

      {!selectedBook && (
        <>
          {loadingBooks ? (
            <div className="speed-reader-setup__empty">Loading…</div>
          ) : books.length === 0 ? (
            <div className="speed-reader-setup__empty">
              <p>No books yet.</p>
              <p className="speed-reader-setup__empty-sub">Add a book from the Library first, then come back here.</p>
            </div>
          ) : (
            <div className="speed-reader-setup__grid">
              {books.map((book) => (
                <button key={book.id} className="speed-reader-book" onClick={() => pickBook(book)}>
                  <div className="speed-reader-book__cover">
                    {book.coverDataUrl ? (
                      <img src={book.coverDataUrl} alt="" />
                    ) : (
                      <span className="speed-reader-book__cover-fallback">{book.title.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="speed-reader-book__title">{book.title}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {selectedBook && (
        <div className="speed-reader-picker">
          <button className="btn btn--ghost speed-reader-picker__back" onClick={backToBooks}>
            ‹ Choose a different book
          </button>

          <h2 className="speed-reader-picker__title">{selectedBook.title}</h2>

          {loadingStream && <div className="speed-reader-setup__empty">Preparing text…</div>}
          {streamError && <div className="speed-reader-setup__error">{streamError}</div>}

          {stream && !loadingStream && (
            <>
              {resumePos && (
                <button
                  className="speed-reader-resume"
                  onClick={() => startFrom(resumePos.globalIndex)}
                >
                  <span className="speed-reader-resume__label">Resume where you left off</span>
                  <span className="speed-reader-resume__detail">
                    word {(resumePos.globalIndex + 1).toLocaleString()} of {stream.tokens.length.toLocaleString()}
                  </span>
                </button>
              )}

              <div className="speed-reader-picker__section-label">Start from</div>
              <div className="speed-reader-chapters">
                <button
                  className={'speed-reader-chapter' + (selectedChapterHref === null ? ' speed-reader-chapter--active' : '')}
                  onClick={() => setSelectedChapterHref(null)}
                >
                  Beginning of book
                </button>
                {stream.chapters.map((c: RsvpChapter) => (
                  <button
                    key={c.href}
                    className={'speed-reader-chapter' + (selectedChapterHref === c.href ? ' speed-reader-chapter--active' : '')}
                    onClick={() => setSelectedChapterHref(c.href)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <button
                className="btn btn--primary speed-reader-picker__start"
                onClick={() => {
                  const chapter = stream.chapters.find((c) => c.href === selectedChapterHref);
                  startFrom(chapter ? chapter.startIndex : 0);
                }}
              >
                Enter Focus Mode
              </button>

              <RecentSessions bookId={selectedBook.id} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RecentSessions({ bookId }: { bookId: string }) {
  const [sessions, setSessions] = useState<SpeedReaderSession[] | null>(null);

  useEffect(() => {
    getSessions(bookId).then((s) => setSessions(s.slice(0, 3)));
  }, [bookId]);

  if (!sessions || sessions.length === 0) return null;

  return (
    <div className="speed-reader-sessions">
      <div className="speed-reader-picker__section-label">Recent sessions</div>
      <ul className="speed-reader-sessions__list">
        {sessions.map((s) => (
          <li key={s.id}>
            <span>{s.wordsRead.toLocaleString()} words</span>
            <span>{formatDuration(s.durationMs)}</span>
            <span>{s.averageWpm} WPM</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
