import { isStep, type ArgItem, type ArgumentRole } from './roles';

/** An item with its words (`text` for a margin-only one). The operations return new arrays and never mutate. */
export interface ArgNode extends ArgItem {
  start?: number | null;
  end?: number | null;
  text?: string;
  /** Written by the reader, not taken from the text. */
  typed?: boolean;
}

export type ImplicitRole = 'warrant' | 'rebuttal' | 'backing';

/** Implicit notes a card can offer: a step with a target takes a warrant and an exception, a warrant a backing. */
export function implicitFor(n: ArgItem, items: readonly ArgItem[]): ImplicitRole[] {
  const has = (role: ArgumentRole) => items.some((m) => m.role === role && m.for === n.id);
  const out: ImplicitRole[] = [];
  if (isStep(n) && n.for) {
    if (!has('warrant')) out.push('warrant');
    if (!has('rebuttal')) out.push('rebuttal');
  }
  if (n.role === 'warrant' && !has('backing')) out.push('backing');
  return out;
}

/** Removes an item and clears the target of whatever pointed at it. */
export const removeItem = <T extends ArgItem>(items: readonly T[], id: string): T[] =>
  items.filter((n) => n.id !== id).map((n) => (n.for === id ? { ...n, for: null } : n));

/** An implicit note: no words on the page, pinned at its target's spot. */
export function addImplicit(items: readonly ArgNode[], id: string, role: ImplicitRole, targetId: string, text: string): ArgNode[] {
  const t = items.find((n) => n.id === targetId);
  const body = text.trim();
  if (!t || !body) return [...items];
  return [...items, { id, role, for: targetId, spot: t.spot, marginOnly: true, start: null, end: null, text: body, typed: true }];
}

/** Keeps role, target and the words' text; drops the highlight. The note stays pinned where the words began. */
export const toMargin = (items: readonly ArgNode[], id: string, wordsOf: (n: ArgNode) => string): ArgNode[] =>
  items.map((n) => (n.id === id && !n.marginOnly ? { ...n, marginOnly: true, text: wordsOf(n), start: null, end: null } : n));

/** The reverse: the next selection becomes the note's words. */
export const tieToWords = (items: readonly ArgNode[], id: string, span: { start: number; end: number }): ArgNode[] =>
  items.map((n) => {
    if (n.id !== id) return n;
    const { text: _text, typed: _typed, marginOnly: _marginOnly, ...rest } = n;
    return { ...rest, start: span.start, end: span.end, spot: span.start };
  });
