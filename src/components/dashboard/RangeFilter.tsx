import { TIME_RANGE_LABELS, type TimeRange } from '../../stats/readingStatsService';
import './RangeFilter.css';

const RANGES: TimeRange[] = ['today', 'week', 'month', '90d', 'all'];

export function RangeFilter({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) {
  return (
    <div className="range-filter" role="tablist" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          className={'range-filter__btn' + (value === r ? ' range-filter__btn--active' : '')}
          onClick={() => onChange(r)}
        >
          {TIME_RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}
