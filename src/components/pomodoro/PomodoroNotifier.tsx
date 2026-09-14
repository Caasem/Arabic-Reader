import { useEffect, useRef, useState } from 'react';
import { pomodoroService } from '../../pomodoro/pomodoroService';
import { usePreferences } from '../../state/PreferencesContext';
import './PomodoroTimer.css';

const TOAST_MS = 3000;

/** Two short tones via Web Audio -- no bundled audio file needed. */
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
    // Autoplay restrictions or no Web Audio: stay silent rather than crash.
  }
}

/** Announces the end of a Pomodoro phase anywhere in the app, whether or not
 * the timer popover is open. Mounted once at the app root. */
export function PomodoroNotifier() {
  const { prefs } = usePreferences();
  const [message, setMessage] = useState<string | null>(null);
  const modeRef = useRef(prefs.pomodoroNotification);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    modeRef.current = prefs.pomodoroNotification;
  }, [prefs.pomodoroNotification]);

  useEffect(() => {
    const unsubscribe = pomodoroService.onNotify((phase, outcome) => {
      if (modeRef.current === 'silent') return;
      if (modeRef.current === 'sound') playBeep();
      const label = phase === 'work' ? 'Work' : 'Break';
      setMessage(outcome === 'completed' ? `${label} session complete` : `${label} session ended`);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setMessage(null), TOAST_MS);
    });
    return () => {
      unsubscribe();
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!message) return null;
  return (
    <div className="pomodoro-notifier" role="status">
      {message}
    </div>
  );
}
