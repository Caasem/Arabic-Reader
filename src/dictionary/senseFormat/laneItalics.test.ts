import { describe, expect, it } from 'vitest';
import { italicPieces, splitItalics, stripItalics } from './laneItalics';

const O = '';
const C = '';

describe('laneItalics', () => {
  it('strips markers', () => {
    expect(stripItalics(`a ${O}b${C} c`)).toBe('a b c');
  });
  it('splits text and spans, trimmed', () => {
    const { text, spans } = splitItalics(` حَسَدٌ ${O}Envy${C}; (S) ${O}he envied${C} `);
    expect(text).toBe('حَسَدٌ Envy; (S) he envied');
    expect(spans.map(([a, b]) => text.slice(a, b))).toEqual(['Envy', 'he envied']);
  });
  it('tolerates unbalanced markers', () => {
    expect(splitItalics(`x${C}y${O}z`)).toEqual({ text: 'xyz', spans: [] });
  });
  it('cuts pieces within a window', () => {
    const { text, spans } = splitItalics(`ab ${O}cd${C} ef`);
    expect(italicPieces(text, spans, 1, 6)).toEqual([
      { text: 'b ', italic: false },
      { text: 'cd', italic: true },
      { text: ' ', italic: false },
    ]);
  });
});
