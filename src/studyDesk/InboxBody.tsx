import { useEffect, useMemo, useRef, useState } from 'react';
import { goToBookLocation } from '../readerChords';
import type { BookMeta } from '../types';
import { createOwnDesk, deleteItem, sendItemToDesk, updateItem } from './deskStore';
import { capture, itemTitle, looksArabic, TYPE_LABEL, useDeskImage, type DeskData } from './useDesk';
import { getReaderMarks } from '../readerChords';
import type { DeskItem } from './types';

interface Props {
  book: BookMeta;
  data: DeskData;
  onClose(): void;
  /** Opens the desk document, at an item when given. */
  onOpenDocument(itemId?: string): void;
  /** Opens Pull in (Alt+U). */
  onPullIn?(): void;
  /** Says what happened, briefly. */
  onToast(message: string): void;
}

const NEW = '__new__';

/** The inbox: the dictionary search's input row and result rows, for the items on the current desk. */
export function InboxBody({ book, data, onClose, onOpenDocument, onPullIn, onToast }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { desks, items, deskId, setDeskId } = data;
  const deskName = (id: string) => {
    const d = desks.find((x) => x.id === id);
    return d ? (d.kind === 'book' && d.bookId === book.id ? 'This book' : d.title) : 'This book';
  };

  useEffect(() => inputRef.current?.focus(), []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.deskId === deskId && i.inInbox)
      .filter((i) => !q || `${i.text} ${i.body ?? ''} ${i.source?.bookTitle ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [items, deskId, query]);

  const ids: (string | null)[] = [...(query.trim() ? [null] : []), ...list.map((i) => i.id)];
  const active = ids.includes(selected) ? selected : (ids[0] ?? null);

  async function addConcept() {
    const text = query.trim();
    if (!text) return;
    const page = getReaderMarks()?.capturePage();
    await capture(book, deskId, { type: 'concept', text, ar: looksArabic(text), source: { bookId: book.id, bookTitle: book.title, location: page?.location, chapterLabel: page?.chapterLabel } });
    setQuery('');
    onToast('Added to the inbox and the desk');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const at = ids.indexOf(active);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(ids[Math.min(at + 1, ids.length - 1)] ?? null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(ids[Math.max(at - 1, 0)] ?? null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active === null) void addConcept();
      else onOpenDocument(active);
    }
  }

  async function pickDesk(value: string) {
    if (value === NEW) {
      const d = await createOwnDesk();
      setDeskId(d.id);
      onOpenDocument();
      return;
    }
    setDeskId(value);
  }

  const count = items.filter((i) => i.deskId === deskId && i.inInbox).length;

  return (
    <div className="dsearch__body sd-inbox" onKeyDown={onKeyDown}>
      <div className="dsearch__input-row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5" />
        </svg>
        <input
          ref={inputRef}
          className="dsearch__input sd-inbox__input"
          dir="auto"
          value={query}
          placeholder="Search the inbox, or write a concept"
          aria-label="Search the inbox, or write a concept"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
        {onPullIn && (
          <button type="button" className="dsearch__fullpage" onClick={onPullIn} title="Pull in from other books (Alt+U)">
            Pull in
          </button>
        )}
        <button type="button" className="dsearch__fullpage" onClick={() => onOpenDocument()} title="Open the desk document">
          Document
        </button>
      </div>
      <div className="sd-inbox__desk">
        <span>Capturing to</span>
        <select value={deskId} onChange={(e) => void pickDesk(e.target.value)} aria-label="Desk to capture to">
          {!desks.some((d) => d.id === deskId) && <option value={deskId}>This book</option>}
          {desks.map((d) => (
            <option key={d.id} value={d.id}>
              {deskName(d.id)}
              {d.kind === 'book' && d.bookId !== book.id ? ' · book' : ''}
            </option>
          ))}
          <option value={NEW}>+ New desk…</option>
        </select>
        <span className="sd-inbox__count">{count === 1 ? '1 item' : `${count} items`}</span>
      </div>
      <div className="dsearch__results" role="listbox" aria-label="Inbox">
        {query.trim() && (
          <div role="option" aria-selected={active === null} className={'dsearch__entry' + (active === null ? ' dsearch__entry--active' : '')} onClick={() => void addConcept()}>
            <div className="sd-inbox__new">
              <span className="dsearch__provider">New concept</span>
              <b dir="auto">{query.trim()}</b>
              <span className="dsearch__meta sd-inbox__enter">Enter</span>
            </div>
          </div>
        )}
        {!count && <p className="dsearch__hint">Nothing here yet. Alt+C writes a concept, Alt+X captures a region of the page, or type above and press Enter.</p>}
        {!!count && !list.length && query.trim() && <p className="dsearch__hint">Nothing in the inbox matches.</p>}
        {list.map((item) => (
          <Row
            key={item.id}
            item={item}
            book={book}
            active={item.id === active}
            desks={desks.filter((d) => d.id !== item.deskId).map((d) => ({ id: d.id, name: deskName(d.id) }))}
            onSelect={() => setSelected(item.id)}
            onShow={() => onOpenDocument(item.id)}
            onToast={onToast}
          />
        ))}
      </div>
    </div>
  );
}

function Row({ item, book, active, desks, onSelect, onShow, onToast }: { item: DeskItem; book: BookMeta; active: boolean; desks: { id: string; name: string }[]; onSelect(): void; onShow(): void; onToast(m: string): void }) {
  const img = useDeskImage(item.imageHash);
  const here = item.source?.bookId === book.id && !!item.source.location;
  const meta = [item.source?.bookId === book.id ? item.source.chapterLabel : item.source?.bookTitle, new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ');
  return (
    <div role="option" aria-selected={active} className={'dsearch__entry' + (active ? ' dsearch__entry--active' : '') + (item.hidden ? ' sd-entry--hidden' : '')} onClick={onSelect}>
      <div className="dsearch__entry-head">
        <span className={item.ar ? 'dsearch__headword' : 'dsearch__headword sd-latin'} dir="auto" lang={item.ar ? 'ar' : undefined}>
          {itemTitle(item)}
        </span>
        <span className="dsearch__meta">{meta}</span>
        <span className="dsearch__provider">{TYPE_LABEL[item.type]}</span>
      </div>
      {img && <img className="sd-thumb" src={img} alt="" />}
      {active && (
        <div className="sd-acts">
          <button type="button" className="dsearch__add" onClick={(e) => (e.stopPropagation(), onShow())}>
            Show in document
          </button>
          {here && (
            <button type="button" className="sd-ghost" onClick={(e) => (e.stopPropagation(), goToBookLocation(item.source!.location!) || onToast('This reader cannot jump there'))}>
              Go to source
            </button>
          )}
          {desks.length > 0 && (
            <select
              className="sd-ghost"
              value=""
              aria-label="Send to another desk"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const to = e.target.value;
                if (!to) return;
                void sendItemToDesk(item.id, to).then(() => onToast('Sent to ' + (desks.find((d) => d.id === to)?.name ?? 'the desk')));
              }}
            >
              <option value="">Send to…</option>
              {desks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="sd-ghost" onClick={(e) => (e.stopPropagation(), void updateItem(item.id, { hidden: !item.hidden }))}>
            {item.hidden ? 'Show on the page' : 'Hide from the document'}
          </button>
          <button type="button" className="sd-ghost" onClick={(e) => (e.stopPropagation(), void deleteItem(item.id).then(() => onToast('Deleted')))}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
