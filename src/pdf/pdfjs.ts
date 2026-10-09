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

/**
 * Where pdf.js finds its fonts, character maps, ICC profiles and WebAssembly decoders: the
 * `pdfjs/` folder that comes with the app (vite.config.ts, pdfjsDataPlugin). Without these a
 * scanned book (JBIG2 / JPEG 2000 images) draws every page blank. Pass the result to getDocument.
 */
export function pdfDataUrls(): { standardFontDataUrl: string; cMapUrl: string; cMapPacked: boolean; iccUrl: string; wasmUrl: string } {
  const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, document.baseURI).href;
  return {
    standardFontDataUrl: `${base}standard_fonts/`,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    iccUrl: `${base}iccs/`,
    wasmUrl: `${base}wasm/`,
  };
}
