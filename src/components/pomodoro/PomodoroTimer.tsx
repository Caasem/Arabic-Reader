import { useEffect, useState } from 'react';
import { pomodoroService } from '../../pomodoro/pomodoroService';
import { usePreferences } from '../../state/PreferencesContext';
import type { BookMeta } from '../../types';
import './PomodoroTimer.css';

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** The timer popover -- a view onto pomodoroService, which keeps running
 * (and announces phase ends via PomodoroNotifier) when this is closed. */
export function PomodoroTimer({ book, onClose }: { book: BookMeta | null; onClose: () => void }) {
  const { prefs } = usePreferences();
  // The service mutates its snapshot in place, so re-render on every change.
  const [, forceRender] = useState(0);
  const snapshot = pomodoroService.getSnapshot();

  useEffect(() => pomodoroService.subscribe(() => forceRender((n) => n + 1)), []);

  const remainingMs = snapshot ? snapshot.targetDurationMs - snapshot.activeDurationMs : 0;

  return (
    <div className="pomodoro-backdrop" onClick={onClose}>
      <div className="pomodoro" onClick={(e) => e.stopPropagation()}>
        <div className="pomodoro__header">
          <span className="pomodoro__title">Pomodoro</span>
          <button className="pomodoro__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!snapshot ? (
          <button
            className="btn btn--primary pomodoro__start"
            onClick={() => pomodoroService.start(book ? { id: book.id, title: book.title } : null)}
          >
            Start Pomodoro
          </button>
        ) : (
          <>
            {prefs.pomodoroShowPhaseLabel && (
              <div className={'pomodoro__phase' + (snapshot.phase === 'break' ? ' pomodoro__phase--break' : '')}>
                {snapshot.phase === 'work' ? 'Work' : 'Break'}
              </div>
            )}
            <div className="pomodoro__time">{formatTime(remainingMs)}</div>
            {snapshot.bookTitle && <div className="pomodoro__book">{snapshot.bookTitle}</div>}
            <div className="pomodoro__controls">
              {snapshot.running ? (
                <button className="pomodoro__btn" onClick={() => pomodoroService.pause()}>
                  Pause
                </button>
              ) : (
                <button className="pomodoro__btn" onClick={() => pomodoroService.resume()}>
                  Resume
                </button>
              )}
              <button className="pomodoro__btn pomodoro__btn--stop" onClick={() => pomodoroService.stop()}>
                Stop
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
