import ePub, { type Book, type Rendition, type NavItem } from 'epubjs';
import type { HighlightColor, ReaderPreferences, ReadingFlow, TocItem } from '../../types';
import { resolveFootnote, type FootnoteContent } from '../footnotes/resolveFootnote';

/** epub.js's own flow keyword for our simpler paginated/scrolled toggle. */
function epubFlow(flow: ReadingFlow): 'paginated' | 'scrolled-doc' {
  return flow === 'scrolled' ? 'scrolled-doc' : 'paginated';
}

export interface RelocatedLocation {
  cfi: string;
  percent: number;
  chapterHref?: string;
  chapterLabel?: string;
}

export interface SelectionInfo {
  cfiRange: string;
  text: string;
  x: number;
  y: number;
}

const HIGHLIGHT_FILL: Record<HighlightColor, string> = {
  yellow: '#e7c65b',
  green: '#8bb872',
  blue: '#6fa3c9',
  purple: '#9c85c9',
  red: '#c97a6d',
};

/**
 * Thin wrapper around epub.js. This is the only file in the app that talks
 * to the epub.js API directly — the rest of the reader deals in TocItem /
 * ReadingPosition / plain DOM `Document`s handed to it via callbacks, so a
 * future native client could swap this out for a different rendering engine
 * without touching wordInteraction, dictionary, or vocabulary code.
 */
export class EpubService {
  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private toc: TocItem[] = [];
  private currentSectionHref?: string;
  private renderedAnnotationCfis = new Set<string>();
  // Set by destroy(). open() is a long async chain (arrayBuffer -> ePub ->
  // book.ready -> renderTo -> navigation -> display) and React 18 StrictMode
  // deliberately mounts effects twice in dev (mount, cleanup, mount) to catch
  // exactly this kind of bug: without this guard, the first (React-discarded)
  // instance keeps running its open() after destroy() has already been
  // called on it, ending up attaching a zombie epub.js rendition to the same
  // DOM container the second, real instance is also rendering into — which
  // is why words never got wrapped / clicks did nothing under `npm run dev`
  // (this doesn't affect a production build/preview, where effects only run
  // once).
  private destroyed = false;
  private currentFlow: ReadingFlow = 'paginated';

  async open(file: Blob, container: HTMLElement, startCfi: string | undefined, prefs: ReaderPreferences): Promise<void> {
    const buf = await file.arrayBuffer();
    if (this.destroyed) return;

    const book = ePub(buf);
    await book.ready;
    if (this.destroyed) {
      book.destroy();
      return;
    }
    this.book = book;

    this.currentFlow = prefs.readingFlow;
    const rendition = book.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: epubFlow(prefs.readingFlow),
      spread: 'auto',
      // RTL is set per-book by epub.js from the OPF <spine page-progression-direction>
      // but Arabic books frequently omit it, so we force it here.
      script: undefined,
    });
    if (this.destroyed) {
      rendition.destroy();
      this.book = null;
      return;
    }
    this.rendition = rendition;

    this.applyPreferences(prefs);

    const nav = await book.loaded.navigation;
    if (this.destroyed) return;
    this.toc = (nav.toc || []).map((item: NavItem) => this.mapNavItem(item));

    await rendition.display(startCfi || undefined);
  }

  /** Reading controls (font/theme/width/flow — Settings panel). Safe to call
   * at any point after `open()`, including while a section is on-screen. */
  applyPreferences(prefs: ReaderPreferences): void {
    if (!this.rendition) return;
    // Force RTL page progression + the chosen font/line-height for Arabic
    // content regardless of what (if anything) the source EPUB declares.
    this.rendition.themes.default({
      html: { direction: 'rtl' },
      body: {
        direction: 'rtl',
        'font-family': `${prefs.fontFamily} !important`,
        'line-height': `${prefs.lineHeight} !important`,
      },
      p: { direction: 'rtl', 'text-align': 'right' },
    });
    this.rendition.themes.fontSize(`${prefs.fontSizePct}%`);

    // rendition.flow() re-clears and re-displays the current page, so only
    // call it when the setting actually changed — calling it on every
    // preference tweak (e.g. dragging the font-size slider) would otherwise
    // reset scroll/page position on every tick.
    if (prefs.readingFlow !== this.currentFlow) {
      this.currentFlow = prefs.readingFlow;
      this.rendition.flow(epubFlow(prefs.readingFlow));
    }
  }

  private mapNavItem(item: NavItem): TocItem {
    return {
      href: item.href,
      label: (item.label || '').trim(),
      subitems: item.subitems?.length ? item.subitems.map((s) => this.mapNavItem(s)) : undefined,
    };
  }

  getToc(): TocItem[] {
    return this.toc;
  }

  async getCoverUrl(): Promise<string | undefined> {
    if (!this.book) return undefined;
    try {
      const url = await this.book.coverUrl();
      return url || undefined;
    } catch {
      return undefined;
    }
  }

  onRelocated(cb: (loc: RelocatedLocation) => void): void {
    this.rendition?.on('relocated', (location: any) => {
      const href = location?.start?.href as string | undefined;
      const chapter = href ? this.findTocLabel(href) : undefined;
      this.currentSectionHref = href;
      cb({
        cfi: location?.start?.cfi,
        percent: typeof location?.start?.percentage === 'number' ? location.start.percentage : 0,
        chapterHref: href,
        chapterLabel: chapter,
      });
    });
  }

  /** Fires once per rendered section with the section's Document, so the
   * wordInteraction layer can walk it and wrap Arabic tokens. */
  onRendered(cb: (doc: Document, sectionHref: string) => void): void {
    this.rendition?.on('rendered', (section: any, view: any) => {
      const doc: Document | undefined = view?.document || view?.iframe?.contentDocument;
      this.currentSectionHref = section?.href ?? this.currentSectionHref;
      if (doc) cb(doc, section?.href);
    });
  }

  /** Fires when the reader selects text inside the rendered page — the
   * built-in epub.js 'selected' event already resolves the selection to a
   * stable CFI range, so highlighting never has to touch raw DOM Ranges. */
  onSelected(cb: (info: SelectionInfo) => void): void {
    this.rendition?.on('selected', (cfiRange: string, contents: any) => {
      const win: Window | undefined = contents?.window;
      const sel = win?.getSelection?.();
      const text = sel?.toString().trim() ?? '';
      if (!text) return;

      let x = 0;
      let y = 0;
      try {
        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const iframeEl = win?.frameElement as HTMLIFrameElement | undefined;
        const iframeRect = iframeEl?.getBoundingClientRect();
        x = (iframeRect?.left ?? 0) + rect.left + rect.width / 2;
        y = (iframeRect?.top ?? 0) + rect.top;
      } catch {
        // best-effort positioning only
      }

      cb({ cfiRange, text, x, y });
    });
  }

  /** Renders a persisted (or brand-new) highlight into the page. Safe to
   * call before the relevant section has rendered — epub.js re-applies
   * registered annotations automatically as sections come into view. */
  renderHighlight(cfiRange: string, color: HighlightColor, onClick?: () => void): void {
    if (this.renderedAnnotationCfis.has(cfiRange)) return;
    this.renderedAnnotationCfis.add(cfiRange);
    this.rendition?.annotations.highlight(
      cfiRange,
      {},
      () => onClick?.(),
      'ar-highlight',
      { fill: HIGHLIGHT_FILL[color], 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' }
    );
  }

  removeHighlight(cfiRange: string): void {
    this.renderedAnnotationCfis.delete(cfiRange);
    this.rendition?.annotations.remove(cfiRange, 'highlight');
  }

  clearSelection(): void {
    // epub.js types this as a single Contents, but at runtime it returns an
    // array (one per rendered view) — hence the cast.
    const contents = (this.rendition?.getContents() as unknown as any[]) ?? [];
    contents.forEach((c: any) => c.window?.getSelection()?.removeAllRanges());
  }

  getCurrentSectionHref(): string | undefined {
    return this.currentSectionHref;
  }

  /** The underlying epub.js Book — deliberately narrow access (only what
   * `bookVocabIndex.ts` needs: walking every spine section's text to build
   * a book-wide word index), rather than exposing the whole epub.js API
   * outside this service. */
  getBookHandle(): Book | null {
    return this.book;
  }

  /** Jumps to a section (by href) and, once it's rendered, scrolls the
   * `indexInSection`-th `.ar-word[data-word=...]` element for `word` into
   * view with a brief highlight flash — used by the Vocabulary Levels
   * panel to jump to a specific occurrence. Resolves once the scroll has
   * happened (or been given up on, if the word never rendered — e.g. the
   * section takes unusually long, or wrapping produced a different token
   * than the indexer counted). */
  async goToWordOccurrence(sectionHref: string, word: string, indexInSection: number): Promise<boolean> {
    if (!this.rendition) return false;
    await this.rendition.display(sectionHref);

    // The 'rendered' event (which triggers word-wrapping) fires asynchronously
    // after display() resolves; poll briefly for the wrapped span to appear
    // rather than assuming a fixed delay is enough.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const contentsList = (this.rendition.getContents() as unknown as any[]) ?? [];
      for (const contents of contentsList) {
        const doc: Document | undefined = contents?.document;
        if (!doc) continue;
        // Filtered in JS rather than built into a CSS attribute selector, so
        // there's no need to worry about escaping quote/backslash characters
        // that could theoretically appear in `word`.
        const matches = Array.from(doc.querySelectorAll<HTMLElement>('.ar-word')).filter(
          (el) => el.dataset.word === word
        );
        const el = matches[indexInSection];
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el.classList.add('ar-word--jump-flash');
          setTimeout(() => el.classList.remove('ar-word--jump-flash'), 1400);
          return true;
        }
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return false;
  }

  /** Resolves a footnote/endnote link's actual content — see resolveFootnote.ts. */
  async loadFootnote(anchor: HTMLAnchorElement, doc: Document, sectionHref: string): Promise<FootnoteContent | null> {
    if (!this.book) return null;
    return resolveFootnote(anchor, doc, sectionHref, this.book);
  }

  getChapterLabelFor(href?: string): string | undefined {
    return href ? this.findTocLabel(href) : undefined;
  }

  private findTocLabel(href: string): string | undefined {
    const clean = href.split('#')[0];
    const walk = (items: TocItem[]): string | undefined => {
      for (const item of items) {
        if (item.href.split('#')[0] === clean) return item.label;
        if (item.subitems) {
          const found = walk(item.subitems);
          if (found) return found;
        }
      }
      return undefined;
    };
    return walk(this.toc);
  }

  next(): void {
    this.rendition?.next();
  }

  prev(): void {
    this.rendition?.prev();
  }

  goTo(href: string): void {
    this.rendition?.display(href);
  }

  /** Fallback for a footnote link that couldn't be resolved inline — jumps
   * to it the normal way. `href` is the raw, unresolved attribute value
   * (e.g. "notes.xhtml#fn3", relative to the section it was clicked in),
   * since footnote clicks are intercepted before epub.js gets a chance to
   * do its own resolution (see resolveFootnote.ts). */
  goToFootnote(href: string, sectionHref: string): void {
    const [filePart, idPart] = href.split('#');
    if (!filePart) {
      this.rendition?.display(href); // same-document fragment
      return;
    }
    try {
      const resolved = new URL(filePart, `file:///${sectionHref}`).pathname.replace(/^\//, '');
      this.rendition?.display(idPart ? `${resolved}#${idPart}` : resolved);
    } catch {
      this.rendition?.display(href);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.rendition?.destroy();
    this.book?.destroy();
    this.rendition = null;
    this.book = null;
  }
}
