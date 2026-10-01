import { pomodoroService } from '../pomodoro';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { formatClock, remainingMs, usePomodoroSnapshot } from './pomodoroClock';
import { IconClose } from './icons';

/** The dock's Timer: start, pause or resume, skip to the next phase, stop. */
export function TimerPopover({ book, center, onClose }: { book: BookMeta; center: number; onClose(): void }) {
  const { prefs } = usePreferences();
  const snapshot = usePomodoroSnapshot();

  function skip() {
    if (!snapshot) return;
    const next = snapshot.phase === 'work' ? 'break' : 'work';
    pomodoroService.stop();
    pomodoroService.start({ id: book.id, title: book.title }, next);
  }

  const phase = !snapshot ? null : !snapshot.running ? 'Paused' : snapshot.phase === 'work' ? 'Work' : 'Break';

  return (
    <section className="qr-sheet qr-timer" role="dialog" aria-label="Pomodoro" style={{ left: center }}>
      <div className="qr-timer__top">
        {phase && prefs.pomodoroShowPhaseLabel ? <span className={'qr-timer__phase qr-timer__phase--' + phase.toLowerCase()}>{phase}</span> : <span />}
        <button type="button" className="qr-close qr-close--plain" onClick={onClose} aria-label="Close timer">
          <IconClose size={15} />
        </button>
      </div>
      <div className="qr-timer__time" role="timer">
        {formatClock(snapshot ? remainingMs(snapshot) : prefs.pomodoroWorkMinutes * 60_000)}
      </div>
      <div className="qr-timer__book" dir="auto" lang="ar">
        {snapshot?.bookTitle ?? book.title}
      </div>
      <div className="qr-timer__actions">
        {!snapshot ? (
          <button type="button" className="qr-btn qr-btn--primary" onClick={() => pomodoroService.start({ id: book.id, title: book.title })}>
            Start
          </button>
        ) : (
          <>
            <button
              type="button"
              className="qr-btn qr-btn--primary"
              onClick={() => (snapshot.running ? pomodoroService.pause() : pomodoroService.resume())}
            >
              {snapshot.running ? 'Pause' : 'Resume'}
            </button>
            <button type="button" className="qr-btn" onClick={skip}>
              Skip
            </button>
            <button type="button" className="qr-btn" onClick={() => pomodoroService.stop()}>
              Stop
            </button>
          </>
        )}
      </div>
      <div className="qr-timer__note">
        {prefs.pomodoroWorkMinutes} min work · {prefs.pomodoroBreakMinutes} min break ·{' '}
        {prefs.pomodoroAutoCycle ? 'next starts on its own' : 'waits for you at 00:00'}
      </div>
    </section>
  );
}
