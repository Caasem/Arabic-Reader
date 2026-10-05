import { describe, expect, it } from 'vitest';
import { senseText } from './senseText';

describe('senseText', () => {
  it('is the gloss when there is one', () => {
    expect(senseText({ gloss: 'дом', examples: [{ ar: 'بيت', gloss: 'x' }] })).toBe('дом');
  });
  it('falls back to the examples\' glosses for an examples-only sense', () => {
    expect(senseText({ gloss: '', examples: [{ ar: 'أ', gloss: 'один' }, { ar: 'ب', gloss: 'два' }] })).toBe('один; два');
  });
  it('is empty for nothing', () => {
    expect(senseText({ gloss: '' })).toBe('');
  });
});
