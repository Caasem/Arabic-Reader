import type { DeskItem, DeskMove } from '../studyDesk/types';

/** The five argument moves, chosen by hand only (docs/features/thinking-front.md). Keys 1–5 pick them in the passage bar. */
export const MOVES: { id: DeskMove; ar: string; en: string; key: string }[] = [
  { id: 'definition', ar: 'تعريف', en: 'Definition', key: '1' },
  { id: 'claim', ar: 'دعوى', en: 'Claim', key: '2' },
  { id: 'evidence', ar: 'دليل', en: 'Evidence', key: '3' },
  { id: 'objection', ar: 'اعتراض', en: 'Objection', key: '4' },
  { id: 'reply', ar: 'جواب', en: 'Reply', key: '5' },
];

export const moveInfo = (id: DeskMove) => MOVES.find((m) => m.id === id)!;
export const moveForKey = (key: string): DeskMove | null => MOVES.find((m) => m.key === key)?.id ?? null;

/** What a move ties to: evidence and objections to a claim, a reply to an objection. Definitions and claims stand alone. */
export function tieKind(move: DeskMove | undefined): DeskMove | null {
  if (move === 'evidence' || move === 'objection') return 'claim';
  if (move === 'reply') return 'objection';
  return null;
}

/** The question the bar asks after a move that ties. */
export function tieQuestion(move: DeskMove): string {
  if (move === 'evidence') return 'Evidence for which claim?';
  if (move === 'objection') return 'Which claim does it object to?';
  return 'Which objection does it answer?';
}

/** Choosing a move: the same one again takes it off; another one drops the old tie (it may be the wrong kind now). */
export function movePatch(item: DeskItem, move: DeskMove): Pick<DeskItem, 'move' | 'tie'> {
  if (item.move === move) return { move: undefined, tie: undefined };
  return { move, tie: undefined };
}

/** Whether `from` can tie to `to`: the right kind, not itself. */
export function canTie(from: DeskItem, to: DeskItem): boolean {
  return from.id !== to.id && !!from.move && tieKind(from.move) === to.move && !to.droppedAt;
}

/** The tie as it stands: the target when it still exists and is still the right kind, else null (loose). */
export function tieOf(item: DeskItem, byId: Map<string, DeskItem>): DeskItem | null {
  const to = item.tie ? byId.get(item.tie) : undefined;
  return to && canTie(item, to) ? to : null;
}

/**
 * What the passage can tie to, best first: items in the active thread, then this book's, then the rest, each in the
 * order they were made (newest first).
 */
export function tieCandidates(item: DeskItem, move: DeskMove, items: DeskItem[], opts: { thread?: string | null; bookId?: string } = {}): DeskItem[] {
  const want = tieKind(move);
  if (!want) return [];
  const rank = (i: DeskItem) => (opts.thread && i.threads?.includes(opts.thread) ? 0 : opts.bookId && i.source?.bookId === opts.bookId ? 1 : 2);
  return items
    .filter((i) => i.id !== item.id && i.move === want && !i.droppedAt)
    .sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt);
}
