import { escapeMd, itemText, runsMd } from '../studyDesk/docExport';
import { registerExportFormat, type ExportContext } from '../studyDesk/exportFormats';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import type { DeskItem } from '../studyDesk/types';
import { itemTitle } from '../studyDesk/useDesk';
import { parseCleanLocation } from '../readerCore/location';

/**
 * The thinking desk's two export formats (docs/features/thinking-front.md, Export): Obsidian (front matter, wiki
 * links, tags, backlinks) and Notion (plain Markdown with to-dos). Both read the same blocks as Markdown does.
 */

/** Where a passage sits in its book: the label to show and to link to (empty when the place is unknown). */
function placeOf(item: DeskItem): string {
  const loc = item.source?.location;
  const pdf = parsePdfLocation(loc);
  if (pdf) return `p. ${pdf.page}`;
  const clean = parseCleanLocation(loc);
  return clean ? item.source?.chapterLabel || `ch. ${clean.chapter + 1}` : '';
}

/** "Book, p. 62" (the words of a citation line); empty when the item has no book. */
function cite(item: DeskItem): string {
  const book = item.source?.bookTitle;
  if (!book) return '';
  const place = placeOf(item);
  return place ? `${book}, ${place}` : book;
}

/** A wiki link to the passage's page, with an optional alias; characters that break a link are dropped. */
function wiki(item: DeskItem, alias?: string): string {
  const clean = (s: string) =>
    s
      .replace(/[[\]|#^\\/:*?"<>\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const book = clean(item.source?.bookTitle ?? '');
  if (!book) return '';
  const place = clean(placeOf(item));
  return `[[${book}${place ? `#${place}` : ''}${alias ? `|${clean(alias)}` : ''}]]`;
}

const snippet = (s: string, n = 40) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > n ? `${chars.slice(0, n).join('')}…` : flat;
};

const yaml = (s: string) => JSON.stringify(s);

/** The reader's own words: a note's text, or its lines when it has no text (a Ḥāshiya line). */
const thoughtText = (item: DeskItem) => [item.text, item.body].filter(Boolean).join('\n').trim();

const lines = (s: string, prefix = '') => s.split('\n').map((l) => `${prefix}${escapeMd(l)}`);

function build(ctx: ExportContext, obsidian: boolean, now: number): string {
  const { desk, items } = ctx;
  const link = (item: DeskItem) => (obsidian ? wiki(item) : '');
  const citeLine = (item: DeskItem) => {
    const c = cite(item);
    const l = link(item);
    return c ? `— ${escapeMd(c)}${l ? ` · ${l}` : ''}` : '';
  };
  const quoteOf = (item: DeskItem, prefix: string, move = false) => {
    const c = citeLine(item);
    const tag = move && obsidian && item.move ? ` #${item.move}` : '';
    return [...lines(itemTitle(item), `${prefix}> `), ...(c ? [`${prefix}>`, `${prefix}> ${c}${tag}`] : [])].join('\n');
  };

  const parts: string[] = [];
  if (obsidian) {
    const kind = desk?.kind ?? 'own';
    const fm = ['---', `title: ${yaml(ctx.title)}`, `kind: ${kind}`];
    if (kind === 'thread' && desk?.question) fm.push(`question: ${yaml(desk.question)}`);
    fm.push(`tags: [arabic-reader, ${kind === 'thread' ? 'thread' : 'desk'}]`, `exported: ${new Date(now).toISOString().slice(0, 10)}`, '---');
    parts.push(fm.join('\n'));
  }
  const ar = desk?.kind === 'thread' && obsidian && desk.titleAr && desk.titleAr !== ctx.title ? `${desk.titleAr} · ` : '';
  parts.push(`# ${escapeMd(ar + ctx.title)}`);
  if (desk?.kind === 'thread' && desk.question) {
    const q = lines(desk.question, '> ');
    parts.push((obsidian ? q : [q[0].replace('> ', '> **Question:** '), ...q.slice(1)]).join('\n'));
  }

  const thought = (item: DeskItem) => {
    const text = lines(thoughtText(item)).join('  \n');
    const linked = obsidian
      ? (item.links ?? [])
          .map((id) => items?.get(id))
          .filter((o): o is DeskItem => !!o)
          .map((o) => {
            const text = `“${snippet(thoughtText(o) || itemTitle(o))}”`;
            return wiki(o, text) || text;
          })
      : [];
    return [obsidian ? `**My note:** ${text}` : text, linked.length ? `Linked: ${linked.join(', ')}` : ''].filter(Boolean).join('\n\n');
  };

  const question = (item: DeskItem) => {
    const answer = item.answer ? items?.get(item.answer) : undefined;
    const body = (item.body ?? '').trim();
    const out = [`- [${item.answer ? 'x' : ' '}] ${obsidian ? '**Masʾala:** ' : ''}${lines(itemTitle(item)).join('  \n  ')}`];
    if (body) out.push(...lines(body, '  '));
    if (answer) out.push('', quoteOf(answer, '  '));
    return out.join('\n');
  };

  for (const b of ctx.blocks) {
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
    else if (b.item.type === 'note' || b.item.type === 'line') parts.push(thought(b.item));
    else if (b.item.type === 'question') parts.push(question(b.item));
    else if (b.item.type === 'quote') {
      const body = (b.item.text ? (b.item.body ?? '') : (b.item.body ?? '').split('\n').slice(1).join('\n')).trim();
      parts.push([quoteOf(b.item, '', true), body && lines(body).join('\n')].filter(Boolean).join('\n\n'));
    } else {
      const text = itemText(b.item, b.cite, true);
      parts.push(obsidian && b.item.move ? `${text} #${b.item.move}` : text);
    }
  }
  return parts.join('\n\n') + '\n';
}

/** Obsidian: front matter, `[[Book#p. N]]` citations, moves as tags, linked thoughts as backlinks, masāʾil as to-dos. */
export function toObsidian(ctx: ExportContext, now: number = Date.now()): string {
  return build(ctx, true, now);
}

/** Notion: Markdown it takes on paste or import: quotes with citations, masāʾil as to-dos, no front matter or wiki links. */
export function toNotion(ctx: ExportContext): string {
  return build(ctx, false, 0);
}

/** Adds both formats to the desk document's Export menu; the returned function takes them out again. */
export function registerThinkingExports(): () => void {
  const off = [
    registerExportFormat({ id: 'obsidian', label: 'Save for Obsidian', ext: 'md', make: (c) => toObsidian(c), savedMessage: 'Saved for Obsidian' }),
    registerExportFormat({ id: 'notion', label: 'Save for Notion', ext: 'md', make: toNotion, savedMessage: 'Saved for Notion' }),
  ];
  return () => off.forEach((f) => f());
}
