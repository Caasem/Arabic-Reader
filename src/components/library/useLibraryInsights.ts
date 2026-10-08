import { useEffect, useState } from 'react';
import { persistenceService } from '../../persistence';
import { getStreak, type StreakInfo } from '../../stats';
import type { Highlight, ReadingSession, VocabularyItem } from '../../types';
import { dayKey } from '../../utils/date';
import { vocabularyService } from '../../vocabulary';

export interface LibraryInsights {
  /** Newest first. */
  highlights: Highlight[];
  vocabulary: VocabularyItem[];
  sessions: ReadingSession[];
  activeDays: Set<string>;
  streak: StreakInfo;
  dueCount: number;
}

const EMPTY: LibraryInsights = { highlights: [], vocabulary: [], sessions: [], activeDays: new Set(), streak: { current: 0, longest: 0 }, dueCount: 0 };

/**
 * Everything around the books that the Library shows: highlights, saved
 * words, reading sessions, the streak and cards due. Loaded once per visit
 * to the Library (and again when `reloadKey` changes), after the shelf itself.
 */
export function useLibraryInsights(reloadKey: number): { insights: LibraryInsights; ready: boolean } {
  const [state, setState] = useState<{ insights: LibraryInsights; ready: boolean }>({ insights: EMPTY, ready: false });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      persistenceService.getAllHighlights(),
      vocabularyService.list(),
      persistenceService.getReadingSessions(),
      vocabularyService.getDueForReview(),
      getStreak(),
    ])
      .then(([highlights, vocabulary, sessions, due, streak]) => {
        if (cancelled) return;
        setState({
          insights: {
            highlights: [...highlights].sort((a, b) => b.createdAt - a.createdAt),
            vocabulary,
            sessions,
            activeDays: new Set(sessions.map((s) => dayKey(s.startedAt))),
            streak,
            dueCount: due.length,
          },
          ready: true,
        });
      })
      .catch(() => {
        // The shelf still works without these; the extras just stay empty.
        if (!cancelled) setState((prev) => ({ ...prev, ready: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return state;
}
