import { useEffect, useMemo, useRef, useState } from 'react';
import { HIGHLIGHT_FILL } from '../theme/tokens';
import type { Highlight, HighlightColor, VocabularyItem } from '../types';
import { IconBookmark, IconChevronLeft, IconChevronRight, IconClose, IconJump, IconPencil, IconSearch, IconTrash } from './icons';
import type { CleanMatch } from './cleanSearch';
import type { ReaderSearch, SearchHit, SearchScope } from './searchState';
import { dueText, statusKindOf, statusLabel, type StatusKind } from './vocabStatus';

export type DrawerTab = 'contents' | 'search' | 'marks' | 'words';

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'contents', label: 'Contents' },
  { id: 'search', label: 'Search' },
  { id: 'marks', label: 'Marks' },
  { id: 'words', label: 'Words' },
];

export interface ChapterRow {
  title: string;
  meta: string;
  /** 0-1 read. */
  read: number;
  current: boolean;
  go(): void;
}

export interface BookmarkRow {
  id: string;
  label: string;
  where: string;
  open(): void;
  remove(): void;
}

export interface HighlightRow {
  highlight: Highlight;
  open(): void;
  recolor(color: HighlightColor): void;
  saveNote(note: string): void;
  remove(): void;
}

interface Props {
  bookTitle: string;
  author?: string;
  tab: DrawerTab;
  onTab(tab: DrawerTab): void;
  onClose(): void;
  contents: { pageLabel: string; percent: number; chapters: ChapterRow[] };
  search: ReaderSearch;
  onPickHit(hit: SearchHit): void;
  marks: {
    bookmarked: boolean;
    onToggleBookmark(): void;
    bookmarks: BookmarkRow[];
    highlights: HighlightRow[];
    editing: string | null;
    setEditing(id: string | null): void;
    /** What the empty Highlights list says (PDF pages highlight through the study desk). */
    highlightsEmpty?: string;
    /** A line under the Highlights label, e.g. why this device can't draw them on the page. */
    highlightsNote?: string;
  };
  words: { items: VocabularyItem[] | null; onJump(item: VocabularyItem): void };
}

/** The right-hand drawer: Contents, Search, Marks and Words for the open book. */
export function BookDrawer({ bookTitle, author, tab, onTab, onClose, contents, search, onPickHit, marks, words }: Props) {
  return (
    <aside className="qr-drawer" aria-label="Book">
      <div className="qr-drawer__head">
        <div className="qr-drawer__title" dir="auto" lang="ar">
          {bookTitle}
        </div>
        <button type="button" className="qr-close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </div>
      <div className="qr-tabs" role="tablist" aria-label="Book">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={'qr-tabs__tab' + (tab === t.id ? ' qr-tabs__tab--on' : '')}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="qr-drawer__body">
        {tab === 'contents' && <ContentsTab author={author} {...contents} />}
        {tab === 'search' && <SearchTab search={search} onPickHit={onPickHit} />}
        {tab === 'marks' && <MarksTab {...marks} />}
        {tab === 'words' && <WordsTab {...words} />}
      </div>
    </aside>
  );
}

function ContentsTab({ author, pageLabel, percent, chapters }: { author?: string } & Props['contents']) {
  return (
    <>
      <div className="qr-progress-card">
        <div className="qr-progress-card__row">
          <span>{pageLabel}</span>
          <span className="qr-progress-card__pct">{Math.round(percent * 100)}% read</span>
        </div>
        <div className="qr-bar" aria-hidden="true">
          <div className="qr-bar__fill" style={{ width: `${percent * 100}%` }} />
        </div>
        {author && (
          <div className="qr-progress-card__author" dir="auto" lang="ar">
            {author}
          </div>
        )}
      </div>
      <div className="qr-chapters">
        {chapters.map((ch, i) => (
          <button key={i} type="button" className={'qr-chapter-row' + (ch.current ? ' qr-chapter-row--on' : '')} onClick={ch.go} aria-current={ch.current || undefined}>
            <span className="qr-chapter-row__title" dir="auto" lang="ar">
              {ch.title}
            </span>
            <span className="qr-chapter-row__meta">
              <span>{ch.meta}</span>
              <span className="qr-bar qr-bar--mini" aria-hidden="true">
                <span className="qr-bar__fill" style={{ width: `${ch.read * 100}%` }} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

const SCOPES: { id: SearchScope; label: string }[] = [
  { id: 'page', label: 'This page' },
  { id: 'book', label: 'This book' },
  { id: 'library', label: 'Library' },
  { id: 'dict', label: 'Dictionary' },
];
const MATCHES: { id: CleanMatch; label: string }[] = [
  { id: 'phrase', label: 'Exact phrase' },
  { id: 'word', label: 'Any word' },
  { id: 'root', label: 'Same root' },
];

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange(v: T): void }) {
  return (
    <>
      <div className="qr-label qr-label--spaced">{label}</div>
      <div className="qr-chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" className={'qr-chip' + (o.id === value ? ' qr-chip--on' : '')} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

function SearchTab({ search, onPickHit }: { search: ReaderSearch; onPickHit(hit: SearchHit): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const { hits } = search;
  const summary = search.searching
    ? 'Searching…'
    : !search.query.trim()
      ? 'Type to search'
      : !hits
        ? search.needsSubmit
          ? 'Press Enter to search'
          : 'Searching…'
        : search.scope === 'dict'
          ? `${hits.length} dictionary ${hits.length === 1 ? 'entry' : 'entries'}`
          : `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}${search.roots.length ? ` · root ${search.roots.map((r) => Array.from(r).join(' ')).join(', ')}` : ''}`;

  function pick(index: number) {
    const hit = search.select(index);
    if (hit) onPickHit(hit);
  }

  return (
    <>
      <form
        className="qr-search-box"
        onSubmit={(e) => {
          e.preventDefault();
          search.submit();
        }}
      >
        <IconSearch size={17} />
        <input
          ref={inputRef}
          type="search"
          dir="auto"
          lang="ar"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          aria-label="Search"
          placeholder={search.scope === 'dict' ? 'Look up a word…' : search.scope === 'library' ? 'Search your library…' : 'Search this book…'}
        />
        {search.needsSubmit && (
          <button type="submit" className="qr-chip-btn" disabled={!search.query.trim() || search.searching}>
            Search
          </button>
        )}
      </form>
      <Chips label="Look in" options={SCOPES} value={search.scope} onChange={search.setScope} />
      {search.scope !== 'dict' && <Chips label="Match" options={MATCHES} value={search.match} onChange={search.setMatch} />}
      <div className="qr-results-head">
        <span className="qr-results-head__summary" role="status">
          {summary}
        </span>
        {hits && hits.length > 0 && search.scope !== 'dict' && (
          <span className="qr-results-head__nav">
            <button type="button" className="qr-round-btn qr-round-btn--xs" onClick={() => pick(search.active - 1)} aria-label="Previous result">
              <IconChevronLeft size={14} />
            </button>
            {search.active + 1} of {hits.length}
            <button type="button" className="qr-round-btn qr-round-btn--xs" onClick={() => pick(search.active + 1)} aria-label="Next result">
              <IconChevronRight size={14} />
            </button>
          </span>
        )}
      </div>
      {hits && (
        <div className="qr-results">
          {hits.map((hit, i) => (
            <button key={i} type="button" className={'qr-result' + (i === search.active ? ' qr-result--on' : '')} onClick={() => pick(i)}>
              <span className="qr-result__where" dir="auto" lang="ar">
                {hit.where}
              </span>
              <span className="qr-result__text" dir="rtl" lang="ar">
                {hit.before}
                <mark>{hit.match}</mark>
                {hit.after}
              </span>
              {hit.gloss && <span className="qr-result__gloss">{hit.gloss}</span>}
            </button>
          ))}
        </div>
      )}
      {!search.query.trim() && search.history.length > 0 && (
        <>
          <div className="qr-label qr-label--spaced">Recent</div>
          <div className="qr-chips" dir="rtl">
            {search.history.map((item) => (
              <button key={item} type="button" className="qr-chip qr-chip--ar" lang="ar" onClick={() => search.pickHistory(item)}>
                {item}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'purple', 'red'];

function MarksTab({ bookmarked, onToggleBookmark, bookmarks, highlights, editing, setEditing, highlightsEmpty, highlightsNote }: Props['marks']) {
  return (
    <>
      <button type="button" className="qr-btn qr-btn--wide qr-btn--soft" onClick={onToggleBookmark}>
        <IconBookmark size={16} filled={bookmarked} />
        {bookmarked ? 'Remove bookmark from this page' : 'Bookmark this page'}
      </button>
      <div className="qr-label qr-label--spaced">Bookmarks</div>
      {bookmarks.length === 0 && <p className="qr-empty">No bookmarks in this book yet.</p>}
      {bookmarks.map((b) => (
        <div key={b.id} className="qr-mark">
          <button type="button" className="qr-mark__main" onClick={b.open}>
            <span className="qr-mark__label" dir="auto" lang="ar">
              {b.label}
            </span>
            <span className="qr-mark__where">{b.where}</span>
          </button>
          <button type="button" className="qr-icon-btn" onClick={b.remove} aria-label="Remove bookmark" title="Remove bookmark">
            <IconTrash />
          </button>
        </div>
      ))}
      <div className="qr-label qr-label--spaced">Highlights</div>
      {highlightsNote && <p className="qr-empty">{highlightsNote}</p>}
      {highlights.length === 0 && <p className="qr-empty">{highlightsEmpty ?? 'Select text in the book to highlight it.'}</p>}
      {highlights.map((row) => (
        <HighlightCard key={row.highlight.id} row={row} editing={editing === row.highlight.id} setEditing={setEditing} />
      ))}
    </>
  );
}

function HighlightCard({ row, editing, setEditing }: { row: HighlightRow; editing: boolean; setEditing(id: string | null): void }) {
  const { highlight } = row;
  const [draft, setDraft] = useState(highlight.note ?? '');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    setDraft(highlight.note ?? '');
    noteRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  return (
    <div className="qr-hl-card">
      <button type="button" className="qr-hl-card__text" dir="rtl" lang="ar" onClick={row.open}>
        <span className={`qr-hl-fill qr-hl-fill--${highlight.color}`}>{highlight.text}</span>
      </button>
      {editing ? (
        <div className="qr-hl-card__edit">
          <textarea ref={noteRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Note" />
          <div className="qr-hl-card__edit-actions">
            <button type="button" className="qr-chip-btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="qr-chip-btn qr-chip-btn--primary"
              onClick={() => {
                row.saveNote(draft.trim());
                setEditing(null);
              }}
            >
              Save note
            </button>
          </div>
        </div>
      ) : (
        <div className={'qr-hl-card__note' + (highlight.note ? '' : ' qr-hl-card__note--empty')}>{highlight.note || 'No note · add one'}</div>
      )}
      <div className="qr-hl-card__foot">
        <div className="qr-hl-card__colors" role="group" aria-label="Highlight colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={'qr-swatch-btn' + (highlight.color === c ? ' qr-swatch-btn--on' : '')}
              aria-label={`Make it ${c}`}
              aria-pressed={highlight.color === c}
              onClick={() => row.recolor(c)}
            >
              <span style={{ background: HIGHLIGHT_FILL[c] }} />
            </button>
          ))}
        </div>
        <span className="qr-hl-card__actions">
          <button type="button" className="qr-icon-btn" onClick={() => setEditing(highlight.id)} aria-label="Edit note" title="Edit note">
            <IconPencil size={15} />
          </button>
          <button type="button" className="qr-icon-btn" onClick={row.remove} aria-label="Remove highlight" title="Remove highlight">
            <IconTrash />
          </button>
        </span>
      </div>
    </div>
  );
}

type WordFilter = 'all' | Exclude<StatusKind, 'none'>;

function WordsTab({ items, onJump }: Props['words']) {
  const [filter, setFilter] = useState<WordFilter>('all');
  const [dueOnly, setDueOnly] = useState(false);
  const [now] = useState(() => Date.now());
  const count = (f: WordFilter) => (items ?? []).filter((i) => f === 'all' || statusKindOf(i) === f).length;
  const shown = useMemo(
    () =>
      (items ?? [])
        .filter((i) => (filter === 'all' || statusKindOf(i) === filter) && (!dueOnly || i.fsrsDue <= now))
        .sort((a, b) => b.addedAt - a.addedAt),
    [items, filter, dueOnly, now]
  );
  const filters: { id: WordFilter; label: string }[] = [
    { id: 'all', label: `All ${count('all')}` },
    { id: 'new', label: `New ${count('new')}` },
    { id: 'learning', label: `Learning ${count('learning')}` },
    { id: 'known', label: `Known ${count('known')}` },
  ];
  return (
    <>
      <p className="qr-drawer__blurb">Words you saved while reading this book. Jump back to the sentence you found them in.</p>
      <div className="qr-chips" role="group" aria-label="Status">
        {filters.map((f) => (
          <button key={f.id} type="button" className={'qr-chip' + (f.id === filter ? ' qr-chip--on' : '')} aria-pressed={f.id === filter} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <label className="qr-check qr-check--spaced">
        <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
        Due for review only
      </label>
      {!items && <p className="qr-empty">Loading…</p>}
      {items && items.length === 0 && <p className="qr-empty">No words saved from this book yet. Click a word and add it.</p>}
      {items && items.length > 0 && shown.length === 0 && <p className="qr-empty">Nothing here with these filters.</p>}
      {shown.map((item) => {
        const kind = statusKindOf(item);
        return (
          <div key={item.id} className="qr-word-row">
            <div className="qr-word-row__text">
              <span className="qr-word-row__gloss">{item.meaning}</span>
              <span className="qr-word-row__meta">
                <span className={'qr-status qr-status--' + kind}>{statusLabel(kind)}</span>
                {dueText(item.fsrsDue, now)}
              </span>
            </div>
            <span className="qr-word-row__word" dir="rtl" lang="ar">
              {item.surfaceForm}
            </span>
            <button type="button" className="qr-round-btn qr-round-btn--xs" onClick={() => onJump(item)} aria-label="Show the sentence in the book" title="Show the sentence">
              <IconJump />
            </button>
          </div>
        );
      })}
    </>
  );
}
