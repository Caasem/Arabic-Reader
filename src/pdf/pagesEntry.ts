/**
 * What the app loads when a PDF opens as pages: the pages view plus the features that attach to it.
 * Each feature registers itself here, so the pages view never imports them. Add the next one below.
 */
import { registerPdfPageExtension } from './pages/extensions';
import { registerOcr } from './ocr/ocrExtension';

registerOcr(registerPdfPageExtension);

export { PdfPagesReader } from './pages/PdfPagesReader';
