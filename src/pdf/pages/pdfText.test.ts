import { describe, expect, it } from 'vitest';
import { foldPageText, layerText } from './pdfText';

describe('layerText', () => {
  it('joins the runs as the text layer draws them, a line break where pdf.js puts a <br>', () => {
    const items = [{ str: 'ذهب', hasEOL: false }, { str: ' ' }, { str: 'الولد', hasEOL: true }, { str: 'إلى' }, {}];
    expect(layerText(items)).toBe('ذهب الولد\nإلى');
  });
});

describe('foldPageText', () => {
  it('keeps plain text as it is, with each letter mapped to itself', () => {
    const { text, map } = foldPageText('كتاب');
    expect(text).toBe('كتاب');
    expect(map).toEqual([0, 1, 2, 3, 4]);
  });

  it('drops tatweel and maps the letters after it back to the layer', () => {
    const { text, map } = foldPageText('كـتاب');
    expect(text).toBe('كتاب');
    expect(map).toEqual([0, 2, 3, 4, 5]);
  });

  it('opens a ligature into its letters, both pointing at the ligature', () => {
    const { text, map } = foldPageText('ﻻ ب');
    expect(text).toBe('لا ب');
    expect(map).toEqual([0, 0, 1, 2, 3]);
  });
});
