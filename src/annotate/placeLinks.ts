import { goToBookLocation } from '../readerChords/navigation';
import { isCleanLocation } from '../quietReader/location';
import { formatPdfLocation, goToPdfPlace, parsePdfLocation, rectsOfCleanLocation } from '../studyDesk/pageGeometry';

/**
 * Sketch nodes that point at the page (quotes, picture regions): where their words are on screen, going there,
 * and a short flash so the eye finds them. Works from the readers' DOM, as the study desk does.
 */

/** A sheet's own place ("pdf:3") as a box place: the top of that page. */
function pdfBox(location: string): string {
  const page = /^pdf:(\d+)$/.exec(location);
  return page ? formatPdfLocation(Number(page[1]), 0, 0, 1, 0) : location;
}

/** The place's boxes on screen now (none when it is not in view). */
export function placeRects(location: string): DOMRect[] {
  if (isCleanLocation(location)) return rectsOfCleanLocation(location).filter((r) => r.width + r.height > 0);
  const at = parsePdfLocation(pdfBox(location));
  const frame = at && document.querySelector<HTMLElement>(`.pdfp-page[data-page="${at.page}"]`);
  if (!at || !frame) return [];
  const f = frame.getBoundingClientRect();
  // A page-only place ("pdf:3") is the top of the page.
  const h = at.h > 0 ? at.h : 0.04;
  return [new DOMRect(f.left + at.x * f.width, f.top + at.y * f.height, (at.w > 0 ? at.w : 1) * f.width, h * f.height)];
}

/** Briefly rings the place's words. */
export function flashPlace(location: string): void {
  const rects = placeRects(location);
  for (const r of rects) {
    const el = document.createElement('div');
    el.className = 'sk-flash';
    Object.assign(el.style, { left: `${r.left - 3}px`, top: `${r.top - 2}px`, width: `${r.width + 6}px`, height: `${r.height + 4}px` });
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1700);
  }
}

/** Goes to the place in the open reader and flashes it once it is on screen. False when no reader can go there. */
export function goToPlace(location: string): boolean {
  const ok = isCleanLocation(location) ? goToBookLocation(location) : goToPdfPlace(pdfBox(location));
  if (ok) window.setTimeout(() => flashPlace(location), 450);
  return ok;
}
