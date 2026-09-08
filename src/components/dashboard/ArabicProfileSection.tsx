import type { ArabicProfile } from '../../stats/readingStatsService';
import { formatCount } from './format';
import './StatGrid.css';

export function ArabicProfileSection({ profile }: { profile: ArabicProfile | null }) {
  if (!profile) return <div className="dash-empty">Loading…</div>;
  return (
    <div className="stat-grid stat-grid--profile">
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(profile.vocabularyKnown)}</div>
        <div className="stat-tile__label">Vocabulary known</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{formatCount(profile.rootsKnown)}</div>
        <div className="stat-tile__label">Roots known</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile__value">{profile.knownWordPercent}%</div>
        <div className="stat-tile__label">Known-word rate</div>
      </div>
    </div>
  );
}
