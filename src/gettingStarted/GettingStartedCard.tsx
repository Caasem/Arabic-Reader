import type { BookMeta } from '../types';
import { usePreferences } from '../state/PreferencesContext';
import { detectDeviceProfile } from '../onboarding/deviceProfile';
import { START_HERE_BOOK_ID } from '../onboarding/firstRun';
import { tourHint } from './hint';
import { ITEMS, type ItemDef } from './items';
import { count, isDone, total, visibility } from './progress';
import { gettingStartedStore } from './store';
import { useGettingStarted } from './useGettingStarted';
import './gettingStarted.css';

interface Props {
  books: BookMeta[];
  onOpenBook(book: BookMeta): void;
}

const RADIUS = 18;
const CIRC = 2 * Math.PI * RADIUS;

/** The book "Show me" opens: the starter book if it is on the shelf, else the most recently added one. */
export function bookForTour(books: BookMeta[]): BookMeta | undefined {
  return books.find((b) => b.id === START_HERE_BOOK_ID) ?? [...books].sort((a, b) => b.addedAt - a.addedAt)[0];
}

/** A dismissible checklist at the top of the Library. Each item ticks itself when it is done (tourEvents). */
export function GettingStartedCard({ books, onOpenBook }: Props) {
  const state = useGettingStarted(true);
  const { prefs, updatePrefs } = usePreferences();
  const mode = visibility(state);
  if (mode === 'hidden') return null;
  const keys = detectDeviceProfile() === 'desktop';

  if (mode === 'done') {
    return (
      <section className="gs gs--done" aria-label="Getting started">
        <p className="gs__done-line">You've done the basics. Everything here is in Settings if you want to see it again.</p>
        <button type="button" className="gs__link" onClick={() => gettingStartedStore.patch({ celebrated: true })}>
          Close
        </button>
      </section>
    );
  }

  const done = count(state);
  const share = done / total();

  function showMe(item: ItemDef) {
    const hint = (!keys && item.hint.touch) || item.hint.desk;
    if (item.place === 'library') {
      tourHint.show(hint);
      return;
    }
    const book = bookForTour(books);
    if (!book) {
      tourHint.show('Add a book to your shelf first, then come back to this.');
      return;
    }
    if (item.place === 'hashiya' && prefs.studyDeskMargins === 'off') updatePrefs({ studyDeskMargins: 'both' });
    onOpenBook(book);
    tourHint.show(hint);
  }

  return (
    <section className="gs" aria-labelledby="gs-title">
      <header className="gs__head">
        <svg className="gs__ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - share)}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <div className="gs__titles">
          <h2 id="gs-title" className="gs__title">
            Getting started
          </h2>
          <p className="gs__count">
            {done} of {total()} done
          </p>
        </div>
        <div className="gs__tools">
          <button type="button" className="gs__link" aria-expanded={!state.collapsed} aria-controls="gs-body" onClick={() => gettingStartedStore.patch({ collapsed: !state.collapsed })}>
            {state.collapsed ? 'Show' : 'Collapse'}
          </button>
          <button type="button" className="gs__link" onClick={() => gettingStartedStore.patch({ hidden: true })}>
            Hide for good
          </button>
        </div>
      </header>
      {!state.collapsed && (
        <ul id="gs-body" className="gs__list">
          {ITEMS.map((item) => {
            const ok = isDone(state, item.id);
            return (
              <li key={item.id} className={'gs__item' + (ok ? ' gs__item--done' : '')}>
                <span className="gs__tick" aria-hidden="true">
                  {ok ? '✓' : ''}
                </span>
                <span className="gs__label">
                  {item.label}
                  {keys && item.keys && <kbd className="gs__kbd">{item.keys}</kbd>}
                  {ok && <span className="gs__sr"> (done)</span>}
                </span>
                {!ok && (
                  <button type="button" className="gs__show" onClick={() => showMe(item)}>
                    Show me
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
