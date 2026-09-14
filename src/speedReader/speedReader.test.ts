import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { computeOrpSplit } from './orp';
import { msPerWord } from './speedReaderService';
import type { RsvpToken } from '../types';

const token = (display: string): RsvpToken => ({ display, sectionHref: 'ch1.xhtml', globalIndex: 0 });

describe('computeOrpSplit', () => {
  it('returns null when there is nothing to anchor on', () => {
    expect(computeOrpSplit('')).toBeNull();
    expect(computeOrpSplit('ب')).toBeNull();
  });

  it('splits on letter clusters, keeping diacritics with their letter', () => {
    expect(computeOrpSplit('كتاب')).toEqual({ before: 'ك', pivot: 'ت', after: 'اب' });
    expect(computeOrpSplit('كِتَاب')).toEqual({ before: 'كِ', pivot: 'تَ', after: 'اب' });
  });
});

describe('msPerWord', () => {
  it('uses the plain WPM interval for short words', () => {
    expect(msPerWord(300, token('كتاب'))).toBe(200);
  });

  it('adds dwell time for long words and sentence ends', () => {
    expect(msPerWord(300, token('استخدامهم'))).toBeGreaterThan(200);
    expect(msPerWord(300, token('كتاب.'))).toBe(300);
  });

  it('clamps WPM to the supported range', () => {
    expect(msPerWord(10_000, token('كتاب'))).toBe(msPerWord(900, token('كتاب')));
  });
});
