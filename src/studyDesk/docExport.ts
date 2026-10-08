import { EMBED_CLASS } from './docHtml';
import type { DeskItem } from './types';
import { itemTitle, looksArabic } from './useDesk';

/**
 * The desk document taken out of the app: copied as plain text, saved as Markdown, or saved as Word
 * (docxExport.ts). All three are made from one reading of the document into blocks, so they agree.
 * Quotes and screenshots carry their source as a citation (book, chapter or page).
 */

export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
}

export type Block =
  | { kind: 'heading'; runs: Run[] }
  | { kind: 'para'; runs: Run[] }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'list'; ordered: boolean; items: Run[][] }
  | { kind: 'item'; item: DeskItem; cite: string };

/** "Book, chapter" for an item's source; empty when it has none. */
export function citation(item: DeskItem): string {
  const s = item.source;
  return s ? [s.bookTitle, s.chapterLabel].filter(Boolean).join(', ') : '';
}

function runsOf(el: Element, flags: Omit<Run, 'text'> = {}, out: Run[] = []): Run[] {
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.textContent) out.push({ text: n.textContent, ...flags });
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const c = n as Element;
    const tag = c.tagName;
    if (tag === 'BR') out.push({ text: '\n', ...flags });
    else
      runsOf(c, { ...flags, ...(tag === 'B' || tag === 'STRONG' ? { b: true } : {}), ...(tag === 'I' || tag === 'EM' ? { i: true } : {}), ...(tag === 'U' ? { u: true } : {}) }, out);
    // A paragraph inside a quotation or list item ends its line.
    if (tag === 'P' && c.nextSibling) out.push({ text: '\n', ...flags });
  });
  return out;
}

const plain = (runs: Run[]) => runs.map((r) => r.text).join('');
const blank = (runs: Run[]) => !plain(runs).trim();

/** The document's blocks in order; items the reader hid (or left out of the document) are skipped. */
export function documentBlocks(html: string, items: Map<string, DeskItem>, shown: (item: DeskItem) => boolean): Block[] {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const out: Block[] = [];
  Array.from(body.children).forEach((el) => {
    if (el.classList.contains(EMBED_CLASS)) {
      const item = items.get(el.getAttribute('data-item') ?? '');
      if (item && shown(item)) out.push({ kind: 'item', item, cite: citation(item) });
      return;
    }
    const runs = runsOf(el);
    switch (el.tagName) {
      case 'H3':
        if (!blank(runs)) out.push({ kind: 'heading', runs });
        break;
      case 'BLOCKQUOTE':
        if (!blank(runs)) out.push({ kind: 'quote', runs });
        break;
      case 'UL':
      case 'OL': {
        const lis = Array.from(el.children)
          .filter((c) => c.tagName === 'LI')
          .map((li) => runsOf(li))
          .filter((r) => !blank(r));
        if (lis.length) out.push({ kind: 'list', ordered: el.tagName === 'OL', items: lis });
        break;
      }
      default:
        if (!blank(runs)) out.push({ kind: 'para', runs });
    }
  });
  return out;
}

// --- plain text ---------------------------------------------------------------------------------------

function itemText(item: DeskItem, cite: string, md: boolean): string {
  const title = itemTitle(item);
  const body = item.text ? (item.body ?? '').trim() : (item.body ?? '').split('\n').slice(1).join('\n').trim();
  const strong = (s: string) => (md ? `**${escapeMd(s)}**` : s);
  const quoteLines = (s: string) => s.split('\n').map((l) => (md ? `> ${escapeMd(l)}` : `“${l}”`));
  switch (item.type) {
    case 'quote': {
      const lines = md ? [...quoteLines(title), ...(cite ? ['>', `> — ${escapeMd(cite)}`] : [])] : [`“${title}”${cite ? ` (${cite})` : ''}`];
      return [lines.join('\n'), body && (md ? escapeMd(body) : body)].filter(Boolean).join('\n\n');
    }
    case 'capture': {
      const label = item.imageHash ? (md ? `*[Screenshot${title && !/^Region of page/.test(title) ? `: ${escapeMd(title)}` : ''}]*` : `[Screenshot${title && !/^Region of page/.test(title) ? `: ${title}` : ''}]`) : md ? escapeMd(title) : title;
      return [cite ? `${label} (${md ? escapeMd(cite) : cite})` : label, body && (md ? escapeMd(body) : body)].filter(Boolean).join('\n\n');
    }
    case 'question':
      return [`${md ? '**Question:**' : 'Question:'} ${md ? escapeMd(title) : title}`, body && (md ? escapeMd(body) : body)].filter(Boolean).join('\n\n');
    case 'card':
      return `${strong(title)} — ${md ? escapeMd(body) : body}`;
    case 'concept':
      return body ? `${strong(title)} — ${md ? escapeMd(body) : body}` : strong(title);
    default:
      return [md ? escapeMd(title) : title, body && (md ? escapeMd(body) : body)].filter(Boolean).join('\n\n');
  }
}

/** Plain text, for the clipboard. */
export function toPlainText(title: string, blocks: Block[]): string {
  const parts = [title];
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'para') parts.push(plain(b.runs));
    else if (b.kind === 'quote') parts.push(`“${plain(b.runs)}”`);
    else if (b.kind === 'list') parts.push(b.items.map((r, i) => `${b.ordered ? `${i + 1}.` : '•'} ${plain(r)}`).join('\n'));
    else parts.push(itemText(b.item, b.cite, false));
  }
  return parts.join('\n\n') + '\n';
}

// --- Markdown -----------------------------------------------------------------------------------------

function escapeMd(s: string): string {
  return s.replace(/([\\`*_[\]])/g, '\\$1').replace(/^([#>+-]|\d+\.)(\s)/gm, '\\$1$2');
}

function runsMd(runs: Run[]): string {
  return runs
    .map((r) => {
      if (r.text === '\n') return '  \n';
      let t = escapeMd(r.text);
      // Keep the spaces outside the markers, or Markdown ignores them.
      const lead = t.match(/^\s*/)![0];
      const trail = t.match(/\s*$/)![0];
      t = t.trim();
      if (!t) return lead + trail;
      if (r.b) t = `**${t}**`;
      if (r.i) t = `*${t}*`;
      return lead + t + trail;
    })
    .join('');
}

export function toMarkdown(title: string, blocks: Block[]): string {
  const parts = [`# ${escapeMd(title)}`];
  for (const b of blocks) {
    if (b.kind === 'heading') parts.push(`## ${runsMd(b.runs)}`);
    else if (b.kind === 'para') parts.push(runsMd(b.runs));
    else if (b.kind === 'quote')
      parts.push(
        runsMd(b.runs)
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n')
      );
    else if (b.kind === 'list') parts.push(b.items.map((r, i) => `${b.ordered ? `${i + 1}.` : '-'} ${runsMd(r)}`).join('\n'));
    else parts.push(itemText(b.item, b.cite, true));
  }
  return parts.join('\n\n') + '\n';
}

/** A file name from the desk title: its letters, Arabic included, without characters file systems refuse. */
export function exportFileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Desk';
  return `${base}.${ext}`;
}

export const isArabicText = (s: string) => looksArabic(s);
