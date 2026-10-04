import type { VocabularyItem } from '../types';

export type StatusKind = 'none' | 'new' | 'learning' | 'known';

export interface WordStatus {
  kind: StatusKind;
  /** When the soonest of the word's cards is due; undefined when not saved. */
  due?: number;
}

const LABEL: Record<StatusKind, string> = { none: 'Not saved', new: 'New', learning: 'Learning', known: 'Known' };

export function statusKindOf(item: VocabularyItem): Exclude<StatusKind, 'none'> {
  if (item.mastery === 'known' || item.mastery === 'mastered') return 'known';
  return item.mastery === 'learning' ? 'learning' : 'new';
}

/** One word's status from its cards: the least-learned card wins, the soonest due date shows. */
export function statusOf(items: VocabularyItem[]): WordStatus {
  if (!items.length) return { kind: 'none' };
  const order: StatusKind[] = ['new', 'learning', 'known'];
  const kind = items.map(statusKindOf).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return { kind, due: Math.min(...items.map((i) => i.fsrsDue)) };
}

export function statusLabel(kind: StatusKind): string {
  return LABEL[kind];
}

/** "due today", "review tomorrow", "review in 12 days" -- counted in calendar days. */
export function dueText(due: number, now = Date.now()): string {
  const day = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const days = day(due) - day(now);
  if (days <= 0) return 'due today';
  if (days === 1) return 'review tomorrow';
  return `review in ${days} days`;
}

export function statusText(status: WordStatus, now = Date.now()): string {
  if (status.kind === 'none' || status.due === undefined) return LABEL[status.kind];
  return `${LABEL[status.kind]} · ${dueText(status.due, now)}`;
}
