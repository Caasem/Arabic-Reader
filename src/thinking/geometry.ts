import { parseCleanLocation } from '../readerCore/location';
import { parsePdfLocation, rectsOfCleanLocation } from '../studyDesk/pageGeometry';
import type { DeskItem } from '../studyDesk/types';

/**
 * Where a passage is on screen, read from the readers' DOM the way the study desk does (src/studyDesk/pageGeometry.ts):
 * PDF pages are `.pdfp-page[data-page]`, the quiet reader's chapters `.qr-chapter[data-chapter]`.
 */

export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The passage's box on screen, or null when its page or chapter is not showing. */
export function passageBox(item: DeskItem): ScreenBox | null {
  const loc = item.source?.location;
  const pdf = parsePdfLocation(loc);
  if (pdf) {
    const frame = document.querySelector<HTMLElement>(`.pdfp-page[data-page="${pdf.page}"]`);
    if (!frame) return null;
    const f = frame.getBoundingClientRect();
    return { left: f.left + pdf.x * f.width, top: f.top + pdf.y * f.height, right: f.left + (pdf.x + pdf.w) * f.width, bottom: f.top + (pdf.y + pdf.h) * f.height };
  }
  if (!parseCleanLocation(loc)) return null;
  const rects = cleanRects(loc!);
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
}

/** The line boxes of a quiet reader passage, without the empty ones. */
export function cleanRects(location: string): DOMRect[] {
  return rectsOfCleanLocation(location).filter((r) => r.width > 0.5 && r.height > 0.5);
}

/** The Ḥāshiya strip's place on screen: beside PDF pages, the strip the study desk keeps; in the quiet reader, the right margin. */
export function stripBox(): ScreenBox {
  const pdfBody = document.querySelector<HTMLElement>('.pdfp .pdfp__body')?.getBoundingClientRect();
  if (pdfBody && document.body.classList.contains('sd-pdf-margin')) return { left: pdfBody.right - 300, top: pdfBody.top, right: pdfBody.right, bottom: pdfBody.bottom };
  const column = document.querySelector<HTMLElement>('.qr-column')?.getBoundingClientRect();
  const stage = document.querySelector<HTMLElement>('.qr-stage')?.getBoundingClientRect();
  if (column && stage && stage.right - column.right >= 240) return { left: column.right + 12, top: stage.top, right: stage.right - 8, bottom: stage.bottom };
  // No room beside the text: a panel at the right edge of the window.
  const w = Math.min(340, window.innerWidth - 24);
  return { left: window.innerWidth - w - 12, top: 64, right: window.innerWidth - 12, bottom: window.innerHeight - 12 };
}
