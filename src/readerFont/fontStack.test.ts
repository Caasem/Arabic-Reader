import { describe, expect, it } from 'vitest';
import { buildFontFaceCss, cleanFontName, isUploadedStack, primaryFamily, stackFor, uploadedCssFamily } from './fontStack';

describe('font stacks', () => {
  it('falls back to the built-in font after the pick', () => {
    expect(stackFor('Amiri')).toBe("'Amiri', 'Noto Naskh Arabic', serif");
    expect(primaryFamily(stackFor('Amiri'))).toBe('Amiri');
    expect(primaryFamily("'Noto Naskh Arabic', 'Amiri', serif")).toBe('Noto Naskh Arabic');
  });

  it('marks uploaded fonts so they never clash with installed ones', () => {
    const family = uploadedCssFamily('Lotus Linotype');
    expect(family).toBe('Lotus Linotype (uploaded)');
    expect(isUploadedStack(stackFor(family))).toBe(true);
    expect(isUploadedStack(stackFor('Lotus Linotype'))).toBe(false);
  });

  it('strips characters that could break out of a quoted CSS name', () => {
    expect(cleanFontName("Evil'; } body { color: red")).toBe('Evil body color: red');
    expect(cleanFontName('  \u0000 ')).toBe('Uploaded font');
  });

  it('writes one @font-face per file with its own weight and style', () => {
    const css = buildFontFaceCss([
      { cssFamily: 'Lotus Linotype (uploaded)', url: 'blob:x/1', weight: 300, italic: false },
      { cssFamily: 'Lotus Linotype (uploaded)', url: 'blob:x/2', weight: 700, italic: true },
    ]);
    expect(css.split('\n')).toEqual([
      "@font-face { font-family: 'Lotus Linotype (uploaded)'; src: url('blob:x/1'); font-weight: 300; font-style: normal; font-display: swap; }",
      "@font-face { font-family: 'Lotus Linotype (uploaded)'; src: url('blob:x/2'); font-weight: 700; font-style: italic; font-display: swap; }",
    ]);
  });
});
