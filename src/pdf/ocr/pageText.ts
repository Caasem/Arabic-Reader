import type { OpenedPdf } from '../pages/pdfjsLoader';

const MIN_TEXT_CHARS = 20;
const textCache = new WeakMap<object, Map<number, Promise<boolean>>>();

/** True when the page has a text layer worth using: such pages never need recognition. */
export function pageHasText(opened: OpenedPdf, number: number): Promise<boolean> {
  let pages = textCache.get(opened.doc);
  if (!pages) textCache.set(opened.doc, (pages = new Map()));
  let known = pages.get(number);
  if (!known) {
    known = opened.doc
      .getPage(number)
      .then((page) => page.getTextContent())
      .then((content) => content.items.reduce((n, item) => n + ('str' in item ? item.str.trim().length : 0), 0) >= MIN_TEXT_CHARS)
      .catch(() => false);
    pages.set(number, known);
  }
  return known;
}
