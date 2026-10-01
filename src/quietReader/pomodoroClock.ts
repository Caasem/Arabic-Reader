import { useEffect, useState } from 'react';
import { pomodoroService } from '../pomodoro';
import type { PomodoroSnapshot } from '../types';

/** "18:42". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function remainingMs(snapshot: PomodoroSnapshot): number {
  return snapshot.targetDurationMs - snapshot.activeDurationMs;
}

/** The running phase, re-rendered on every tick. */
export function usePomodoroSnapshot(): PomodoroSnapshot | null {
  const [, force] = useState(0);
  useEffect(() => pomodoroService.subscribe(() => force((n) => n + 1)), []);
  return pomodoroService.getSnapshot();
}
