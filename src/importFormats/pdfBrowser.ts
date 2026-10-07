/**
 * pdf.js and the dictionary for the real app. Loaded only when a PDF is added, so neither
 * pdfjs-dist nor its worker is part of the main bundle. Vite turns the worker URL below into a
 * bundled file (precached by the service worker, packaged by Electron and Capacitor with the rest
 * of the build), so nothing is fetched from a CDN and it works offline.
 */
import type { PdfDeps, PdfDocument } from './pdf';

export async function loadPdfDeps(): Promise<PdfDeps> {
  const [pdfjs, { aramorphProvider }] = await Promise.all([
    import('pdfjs-dist'),
    import('../dictionary/providers/aramorph/AramorphDictionaryProvider'),
  ]);
  return {
    async openDocument(data: Uint8Array): Promise<PdfDocument> {
      // pdf.js types `port` as null; it takes a Worker.
      const port = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' }) as unknown as null;
      const worker = new pdfjs.PDFWorker({ port });
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
