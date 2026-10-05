import { useEffect, useRef, useState } from 'react';
import { vocabularyService } from '../vocabulary';
import type { BookMeta, DictionaryEntry } from '../types';
import { isRussianQuery, useDictionarySearch } from './useDictionarySearch';

interface Props {
  book: BookMeta;
  initialQuery: string;
  onClose(): void;
}

/** The search box and results, shared by every layout. */
export function SearchBody({ book, initialQuery, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  // Selection and saved-state belong to one result word, so they reset by
  // comparison rather than by an effect.
  const [selection, setSelection] = useState({ word: '', index: 0 });
  const [addedWord, setAddedWord] = useState('');
  const [savedWord, setSavedWord] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { loading, result } = useDictionarySearch(query);
  const entries = result?.entries ?? [];
  const word = result?.word ?? '';
  const selected = selection.word === word ? selection.index : 0;
  const added = addedWord === word;
  const alreadySaved = savedWord === word;
  const setSelected = (update: (i: number) => number) => setSelection({ word, index: update(selected) });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    let stale = false;
    if (word && !isRussianQuery(word)) void vocabularyService.isSaved(book.id, word).then((saved) => !stale && saved && setSavedWord(word));
    return () => {
      stale = true;
    };
  }, [book.id, word]);

  async function addSelected() {
    const entry = entries[selected];
    if (!entry || added || alreadySaved) return;
    const morph = result?.morphology?.[0];
    await vocabularyService.saveToVocabulary({
      surfaceForm: isRussianQuery(word) ? entry.headword : word,
      entries: [entry],
      lemma: entry.lemma ?? morph?.lemma,
      root: entry.root ?? morph?.root,
      pos: entry.senses[0]?.pos ?? morph?.pos,
      book,
    });
    setAddedWord(word);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void addSelected();
    }
  }

  const saved = added || alreadySaved;

  return (
    <div className="dsearch__body" onKeyDown={onKeyDown}>
      <div className="dsearch__input-row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          className="dsearch__input"
          dir="rtl"
          lang="ar"
          value={query}
          placeholder="ابحث في القاموس"
          aria-label="Search the dictionary"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="dsearch__results" role="listbox" aria-label="Results">
        {!query.trim() && <p className="dsearch__hint">Type an Arabic word, or a Russian word to search Baranov.</p>}
        {query.trim() && loading && !result && <p className="dsearch__hint">Searching…</p>}
        {query.trim() && !loading && result && entries.length === 0 && <p className="dsearch__hint">{isRussianQuery(query) ? 'No Arabic entry found. Is Baranov switched on in Settings?' : 'No entry found.'}</p>}
        {result?.failedProviders?.length ? (
          <p className="dsearch__hint">Couldn't load: {result.failedProviders.map((p) => p.name).join(', ')}.</p>
        ) : null}
        {entries.map((entry, i) => (
          <EntryRow
            key={`${entry.providerId}:${i}`}
            entry={entry}
            active={i === selected}
            saved={saved}
            onSelect={() => setSelection({ word, index: i })}
            onAdd={() => void addSelected()}
          />
        ))}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  active,
  saved,
  onSelect,
  onAdd,
}: {
  entry: DictionaryEntry;
  active: boolean;
  saved: boolean;
  onSelect(): void;
  onAdd(): void;
}) {
  const pos = entry.senses[0]?.pos;
  return (
    <div
      role="option"
      aria-selected={active}
      tabIndex={-1}
      className={'dsearch__entry' + (active ? ' dsearch__entry--active' : '')}
      onClick={onSelect}
    >
      <div className="dsearch__entry-head">
        <span className="dsearch__headword" lang="ar" dir="rtl">
          {entry.headword}
        </span>
        <span className="dsearch__meta">
          {[pos, entry.root && `root ${entry.root.split('').join(' ')}`].filter(Boolean).join(' · ')}
        </span>
        <span className="dsearch__provider">{entry.providerName}</span>
      </div>
      {active ? (
        <>
          <ul className="dsearch__senses">
            {entry.senses.map((sense, i) => (
              <li key={i}>{sense.gloss || sense.examples?.map((ex) => ex.gloss).join('; ')}</li>
            ))}
          </ul>
          <button type="button" className="dsearch__add" disabled={saved} onClick={onAdd}>
            {saved ? 'In vocabulary' : 'Add to vocabulary'}
          </button>
        </>
      ) : (
        <div className="dsearch__gloss">{entry.senses[0]?.gloss || entry.senses[0]?.examples?.[0]?.gloss}</div>
      )}
    </div>
  );
}
