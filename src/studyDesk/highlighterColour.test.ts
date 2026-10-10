import { describe, expect, it } from 'vitest';
import { highlighterFill, highlighterNight, highlighterOutlines } from './highlighterColour';

describe('highlighter colours', () => {
  it('writes the fill with the strength as alpha', () => {
    expect(highlighterFill('#f6ead0', 0.7)).toBe('rgb(246 234 208 / 0.7)');
    expect(highlighterFill('#6FA3C9', 1)).toBe('rgb(111 163 201 / 1)');
  });

  it('falls back to cream for a colour it cannot read', () => {
    expect(highlighterFill('nope', 0.5)).toBe('rgb(246 234 208 / 0.5)');
  });

  it('draws outlines in the colour\'s hue, darker when lit', () => {
    // Cream gives golds close to the Highlighter's earlier ones (#c9a85a resting, #7d5a14 lit).
    expect(highlighterOutlines('#f6ead0')).toEqual({ rest: 'hsl(41 68% 57%)', lit: 'hsl(41 68% 28%)' });
    expect(highlighterOutlines('#6fa3c9').lit).toMatch(/^hsl\(205 /);
  });

  it('keeps greys grey', () => {
    expect(highlighterOutlines('#cccccc')).toEqual({ rest: 'hsl(0 0% 57%)', lit: 'hsl(0 0% 28%)' });
  });

  it('turns the colour dark for night pages, keeping its hue', () => {
    const n = highlighterNight('#f6ead0', 0.7);
    expect(n.fill).toBe('hsl(41 68% 14% / 0.7)');
    // Lit is lighter than resting on dark paper.
    expect(n.lit).toBe('hsl(41 68% 70%)');
    expect(highlighterNight('#6fa3c9', 1).fill).toMatch(/^hsl\(205 \d+% 3\d% \/ 1\)$/);
  });
});
