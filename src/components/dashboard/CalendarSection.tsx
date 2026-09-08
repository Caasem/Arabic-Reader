import { useEffect, useState } from 'react';
import { ActivityCalendar } from './ActivityCalendar';
import { getSessionsForDay, type DayActivity } from '../../stats/readingStatsService';
import type { ReadingSession } from '../../types';
import { formatHours, formatCount } from './format';
import { IconClose } from '../shared/icons';
import './CalendarSection.css';

export function CalendarSection({ data }: { data: DayActivity[] | null }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [daySessions, setDaySessions] = useState<ReadingSession[] | null>(null);

  useEffect(() => {
    if (!selectedDay) {
      setDaySessions(null);
      return;
    }
    let cancelled = false;
    setDaySessions(null);
    getSessionsForDay(selectedDay).then((sessions) => {
      if (!cancelled) setDaySessions(sessions);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDay]);

  if (!data) return <div className="dash-empty">Loading…</div>;

  return (
    <div className="calendar-section">
      <ActivityCalendar
        data={data}
        selected={selectedDay}
        onSelectDay={(date) => setSelectedDay((prev) => (prev === date ? null : date))}
      />

      {selectedDay && (
        <div className="day-detail">
          <div className="day-detail__header">
            <span className="day-detail__title">
              {new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
            <button className="day-detail__close" onClick={() => setSelectedDay(null)} aria-label="Close">
              <IconClose size={13} />
            </button>
          </div>
          {daySessions === null ? (
            <div className="dash-empty">Loading…</div>
          ) : daySessions.length === 0 ? (
            <div className="dash-empty">No reading logged this day.</div>
          ) : (
            <>
              <div className="day-detail__stats">
                <span>
                  <strong>{formatHours(daySessions.reduce((s, r) => s + r.activeDurationMs, 0))}</strong> reading
                </span>
                <span>
                  <strong>{formatCount(daySessions.reduce((s, r) => s + r.wordsRead, 0))}</strong> words
                </span>
                <span>
                  <strong>{formatCount(daySessions.reduce((s, r) => s + r.lookupCount, 0))}</strong> lookups
                </span>
                <span>
                  <strong>{daySessions.length}</strong> session{daySessions.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="day-detail__sessions">
                {daySessions.map((s) => (
                  <li key={s.id}>
                    <span className="day-detail__book">{s.bookTitle}</span>
                    <span className="day-detail__meta">
                      {formatHours(s.activeDurationMs)} · {formatCount(s.wordsRead)} words · {s.lookupCount} lookups
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
