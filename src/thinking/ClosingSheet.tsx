import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { addJournal } from '../studyDesk/deskStore';
import { parseRoute } from '../routing/route';
import { clearEnded, endedSession, subscribeSession } from './session';
import { sessionSummary, shouldAsk } from './today';

const inLibrary = (): boolean => parseRoute(window.location.hash).view === 'library';

/** Whether the Library is showing, kept current as the hash changes. */
function useInLibrary(): boolean {
  const [on, setOn] = useState(inLibrary);
  useEffect(() => {
    const read = () => setOn(inLibrary());
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return on;
}

/**
 * The optional sheet after a book closes (docs/features/thinking-front.md, the closing prompt): what the visit came to
 * and "What changed in your mind?" in one line. Save keeps it as a line of the reading journal; Skip does not.
 */
export function ClosingSheet() {
  const { prefs } = usePreferences();
  const ended = useSyncExternalStore(subscribeSession, endedSession);
  const library = useInLibrary();
  const ask = !!ended && prefs.thinkingClosingPrompt && shouldAsk(ended);

  // Nothing to ask (the prompt is off, or too little happened): drop it so it does not come up later.
  useEffect(() => {
    if (ended && !ask) clearEnded();
  }, [ended, ask]);

  if (!ended || !ask || !library) return null;
  return <Sheet key={ended.endedAt} />;
}

function Sheet() {
  const ended = endedSession();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  if (!ended) return null;

  const save = () => {
    // Save with no words still keeps the pages and minutes for On this day; only Skip keeps nothing.
    void addJournal({
      at: ended.endedAt,
      bookId: ended.bookId,
      bookTitle: ended.bookTitle,
      pages: ended.pages,
      minutes: ended.minutes,
      text: text.trim(),
      made: ended.made,
    });
    clearEnded();
  };

  return (
    <div
      className="th-close"
      role="dialog"
      aria-label="What changed in your mind?"
      onKeyDown={(e) => {
        if (e.key === 'Escape') clearEnded();
      }}
    >
      <span className="th-eyebrow">You closed</span>
      <h2 className="th-close__book">{ended.bookTitle}</h2>
      <p className="th-close__sum">{sessionSummary({ ...ended.made, pages: ended.pages, minutes: ended.minutes })}</p>
      <label className="th-close__ask">
        <span>What changed in your mind?</span>
        <input
          ref={input}
          className="th-input"
          type="text"
          value={text}
          placeholder="One line, if anything did"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
        />
      </label>
      <div className="th-row th-close__acts">
        <button type="button" className="sd-btn" onClick={clearEnded}>
          Skip
        </button>
        <button type="button" className="sd-btn sd-btn--pri" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
