import type { StreakInfo } from '../../stats';
import type { VocabularyItem } from '../../types';
import { topVocabularyBook, weekStrip } from './libraryInsights';

const GOALS = [10, 15, 20, 30, 45, 60];
const RING = 2 * Math.PI * 20;

interface Props {
  streak: StreakInfo;
  activeDays: Set<string>;
  todayMs: number;
  goalMinutes: number;
  onGoalChange(minutes: number): void;
  vocabulary: VocabularyItem[];
  dueCount: number;
  onOpenStats(): void;
  onOpenVocabulary(): void;
  onReview(): void;
}

/** Streak, today's reading against a goal, words saved, cards due. */
export function HabitsRow({ streak, activeDays, todayMs, goalMinutes, onGoalChange, vocabulary, dueCount, onOpenStats, onOpenVocabulary, onReview }: Props) {
  const week = weekStrip(activeDays);
  const todayMin = Math.floor(todayMs / 60_000);
  const share = Math.min(1, goalMinutes > 0 ? todayMin / goalMinutes : 0);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = vocabulary.filter((v) => v.addedAt >= weekAgo).length;
  const top = topVocabularyBook(vocabulary);
  const goals = GOALS.includes(goalMinutes) ? GOALS : [...GOALS, goalMinutes].sort((a, b) => a - b);

  return (
    <section className="lib-habits" aria-label="Reading habits">
      <button type="button" className="lib-tile lib-tile--button" onClick={onOpenStats}>
        <span className="lib-tile__label">Reading streak</span>
        <span className="lib-tile__value">
          {streak.current} <small>{streak.current === 1 ? 'day' : 'days'}</small>
        </span>
        <span className="lib-week" aria-label={`Read on ${week.filter((d) => d.active).length} of the last 7 days`}>
          {week.map((d) => (
            <span key={d.key} className="lib-week__day">
              <span className={'lib-week__bar' + (d.active ? ' lib-week__bar--on' : '')} />
              <span className={'lib-week__label' + (d.today ? ' lib-week__label--today' : '')}>{d.label}</span>
            </span>
          ))}
        </span>
      </button>

      <div className="lib-tile lib-tile--row">
        <svg aria-hidden="true" width="64" height="64" viewBox="0 0 48 48" className="lib-ring">
          <circle cx="24" cy="24" r="20" className="lib-ring__track" />
          <circle cx="24" cy="24" r="20" className="lib-ring__fill" strokeDasharray={`${RING * share} ${RING}`} transform="rotate(-90 24 24)" />
        </svg>
        <div className="lib-tile__stack">
          <span className="lib-tile__label">Today</span>
          <span className="lib-tile__value">
            {todayMin} <small>/ {goalMinutes} min</small>
          </span>
          <span className="lib-tile__hint">
            {todayMin >= goalMinutes ? 'Daily goal reached' : `${goalMinutes - todayMin} min to your daily goal`}
          </span>
          <label className="lib-goal">
            <span>Goal</span>
            <select value={goalMinutes} onChange={(e) => onGoalChange(Number(e.target.value))}>
              {goals.map((g) => (
                <option key={g} value={g}>
                  {g} min
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <button type="button" className="lib-tile lib-tile--button" onClick={onOpenVocabulary}>
        <span className="lib-tile__label">Words saved</span>
        <span className="lib-tile__value">{vocabulary.length}</span>
        <span className="lib-tile__hint">
          +{thisWeek} this week
          {top && (
            <>
              {' · '}
              {top.count} from{' '}
              <span className="lib-ar" dir="auto">
                {top.title}
              </span>
            </>
          )}
        </span>
      </button>

      <button type="button" className="lib-tile lib-tile--button lib-tile--due" onClick={onReview}>
        <span className="lib-tile__label">Flashcards due</span>
        <span className="lib-tile__value">{dueCount}</span>
        <span className="lib-tile__cta">{dueCount > 0 ? 'Review now →' : 'All caught up'}</span>
      </button>
    </section>
  );
}
