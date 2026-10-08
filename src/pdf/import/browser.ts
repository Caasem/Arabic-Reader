/**
 * pdf.js and the dictionary for the real app. Loaded only when a PDF is added, so neither
 * pdfjs-dist nor its worker is part of the main bundle (see ../pdfjs.ts).
 */
import { loadPdfjs } from '../pdfjs';
import type { PdfDeps, PdfDocument } from './convert';

export async function loadPdfDeps(): Promise<PdfDeps> {
  const [{ pdfjs, createWorker }, { aramorphProvider }] = await Promise.all([
    loadPdfjs(),
    import('../../dictionary/providers/aramorph/AramorphDictionaryProvider'),
  ]);
  return {
    async openDocument(data: Uint8Array): Promise<PdfDocument> {
      const worker = createWorker();
      try {
        const task = pdfjs.getDocument({
          data,
          worker,
          // Text only: no web fonts, no system-font lookups.
          disableFontFace: true,
          useSystemFonts: false,
          verbosity: 0,
        });
        const doc = await task.promise;
        return {
          numPages: doc.numPages,
          getPage: (n) => doc.getPage(n),
          getMetadata: () => doc.getMetadata(),
          destroy: async () => {
            await task.destroy();
            worker.destroy();
          },
        };
      } catch (e) {
        worker.destroy();
        throw e;
      }
    },
    async analyse(words) {
      const analyses = await aramorphProvider.analyzeMany(words);
      return new Set(words.filter((w) => (analyses.get(w)?.length ?? 0) > 0));
    },
  };
}
