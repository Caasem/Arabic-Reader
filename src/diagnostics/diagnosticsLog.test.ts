// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_DIAGNOSTIC_ENTRIES,
  clearDiagnostics,
  formatDiagnosticsReport,
  getDiagnostics,
  logDiagnostic,
  subscribeDiagnostics,
} from './diagnosticsLog';

describe('diagnosticsLog', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDiagnostics();
  });

  it('appends entries with error details', () => {
    logDiagnostic('error', 'reader', 'Could not open book', new Error('bad zip'));
    const [entry] = getDiagnostics();
    expect(entry).toMatchObject({ level: 'error', source: 'reader', message: 'Could not open book' });
    expect(entry.detail).toContain('bad zip');
  });

  it('keeps only the newest entries', () => {
    for (let i = 0; i < MAX_DIAGNOSTIC_ENTRIES + 5; i++) logDiagnostic('info', 'test', `entry ${i}`);
    const entries = getDiagnostics();
    expect(entries).toHaveLength(MAX_DIAGNOSTIC_ENTRIES);
    expect(entries[0].message).toBe('entry 5');
  });

  it('returns a stable snapshot and notifies subscribers on change', () => {
    let calls = 0;
    const unsubscribe = subscribeDiagnostics(() => calls++);
    const before = getDiagnostics();
    expect(getDiagnostics()).toBe(before);
    logDiagnostic('warn', 'test', 'changed');
    expect(calls).toBe(1);
    expect(getDiagnostics()).not.toBe(before);
    unsubscribe();
    clearDiagnostics();
    expect(calls).toBe(1);
    expect(getDiagnostics()).toEqual([]);
  });

  it('formats a report with info and indented details', () => {
    logDiagnostic('error', 'dictionary', 'Lookup failed', 'line one\nline two');
    const report = formatDiagnosticsReport({ 'App version': '1.0' });
    expect(report).toContain('App version: 1.0');
    expect(report).toContain('[error] dictionary: Lookup failed');
    expect(report).toContain('    line two');
  });
});
