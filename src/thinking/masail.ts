import type { DeskItem } from '../studyDesk/types';

/** Masāʾil (docs/features/thinking-front.md): questions kept open until a passage answers them. */

export type MasailFilter = 'open' | 'answered' | 'all';

/** Open until a passage answers it; a question whose answering passage was deleted is open again. */
export function isOpen(q: DeskItem, byId: ReadonlyMap<string, DeskItem>): boolean {
  return !q.answer || !byId.has(q.answer);
}

/** Open ones oldest first (longest waiting first), answered ones most recently answered first; All is open, then answered. */
export function masail(items: DeskItem[], byId: ReadonlyMap<string, DeskItem>, filter: MasailFilter): DeskItem[] {
  const questions = items.filter((i) => i.type === 'question');
  const open = questions.filter((q) => isOpen(q, byId)).sort((a, b) => a.createdAt - b.createdAt);
  const answered = questions.filter((q) => !isOpen(q, byId)).sort((a, b) => (b.answeredAt ?? b.updatedAt) - (a.answeredAt ?? a.updatedAt));
  return filter === 'open' ? open : filter === 'answered' ? answered : [...open, ...answered];
}

/** The open masʾala that has waited longest. */
export function oldestOpen(items: DeskItem[], byId: ReadonlyMap<string, DeskItem>): DeskItem | null {
  return masail(items, byId, 'open')[0] ?? null;
}

/** How long a masʾala has waited, with no "ago": "3 days", "2 months", "a year". */
export function waited(askedAt: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(askedAt)) / 864e5);
  if (days <= 0) return 'less than a day';
  if (days === 1) return 'a day';
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} months`;
  const years = Math.round(days / 365);
  return years === 1 ? 'a year' : `${years} years`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** What saving an answer sets on the question. */
export const answerPatch = (answerId: string, now = Date.now()): { answer: string; answeredAt: number } => ({ answer: answerId, answeredAt: now });

/** What reopening clears (patchItems removes a field set to undefined). */
export const reopenPatch = (): { answer: undefined; answeredAt: undefined } => ({ answer: undefined, answeredAt: undefined });
