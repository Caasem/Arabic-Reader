/**
 * The one place pdf.js is loaded. Every PDF feature (import, pages view, and whatever attaches
 * later) opens documents through here, so the library stays out of the main bundle and its worker
 * is set up the same way everywhere: Vite bundles the worker file (precached for offline use,
 * packaged in Electron and Capacitor), nothing is fetched from a CDN.
 */
import type * as Pdfjs from 'pdfjs-dist';

export type PdfjsModule = typeof Pdfjs;

export interface PdfjsRuntime {
  pdfjs: PdfjsModule;
  /** A fresh pdf.js worker; destroy it with the document it served. */
  createWorker(): InstanceType<PdfjsModule['PDFWorker']>;
}

let loading: Promise<PdfjsRuntime> | null = null;

export function loadPdfjs(): Promise<PdfjsRuntime> {
  loading ??= import('pdfjs-dist').then((pdfjs) => ({
    pdfjs,
    createWorker() {
      // pdf.js types `port` as null; it takes a Worker.
      const port = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' }) as unknown as null;
      return new pdfjs.PDFWorker({ port });
    },
  }));
  return loading;
}
