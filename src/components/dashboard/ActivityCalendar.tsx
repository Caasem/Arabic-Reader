import { useMemo } from 'react';
import type { DayActivity } from '../../stats/readingStatsService';
import { dayKey } from '../../stats/readingStatsService';
import './ActivityCalendar.css';

const WEEKS = 26; // ~6 months — enough real history to be useful, fits without horizontal scroll on a typical window
const DAY_MS = 86_400_000;

function levelFor(ms: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (ms <= 0 || max <= 0) return 0;
  const ratio = ms / max;
  if (ratio > 0.85) return 4;
  if (ratio > 0.55) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export function ActivityCalendar({
  data,
  selected,
  onSelectDay,
}: {
  data: DayActivity[];
  selected: string | null;
  onSelectDay: (date: string) => void;
}) {
  const { weeks, max, totalDays } = useMemo(() => {
    const byDate = new Map(data.map((d) => [d.date, d]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Align the grid so the last column ends on today's weekday.
    const daysBack = WEEKS * 7 - 1;
    const start = new Date(today.getTime() - daysBack * DAY_MS);
    start.setDate(start.getDate() - start.getDay()); // snap back to Sunday

    const cells: { date: string; ms: number; inRange: boolean }[] = [];
    let max = 0;
    let totalDays = 0;
    for (let i = 0; i < WEEKS * 7; i++) {
      const t = start.getTime() + i * DAY_MS;
      const key = dayKey(t);
      const activity = byDate.get(key);
      const ms = activity?.activeDurationMs ?? 0;
      if (ms > 0) totalDays++;
      max = Math.max(max, ms);
      cells.push({ date: key, ms, inRange: t <= today.getTime() });
    }
    const weeks: (typeof cells)[] = [];
    for (let w = 0; w < WEEKS; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));
    return { weeks, max, totalDays };
  }, [data]);

  return (
    <div className="activity-cal">
      <div className="activity-cal__grid">
        {weeks.map((week, wi) => (
          <div className="activity-cal__week" key={wi}>
            {week.map((cell) => (
              <button
                key={cell.date}
                className={
                  'activity-cal__cell' +
                  (cell.inRange ? ` activity-cal__cell--l${levelFor(cell.ms, max)}` : ' activity-cal__cell--future') +
                  (selected === cell.date ? ' activity-cal__cell--selected' : '')
                }
                disabled={!cell.inRange || cell.ms === 0}
                onClick={() => onSelectDay(cell.date)}
                title={`${cell.date} — ${cell.ms > 0 ? Math.round(cell.ms / 60_000) + ' min' : 'no reading'}`}
                aria-label={`${cell.date}, ${cell.ms > 0 ? Math.round(cell.ms / 60_000) + ' minutes read' : 'no reading'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="activity-cal__footer">
        <span>{totalDays} active day{totalDays === 1 ? '' : 's'} in the last {WEEKS * 7} days</span>
        <div className="activity-cal__legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`activity-cal__cell activity-cal__cell--l${l} activity-cal__legend-swatch`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
