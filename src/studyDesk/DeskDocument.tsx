import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { createOwnDesk, ensureBookDesk, getDesk, renameDesk, saveDeskHtml, updateItem } from './deskStore';
import './deskDocument.css';
import { applyLineStart, lineStart, runFormat, type FormatCommand } from './docFormat';
import { ItemPicker } from './ItemPicker';
import { IconCapture, IconChevron, IconDown, IconEye, IconEyeOff, IconInbox, IconPull, IconUp } from './icons';
import { fillEmbed, type EmbedAct } from './docEmbeds';
import { EMBED_CLASS, embedHtml, EMPTY_DOC, outline, sanitizeDocHtml } from './docHtml';
import { capture, itemTitle, looksArabic, TYPE_LABEL, useDeskImage, type DeskData } from './useDesk';
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
  /** Go to where an item came from (this book or another). */
  onGoToSource?(item: DeskItem): void;
  onToast(m: string): void;
}

const MIN_KEY = 'studyDesk.docPanelMin';

const FORMATS: { cmd: FormatCommand; label: string; title: string; icon: React.ReactNode }[] = [
  { cmd: 'bold', label: 'Bold', title: 'Bold (Ctrl+B)', icon: <b>B</b> },
  { cmd: 'italic', label: 'Italic', title: 'Italic (Ctrl+I)', icon: <i>I</i> },
  { cmd: 'heading', label: 'Heading', title: 'Heading (# at the start of a line)', icon: <span className="sd-fmt__h">H</span> },
  { cmd: 'bullets', label: 'Bulleted list', title: 'Bulleted list (- at the start of a line)', icon: <span>•≡</span> },
  { cmd: 'numbers', label: 'Numbered list', title: 'Numbered list (1. at the start of a line)', icon: <span>1.</span> },
  { cmd: 'quote', label: 'Quotation', title: 'Quotation (> at the start of a line)', icon: <span className="sd-fmt__q">“</span> },
];
const SAVE_MS = 400;

/** Whether an item shows in the document text (margin notes follow the margin setting). */
export function shownInDocument(item: DeskItem, mode: 'all' | 'chosen' | 'none'): boolean {
  if (item.hidden) return false;
  if (!item.fromMargin) return true;
  if (mode === 'none') return false;
  return item.inDocument ?? mode === 'all';
}

/** The desk as one notepad, with the inbox beside it to reorder, file and hide items. */
export function DeskDocument({ book, data, deskId, focusItem, onClose, onSwitchDesk, onCapture, onPullIn, onGoToSource, onToast }: Props) {
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

  // New lines are paragraphs (the browser's default is a div), so Enter after a heading or list gives a plain line.
  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // Divs then; the document turns them into paragraphs when it saves.
    }
  }, []);
  function format(cmd: FormatCommand) {
    if (!edRef.current?.contains(window.getSelection()?.anchorNode ?? null)) edRef.current?.focus();
    runFormat(cmd);
    scheduleSave();
    bump();
  }

  /** The item whose note is being edited in place (docEmbeds.ts). */
  const editing = useRef<string | null>(null);
  const fillAll = useCallback(() => {
    edRef.current?.querySelectorAll<HTMLElement>(`.${EMBED_CLASS}`).forEach((el) => {
      const id = el.dataset.item ?? '';
      // Leave a note being typed alone; it is redrawn once saved.
      if (id === editing.current && el.querySelector('textarea')) return;
      const item = itemsById.get(id);
      fillEmbed(el, item, { shown: !!item && shownInDocument(item, docMode), editing: id === editing.current, bookId: book.id });
    });
  }, [itemsById, docMode, book.id]);

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

  /** What the corner says: saving, saved, or a save that failed. */
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  /** The editor's latest HTML and whether it has unsaved changes; kept so a save still works after the editor is gone (closing). */
  const latest = useRef<{ deskId: string; html: string; dirty: boolean } | null>(null);
  const save = useCallback(() => {
    const ed = edRef.current;
    if (ed && loadedFor.current === deskId) latest.current = { deskId, html: ed.innerHTML, dirty: latest.current?.dirty ?? false };
    const l = latest.current;
    if (!l || !l.dirty || l.deskId !== deskId) return;
    l.dirty = false;
    void saveDeskHtml(l.deskId, l.html, { quiet: true }).then(
      () => setSaved((st) => (st === 'saving' && !latest.current?.dirty ? 'saved' : st)),
      () => setSaved('failed')
    );
  }, [deskId]);

  function scheduleSave() {
    setSaved('saving');
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

  function onInput(e: React.FormEvent<HTMLDivElement>) {
    const ed = edRef.current!;
    // Typing in an item's note is not typing in the document.
    if (e.target !== ed) return;
    if (!ed.firstElementChild) {
      ed.innerHTML = EMPTY_DOC;
      caretEnd(ed.querySelector('p'));
    }
    // A line that starts "# ", "- ", "1. " or "> " becomes a heading, a list or a quotation (docFormat.ts).
    const sel = window.getSelection();
    let node: Node | null = sel?.anchorNode ?? null;
    while (node && node.parentNode !== ed) node = node.parentNode;
    if (node && node.nodeType === Node.ELEMENT_NODE && /^(P|DIV)$/.test((node as Element).tagName) && lineStart(node.textContent ?? '')) {
      caretEnd(applyLineStart(node as HTMLElement));
    } else if (node && node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'P' && (node.textContent ?? '') === '/') {
      // "/" alone on a line: choose an item to put there.
      setPicker({ line: node as HTMLElement, anchor: (node as HTMLElement).getBoundingClientRect() });
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
  const perHeading = new Map<number, number>();
  itemEntries.forEach((e) => e.heading !== null && perHeading.set(e.heading, (perHeading.get(e.heading) ?? 0) + 1));
  const words = useMemo(() => countWords(edRef.current), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  function scrollToHeading(index: number) {
    const h = edRef.current?.querySelectorAll('h3')[index];
    h?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

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

  // --- putting an item where you are writing: "/" on an empty line, or a row dragged from the side panel ---
  const [picker, setPicker] = useState<{ line: HTMLElement; anchor: DOMRect } | null>(null);
  /** Puts an item's embed at `ref` (replacing it, or before or after it), moving it if it is already in the text. */
  function putItem(id: string, ref: Element, how: 'replace' | 'before' | 'after') {
    const ed = edRef.current;
    if (!ed) return;
    let el = embedEl(id);
    if (el === ref) return;
    if (!el) {
      const holder = document.createElement('div');
      holder.innerHTML = embedHtml(id);
      el = holder.firstElementChild!;
    }
    if (how === 'replace') ref.replaceWith(el);
    else if (how === 'before') ed.insertBefore(el, ref);
    else ed.insertBefore(el, ref.nextSibling);
    known.current.add(id);
    // Somewhere to keep typing after it.
    let next = el.nextElementSibling;
    if (!next || next.tagName !== 'P') {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      ed.insertBefore(p, el.nextSibling);
      next = p;
    }
    if (how === 'replace') caretEnd(next as HTMLElement);
    fillAll();
    scheduleSave();
    bump();
  }
  function pick(item: DeskItem) {
    if (!picker) return;
    const line = picker.line;
    setPicker(null);
    if (line.isConnected) putItem(item.id, line, 'replace');
  }
  function cancelPick() {
    if (!picker) return;
    const line = picker.line;
    setPicker(null);
    if (line.isConnected && line.textContent === '/') {
      line.innerHTML = '<br>';
      caretEnd(line);
      scheduleSave();
    }
  }
  /** A side-panel row dropped on the text: before or after the line under the pointer. */
  function onEditorDrop(e: React.DragEvent<HTMLDivElement>) {
    const id = dragId.current;
    const ed = edRef.current;
    dragId.current = null;
    if (!id || !ed) return;
    e.preventDefault();
    const blocks = Array.from(ed.children);
    let best: { el: Element; d: number; after: boolean } | null = null;
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      const d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      if (!best || d < best.d) best = { el: b, d, after: e.clientY > r.top + r.height / 2 };
    }
    if (best) putItem(id, best.el, best.after ? 'after' : 'before');
  }
  /** A screenshot shown at full size. */
  const [zoom, setZoom] = useState<DeskItem | null>(null);

  // --- the buttons on an item in the text (docEmbeds.ts) ---
  function finishNote(el: HTMLElement, keep: boolean) {
    const id = el.dataset.item ?? '';
    const ta = el.querySelector('textarea');
    const item = itemsById.get(id);
    editing.current = null;
    if (keep && ta && item && ta.value !== (item.body ?? '')) void updateItem(id, { body: ta.value });
    if (item) fillEmbed(el, item, { shown: shownInDocument(item, docMode), editing: false, bookId: book.id });
  }
  function onEditorClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-act]');
    const host = target.closest<HTMLElement>(`.${EMBED_CLASS}`);
    if (!btn || !host) return;
    const id = host.dataset.item ?? '';
    const item = itemsById.get(id);
    const act = btn.dataset.act as EmbedAct;
    e.preventDefault();
    if (!item) return;
    if (act === 'remove') {
      host.remove();
      scheduleSave();
      bump();
      onToast('Taken off the page. Put it back from the side panel.');
    } else if (act === 'source') {
      save();
      onGoToSource?.(item);
    } else if (act === 'zoom') {
      setZoom(item);
    } else if (act === 'note') {
      const open = editing.current && edRef.current?.querySelector<HTMLElement>(`.${EMBED_CLASS}[data-item="${editing.current}"]`);
      if (open && open !== host) finishNote(open, true);
      editing.current = id;
      fillEmbed(host, item, { shown: true, editing: true, bookId: book.id });
      const ta = host.querySelector('textarea');
      if (ta) {
        ta.addEventListener('blur', () => editing.current === id && finishNote(host, true));
        ta.addEventListener('keydown', (ev) => {
          ev.stopPropagation();
          if (ev.key === 'Escape') {
            ev.preventDefault();
            finishNote(host, false);
          }
        });
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
  }

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
          <div className="sd-doc__status">
            <p className="sd-eyebrow">{desk?.kind === 'own' ? 'Your desk · captures from any book' : 'Book desk'}</p>
            <span className="sd-doc__count">{words === 1 ? '1 word' : `${words.toLocaleString()} words`}</span>
            <span className={'sd-doc__saved sd-doc__saved--' + saved} role="status" aria-live="polite">
              {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'failed' ? 'Not saved: no space left?' : ''}
            </span>
          </div>
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
          <div className="sd-fmt" role="toolbar" aria-label="Formatting">
            {FORMATS.map((f) => (
              <button key={f.cmd} type="button" title={f.title} aria-label={f.label} onMouseDown={(e) => e.preventDefault()} onClick={() => format(f.cmd)}>
                {f.icon}
              </button>
            ))}
          </div>
          <div ref={edRef} className="sd-editor" role="textbox" contentEditable suppressContentEditableWarning spellCheck aria-label="Document text" aria-multiline="true" onInput={onInput}
            onBlur={save}
            onClick={onEditorClick}
            onDragOver={(e) => dragId.current && (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'))}
            onDrop={onEditorDrop}
          />
          <p className="sd-doc__hint">Type anywhere. At the start of a line: # heading, - list, 1. numbered list, &gt; quotation. Ctrl+B bold, Ctrl+I italic. / on an empty line puts an item there; rows of the side panel can be dragged into the text. New captures appear at the end.</p>
          {picker && (
            <ItemPicker
              items={deskItems}
              onPage={new Set(itemEntries.map((e) => e.id))}
              anchor={picker.anchor}
              onPick={pick}
              onPullIn={onPullIn && (() => (cancelPick(), onPullIn()))}
              onCancel={cancelPick}
            />
          )}
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
                      <button type="button" className="sd-order__hbtn" onClick={() => scrollToHeading(e.index)} title="Go to this heading">
                        <span dir="auto">{e.text}</span>
                        <span className="sd-order__hn">{perHeading.get(e.index) ?? 0}</span>
                      </button>
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
      {zoom?.imageHash && <ImageZoom item={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/** A screenshot at full size over the document; a click or Esc closes it. */
function ImageZoom({ item, onClose }: { item: DeskItem; onClose(): void }) {
  const src = useDeskImage(item.imageHash);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only this closes: the document stays open.
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="sd-zoom" role="dialog" aria-label="Image at full size" onClick={onClose}>
      <div>
        {src && <img src={src} alt={item.text || 'Screenshot'} />}
        <div className="sd-zoom__bar">
          <span dir="auto">{item.text || item.source?.bookTitle || 'Screenshot'}</span>
          <button type="button" onClick={onClose}>
            Close · Esc
          </button>
        </div>
      </div>
    </div>
  );
}

/** Words the reader wrote: the document's text without its items. */
function countWords(ed: HTMLElement | null): number {
  if (!ed) return 0;
  let n = 0;
  const walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => (t.parentElement?.closest(`.${EMBED_CLASS}`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let t = walk.nextNode(); t; t = walk.nextNode()) n += (t.textContent ?? '').split(/\s+/).filter(Boolean).length;
  return n;
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
