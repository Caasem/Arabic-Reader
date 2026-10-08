/**
 * pdf.js for the pages view: the document with page rendering and the text layer. Loaded only when
 * a PDF book is opened as pages (the worker is bundled by Vite like the import's; see
 * src/importFormats/pdfBrowser.ts).
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type * as Pdfjs from 'pdfjs-dist';

export type { PDFDocumentProxy, PDFPageProxy };
export type PdfjsModule = typeof Pdfjs;

export interface OpenedPdf {
  pdfjs: PdfjsModule;
  doc: PDFDocumentProxy;
  destroy(): Promise<void>;
}

export async function openPdfPages(data: Uint8Array): Promise<OpenedPdf> {
  const pdfjs = await import('pdfjs-dist');
  const port = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' }) as unknown as null;
  const worker = new pdfjs.PDFWorker({ port });
  try {
    const task = pdfjs.getDocument({ data, worker, disableFontFace: false, useSystemFonts: false, verbosity: 0 });
    const doc = await task.promise;
    return {
      pdfjs,
      doc,
      destroy: async () => {
        await task.destroy();
        worker.destroy();
      },
    };
  } catch (e) {
    worker.destroy();
    throw e;
  }
}
