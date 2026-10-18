import { EMPTY_DOC, embedHtml } from '../studyDesk/docHtml';
import type { DeskItem, DeskMove } from '../studyDesk/types';
import type { ArgNode, Argument } from './argument';
import { wordsOf } from './labels';
import { moveInfo } from './moves';
import { isPassage, isThought, onPassage, short, thoughtText } from './passages';

/**
 * Argument to draft (docs/features/thinking-front.md): the thread's argument tree as an outline for its Document.
 * Definitions first, then each claim as a heading with its evidence and objections (each objection followed by its
 * replies) as embedded passages with their citations, the thread's own thoughts on those passages as plain
 * paragraphs, and what is not tied yet last. No React here.
 */

export type DraftBlock = { kind: 'heading'; text: string } | { kind: 'para'; text: string } | { kind: 'item'; id: string };

const ORDER: Record<DeskMove, number> = { definition: 0, claim: 0, evidence: 1, objection: 2, reply: 3 };

/** Evidence before objections, then the rest; each group keeps the order the tree gives. */
export const inDraftOrder = (kids: ArgNode[]): ArgNode[] => [...kids].sort((a, b) => ORDER[a.item.move!] - ORDER[b.item.move!]);

/** The ids of every item in the tree. */
function treeIds(arg: Argument): Set<string> {
  const ids = new Set<string>();
  const walk = (n: ArgNode) => {
    ids.add(n.item.id);
    n.kids.forEach(walk);
  };
  [...arg.definitions, ...arg.claims, ...arg.loose].forEach(walk);
  return ids;
}

/**
 * The outline for an argument. `members` are the thread's members: the thoughts among them that sit on a passage of the
 * argument follow it as paragraphs (each once). Nothing in the argument gives an empty outline.
 */
export function draftBlocks(arg: Argument, members: DeskItem[]): DraftBlock[] {
  const inTree = treeIds(arg);
  const mine = members.filter((m) => isThought(m) && !inTree.has(m.id));
  const used = new Set<string>();
  const out: DraftBlock[] = [];

  /** An item and what hangs on it: a passage as an embed with the thoughts on it; a thought of yours as a paragraph. */
  const body = (n: ArgNode, own = true) => {
    const item = n.item;
    if (isPassage(item)) {
      out.push({ kind: 'item', id: item.id });
      for (const t of mine) {
        if (used.has(t.id) || !onPassage(t, item)) continue;
        used.add(t.id);
        out.push({ kind: 'para', text: thoughtText(t) });
      }
    } else if (own) out.push({ kind: 'para', text: `${moveInfo(item.move!).en}: ${wordsOf(item)}` });
    inDraftOrder(n.kids).forEach((k) => body(k));
  };

  if (arg.definitions.length) {
    out.push({ kind: 'heading', text: 'Definitions' });
    arg.definitions.forEach((n) => body(n));
  }
  for (const claim of arg.claims) {
    out.push({ kind: 'heading', text: short(wordsOf(claim.item), 100) || 'Claim' });
    // Your own claim is the heading itself; a claim taken from a book is quoted under it.
    body(claim, false);
  }
  if (arg.loose.length) {
    out.push({ kind: 'heading', text: 'Not tied yet' });
    arg.loose.forEach((n) => body(n));
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The outline as desk document HTML (headings, paragraphs and item embeds). */
export const draftHtml = (blocks: DraftBlock[]): string =>
  blocks.map((b) => (b.kind === 'heading' ? `<h3>${esc(b.text)}</h3>` : b.kind === 'para' ? `<p>${esc(b.text).replace(/\n/g, '<br>')}</p>` : embedHtml(b.id))).join('');

/** A document with nothing in it: no item and no words (the empty line a new one starts with). */
export const isBlankDoc = (html: string): boolean =>
  !html.includes('desk-embed') &&
  !html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();

const TRAILING_EMPTY_LINES = /(<p>\s*(<br\s*\/?>)?\s*<\/p>\s*)+$/i;

/** The document with the draft in it: written as it is when the document is blank, else added after it under "Draft — <date>". */
export function withDraft(html: string, blocks: DraftBlock[], date: string): string {
  const draft = draftHtml(blocks);
  if (isBlankDoc(html)) return draft + EMPTY_DOC;
  return html.replace(TRAILING_EMPTY_LINES, '') + `<h3>Draft — ${esc(date)}</h3>` + draft + EMPTY_DOC;
}
