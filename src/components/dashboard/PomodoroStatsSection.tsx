import type { PomodoroTotals } from '../../pomodoro';
import { formatCount, formatHours } from './format';
import './StatGrid.css';

export function PomodoroStatsSection({ totals }: { totals: PomodoroTotals | null }) {
  if (!totals) return <div className="dash-empty">Loading…</div>;
  if (totals.completed === 0 && totals.abandoned === 0) {
    return <div className="dash-empty">No Pomodoro sessions in this range yet.</div>;
  }
  return (
    <div className="stat-grid">
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(totals.completed)}</div>
        <div className="stat-tile__label">Completed</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(totals.abandoned)}</div>
        <div className="stat-tile__label">Abandoned</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatHours(totals.totalFocusMs)}</div>
        <div className="stat-tile__label">Focus time</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatHours(totals.averageDurationMs)}</div>
        <div className="stat-tile__label">Average session</div>
      </div>

      {totals.bookBreakdown.length > 0 && (
        <div className="stat-tile stat-tile--wide">
          <div className="stat-tile__label">By book</div>
          <ul className="pomodoro-book-breakdown">
            {totals.bookBreakdown.map((b) => (
              <li key={b.bookTitle}>
                <span className="pomodoro-book-breakdown__title">{b.bookTitle}</span>
                <span className="pomodoro-book-breakdown__detail">
                  {formatHours(b.ms)} · {b.sessions} session{b.sessions === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
