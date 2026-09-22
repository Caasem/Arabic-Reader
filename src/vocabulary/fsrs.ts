import { fsrs, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { MasteryLevel, VocabularyItem } from '../types';

/**
 * FSRS scheduling (the algorithm Anki defaults to), with the library's
 * published default parameters (90% target retention). VocabularyItem keeps
 * FSRS state as flat fields; these helpers convert to and from ts-fsrs's Card.
 */
export const scheduler = fsrs();

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export const GRADE_TO_RATING: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export type FsrsFields = Pick<
  VocabularyItem,
  | 'fsrsDue'
  | 'fsrsStability'
  | 'fsrsDifficulty'
  | 'fsrsScheduledDays'
  | 'fsrsLearningSteps'
  | 'fsrsReps'
  | 'fsrsLapses'
  | 'fsrsState'
>;

/** A brand-new card, due immediately. */
export function freshFsrsFields(now: number): FsrsFields {
  const card = createEmptyCard(new Date(now));
  return {
    fsrsDue: now,
    fsrsStability: card.stability,
    fsrsDifficulty: card.difficulty,
    fsrsScheduledDays: card.scheduled_days,
    fsrsLearningSteps: card.learning_steps,
    fsrsReps: card.reps,
    fsrsLapses: card.lapses,
    fsrsState: card.state,
  };
}

export function toFsrsCard(item: VocabularyItem): Card {
  return {
    due: new Date(item.fsrsDue),
    stability: item.fsrsStability,
    difficulty: item.fsrsDifficulty,
    elapsed_days: 0,
    scheduled_days: item.fsrsScheduledDays,
    learning_steps: item.fsrsLearningSteps,
    reps: item.fsrsReps,
    lapses: item.fsrsLapses,
    state: item.fsrsState as State,
    last_review: item.fsrsLastReview ? new Date(item.fsrsLastReview) : undefined,
  };
}

export function applyReview(item: VocabularyItem, card: Card, now: number, grade: ReviewGrade): VocabularyItem {
  const mastery: MasteryLevel =
    card.state === State.New ? 'new' : card.state === State.Review && card.stability >= 90 ? 'mastered' : 'learning';
  return {
    ...item,
    fsrsDue: card.due.getTime(),
    fsrsStability: card.stability,
    fsrsDifficulty: card.difficulty,
    fsrsScheduledDays: card.scheduled_days,
    fsrsLearningSteps: card.learning_steps,
    fsrsReps: card.reps,
    fsrsLapses: card.lapses,
    fsrsState: card.state,
    fsrsLastReview: now,
    mastery,
    successfulRecalls: grade === 'again' ? item.successfulRecalls : item.successfulRecalls + 1,
    lastReviewedAt: now,
  };
}

/** Anki-style "due in" label for the grade buttons: "10m", "3d", "2mo". */
export function formatDueIn(dueMs: number, now: number = Date.now()): string {
  const diffMs = dueMs - now;
  if (diffMs <= 60_000) return '<1m';
  const minutes = diffMs / 60_000;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${Math.round(days / 365)}y`;
}
