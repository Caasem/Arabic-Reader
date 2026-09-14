import { useCallback, useEffect, useRef, useState } from 'react';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { CollapsibleSection } from './CollapsibleSection';
import { RangeFilter } from './RangeFilter';
import { ArabicProfileSection } from './ArabicProfileSection';
import { CurrentFocusSection } from './CurrentFocusSection';
import { ReadingStatsSection } from './ReadingStatsSection';
import { CalendarSection } from './CalendarSection';
import { TrendCharts } from './TrendCharts';
import { PomodoroStatsSection } from './PomodoroStatsSection';
import { getPomodoroTotals, type PomodoroTotals } from '../../pomodoro/pomodoroStats';
import {
  getArabicProfile,
  getReadingTotals,
  getVocabularySavedInRange,
  getWeakVocabulary,
  getStreak,
  getDailyActivity,
  getTrend,
  type ArabicProfile,
  type ReadingTotals,
  type StreakInfo,
  type DayActivity,
  type TrendPoint,
  type TimeRange,
} from '../../stats/readingStatsService';
import type { VocabularyItem } from '../../types';
import './Dashboard.css';

export function Dashboard() {
  const [range, setRange] = useState<TimeRange>('week');

  const [profile, setProfile] = useState<ArabicProfile | null>(null);
  const [weakVocab, setWeakVocab] = useState<VocabularyItem[] | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [dailyActivity, setDailyActivity] = useState<DayActivity[] | null>(null);

  // Tagged with the range it was computed for, so a range switch shows
  // loading placeholders (derived below) instead of stale numbers.
  const [rangeData, setRangeData] = useState<{
    range: TimeRange;
    totals: ReadingTotals;
    vocabSaved: number;
    trend: TrendPoint[];
    pomodoroTotals: PomodoroTotals;
  } | null>(null);
  const current = rangeData?.range === range ? rangeData : null;

  // Range-independent — an Arabic learner's cumulative profile, the weak-word
  // list, streaks, and the full activity log don't reset when the filter
  // changes, so these load once.
  // Vocabulary feeds several sections; read it once per Dashboard visit.
  const vocabularyRef = useRef<Promise<VocabularyItem[]> | null>(null);
  const loadVocabulary = useCallback(() => (vocabularyRef.current ??= vocabularyService.list()), []);

  useEffect(() => {
    const vocabulary = loadVocabulary();
    vocabulary.then((items) => getArabicProfile(items)).then(setProfile);
    vocabulary.then((items) => getWeakVocabulary(8, items)).then(setWeakVocab);
    getStreak().then(setStreak);
    getDailyActivity().then(setDailyActivity);
  }, [loadVocabulary]);

  // Range-dependent — recomputed every time the Today/Week/Month/90d/All
  // filter changes.
  useEffect(() => {
    let cancelled = false;
    loadVocabulary().then(async (items) => {
      const [totals, vocabSaved, trend, pomodoroTotals] = await Promise.all([
        getReadingTotals(range),
        getVocabularySavedInRange(range, items),
        getTrend(range, items),
        getPomodoroTotals(range),
      ]);
      if (!cancelled) setRangeData({ range, totals, vocabSaved, trend, pomodoroTotals });
    });
    return () => {
      cancelled = true;
    };
  }, [range, loadVocabulary]);

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard__subtitle">Your Arabic reading, at a glance.</p>
        </div>
        <RangeFilter value={range} onChange={setRange} />
      </header>

      <div className="dashboard__sections">
        <CollapsibleSection id="profile" title="Arabic Profile">
          <ArabicProfileSection profile={profile} />
        </CollapsibleSection>

        <CollapsibleSection id="focus" title="Current Focus" subtitle="Weak vocabulary">
          <CurrentFocusSection words={weakVocab} />
        </CollapsibleSection>

        <CollapsibleSection id="stats" title="Reading Statistics" subtitle={rangeSubtitle(range)}>
          <ReadingStatsSection totals={current?.totals ?? null} vocabularySaved={current?.vocabSaved ?? null} streak={streak} />
        </CollapsibleSection>

        <CollapsibleSection id="pomodoro" title="Pomodoro" subtitle={rangeSubtitle(range)}>
          <PomodoroStatsSection totals={current?.pomodoroTotals ?? null} />
        </CollapsibleSection>

        <CollapsibleSection id="calendar" title="Calendar" subtitle="Reading activity">
          <CalendarSection data={dailyActivity} />
        </CollapsibleSection>

        <CollapsibleSection id="trends" title="Trends" subtitle={rangeSubtitle(range)}>
          <TrendCharts points={current?.trend ?? null} />
        </CollapsibleSection>
      </div>
    </div>
  );
}

function rangeSubtitle(range: TimeRange): string {
  switch (range) {
    case 'today':
      return 'Today';
    case 'week':
      return 'Last 7 days';
    case 'month':
      return 'Last 30 days';
    case '90d':
      return 'Last 90 days';
    case 'all':
      return 'All time';
  }
}
