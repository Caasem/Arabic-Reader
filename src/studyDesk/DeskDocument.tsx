import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getBlobStore } from '../blobStore';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { createOwnDesk, ensureBookDesk, getDesk, renameDesk, saveDeskHtml, updateItem } from './deskStore';
import './deskDocument.css';
import { IconCapture, IconChevron, IconDown, IconEye, IconEyeOff, IconInbox, IconPull, IconUp } from './icons';
import { EMBED_CLASS, embedHtml, EMPTY_DOC, outline, sanitizeDocHtml } from './docHtml';
import { capture, itemTitle, looksArabic, TYPE_LABEL, type DeskData } from './useDesk';
import type { Desk, DeskItem } from './types';

interface Props {
  book: BookMeta;
  data: DeskData;
  /** Desk to show; the current capture desk when absent. */
  deskId: string;
  /** Item to scroll to and flash. */
  focusItem?: string;
  onClose(): void;
  onSwitchDesk(id: string): void;
  /** Close the document, capture a region of the page, and come back. */
  onCapture(): void;
  onPullIn?(): void;
  onToast(m: string): void;
}

const MIN_KEY = 'studyDesk.docPanelMin';
const SAVE_MS = 400;

/** Whether an item shows in the document text (margin notes follow the margin setting). */
export function shownInDocument(item: DeskItem, mode: 'all' | 'chosen' | 'none'): boolean {
  if (item.hidden) return false;
  if (!item.fromMargin) return true;
  if (mode === 'none') return false;
  return item.inDocument ?? mode === 'all';
}

function fillEmbed(el: HTMLElement, item: DeskItem | undefined, shown: boolean): void {
  el.replaceChildren();
  el.classList.toggle('sd-emb--hidden', !item || !shown);
  if (!item) return;
  const head = document.createElement('div');
  head.className = 'sd-emb__head';
  const text = document.createElement('span');
  text.className = item.ar ? 'sd-emb__text sd-emb__text--ar' : 'sd-emb__text';
  text.dir = 'auto';
  text.textContent = itemTitle(item);
  const type = document.createElement('span');
  type.className = 'sd-emb__type';
  type.textContent = TYPE_LABEL[item.type];
  head.append(text, type);
  el.append(head);
  if (item.body && item.text) {
    const body = document.createElement('div');
    body.className = 'sd-emb__body';
    body.dir = 'auto';
    body.textContent = item.body;
    el.append(body);
  }
  if (item.imageHash) {
    const img = document.createElement('img');
    img.className = 'sd-emb__img';
    img.alt = '';
    el.append(img);
    void getBlobStore()
      .url(item.imageHash)
      .then((u) => {
        if (u) img.src = u;
      });
  }
  const meta = document.createElement('div');
  meta.className = 'sd-emb__meta';
  meta.textContent = [item.source?.chapterLabel ?? item.source?.bookTitle, new Date(item.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ');
  el.append(meta);
}

/** The desk as one notepad, with the inbox beside it to reorder, file and hide items. */
export function DeskDocument({ book, data, deskId, focusItem, onClose, onSwitchDesk, onCapture, onPullIn, onToast }: Props) {
  const { prefs } = usePreferences();
  const docMode = prefs.studyDeskMarginsInDocument;
  const [desk, setDesk] = useState<Desk | null>(null);
  const [version, setVersion] = useState(0);
  const [min, setMin] = useState(() => {
    try {
      return localStorage.getItem(MIN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [filter, setFilter] = useState('');
  const edRef = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string>>(new Set());
  const saveTimer = useRef<number>(0);
  const loadedFor = useRef<string | null>(null);
  const itemsById = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const deskItems = useMemo(() => data.items.filter((i) => i.deskId === deskId), [data.items, deskId]);

  const bump = () => setVersion((v) => v + 1);

  // Load the desk (and make the book's desk on first use).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const d = (await getDesk(deskId)) ?? (deskId.startsWith('book:') ? await ensureBookDesk(book) : null);
      if (alive) setDesk(d ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [deskId, book]);

  const fillAll = useCallback(() => {
    edRef.current?.querySelectorAll<HTMLElement>(`.${EMBED_CLASS}`).forEach((el) => {
      const item = itemsById.get(el.dataset.item ?? '');
      fillEmbed(el, item, !!item && shownInDocument(item, docMode));
    });
  }, [itemsById, docMode]);

  // Put the document into the editor once per desk; after that the editor owns it.
  useLayoutEffect(() => {
    const ed = edRef.current;
    if (!ed || !desk || loadedFor.current === desk.id) return;
    loadedFor.current = desk.id;
    ed.innerHTML = sanitizeDocHtml(desk.html || EMPTY_DOC) || EMPTY_DOC;
    known.current = new Set(outline(ed.innerHTML).flatMap((e) => (e.kind === 'item' ? [e.id] : [])));
    fillAll();
    bump();
  }, [desk, fillAll]);

  // Items captured while the document is open: add their embeds to the editor without disturbing typing.
  useEffect(() => {
    const ed = edRef.current;
    if (!ed || loadedFor.current !== deskId) return;
    let added = false;
    for (const item of deskItems) {
      if (known.current.has(item.id)) continue;
      known.current.add(item.id);
      if (ed.querySelector(`.${EMBED_CLASS}[data-item="${item.id}"]`)) continue;
      const holder = document.createElement('div');
      holder.innerHTML = embedHtml(item.id);
      const last = ed.lastElementChild;
      if (last && last.tagName === 'P' && !last.textContent?.trim()) ed.insertBefore(holder.firstChild!, last);
      else {
        ed.appendChild(holder.firstChild!);
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        ed.appendChild(p);
      }
      added = true;
    }
    fillAll();
    if (added) {
      scheduleSave();
      bump();
    }
    // scheduleSave only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskItems, fillAll, deskId, desk]);

  /** The editor's latest HTML and whether it has unsaved changes; kept so a save still works after the editor is gone (closing). */
  const latest = useRef<{ deskId: string; html: string; dirty: boolean } | null>(null);
  const save = useCallback(() => {
    const ed = edRef.current;
    if (ed && loadedFor.current === deskId) latest.current = { deskId, html: ed.innerHTML, dirty: latest.current?.dirty ?? false };
    const l = latest.current;
    if (!l || !l.dirty || l.deskId !== deskId) return;
    l.dirty = false;
    void saveDeskHtml(l.deskId, l.html, { quiet: true });
  }, [deskId]);

  function scheduleSave() {
    if (edRef.current && loadedFor.current === deskId) latest.current = { deskId, html: edRef.current.innerHTML, dirty: true };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(save, SAVE_MS);
  }
  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
    save();
  }, [save]);

  // Scroll to and flash an item.
  useEffect(() => {
    if (!focusItem || !desk) return;
    const el = edRef.current?.querySelector<HTMLElement>(`.${EMBED_CLASS}[data-item="${focusItem}"]`);
    if (!el) return;
    el.scrollIntoView?.({ block: 'center' });
    el.classList.add('sd-emb--flash');
    const t = window.setTimeout(() => el.classList.remove('sd-emb--flash'), 1400);
    return () => window.clearTimeout(t);
  }, [focusItem, desk, version]);

  function onInput() {
    const ed = edRef.current!;
    if (!ed.firstElementChild) {
      ed.innerHTML = EMPTY_DOC;
      caretEnd(ed.querySelector('p'));
    }
    // "# " at the start of a line makes it a heading.
    const sel = window.getSelection();
    let node: Node | null = sel?.anchorNode ?? null;
    while (node && node.parentNode !== ed) node = node.parentNode;
    if (node && node.nodeType === Node.ELEMENT_NODE && /^(P|DIV)$/.test((node as Element).tagName) && /^#[\s ]/.test(node.textContent ?? '')) {
      const h = document.createElement('h3');
      h.textContent = (node.textContent ?? '').replace(/^#[\s ]+/, '');
      if (!h.textContent) h.innerHTML = '<br>';
      ed.replaceChild(h, node);
      caretEnd(h);
    } else if (node && node.nodeType === Node.TEXT_NODE) {
      const p = document.createElement('p');
      ed.replaceChild(p, node);
      p.appendChild(node);
      caretEnd(p);
    }
    scheduleSave();
    bump();
  }

  // --- side panel actions on the editor itself ---
  const topOf = (el: Element) => {
    let n: Element = el;
    while (n.parentElement && n.parentElement !== edRef.current) n = n.parentElement;
    return n;
  };
  const embedEl = (id: string) => edRef.current?.querySelector(`.${EMBED_CLASS}[data-item="${id}"]`) ?? null;
  function placeBefore(el: Element, ref: Element | null) {
    const ed = edRef.current!;
    if (ref) ed.insertBefore(el, ref);
    else {
      const last = ed.lastElementChild;
      if (last && last !== el && last.tagName === 'P' && !last.textContent?.trim()) ed.insertBefore(el, last);
      else ed.appendChild(el);
    }
    scheduleSave();
    bump();
  }
  const entries = useMemo(() => (edRef.current ? outline(edRef.current.innerHTML) : []), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const itemEntries = entries.filter((e): e is Extract<typeof e, { kind: 'item' }> => e.kind === 'item');
  const headings = entries.filter((e): e is Extract<typeof e, { kind: 'heading' }> => e.kind === 'heading');
  const offPage = deskItems.filter((i) => !itemEntries.some((e) => e.id === i.id));

  function shift(id: string, by: -1 | 1) {
    const at = itemEntries.findIndex((e) => e.id === id);
    const other = itemEntries[at + by];
    const el = embedEl(id);
    const ot = other && embedEl(other.id);
    if (!el || !ot) return;
    if (by < 0) placeBefore(el, topOf(ot));
    else placeBefore(el, topOf(ot).nextElementSibling);
  }
  function file(id: string, heading: number | null) {
    const el = embedEl(id);
    if (!el) return;
    const heads = Array.from(edRef.current!.children).filter((c) => c.tagName === 'H3');
    placeBefore(el, heading === null ? (heads[0] ?? null) : (heads[heading + 1] ?? null));
  }
  const dragId = useRef<string | null>(null);

  /** An item deleted from the text goes back at the end. */
  function putBack(id: string) {
    const holder = document.createElement('div');
    holder.innerHTML = embedHtml(id);
    edRef.current?.appendChild(holder.firstChild!);
    placeBefore(edRef.current!.lastElementChild!, null);
    fillAll();
  }

  async function addConcept() {
    const t = filter.trim();
    if (!t) return;
    await capture(book, deskId, { type: 'concept', text: t, ar: looksArabic(t), source: { bookId: book.id, bookTitle: book.title } });
    setFilter('');
    onToast('Concept added at the end');
  }

  function setMinimised(v: boolean) {
    setMin(v);
    try {
      localStorage.setItem(MIN_KEY, v ? '1' : '0');
    } catch {
      // Not remembered.
    }
  }

  const deskLabel = (d: Desk) => (d.kind === 'book' && d.bookId === book.id ? 'This book' : d.title);
  let n = 0;

  return (
    <div className="sd-doc" role="dialog" aria-label="Desk document">
      <div className="sd-doc__main">
        <div className="sd-doc__paper">
          <div className="sd-doc__top">
            <button type="button" className="sd-pill" onClick={() => (save(), onClose())}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to the page
            </button>
            <div className="sd-desks" role="tablist" aria-label="Desks">
              {data.desks.map((d) => (
                <button key={d.id} type="button" role="tab" aria-selected={d.id === deskId} onClick={() => onSwitchDesk(d.id)}>
                  {deskLabel(d)}
                </button>
              ))}
              <button type="button" className="sd-desks__new" onClick={() => void createOwnDesk().then((d) => onSwitchDesk(d.id))}>
                + Desk
              </button>
            </div>
          </div>
          <p className="sd-eyebrow">{desk?.kind === 'own' ? 'Your desk · captures from any book' : 'Book desk'}</p>
          <h2
            className="sd-doc__title"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            aria-label="Desk title"
            onBlur={(e) => desk && void renameDesk(desk.id, e.currentTarget.textContent ?? '')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                edRef.current?.focus();
              }
            }}
          >
            {desk?.title}
          </h2>
          <div ref={edRef} className="sd-editor" role="textbox" contentEditable suppressContentEditableWarning spellCheck aria-label="Document text" aria-multiline="true" onInput={onInput} onBlur={save} />
          <p className="sd-doc__hint">Type anywhere. # and a space starts a heading. New captures for this desk appear at the end.</p>
        </div>
      </div>
      <aside className={'sd-side' + (min ? ' sd-side--min' : '')} aria-label="Inbox for this desk">
        <div className="sd-side__head">
          <span className="sd-eyebrow">
            Inbox <span className="sd-count">{deskItems.length}</span>
          </span>
          <button type="button" className="sd-side__tog" aria-expanded={!min} aria-label={min ? 'Open the inbox' : 'Collapse the inbox'} title={min ? 'Open the inbox' : 'Collapse the inbox'} onClick={() => setMinimised(!min)}>
            <IconChevron left={min} />
          </button>
        </div>
        {min ? (
          <div className="sd-side__rail">
            <button type="button" onClick={() => setMinimised(false)} title="Open the inbox" aria-label="Open the inbox">
              <IconInbox />
              <span>{deskItems.length}</span>
            </button>
            <button type="button" onClick={onCapture} title="Capture a region (Alt+X)" aria-label="Capture a region">
              <IconCapture />
            </button>
            {onPullIn && (
              <button type="button" onClick={onPullIn} title="Pull in (Alt+U)" aria-label="Pull in">
                <IconPull />
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="dsearch__input-row">
              <input
                className="dsearch__input sd-inbox__input"
                dir="auto"
                value={filter}
                placeholder="Write a concept, or filter"
                aria-label="Write a concept, or filter the inbox"
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addConcept();
                  }
                }}
              />
            </div>
            <div className="sd-side__tools">
              <button type="button" className="sd-btn" onClick={() => void addConcept()} disabled={!filter.trim()}>
                Add concept
              </button>
              <button type="button" className="sd-btn" onClick={onCapture}>
                Capture
              </button>
              {onPullIn && (
                <button type="button" className="sd-btn" onClick={onPullIn}>
                  Pull in
                </button>
              )}
            </div>
            <ol className="sd-order">
              {entries.map((e) => {
                if (e.kind === 'heading')
                  return (
                    <li key={'h' + e.index} className="sd-order__h" onDragOver={(ev) => dragId.current && ev.preventDefault()} onDrop={(ev) => {
                      ev.preventDefault();
                      if (dragId.current) file(dragId.current, e.index);
                      dragId.current = null;
                    }}>
                      {e.text}
                    </li>
                  );
                const item = itemsById.get(e.id);
                if (!item) return null;
                const shown = shownInDocument(item, docMode);
                if (shown) n++;
                const miss = !!filter.trim() && !`${item.text} ${item.body ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase());
                const at = itemEntries.findIndex((x) => x.id === e.id);
                return (
                  <li
                    key={e.id}
                    className={'sd-order__i' + (shown ? '' : ' sd-order__i--off') + (miss ? ' sd-order__i--miss' : '')}
                    draggable
                    onDragStart={(ev) => {
                      dragId.current = e.id;
                      ev.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(ev) => dragId.current && dragId.current !== e.id && ev.preventDefault()}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      const from = dragId.current && embedEl(dragId.current);
                      const to = embedEl(e.id);
                      if (from && to) placeBefore(from, topOf(to));
                      dragId.current = null;
                    }}
                  >
                    <span className="sd-order__n">{shown ? n : ''}</span>
                    <span className="sd-order__k">{TYPE_LABEL[item.type]}</span>
                    <span className={'sd-order__t' + (item.ar ? ' sd-order__t--ar' : '')} dir="auto">
                      {itemTitle(item)}
                    </span>
                    {headings.length > 0 && (
                      <select className="sd-order__sel" aria-label="File under a heading" value={e.heading === null ? '' : String(e.heading)} onChange={(ev) => file(e.id, ev.target.value === '' ? null : Number(ev.target.value))}>
                        <option value="">No heading</option>
                        {headings.map((h) => (
                          <option key={h.index} value={h.index}>
                            {h.text}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" aria-label="Move up" disabled={at === 0} onClick={() => shift(e.id, -1)}>
                      <IconUp />
                    </button>
                    <button type="button" aria-label="Move down" disabled={at === itemEntries.length - 1} onClick={() => shift(e.id, 1)}>
                      <IconDown />
                    </button>
                    <button
                      type="button"
                      aria-label={shown ? 'Hide from the page' : 'Show on the page'}
                      title={shown ? 'Hide from the page' : 'Show on the page'}
                      onClick={() => void (item.fromMargin ? updateItem(item.id, { inDocument: !shown, hidden: false }) : updateItem(item.id, { hidden: !item.hidden }))}
                    >
                      {shown ? <IconEye /> : <IconEyeOff />}
                    </button>
                  </li>
                );
              })}
              {offPage.length > 0 && <li className="sd-order__h">Taken off the page</li>}
              {offPage.map((item) => (
                <li key={item.id} className="sd-order__i sd-order__i--off">
                  <span className="sd-order__k">{TYPE_LABEL[item.type]}</span>
                  <span className="sd-order__t" dir="auto">
                    {itemTitle(item)}
                  </span>
                  <button type="button" className="sd-ghost" onClick={() => putBack(item.id)}>
                    Put back
                  </button>
                </li>
              ))}
              {!entries.length && !offPage.length && <li className="dsearch__hint">Nothing on this desk yet. Write a concept above, capture a region, or pull something in.</li>}
            </ol>
          </>
        )}
      </aside>
    </div>
  );
}

function caretEnd(el: HTMLElement | null) {
  if (!el) return;
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  } catch {
    // No caret: harmless.
  }
}
