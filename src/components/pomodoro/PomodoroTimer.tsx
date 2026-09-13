import { useEffect, useState } from 'react';
import { pomodoroService } from '../../pomodoro/pomodoroService';
import { usePreferences } from '../../state/PreferencesContext';
import type { BookMeta } from '../../types';
import './PomodoroTimer.css';

/** A short, self-contained beep (Web Audio, no bundled asset) for
 * Settings → Pomodoro notification = "sound" -- two quick tones read as
 * "phase done" without needing an audio file shipped with the app. */
function playBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.16);
    });
    window.setTimeout(() => ctx.close(), 500);
  } catch {
    // best-effort only -- autoplay restrictions or no Web Audio support
    // just mean silence instead of a crash
  }
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PomodoroTimer({ book, onClose }: { book: BookMeta | null; onClose: () => void }) {
  const { prefs } = usePreferences();
  const [, forceRender] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const snapshot = pomodoroService.getSnapshot();

  useEffect(() => {
    pomodoroService.setPrefs({
      pomodoroWorkMinutes: prefs.pomodoroWorkMinutes,
      pomodoroBreakMinutes: prefs.pomodoroBreakMinutes,
      pomodoroAutoCycle: prefs.pomodoroAutoCycle,
      pomodoroNotification: prefs.pomodoroNotification,
    });
  }, [prefs.pomodoroWorkMinutes, prefs.pomodoroBreakMinutes, prefs.pomodoroAutoCycle, prefs.pomodoroNotification]);

  useEffect(() => pomodoroService.subscribe(() => forceRender((n) => n + 1)), []);

  useEffect(
    () =>
      pomodoroService.onNotify((phase, kind) => {
        const label = phase === 'work' ? 'Work' : 'Break';
        const message = kind === 'completed' ? `${label} session complete` : `${label} session ended`;
        if (prefs.pomodoroNotification === 'silent') return;
        if (prefs.pomodoroNotification === 'sound') playBeep();
        setToast(message);
        window.setTimeout(() => setToast(null), 3000);
      }),
    [prefs.pomodoroNotification]
  );

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

        {toast && <div className="pomodoro__toast">{toast}</div>}

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
