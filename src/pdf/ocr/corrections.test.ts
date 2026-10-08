// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { positionKey, recallCorrection, rememberCorrection } from './corrections';

const box = { x: 100, y: 200, w: 40, h: 20 };
const ocr = { read: 'المدرسه', page: 3, box };

describe('remembered corrections', () => {
  beforeEach(() => localStorage.clear());

  it('finds a fix by where the word is, tolerating a small shift between reads', () => {
    rememberCorrection('b1', ocr, 'المدرسة');
    expect(recallCorrection('b1', 3, box, 'anything', { readIsUnknown: false })).toBe('المدرسة');
    expect(recallCorrection('b1', 3, { ...box, x: 101, y: 201 }, 'anything', { readIsUnknown: false })).toBe('المدرسة');
    expect(recallCorrection('b1', 4, box, 'anything', { readIsUnknown: false })).toBeUndefined();
    expect(positionKey(3, box)).toBe(positionKey(3, { ...box, x: 101 }));
  });

  it('finds a fix by the misread text, only when the read is not a word', () => {
    rememberCorrection('b1', ocr, 'المدرسة');
    const elsewhere = { x: 400, y: 600, w: 40, h: 20 };
    expect(recallCorrection('b1', 9, elsewhere, 'المدرسه', { readIsUnknown: true })).toBe('المدرسة');
    expect(recallCorrection('b1', 9, elsewhere, 'المدرسه', { readIsUnknown: false })).toBeUndefined();
  });

  it('keeps books apart and forgets a fix put back to what was read', () => {
    rememberCorrection('b1', ocr, 'المدرسة');
    expect(recallCorrection('b2', 3, box, 'المدرسه', { readIsUnknown: true })).toBeUndefined();
    rememberCorrection('b1', ocr, 'المدرسه');
    expect(recallCorrection('b1', 3, box, 'المدرسه', { readIsUnknown: true })).toBeUndefined();
  });
});
