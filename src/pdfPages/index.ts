/**
 * Original pages for books added from a PDF: the PDF's own pages (fit to width, zoom, page
 * counter), with word taps through its text layer into the usual dictionary popup. Books whose
 * text could not be reflowed (scanned, or a broken text layer) open here only.
 *
 * Touch points outside this folder: `ReaderSwitch` (chooses pages or text), `QuietReader` and its
 * `DisplaySheet` (the "Original pages" button), `BookMeta.pdf`, the BlobStore namespace `pdf`
 * (src/storage/registry.ts), and the original-PDF methods in src/persistence/booksRepo.ts. To
 * remove: delete this folder, drop those hooks, and let PDFs be converted to reflowed text only.
 * Third-party code: pdfjs-dist (Apache-2.0).
 */
export { PdfPagesReader } from './PdfPagesReader';
export { usePdfView, loadPdfView, type PdfView } from './pdfView';
