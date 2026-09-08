import { useMemo, useState } from 'react';
import type { TrendPoint } from '../../stats/readingStatsService';
import './TrendCharts.css';

type MetricKey = 'wordsRead' | 'readingTime' | 'wpm' | 'lookupDensity' | 'vocabGrowth';

const METRICS: { key: MetricKey; label: string; suffix?: string }[] = [
  { key: 'wordsRead', label: 'Words read' },
  { key: 'readingTime', label: 'Reading time', suffix: 'm' },
  { key: 'wpm', label: 'WPM' },
  { key: 'lookupDensity', label: 'Lookup density' },
  { key: 'vocabGrowth', label: 'Vocabulary growth' },
];

function valueFor(point: TrendPoint, key: MetricKey, runningVocab: number): number {
  switch (key) {
    case 'wordsRead':
      return point.wordsRead;
    case 'readingTime':
      return Math.round(point.activeDurationMs / 60_000);
    case 'wpm':
      return point.averageWpm;
    case 'lookupDensity':
      return point.lookupDensityPer1000;
    case 'vocabGrowth':
      return runningVocab;
  }
}

const WIDTH = 640;
const HEIGHT = 140;
const PAD = 8;

export function TrendCharts({ points }: { points: TrendPoint[] | null }) {
  const [metric, setMetric] = useState<MetricKey>('wordsRead');

  const series = useMemo(() => {
    if (!points) return [];
    let running = 0;
    return points.map((p) => {
      running += p.vocabularyAdded;
      return { date: p.date, value: valueFor(p, metric, running) };
    });
  }, [points, metric]);

  if (!points) return <div className="dash-empty">Loading…</div>;
  if (points.length < 2) {
    return <div className="dash-empty">Not enough reading history yet to chart a trend — keep reading and this fills in.</div>;
  }

  const max = Math.max(1, ...series.map((s) => s.value));
  const min = 0;
  const stepX = series.length > 1 ? (WIDTH - PAD * 2) / (series.length - 1) : 0;

  function yFor(v: number) {
    const ratio = max === min ? 0 : (v - min) / (max - min);
    return HEIGHT - PAD - ratio * (HEIGHT - PAD * 2);
  }

  const linePath = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * stepX} ${yFor(s.value)}`).join(' ');
  const areaPath = `${linePath} L ${PAD + (series.length - 1) * stepX} ${HEIGHT - PAD} L ${PAD} ${HEIGHT - PAD} Z`;

  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const latest = series[series.length - 1]?.value ?? 0;

  return (
    <div className="trend-charts">
      <div className="trend-charts__picker">
        {METRICS.map((m) => (
          <button
            key={m.key}
            className={'trend-charts__pill' + (metric === m.key ? ' trend-charts__pill--active' : '')}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="trend-charts__headline">
        <span className="trend-charts__value">
          {latest.toLocaleString()}
          {activeMetric.suffix}
        </span>
        <span className="trend-charts__sub">{activeMetric.label} · latest day</span>
      </div>

      <svg className="trend-charts__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        <path d={areaPath} className="trend-charts__area" />
        <path d={linePath} className="trend-charts__line" />
      </svg>

      <div className="trend-charts__axis">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}
