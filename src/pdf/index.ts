/**
 * PDF support, in one module. A PDF is added as its pages: the PDF itself is kept and read as it is,
 * with no attempt to read its text (`openPdfPages`). With Settings → PDF → Convert PDFs to text when adding
 * (`pdfConvertToText`), its text is also checked and reflowed into an EPUB for the ordinary readers
 * (`convertPdf`). Anything PDF-specific lives here; the rest of the app only has the touch points below.
 *
 *   src/pdf/
 *     pdfjs.ts        the one pdf.js loader (lazy; bundled worker; works offline)
 *     arabic.ts       Arabic text normalisation shared by import and pages
 *     import/         PDF -> reflowed EPUB: convert.ts (flow and errors), reflow.ts (lines,
 *                     paragraphs, headings, verse), quality.ts (is the text usable?), browser.ts
 *                     (pdf.js + AraMorph for the real app)
 *     pages/          Original pages view: PdfPagesReader, view switch and positions (pdfView.ts),
 *                     tapped words (wordAtPoint.ts), the pdf.js document for pages (pdfjsLoader.ts),
 *                     and extensions.ts, the registry later features attach to (page overlays such
 *                     as highlights, a second source of tapped words such as OCR, header controls)
 *     ocr/            tap a word on a scanned page: crop, pluggable text-recognition engines (the OS's,
 *                     the app's, addresses the reader adds), settings; registered by pagesEntry.ts
 *     pagesEntry.ts   what the app loads for the pages view: the view plus the features that attach to it
 *     testPdf.ts      a tiny PDF writer for tests (no PDF is committed)
 *
 * Touch points outside this folder: `src/importFormats/index.ts` (the `.pdf` case calls
 * `import/convert` and `import/browser`), `libraryService.importBook` (keeps the original PDF),
 * `ReaderSwitch` and `QuietReader`/`DisplaySheet` (pages vs text), `BookMeta.pdf`, the BlobStore
 * namespace `pdf` (src/storage/registry.ts) and `getPdfOriginal`/`savePdfOriginal` in
 * src/persistence/booksRepo.ts. To remove: delete this folder, drop those hooks, and let `.pdf`
 * be refused again. Third-party code: pdfjs-dist (Apache-2.0; see NOTICE.md and the Licence section
 * of docs/features/formats-pdf.md).
 *
 * Adding a feature (OCR, highlights, search hits, pinch zoom): put it in its own folder
 * (`src/pdf/ocr/`, `src/pdf/highlights/`) and register a `PdfPageExtension` from its index; the
 * pages view needs no edit. Import-side features (new quality checks, column detection) go in
 * `import/` and are called from `convert.ts`.
 */
export { PdfPagesReader } from './pages/PdfPagesReader';
export { usePdfView, loadPdfView, type PdfView } from './pages/pdfView';
export { registerPdfPageExtension, pdfPageExtensions, type PdfPageExtension, type PdfPageContext, type PdfWordTap } from './pages/extensions';
export { convertPdf, PdfImportError, PDF_MESSAGES, MAX_PDF_BYTES, type ConvertedPdf, type PdfDeps, type PdfReflow } from './import/convert';
