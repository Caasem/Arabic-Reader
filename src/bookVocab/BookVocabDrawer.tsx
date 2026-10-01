import { useEffect, useMemo, useRef, useState } from 'react';
import { vocabularyService } from '../vocabulary';
import type { BookMeta, VocabularyItem } from '../types';
import { goToBookLocation } from '../readerChords';

type Filter = 'all' | 'new' | 'learning' | 'known' | 'due';
type Sort = 'saved' | 'due';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'due', label: 'Due' },
  { id: 'new', label: 'New' },
  { id: 'learning', label: 'Learning' },
  { id: 'known', label: 'Known' },
];

function statusOf(item: VocabularyItem): 'new' | 'learning' | 'known' {
  if (item.mastery === 'mastered' || item.mastery === 'known') return 'known';
  return item.mastery === 'learning' ? 'learning' : 'new';
}

const STATUS_LABEL = { new: 'New', learning: 'Learning', known: 'Known' } as const;

interface Props {
  book: BookMeta;
  onClose(): void;
}

/** The Alt+V drawer: every word saved from this book, filterable, with a way back to its sentence. */
export function BookVocabDrawer({ book, onClose }: Props) {
  const [items, setItems] = useState<VocabularyItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('saved');
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let stale = false;
    void vocabularyService.listForBook(book.id).then((list) => !stale && setItems(list));
    drawerRef.current?.focus();
    return () => {
      stale = true;
    };
  }, [book.id]);

  const [now] = useState(() => Date.now());
  const dueCount = items?.filter((i) => i.fsrsDue <= now).length ?? 0;

  const shown = useMemo(() => {
    const list = (items ?? []).filter((i) => {
      if (filter === 'all') return true;
      if (filter === 'due') return i.fsrsDue <= now;
      return statusOf(i) === filter;
    });
    return list.sort((a, b) => (sort === 'due' ? a.fsrsDue - b.fsrsDue : b.addedAt - a.addedAt));
  }, [items, filter, sort, now]);

  function jump(item: VocabularyItem) {
    if (item.location && goToBookLocation(item.location)) onClose();
    else setNotice('This word has no saved place in the book to jump to.');
  }

  return (
    <aside
      ref={drawerRef}
      className="bvocab"
      aria-label="Vocabulary for this book"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="bvocab__header">
        <span className="bvocab__title">Vocabulary · this book</span>
        <kbd className="bvocab__key">Alt V</kbd>
        <button type="button" className="bvocab__close" aria-label="Close book vocabulary" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="bvocab__summary">
        {items ? `${items.length} ${items.length === 1 ? 'word' : 'words'} saved · ${dueCount} due` : 'Loading…'}
      </div>
      <div className="bvocab__filters" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="bvocab__chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <select className="bvocab__sort" value={sort} aria-label="Sort" onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="saved">Newest first</option>
          <option value="due">Due first</option>
        </select>
      </div>

      <div className="bvocab__list">
        {items && items.length === 0 && <p className="bvocab__hint">No words saved from this book yet. Tap a word and save it.</p>}
        {items && items.length > 0 && shown.length === 0 && <p className="bvocab__hint">No words match this filter.</p>}
        {shown.map((item) => {
          const status = statusOf(item);
          const open = openId === item.id;
          return (
            <div key={item.id} className={'bvocab__row' + (open ? ' bvocab__row--open' : '')}>
              <button type="button" className="bvocab__row-main" aria-expanded={open} onClick={() => setOpenId(open ? null : item.id)}>
                <span className="bvocab__word" lang="ar" dir="rtl">
                  {item.surfaceForm}
                </span>
                <span className="bvocab__meaning">{item.meaning}</span>
                <span className={'bvocab__pill bvocab__pill--' + status}>{STATUS_LABEL[status]}</span>
              </button>
              <div className="bvocab__meta">
                {item.root && (
                  <span lang="ar" dir="rtl">
                    {item.root.split('').join(' ')}
                  </span>
                )}
                {item.fsrsDue <= now && <span>due</span>}
              </div>
              {open && (
                <>
                  {item.sentence && (
                    <p className="bvocab__sentence" lang="ar" dir="rtl">
                      {item.sentence}
                    </p>
                  )}
                  <div className="bvocab__actions">
                    <button type="button" className="bvocab__btn bvocab__btn--primary" onClick={() => jump(item)}>
                      Jump to it
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {notice && <p className="bvocab__hint">{notice}</p>}
      </div>
    </aside>
  );
}
