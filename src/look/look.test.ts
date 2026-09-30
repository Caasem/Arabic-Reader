import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, isHexColor, mix, readableOn, rgbToHex } from './color';
import { buildLookCss } from './buildLookCss';
import { LOOK_PALETTES, resolveLookColors } from './palettes';
import { pickContinueBook } from './continueBook';
import type { BookMeta } from '../types';

describe('color helpers', () => {
  it('round-trips hex through rgb', () => {
    expect(rgbToHex(hexToRgb('#9c7a4f'))).toBe('#9c7a4f');
  });

  it('mixes by weight', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#102030', '#ffffff', 1)).toBe('#102030');
  });

  it('accepts only six-digit hex', () => {
    expect(isHexColor('#aabbcc')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });

  it('measures contrast on the WCAG scale', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('picks readable text for a filled colour', () => {
    expect(readableOn('#ffffff')).toBe('#1c1b19');
    expect(readableOn('#1f3f8f')).toBe('#ffffff');
  });
});

describe('palettes', () => {
  it('has readable text on the page background in every preset', () => {
    for (const palette of LOOK_PALETTES) {
      expect(contrastRatio(palette.colors.ink, palette.colors.bg)).toBeGreaterThan(7);
    }
  });

  it('lays custom picks over a preset and falls back for an unknown id', () => {
    expect(resolveLookColors('jewel', { accent: '#ff0000' }).accent).toBe('#ff0000');
    expect(resolveLookColors('jewel', { accent: '#ff0000' }).secondary).toBe('#0f766e');
    expect(resolveLookColors('nope', {}).accent).toBe(LOOK_PALETTES[0].colors.accent);
  });
});

describe('buildLookCss', () => {
  it('writes a block per theme and only remaps surfaces in light', () => {
    const css = buildLookCss(LOOK_PALETTES[0].colors);
    expect(css).toContain("html[data-look][data-theme='light']");
    expect(css).toContain("html[data-look][data-theme='dark']");
    expect(css).toContain("html[data-look][data-theme='sepia']");
    const dark = css.split('\n')[1];
    expect(dark).not.toContain('--bg:');
    expect(dark).toContain('--accent:');
  });

  it("keeps the original app's accent for the default palette", () => {
    const light = buildLookCss(LOOK_PALETTES[0].colors).split('\n')[0];
    expect(light).toContain('--accent:#9c7a4f');
    expect(light).toContain('--bg:#faf7f2');
  });
});

describe('pickContinueBook', () => {
  const book = (id: string) => ({ id, title: id }) as BookMeta;
  const books = [book('a'), book('b'), book('c'), book('d')];

  it('picks the most recently read unfinished book', () => {
    const info = {
      a: { percent: 0.4, lastReadAt: 10 },
      b: { percent: 0.2, lastReadAt: 30 },
      c: { percent: 0.99, lastReadAt: 50 },
      d: { percent: 0 },
    };
    expect(pickContinueBook(books, info)?.id).toBe('b');
  });

  it('returns nothing when no book is in progress', () => {
    expect(pickContinueBook(books, { c: { percent: 1, lastReadAt: 5 }, d: { percent: 0 } })).toBeUndefined();
    expect(pickContinueBook([], {})).toBeUndefined();
  });
});
