import { getBlobStore } from '../blobStore';
import type { DeskItem } from './types';
import { itemTitle, TYPE_LABEL } from './useDesk';

/**
 * How an item looks inside the desk document. The editor holds empty `.desk-embed` placeholders
 * (docHtml.ts); this fills one from its item record. Built with the DOM, not React: the placeholders live
 * inside the contenteditable editor, which React does not own.
 *
 * Buttons carry `data-act` and are handled by the document (event delegation):
 *   source  go to where the item came from
 *   note    edit what the item says (its body)
 *   remove  take it off the page (it stays in the inbox, under "Taken off the page")
 */

export type EmbedAct = 'source' | 'note' | 'remove' | 'zoom';

export interface EmbedOptions {
  /** Shown in the document (margin notes can be left out). */
  shown: boolean;
  /** Its note is being edited. */
  editing: boolean;
  /** The open book, to say "this book" rather than repeat its title. */
  bookId: string;
}

/** Where the item came from, as place parts (each isolated so Arabic and Latin parts keep their order). */
export function sourceParts(item: DeskItem, bookId: string): string[] {
  const s = item.source;
  const fromHere = (s?.bookId ?? item.pin?.bookId) === bookId;
  const where = s ? (fromHere ? s.chapterLabel : [s.bookTitle, s.chapterLabel].filter(Boolean).join(', ')) : undefined;
  const when = new Date(item.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return [where, when].filter((p): p is string => !!p);
}

/** The place an item can be taken back to: its source, or for a margin note the line it is pinned to. */
export function placeOf(item: DeskItem): { bookId: string; location?: string } | null {
  if (item.source?.bookId) return { bookId: item.source.bookId, location: item.source.location ?? (item.pin?.bookId === item.source.bookId ? item.pin.location : undefined) };
  if (item.pin) return { bookId: item.pin.bookId, location: item.pin.location };
  return null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(act: EmbedAct, label: string): HTMLButtonElement {
  const b = el('button', 'sd-emb__act', label);
  b.type = 'button';
  b.dataset.act = act;
  return b;
}

export function fillEmbed(host: HTMLElement, item: DeskItem | undefined, opts: EmbedOptions): void {
  host.replaceChildren();
  host.className = host.className
    .split(' ')
    .filter((c) => !c.startsWith('sd-emb--'))
    .join(' ');
  host.classList.toggle('sd-emb--hidden', !item || !opts.shown);
  if (!item) return;
  host.classList.add(`sd-emb--${item.type}`);
  // An Arabic item lays out right to left (a quote's rule at its right edge). Set on each fill: saving drops attributes.
  if (item.ar) host.setAttribute('dir', 'rtl');
  else host.removeAttribute('dir');
  if (item.fromMargin) host.classList.add('sd-emb--margin');

  const head = el('div', 'sd-emb__head');
  const text = el('span', item.ar ? 'sd-emb__text sd-emb__text--ar' : 'sd-emb__text', itemTitle(item));
  text.dir = 'auto';
  head.append(text, el('span', 'sd-emb__type', TYPE_LABEL[item.type]));
  host.append(head);

  // The body: what the item says beside its title. Without a title of its own, the body's first line is the title.
  const body = item.text ? (item.body ?? '') : (item.body ?? '').split('\n').slice(1).join('\n');
  if (opts.editing) {
    const ta = el('textarea', 'sd-emb__edit');
    ta.dir = 'auto';
    ta.value = item.body ?? '';
    ta.placeholder = 'Write a note on this…';
    ta.setAttribute('aria-label', 'Note on this item');
    ta.rows = Math.min(8, Math.max(2, ta.value.split('\n').length + 1));
    host.append(ta);
    const hint = el('div', 'sd-emb__edit-hint', 'Saved when you click away · Esc cancels');
    host.append(hint);
  } else if (body) {
    const b = el('div', 'sd-emb__body', body);
    b.dir = 'auto';
    host.append(b);
  }

  if (item.imageHash) {
    const img = el('img', 'sd-emb__img');
    img.alt = item.text ? `Image: ${item.text}` : 'Screenshot';
    img.dataset.act = 'zoom';
    host.append(img);
    void getBlobStore()
      .url(item.imageHash)
      .then((u) => {
        if (u) img.src = u;
      });
  }

  const foot = el('div', 'sd-emb__foot');
  const meta = el('div', 'sd-emb__meta');
  sourceParts(item, opts.bookId).forEach((p, i) => {
    if (i) meta.append(' · ');
    meta.append(el('bdi', '', p));
  });
  const acts = el('div', 'sd-emb__acts');
  if (placeOf(item)) acts.append(button('source', 'Go to source'));
  acts.append(button('note', !item.text ? 'Edit' : item.body ? 'Edit note' : 'Add note'), button('remove', 'Remove from page'));
  foot.append(meta, acts);
  host.append(foot);
}
