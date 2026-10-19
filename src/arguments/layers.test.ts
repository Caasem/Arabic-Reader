import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, cardShown, layersOf } from './layers';

const note = (role: 'warrant' | 'backing' | 'rebuttal') => ({ argument: { role, for: 'x', typed: true } });

describe('cardShown', () => {
  it('never hides what is not an argument item', () => {
    expect(cardShown({}, { ...DEFAULT_LAYERS, cards: false })).toBe(true);
  });
  it('the cards layer hides every argument card, marks or sheet unaffected', () => {
    const off = { ...DEFAULT_LAYERS, cards: false };
    expect(cardShown({ argument: { role: 'claim', for: null } }, off)).toBe(false);
    expect(cardShown(note('warrant'), off)).toBe(false);
  });
  it('each kind of reader\'s note has its own switch; highlighted cards ignore them', () => {
    const l = { ...DEFAULT_LAYERS, warrants: false };
    expect(cardShown(note('warrant'), l)).toBe(false);
    expect(cardShown(note('backing'), l)).toBe(true);
    expect(cardShown({ argument: { role: 'warrant', for: 'x' } }, l)).toBe(true);
    expect(cardShown(note('rebuttal'), { ...DEFAULT_LAYERS, exceptions: false })).toBe(false);
    expect(cardShown(note('backing'), { ...DEFAULT_LAYERS, backings: false })).toBe(false);
  });
  it('reads the preferences', () => {
    expect(layersOf({ argumentsMarks: false, argumentsCards: true, argumentsSheet: 'full', argumentsWarrants: true, argumentsBackings: false, argumentsExceptions: true })).toEqual({
      marks: false, cards: true, sheet: 'full', warrants: true, backings: false, exceptions: true,
    });
  });
});
