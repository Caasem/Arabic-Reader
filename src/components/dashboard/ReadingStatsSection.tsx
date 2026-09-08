import type { ReadingTotals, StreakInfo } from '../../stats/readingStatsService';
import { formatCount, formatHours } from './format';
import { IconFlame } from '../shared/icons';
import './StatGrid.css';

export function ReadingStatsSection({
  totals,
  vocabularySaved,
  streak,
}: {
  totals: ReadingTotals | null;
  vocabularySaved: number | null;
  streak: StreakInfo | null;
}) {
  if (!totals) return <div className="dash-empty">Loading…</div>;
  return (
    <div className="stat-grid">
      <div className="stat-tile">
        <div className="stat-tile__value">{formatHours(totals.activeDurationMs)}</div>
        <div className="stat-tile__label">Reading time</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(totals.wordsRead)}</div>
        <div className="stat-tile__label">Words read</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(totals.sessions)}</div>
        <div className="stat-tile__label">Sessions</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(totals.booksTouched)}</div>
        <div className="stat-tile__label">Books opened</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{totals.averageWpm || '—'}</div>
        <div className="stat-tile__label">Average WPM</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(totals.lookups)}</div>
        <div className="stat-tile__label">Dictionary lookups</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{vocabularySaved === null ? '—' : formatCount(vocabularySaved)}</div>
        <div className="stat-tile__label">Vocabulary saved</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{totals.lookupDensityPer1000 || '—'}</div>
        <div className="stat-tile__label">Lookups / 1,000 words</div>
      </div>
      <div className="stat-tile stat-tile--streak">
        <div className="stat-tile__value">
          <IconFlame size={16} />
          {streak ? streak.current : '—'}
        </div>
        <div className="stat-tile__label">{streak ? `Day streak · best ${streak.longest}` : 'Reading streak'}</div>
      </div>
    </div>
  );
}
