import { describe, expect, it } from 'vitest';
import { pdfPageExtensions, registerPdfPageExtension } from './extensions';

describe('PDF page extensions', () => {
  it('registers, replaces by id and removes', () => {
    const before = pdfPageExtensions().length;
    const remove = registerPdfPageExtension({ id: 'test-ocr', wordAt: async () => null });
    expect(pdfPageExtensions()).toHaveLength(before + 1);
    registerPdfPageExtension({ id: 'test-ocr', wordAt: async () => null });
    expect(pdfPageExtensions()).toHaveLength(before + 1);
    remove();
    expect(pdfPageExtensions()).toHaveLength(before);
  });
});
