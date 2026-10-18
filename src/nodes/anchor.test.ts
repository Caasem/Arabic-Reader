import { describe, expect, it } from 'vitest';
import { cleanToScreen, describeAnchor, PDF_REACH, pdfToScreen, sameAnchor, screenToClean, screenToPdf } from './anchor';

const frame = { left: 100, top: 400, width: 500 };

describe('PDF anchors', () => {
  it('turns page units into screen pixels at any zoom, and back', () => {
    expect(pdfToScreen({ x: 0, y: 0 }, frame)).toEqual({ x: 100, y: 400 });
    expect(pdfToScreen({ x: 1000, y: 200 }, frame)).toEqual({ x: 600, y: 500 });
    const wide = { left: 0, top: 0, width: 1000 };
    expect(pdfToScreen({ x: 123, y: 45 }, wide)).toEqual({ x: 123, y: 45 });
    expect(screenToPdf({ x: 600, y: 500 }, frame)).toEqual({ x: 1000, y: 200 });
  });

  it('allows the margins either side of the page, but not infinitely far', () => {
    expect(screenToPdf({ x: 50, y: 400 }, frame).x).toBe(-100);
    expect(screenToPdf({ x: 99999, y: 0 }, frame).x).toBe(PDF_REACH);
    expect(screenToPdf({ x: -99999, y: 0 }, frame).x).toBe(-PDF_REACH);
  });
});

describe('clean-text anchors', () => {
  it('measures from the word corner in em, in screen directions', () => {
    const corner = { x: 300, y: 120 };
    expect(cleanToScreen({ dx: -2, dy: 1.5 }, corner, 20)).toEqual({ x: 260, y: 150 });
    expect(screenToClean({ x: 260, y: 150 }, corner, 20)).toEqual({ dx: -2, dy: 1.5 });
  });

  it('keeps the same place when the text is bigger or moved: the offset scales with the font', () => {
    const a = { dx: 3, dy: 0 };
    expect(cleanToScreen(a, { x: 0, y: 0 }, 40).x).toBe(2 * cleanToScreen(a, { x: 0, y: 0 }, 20).x);
  });
});

describe('describing', () => {
  it('names where a node is and compares anchors', () => {
    expect(describeAnchor({ kind: 'pdf', page: 7, x: 0, y: 0 })).toBe('Page 7');
    expect(describeAnchor({ kind: 'clean', chapter: 0, offset: 5, dx: 0, dy: 0 })).toBe('Chapter 1');
    expect(describeAnchor(undefined)).toBe('');
    expect(sameAnchor({ kind: 'pdf', page: 1, x: 2, y: 3 }, { kind: 'pdf', page: 1, x: 2, y: 3 })).toBe(true);
    expect(sameAnchor({ kind: 'pdf', page: 1, x: 2, y: 3 }, { kind: 'pdf', page: 2, x: 2, y: 3 })).toBe(false);
  });
});
