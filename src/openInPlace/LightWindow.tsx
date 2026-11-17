import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { persistenceService } from '../persistence';
import { PreferencesProvider } from '../state/PreferencesProvider';
import { FEATURES } from '../features/registry';
import { ReaderSwitch } from '../readerCore/ReaderSwitch';
import { formatWindowRoute, type WindowRoute } from '../routing';
import { getFilesBridge, getWindowsBridge } from '../sync/desktopBridge';
import type { BookMeta } from '../types';
import { defaultOpenDeps, openToken } from './openToken';
import { inPlaceHash } from './promote';

const SettingsPanel = lazy(() => import('../components/shared/SettingsPanel').then((m) => ({ default: m.SettingsPanel })));

/** The app-wide hosts a light window needs: the look (theme, palette) and the reading font. The rest belong to the main window. */
const LIGHT_APP_HOSTS = ['look', 'readerFont'];

type State = { status: 'loading' } | { status: 'ready'; book: BookMeta; cfi?: string } | { status: 'notFound'; book: BookMeta } | { status: 'error'; message: string };

/** A file is opened once per token, even if the window's effect runs twice (a book record must not be made twice). */
const opening = new Map<string, Promise<BookMeta>>();
function openTokenOnce(token: string): Promise<BookMeta> {
  let pending = opening.get(token);
  if (!pending) {
    const files = getFilesBridge();
    if (!files) return Promise.reject(new Error('Opening files needs the desktop app.'));
    pending = openToken(token, defaultOpenDeps(files));
    opening.set(token, pending);
    pending.catch(() => opening.delete(token));
  }
  return pending;
}

/**
 * A light window (docs/features/open-in-place.md): the reader alone, no Library or navigation bar, for one book. It is
 * the same reader as the main window's; Back becomes "Library", which brings up the main window and leaves this one.
 */
export function LightWindow({ route }: { route: WindowRoute }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [settings, setSettings] = useState<{ group?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const token = route.token;
  const bookId = route.bookId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const book = token ? await openTokenOnce(token) : bookId ? await persistenceService.getBook(bookId) : undefined;
      if (!book) throw new Error('This book is no longer in your library.');
      if (cancelled) return;
      // A token lives only as long as the app is running; the book's own address survives a reload.
      window.history.replaceState(null, '', formatWindowRoute({ bookId: book.id }));
      const hash = inPlaceHash(book);
      const files = getFilesBridge();
      if (book.inPlace && hash && files && !(await files.has(hash))) {
        if (!cancelled) setState({ status: 'notFound', book });
        return;
      }
      if (!cancelled) setState({ status: 'ready', book });
    })().catch((e) => {
      if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'This file could not be opened.' });
    });
    return () => {
      cancelled = true;
    };
  }, [token, bookId, attempt]);

  // Tell the main process which book this window shows: it titles the window and lists it under "Open now".
  const shown = state.status === 'ready' || state.status === 'notFound' ? state.book : null;
  useEffect(() => {
    if (shown) void getWindowsBridge()?.setBook(shown.id, shown.title);
  }, [shown]);

  const library = useCallback(() => void getWindowsBridge()?.openLibrary(), []);

  async function findIt(book: BookMeta) {
    const hash = inPlaceHash(book);
    if (!hash) return;
    setHint(null);
    const result = await getFilesBridge()?.locate(hash);
    if (result === 'found') setAttempt((n) => n + 1);
    else if (result === 'different') setHint('That is not the same file.');
  }

  return (
    <PreferencesProvider>
      {FEATURES.map(({ id, AppHost }) => AppHost && LIGHT_APP_HOSTS.includes(id) && <AppHost key={id} />)}
      <div className="app oip-window">
        <main className="app__main oip-window__main">
          <Suspense fallback={<div className="app__loading" role="status">Loading…</div>}>
            {state.status === 'loading' && (
              <div className="app__loading" role="status">
                Opening…
              </div>
            )}
            {state.status === 'error' && (
              <div className="oip-message" role="alert">
                <p>{state.message}</p>
                <button type="button" className="btn btn--ghost" onClick={library}>
                  Library
                </button>
              </div>
            )}
            {state.status === 'notFound' && (
              <div className="oip-message" role="alert">
                <h1>File not found</h1>
                <p dir="auto">“{state.book.title}” is not where it was. Find it again, or open your library.</p>
                {hint && <p className="oip-message__hint">{hint}</p>}
                <div className="oip-message__actions">
                  <button type="button" className="btn btn--primary" onClick={() => void findIt(state.book)}>
                    Find it…
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={library}>
                    Library
                  </button>
                </div>
              </div>
            )}
            {state.status === 'ready' && (
              <ReaderSwitch
                book={state.book}
                onBack={library}
                initialCfiOverride={state.cfi}
                // A search result or link into another book: this window shows that book instead.
                onOpenBookAt={(book, cfi) => {
                  window.history.replaceState(null, '', formatWindowRoute({ bookId: book.id }));
                  setState({ status: 'ready', book, cfi });
                }}
                onOpenSettings={(group) => setSettings({ group })}
              />
            )}
          </Suspense>
        </main>
        {settings && (
          <Suspense fallback={null}>
            <SettingsPanel initialGroup={settings.group} onClose={() => setSettings(null)} />
          </Suspense>
        )}
      </div>
    </PreferencesProvider>
  );
}
