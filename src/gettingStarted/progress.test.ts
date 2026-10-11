import { describe, expect, it } from 'vitest';
import { ITEM_IDS, ITEMS } from './items';
import { applySeed, count, INITIAL, isDone, mark, normalise, seedFromCounts, startOver, visibility, type SeedCounts } from './progress';

const NONE: SeedCounts = { savedWords: 0, notes: 0, customCards: 0, deskItems: 0, drawings: 0, drawingsElsewhere: 0 };

describe('items', () => {
  it('are the seven, in the tour book order, with unique ids', () => {
    expect(ITEM_IDS).toEqual(['save-word', 'dictionary-search', 'write-note', 'make-flashcard', 'open-hashiya', 'draw-sketch', 'draw-other-source']);
    expect(new Set(ITEM_IDS).size).toBe(ITEMS.length);
  });
});

describe('mark / count', () => {
  it('ticks once, ignores unknown ids and returns the same state when nothing changes', () => {
    const a = mark(INITIAL, 'write-note');
    expect(isDone(a, 'write-note')).toBe(true);
    expect(mark(a, 'write-note')).toBe(a);
    expect(mark(a, 'nope')).toBe(a);
    expect(count(a)).toBe(1);
  });
});

describe('visibility', () => {
  const finished = ITEM_IDS.reduce(mark, INITIAL);
  it('shows the card, then a closing line once, then nothing', () => {
    expect(visibility(INITIAL)).toBe('card');
    expect(visibility(finished)).toBe('done');
    expect(visibility({ ...finished, celebrated: true })).toBe('hidden');
  });
  it('hides for good', () => {
    expect(visibility({ ...INITIAL, hidden: true })).toBe('hidden');
  });
});

describe('seeding', () => {
  it('ticks only what the counts prove', () => {
    expect(seedFromCounts(NONE)).toEqual([]);
    const ids = seedFromCounts({ ...NONE, savedWords: 5, deskItems: 2, drawings: 1 });
    expect(ids).toEqual(['save-word', 'open-hashiya', 'draw-sketch']);
  });
  it('applies once', () => {
    const s = applySeed(INITIAL, { ...NONE, notes: 3 });
    expect(isDone(s, 'write-note')).toBe(true);
    expect(s.seeded).toBe(true);
    expect(applySeed(s, { ...NONE, savedWords: 1 })).toBe(s);
  });
  it('start over clears progress without seeding again', () => {
    const s = startOver();
    expect(count(s)).toBe(0);
    expect(applySeed(s, { ...NONE, notes: 3 })).toBe(s);
  });
});

describe('normalise', () => {
  it('drops unknown ids and bad values', () => {
    expect(normalise({ done: ['write-note', 'zzz'], hidden: 'x' })).toMatchObject({ done: ['write-note'], hidden: false });
    expect(normalise(null)).toBe(INITIAL);
  });
});
