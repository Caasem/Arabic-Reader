import { useEffect } from 'react';
import type { PdfPageContext } from '../pdf/pages/extensions';
import { pdfBoxMarks, publishOpenedPdf, usePdfDesk } from './pdfDesk';
import './pdfDesk.css';

/**
 * Desk items with a region on a PDF page (region capture's `pdf:<page>:…` places), drawn as boxes over the
 * page. Lives inside the page frame as a pages-view extension layer (src/pdf/pages/extensions.ts) and lets
 * taps through to the text layer. Their cards sit in the margin beside the pages (PdfMargin).
 */
export function PdfDeskLayer({ book, opened, page, width, height }: PdfPageContext) {
  const { items, hover } = usePdfDesk();
  // Scanned pages are read from the PDF itself when a drag snaps to words (pdfSnap.ts).
  useEffect(() => publishOpenedPdf(opened), [opened]);
  // Margin notes sit at a level (no height) and get no box; a region keeps its box when its card is in a pile.
  const marks = pdfBoxMarks(items, book.id, page);
  if (!marks.length) return null;
  return (
    <div className="sd-pdfdesk" aria-hidden="true">
      {marks.map((m) => (
        <div
          key={m.item.id}
          className={'sd-pdfbox' + (hover === m.item.id ? ' sd-pdfbox--on' : '') + (m.item.body?.trim() ? ' sd-pdfbox--noted' : '')}
          data-item={m.item.id}
          style={{ left: m.x * width, top: m.y * height, width: m.w * width, height: m.h * height }}
        />
      ))}
    </div>
  );
}
