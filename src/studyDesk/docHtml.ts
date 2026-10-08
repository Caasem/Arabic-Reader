/**
 * The desk document is HTML the reader types into (a contenteditable notepad). It is cleaned on every
 * save and load so only a small set of tags survives, and inbox items sit in it as empty embed
 * placeholders that the editor fills from the item records.
 */

export const EMBED_CLASS = 'desk-embed';

const BLOCKS = new Set(['P', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR']);

function parse(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body;
}

/** The placeholder for an item. */
export function embedHtml(itemId: string): string {
  return `<div class="${EMBED_CLASS}" data-item="${itemId.replace(/[^\w-]/g, '')}" contenteditable="false"></div>`;
}

function isEmbed(el: Element): boolean {
  return el.tagName === 'DIV' && el.classList.contains(EMBED_CLASS) && !!el.getAttribute('data-item');
}

function cleanInto(source: Node, target: Node, doc: Document): void {
  source.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(node.textContent ?? ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (isEmbed(el)) {
      const holder = doc.createElement('div');
      holder.innerHTML = embedHtml(el.getAttribute('data-item')!);
      target.appendChild(holder.firstChild!);
      return;
    }
    // Headings of any level become the one heading the desk knows; other blocks map to paragraphs.
    const tag = /^H[1-6]$/.test(el.tagName) ? 'H3' : el.tagName === 'DIV' ? 'P' : el.tagName;
    if (BLOCKS.has(tag) || INLINE.has(tag)) {
      const copy = doc.createElement(tag);
      cleanInto(el, copy, doc);
      target.appendChild(copy);
      return;
    }
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE') return;
    // Anything else (spans, links, fonts): keep the text, drop the element.
    cleanInto(el, target, doc);
  });
}

/** Only the allowed tags and the item embeds survive; attributes, scripts and styles are dropped. */
export function sanitizeDocHtml(html: string): string {
  const body = parse(html);
  const out = body.ownerDocument.createElement('div');
  cleanInto(body, out, body.ownerDocument);
  // Bare text at the top level goes into a paragraph so every line is a block.
  const doc = body.ownerDocument;
  let run: HTMLElement | null = null;
  Array.from(out.childNodes).forEach((node) => {
    const block = node.nodeType === Node.ELEMENT_NODE && (BLOCKS.has((node as Element).tagName) || isEmbed(node as Element));
    if (block) {
      run = null;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim() && !run) {
      node.remove();
      return;
    }
    if (!run) {
      run = doc.createElement('p');
      out.insertBefore(run, node);
    }
    run.appendChild(node);
  });
  return out.innerHTML;
}

const isEmptyPara = (el: Element | null): boolean => !!el && el.tagName === 'P' && !el.textContent?.trim() && !el.querySelector(`.${EMBED_CLASS}`);

/** Adds an item at the end of the document, before a trailing empty line, and keeps an empty line after it to type on. */
export function appendEmbed(html: string, itemId: string): string {
  const body = parse(html);
  const holder = body.ownerDocument.createElement('div');
  holder.innerHTML = embedHtml(itemId);
  const embed = holder.firstChild!;
  const last = body.lastElementChild;
  if (isEmptyPara(last)) body.insertBefore(embed, last);
  else {
    body.appendChild(embed);
    const p = body.ownerDocument.createElement('p');
    p.innerHTML = '<br>';
    body.appendChild(p);
  }
  return body.innerHTML;
}

export function removeEmbed(html: string, itemId: string): string {
  const body = parse(html);
  body.querySelectorAll(`.${EMBED_CLASS}[data-item="${itemId}"]`).forEach((e) => e.remove());
  return body.innerHTML;
}

export function hasEmbed(html: string, itemId: string): boolean {
  return html.includes(`data-item="${itemId}"`);
}

export type OutlineEntry = { kind: 'heading'; text: string; index: number } | { kind: 'item'; id: string; heading: number | null };

/** Headings and items in document order; each item knows the heading above it. */
export function outline(html: string): OutlineEntry[] {
  const body = parse(html);
  const out: OutlineEntry[] = [];
  let heading: number | null = null;
  let headings = 0;
  body.querySelectorAll(`h3, .${EMBED_CLASS}`).forEach((el) => {
    if (el.tagName === 'H3') {
      heading = headings++;
      out.push({ kind: 'heading', text: el.textContent?.trim() || 'Untitled heading', index: heading });
    } else out.push({ kind: 'item', id: el.getAttribute('data-item')!, heading });
  });
  return out;
}

/** The top-level block holding `el`. */
function topBlock(body: HTMLElement, el: Element): Element {
  let node: Element = el;
  while (node.parentElement && node.parentElement !== body) node = node.parentElement;
  return node;
}

/** Moves an item before another item, or to the end when `beforeItemId` is null. */
export function moveEmbedBefore(html: string, itemId: string, beforeItemId: string | null): string {
  const body = parse(html);
  const el = body.querySelector(`.${EMBED_CLASS}[data-item="${itemId}"]`);
  if (!el) return html;
  if (beforeItemId === null) {
    const last = body.lastElementChild;
    if (isEmptyPara(last) && last !== el) body.insertBefore(el, last);
    else body.appendChild(el);
    return body.innerHTML;
  }
  const target = body.querySelector(`.${EMBED_CLASS}[data-item="${beforeItemId}"]`);
  if (!target || target === el) return html;
  body.insertBefore(el, topBlock(body, target));
  return body.innerHTML;
}

/** Moves an item one place up or down among the items. */
export function shiftEmbed(html: string, itemId: string, by: -1 | 1): string {
  const ids = outline(html).flatMap((e) => (e.kind === 'item' ? [e.id] : []));
  const at = ids.indexOf(itemId);
  const other = ids[at + by];
  if (at < 0 || !other) return html;
  if (by < 0) return moveEmbedBefore(html, itemId, other);
  const body = parse(html);
  const el = body.querySelector(`.${EMBED_CLASS}[data-item="${itemId}"]`)!;
  const next = topBlock(body, body.querySelector(`.${EMBED_CLASS}[data-item="${other}"]`)!);
  body.insertBefore(el, next.nextSibling);
  return body.innerHTML;
}

/** Files an item at the end of the section under heading number `heading`, or before the first heading when null. */
export function fileUnderHeading(html: string, itemId: string, heading: number | null): string {
  const body = parse(html);
  const el = body.querySelector(`.${EMBED_CLASS}[data-item="${itemId}"]`);
  if (!el) return html;
  el.remove();
  const heads = Array.from(body.children).filter((c) => c.tagName === 'H3');
  let before: Element | null;
  if (heading === null) before = heads[0] ?? null;
  else before = heads[heading + 1] ?? null;
  if (!before) {
    const last = body.lastElementChild;
    before = isEmptyPara(last) ? last : null;
  }
  body.insertBefore(el, before);
  return body.innerHTML;
}

/** Puts a heading where an item was (a margin note turned into a heading). */
export function replaceEmbedWithHeading(html: string, itemId: string, text: string): string {
  const body = parse(html);
  const el = body.querySelector(`.${EMBED_CLASS}[data-item="${itemId}"]`);
  const h = body.ownerDocument.createElement('h3');
  h.textContent = text;
  if (el) el.replaceWith(h);
  else body.appendChild(h);
  return body.innerHTML;
}

/** A new, empty document. */
export const EMPTY_DOC = '<p><br></p>';
