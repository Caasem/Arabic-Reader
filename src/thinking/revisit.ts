import { createEmptyCard, Rating, State, type Card } from 'ts-fsrs';
import type { DeskItem, DeskReview } from '../studyDesk/types';
import { scheduler } from '../vocabulary/fsrs';
import { isPassage, isThought, onPassage, thoughtText } from './passages';

/**
 * Scheduling for Revisit (docs/features/thinking-front.md): a thought comes back a week after it is written, then is
 * judged again. Still agree is graded Good and Revise Hard with the vocabulary's FSRS scheduler. No React here.
 */

const DAY = 864e5;
const FIRST_DAYS = 7;

type StoredCard = NonNullable<DeskReview['card']>;

/** Due a week out, with no card yet: the first visit starts the FSRS card. */
export function firstReview(now: number): DeskReview {
  return { due: now + FIRST_DAYS * DAY, every: FIRST_DAYS, agreed: [] };
}

/**
 * The FSRS card for a thought. Before the first visit there is none, so one is made as if the week just passed had
 * been the first interval (a review card whose stability is that week): the first Good then lands further out, rather
 * than in the learning steps' ten minutes a brand-new card would get.
 */
function cardOf(review: DeskReview): Card {
  const c = review.card;
  if (!c) {
    const since = new Date(review.due - review.every * DAY);
    return {
      ...createEmptyCard(since),
      due: new Date(review.due),
      stability: Math.max(1, review.every),
      difficulty: 5,
      scheduled_days: review.every,
      reps: 1,
      state: State.Review,
      last_review: since,
    };
  }
  return {
    due: new Date(review.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: 0,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.lastReview ? new Date(c.lastReview) : undefined,
  };
}

function grade(review: DeskReview, now: number, rating: Rating.Good | Rating.Hard): { card: StoredCard; days: number } {
  const next = scheduler.next(cardOf(review), new Date(now), rating).card;
  return {
    days: Math.max(1, Math.round(next.scheduled_days)),
    card: {
      stability: next.stability,
      difficulty: next.difficulty,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      scheduledDays: next.scheduled_days,
      learningSteps: next.learning_steps,
      lastReview: now,
    },
  };
}

/** Still agree: graded Good. The next visit is never nearer than the last gap, and is a day further out at least. */
export function agree(review: DeskReview, now: number): DeskReview {
  const { card, days } = grade(review, now, Rating.Good);
  const every = Math.max(days, review.every + 1);
  return { ...review, due: now + every * DAY, every, agreed: [...review.agreed, now], card: { ...card, scheduledDays: every } };
}

/** A thought's words live in its body (notes and lines) or in its text; the new wording goes where the old one is. */
const livesInBody = (item: DeskItem): boolean => !!(item.body ?? '').trim();

/** When the current wording was written: the last Revise, or the item's creation. */
function writtenAt(item: DeskItem): number {
  return (item.versions?.length && item.review?.revisedAt) || item.createdAt;
}

/** Revise: the current wording becomes a version, the new one takes its place, and the review is graded Hard. */
export function revise(item: DeskItem, newText: string, now: number): Partial<DeskItem> {
  const text = newText.trim();
  const review = item.review ?? firstReview(item.createdAt);
  const { card, days } = grade(review, now, Rating.Hard);
  return {
    versions: [...(item.versions ?? []), { at: writtenAt(item), text: thoughtText(item) }],
    ...(livesInBody(item) ? { body: text } : { text }),
    review: { due: now + days * DAY, every: days, agreed: review.agreed, card, revisedAt: now },
  };
}

/** Drop: archived, still on its desk. Undo restores it with `{ droppedAt: undefined }` through patchItems. */
export function drop(now: number): Partial<DeskItem> {
  return { droppedAt: now };
}

/** Live thoughts that are scheduled and due, the longest waiting first. */
export function dueThoughts(items: DeskItem[], now: number): DeskItem[] {
  return items.filter((i) => i.review && i.review.due <= now && isThought(i)).sort((a, b) => a.review!.due - b.review!.due);
}

/** The soonest visit still to come (ms), or null when nothing is waiting. */
export function nextDue(items: DeskItem[], now: number): number | null {
  let soonest: number | null = null;
  for (const i of items) if (i.review && i.review.due > now && isThought(i) && (soonest === null || i.review.due < soonest)) soonest = i.review.due;
  return soonest;
}

/** Every wording of a thought, newest first; the current one is marked. */
export function history(item: DeskItem): { at: number; text: string; current: boolean }[] {
  const old = (item.versions ?? []).map((v) => ({ at: v.at, text: v.text, current: false })).reverse();
  return [{ at: writtenAt(item), text: thoughtText(item), current: true }, ...old];
}

/** "a day", "9 days", "3 months": how far off a visit is, in the words the screen uses. */
export function intervalLabel(days: number): string {
  if (days <= 1) return 'a day';
  if (days < 60) return `${days} days`;
  const months = Math.round(days / 30.4);
  return months >= 24 ? `${Math.round(days / 365)} years` : `${months} months`;
}

/** The passage a thought is on: a quote or capture in the same book at the same place. */
export function passageFor(thought: DeskItem, items: DeskItem[]): DeskItem | undefined {
  return items.find((p) => p.id !== thought.id && isPassage(p) && onPassage(thought, p));
}
