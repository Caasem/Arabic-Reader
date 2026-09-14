// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PomodoroService, type PomodoroOutcome } from './pomodoroService';
import { persistenceService } from '../persistence/db';

const T0 = 2_000_000_000;

describe('PomodoroService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('records active time excluding pauses, with the real start time', async () => {
    const service = new PomodoroService();
    service.setPrefs({ pomodoroWorkMinutes: 25, pomodoroBreakMinutes: 5, pomodoroAutoCycle: false, pomodoroNotification: 'silent' });
    const outcomes: string[] = [];
    service.onNotify((phase, outcome: PomodoroOutcome) => outcomes.push(`${phase}:${outcome}`));

    service.start({ id: 'pause-book', title: 'Book' });
    vi.advanceTimersByTime(10_000);
    service.pause();
    vi.advanceTimersByTime(60_000);
    service.resume();
    vi.advanceTimersByTime(5_000);
    service.stop();
    await service.whenIdle();

    const [session] = (await persistenceService.getPomodoroSessions()).filter((s) => s.bookId === 'pause-book');
    expect(session).toMatchObject({ phase: 'work', status: 'abandoned', activeDurationMs: 15_000, startedAt: T0 });
    expect(outcomes).toEqual(['work:abandoned']);
    expect(service.getSnapshot()).toBeNull();
  });

  it('completes a phase on time and auto-cycles into a break', async () => {
    const service = new PomodoroService();
    service.setPrefs({ pomodoroWorkMinutes: 1, pomodoroBreakMinutes: 5, pomodoroAutoCycle: true, pomodoroNotification: 'silent' });
    service.start({ id: 'cycle-book', title: 'Book' });
    vi.advanceTimersByTime(60_000);
    await service.whenIdle();

    const [session] = (await persistenceService.getPomodoroSessions()).filter((s) => s.bookId === 'cycle-book');
    expect(session).toMatchObject({ status: 'completed', activeDurationMs: 60_000 });
    expect(service.getSnapshot()).toMatchObject({ phase: 'break', running: true, targetDurationMs: 5 * 60_000 });
    service.stop();
  });

  it('resumes a running phase after a reload, counting time spent closed', () => {
    const first = new PomodoroService();
    first.start(null);
    vi.advanceTimersByTime(30_000);
    vi.setSystemTime(Date.now() + 120_000); // app closed for two minutes
    const reloaded = new PomodoroService();
    expect(reloaded.getSnapshot()?.activeDurationMs).toBe(150_000);
    reloaded.stop();
    first.stop();
  });
});
