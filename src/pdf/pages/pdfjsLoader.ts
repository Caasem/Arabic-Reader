/**
 * pdf.js for the pages view: the document with page rendering and the text layer. Loaded only when
 * a PDF book is opened as pages (see ../pdfjs.ts).
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { loadPdfjs, type PdfjsModule } from '../pdfjs';

export type { PDFDocumentProxy, PDFPageProxy };
export type { PdfjsModule };

export interface OpenedPdf {
  pdfjs: PdfjsModule;
  doc: PDFDocumentProxy;
  destroy(): Promise<void>;
}

export async function openPdfPages(data: Uint8Array): Promise<OpenedPdf> {
  const { pdfjs, createWorker } = await loadPdfjs();
  const worker = createWorker();
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
