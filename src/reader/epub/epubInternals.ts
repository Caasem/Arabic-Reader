import type { Book, NavItem, Rendition } from 'epubjs';
import type { TocItem } from '../../types';

/**
 * Typed access to the parts of epub.js this app relies on that its own
 * TypeScript definitions don't declare (or declare incorrectly). Keeping the
 * casts here means the rest of the app never touches `any`.
 */

export interface SpineSection {
  href: string;
  index: number;
  /** Set by `load()`; cleared by `unload()`. */
  document?: Document;
  /** Resolves with the section's root *Element* (not a Document, despite
   * epub.js's JSDoc). */
  load(request: (path: string) => Promise<unknown>): Promise<Element>;
  unload(): void;
  cfiFromRange(range: Range): string;
}

export function getSpineSections(book: Book): SpineSection[] {
  return (book.spine as unknown as { spineItems: SpineSection[] }).spineItems ?? [];
}

/**
 * Loads each spine section in reading order, hands its parsed document to
 * `visit`, then unloads it so a whole-book pass never keeps every chapter's
 * DOM alive at once. A section that fails to load is skipped rather than
 * aborting the pass; errors thrown by `visit` still propagate.
 */
export async function forEachSpineSection(
  book: Book,
  visit: (section: SpineSection, doc: Document) => void | Promise<void>,
  options: { filter?: (section: SpineSection) => boolean; signal?: AbortSignal } = {}
): Promise<void> {
  for (const section of getSpineSections(book)) {
    if (options.signal?.aborted) return;
    if (options.filter && !options.filter(section)) continue;
    let root: Element | undefined;
    try {
      root = await section.load(book.load.bind(book) as (path: string) => Promise<unknown>);
    } catch {
      safeUnload(section);
      continue;
    }
    try {
      const doc = section.document ?? root?.ownerDocument;
      if (doc) await visit(section, doc);
    } finally {
      safeUnload(section);
    }
  }
}

function safeUnload(section: SpineSection): void {
  try {
    section.unload();
  } catch {
    // best-effort memory cleanup only
  }
}

/** The section's body element, falling back to the document root. */
export function sectionBody(doc: Document): Element | null {
  return doc.body ?? doc.getElementsByTagNameNS('*', 'body')[0] ?? doc.documentElement;
}

export function mapNavItems(items: NavItem[] | undefined): TocItem[] {
  return (items ?? []).map((item) => ({
    href: item.href,
    label: (item.label || '').trim(),
    subitems: item.subitems?.length ? mapNavItems(item.subitems) : undefined,
  }));
}

/** The TOC label for a section href, ignoring any #fragment on either side. */
export function findTocLabel(toc: TocItem[], href: string): string | undefined {
  const clean = href.split('#')[0];
  for (const item of toc) {
    if (item.href.split('#')[0] === clean) return item.label;
    if (item.subitems) {
      const found = findTocLabel(item.subitems, href);
      if (found) return found;
    }
  }
  return undefined;
}

/** Runs `task` through `rendition.q`, the queue epub.js serializes page turns on. */
export function enqueue(rendition: Rendition, task: () => void): void {
  void (rendition as unknown as { q: { enqueue(task: () => void): Promise<unknown> } }).q.enqueue(task);
}

export interface RenderedContents {
  document?: Document;
  window?: Window;
  cfiFromNode(node: Node): string;
}

/** Every rendered section's Contents (typed by epub.js as one, returned as an array). */
export function renderedContents(rendition: Rendition): RenderedContents[] {
  const contents = rendition.getContents() as unknown;
  if (Array.isArray(contents)) return contents as RenderedContents[];
  return contents ? [contents as RenderedContents] : [];
}

export interface BookLocations {
  total: number;
  generate(charsPerLocation: number): Promise<unknown>;
  load(serialized: string): unknown;
  save(): string;
  locationFromCfi(cfi: string): number | null;
}

export function bookLocations(book: Book): BookLocations {
  return (book as unknown as { locations: BookLocations }).locations;
}

/** The spine's declared page-progression-direction, if any. */
export function declaredDirection(book: Book): string | undefined {
  return (book as unknown as { packaging?: { metadata?: { direction?: string } } }).packaging?.metadata?.direction;
}
