import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DictionaryPopup } from '../components/reader/DictionaryPopup';
import { dictionaryManager } from '../dictionary';
import { orderProviders } from '../dictionary/providerOrder';
import { forgetWordPicks, rankByPicks, recordEntrySave, recordSelectionSave } from '../sensePicks';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta, DictionaryEntry, DictionaryLookupResult, WordInstance } from '../types';
import { vocabularyService } from '../vocabulary';
import { lookupWord, saveLookup } from '../vocabulary/lookupWord';
import type { DictionaryPageRequest } from './events';
import './dictionaryPage.css';

/** Cards saved with no book open are filed under this one. */
export const DICTIONARY_BOOK: BookMeta = { id: 'dictionary', title: 'Dictionary', format: 'epub', addedAt: 0, sizeBytes: 0 };

const TAB_KEY = 'dictionaryPage.lastTab';
const ALL = 'all';
const NEARBY = 9;

interface Lookup {
  word: string;
  loading: boolean;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
}

const readTab = () => {
  try {
    return localStorage.getItem(TAB_KEY) ?? ALL;
  } catch {
    return ALL;
  }
};

/** Tab labels: short, as on a shelf of books. */
const SHORT_NAMES: Record<string, string> = { aramorph: 'English', alwasit: 'Al-Wasīṭ', alsihah: 'Al-Ṣiḥāḥ', almaqayis: 'Maqāyīs', baranov: 'Baranov', personal: 'My dictionary' };
const shortName = (p: { id: string; name: string }) => SHORT_NAMES[p.id] ?? p.name;

const isTyping = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

/**
 * The full-page dictionary (roadmap item dict-fullpage). The entries themselves are drawn by the
 * dictionary popup in its `page` mode, so they look and behave exactly as in the popup.
 */
export function DictionaryPage({ request, onBack, backLabel }: { request: DictionaryPageRequest | null; onBack: () => void; backLabel: string }) {
  const { prefs } = usePreferences();
  const book = request?.book ?? DICTIONARY_BOOK;
  const [query, setQuery] = useState(request?.word ?? '');
  const [history, setHistory] = useState<{ words: string[]; at: number }>(() => ({ words: request?.word ? [request.word] : [], at: request?.word ? 0 : -1 }));
  const word = history.at >= 0 ? history.words[history.at] : '';
  const [tab, setTab] = useState<string>(() => request?.providerId ?? readTab());
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A new request (maximise from the popup again, Alt+D's Full page) starts from its word.
  useEffect(() => {
    if (!request?.word) return;
    setQuery(request.word);
    setHistory({ words: [request.word], at: 0 });
    if (request.providerId) setTab(request.providerId);
  }, [request]);

  useEffect(() => {
    if (!word) {
      inputRef.current?.focus();
      return;
    }
    let stale = false;
    setLookup({ word, loading: true, result: null, instance: null, saved: false });
    void (async () => {
      const found = await lookupWord(book.id, word, {});
      const result = prefs.savedEntriesFirst ? await rankByPicks(book, word, found.result) : found.result;
      if (!stale) setLookup({ word, loading: false, result, instance: found.instance, saved: found.saved });
    })();
    return () => {
      stale = true;
    };
    // `book` changes only with `request`, which also resets `word`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, book.id, prefs.savedEntriesFirst]);

  const go = useCallback((next: string) => {
    const w = next.trim();
    if (!w) return;
    setQuery(w);
    setHistory((h) => ({ words: [...h.words.slice(0, h.at + 1), w], at: h.at + 1 }));
  }, []);

  const step = useCallback((delta: number) => {
    setHistory((h) => {
      const at = Math.min(h.words.length - 1, Math.max(0, h.at + delta));
      setQuery(h.words[at] ?? '');
      return { ...h, at };
    });
  }, []);

  // Esc goes back; Alt+Left / Alt+Right step through the words looked at.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTyping(e.target)) onBack();
      else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        step(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, step]);

  const providers = useMemo(
    () =>
      orderProviders(
        dictionaryManager.getProviders().filter((p) => prefs.enabledProviderIds.includes(p.id)),
        prefs.dictionaryProviderOrder
      ),
    [prefs.enabledProviderIds, prefs.dictionaryProviderOrder]
  );
  const entries = lookup?.result?.entries ?? [];
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of entries) c.set(e.providerId, (c.get(e.providerId) ?? 0) + 1);
    return c;
  }, [entries]);
  const activeTab = tab === ALL || providers.some((p) => p.id === tab) ? tab : ALL;
  const shown: DictionaryLookupResult | null = useMemo(() => {
    if (!lookup?.result) return null;
    return activeTab === ALL ? lookup.result : { ...lookup.result, entries: lookup.result.entries.filter((e) => e.providerId === activeTab) };
  }, [lookup, activeTab]);

  function chooseTab(id: string) {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // Not remembered this time.
    }
  }

  // Saving: the same cards as the popup in a reader makes.
  const full = lookup?.result ?? null;
  const save = (entriesToSave?: DictionaryEntry[], describedBy?: DictionaryEntry) =>
    saveLookup(book, { word, result: full!, instance: lookup?.instance ?? null }, { entries: entriesToSave, describedBy });
  const markSaved = (saved: boolean) => setLookup((l) => (l ? { ...l, saved } : l));
  const handlers = {
    onSave: async () => {
      if (!full) return;
      if (lookup?.saved) {
        await vocabularyService.removeAllForWord(book.id, word);
        void forgetWordPicks(book, word, full);
        markSaved(false);
      } else {
        await save();
        markSaved(true);
      }
    },
    onSaveEntry: async (entry: DictionaryEntry) => {
      if (!full) return;
      await save([entry], entry);
      void recordEntrySave(book, word, full, entry);
      markSaved(true);
    },
    onSaveSelection: async (entry: DictionaryEntry, text: string) => {
      if (!full) return;
      await save([{ ...entry, senses: [{ gloss: text }] }], entry);
      void recordSelectionSave(book, word, full, entry, text);
      markSaved(true);
    },
    onSaveEntries: async (list: DictionaryEntry[]) => {
      if (!full || !list.length) return;
      await save(list, list[0]);
      markSaved(true);
    },
  };

  const activeProvider = providers.find((p) => p.id === activeTab);
  const nearbyAround = activeProvider?.listHeadwords ? shown?.entries[0]?.headword : undefined;

  return (
    <div className="dpage">
      <header className="dpage__bar">
        <div className="dpage__bar-inner">
          <div className="dpage__row">
            <button className="dpage__back" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              {backLabel}
            </button>
            <form
              className="dpage__search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                go(query);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                className="dpage__input"
                dir="auto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a word and press Enter"
                aria-label="Search the dictionary"
              />
            </form>
            <span className="dpage__hint">Esc to go back · Alt ← → previous word</span>
          </div>
          {word && (
            <nav className="dpage__tabs" aria-label="Dictionaries">
              <button className="dpage__tab" aria-current={activeTab === ALL ? 'page' : undefined} onClick={() => chooseTab(ALL)}>
                All <span className="dpage__count">{lookup?.loading ? '…' : entries.length}</span>
              </button>
              {providers.map((p) => {
                const n = counts.get(p.id) ?? 0;
                return (
                  <button
                    key={p.id}
                    className={'dpage__tab' + (n ? '' : ' dpage__tab--empty')}
                    aria-current={activeTab === p.id ? 'page' : undefined}
                    onClick={() => chooseTab(p.id)}
                  >
                    {shortName(p)} <span className="dpage__count">{lookup?.loading ? '…' : n}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <main className="dpage__main" dir="rtl">
        {!word ? (
          <p className="dpage__empty" dir="ltr">
            Type a word, or tap one while reading and press the full-page button.
          </p>
        ) : (
          <>
            <div className="dpage__entries">
              {lookup && !lookup.loading && shown && !shown.entries.length ? (
                <p className="dpage__empty" dir="ltr">
                  {activeTab === ALL ? `No entry found for "${word}".` : `No entry for "${word}" in ${activeProvider ? shortName(activeProvider) : 'this dictionary'}.`}
                </p>
              ) : (
                <DictionaryPopup
                  key={`${word}|${activeTab}`}
                  page
                  word={word}
                  result={shown}
                  instance={lookup?.instance ?? null}
                  saved={lookup?.saved ?? false}
                  loading={!lookup || lookup.loading}
                  x={0}
                  y={0}
                  onClose={onBack}
                  onSave={() => void handlers.onSave()}
                  onSaveEntry={(entry) => void handlers.onSaveEntry(entry)}
                  onSaveSelection={(entry, text) => void handlers.onSaveSelection(entry, text)}
                  onSaveEntries={(list) => void handlers.onSaveEntries(list)}
                />
              )}
            </div>
            {nearbyAround && activeProvider && (
              <Nearby key={`${activeProvider.id}|${nearbyAround}`} provider={activeProvider} label={shortName(activeProvider)} around={nearbyAround} onPick={go} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Headwords before and after the current one, in the dictionary's own order. */
function Nearby({
  provider,
  label,
  around,
  onPick,
}: {
  label: string;
  provider: { id: string; name: string; listHeadwords?: (around: string, before: number, after: number) => Promise<{ words: string[]; index: number } | null> };
  around: string;
  onPick: (word: string) => void;
}) {
  const [centre, setCentre] = useState(around);
  const [win, setWin] = useState<{ words: string[]; index: number } | null>(null);
  useEffect(() => {
    let stale = false;
    void provider.listHeadwords?.(centre, NEARBY, NEARBY).then((w) => !stale && setWin(w));
    return () => {
      stale = true;
    };
  }, [provider, centre]);
  if (!win) return null;
  const current = around.split('|')[0].trim();
  return (
    <aside className="dpage__nearby" aria-label={`Nearby in ${label}`}>
      <div className="dpage__label" dir="ltr">
        Nearby in {label}
      </div>
      <button className="dpage__page-btn" dir="ltr" onClick={() => setCentre(win.words[0])} disabled={win.index === 0}>
        Earlier
      </button>
      <ul className="dpage__nearby-list">
        {win.words.map((w, i) => (
          <li key={`${w}${i}`}>
            <button className="dpage__nearby-word" aria-current={w === current ? 'true' : undefined} onClick={() => onPick(w)}>
              {w}
            </button>
          </li>
        ))}
      </ul>
      <button className="dpage__page-btn" dir="ltr" onClick={() => setCentre(win.words[win.words.length - 1])}>
        Later
      </button>
    </aside>
  );
}
