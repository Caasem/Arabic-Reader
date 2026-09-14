import ePub, { type Book, type Rendition } from 'epubjs';
import type { HighlightColor, PageDirection, ReaderPreferences, ReadingFlow, TocItem } from '../../types';
import type { ResolvedTheme } from '../../state/PreferencesContext';
import { HIGHLIGHT_FILL, PAGE_COLORS } from '../../theme/tokens';
import { resolveFootnote, type FootnoteContent } from '../footnotes/resolveFootnote';
import { anchorOf, toHostRect } from '../wordInteraction/rectInHost';
import { searchBook, type SearchOptions, type SearchResult } from './bookSearch';
import { bookLocations, declaredDirection, enqueue, findTocLabel, mapNavItems, renderedContents } from './epubInternals';
import { sanitizeSectionDocument } from './sanitizeSection';

export type { SearchMatchType, SearchOptions, SearchResult } from './bookSearch';

export type EffectiveDirection = 'rtl' | 'ltr';

export interface RelocatedLocation {
  cfi: string;
  percent: number;
  chapterHref?: string;
  chapterLabel?: string;
  /** Paginated flow only: the displayed page is the last page of its section. */
  atPageEnd?: boolean;
}

export interface SelectionInfo {
  cfiRange: string;
  text: string;
  x: number;
  y: number;
}

export interface OpenOptions {
  startCfi?: string;
  prefs: ReaderPreferences;
  theme: ResolvedTheme;
  /** Once per rendered section document. */
  onRendered(doc: Document, sectionHref: string): void;
  onRelocated(location: RelocatedLocation): void;
  /** Text selected in the page, resolved to a CFI range. */
  onSelected(info: SelectionInfo): void;
}

interface RelocatedEvent {
  start?: { cfi?: string; href?: string; percentage?: number };
  end?: { displayed?: { page?: number; total?: number } };
}

function epubFlow(flow: ReadingFlow): 'paginated' | 'scrolled-doc' {
  return flow === 'scrolled' ? 'scrolled-doc' : 'paginated';
}

/**
 * The only module that drives epub.js rendering; the rest of the reader deals
 * in TocItems, locations, and plain section Documents.
 */
export class EpubService {
  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private container: HTMLElement | null = null;
  private toc: TocItem[] = [];
  private currentSectionHref?: string;
  private readonly renderedAnnotationCfis = new Set<string>();
  /** open() is a long async chain. If destroy() lands mid-way (React
   * StrictMode's double mount does exactly that in dev), the abandoned open
   * must not attach a second rendition to the same container. */
  private destroyed = false;
  private currentFlow: ReadingFlow = 'paginated';
  private currentDirection: EffectiveDirection = 'rtl';
  private currentTwoColumn = false;

  /** 'auto' follows the book's declared direction, defaulting to RTL (Arabic
   * books often don't declare one). */
  getEffectiveDirection(pageDirection: PageDirection): EffectiveDirection {
    if (pageDirection === 'rtl' || pageDirection === 'ltr') return pageDirection;
    return this.book && declaredDirection(this.book) === 'ltr' ? 'ltr' : 'rtl';
  }

  async open(file: Blob, container: HTMLElement, options: OpenOptions): Promise<void> {
    const buf = await file.arrayBuffer();
    if (this.destroyed) return;

    const book = ePub(buf);
    // Every section is sanitized before it's serialized into its iframe.
    book.spine.hooks.content.register(sanitizeSectionDocument);
    await book.ready;
    if (this.destroyed) {
      book.destroy();
      return;
    }
    this.book = book;
    this.container = container;

    const { prefs } = options;
    this.currentFlow = prefs.readingFlow;
    this.currentDirection = this.getEffectiveDirection(prefs.pageDirection);
    this.currentTwoColumn = prefs.twoColumnEnabled;
    const rendition = book.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: epubFlow(prefs.readingFlow),
      // 'continuous' stitches sections into one scrollable feed; the default
      // manager holds one section at a time. Changing it means reopening.
      manager: prefs.readingFlow === 'scrolled' && prefs.continuousScrollEnabled ? 'continuous' : 'default',
      // Two columns are forced on/off, not width-dependent. epub.js still
      // requires width >= minSpreadWidth (800px default) and treats 0 as unset.
      spread: prefs.twoColumnEnabled ? 'always' : 'none',
      minSpreadWidth: prefs.twoColumnEnabled ? 1 : undefined,
      // Only a fallback for books without a declared direction; direction()
      // below makes an explicit setting win.
      defaultDirection: this.currentDirection,
      // iOS WebKit doesn't deliver taps into a section iframe sandboxed
      // without allow-scripts. Book script still can't run: sections are
      // sanitized by the content hook above.
      allowScriptedContent: true,
    });
    if (this.destroyed) {
      rendition.destroy();
      this.book = null;
      return;
    }
    this.rendition = rendition;
    rendition.direction(this.currentDirection);
    this.applyPreferences(prefs, options.theme);
    // Before the first display, so the first section's events aren't missed.
    this.listen(rendition, options);

    const nav = await book.loaded.navigation;
    if (this.destroyed) return;
    this.toc = mapNavItems(nav.toc);

    await rendition.display(options.startCfi || undefined);
  }

  private listen(rendition: Rendition, options: OpenOptions): void {
    rendition.on('rendered', (section: { href?: string } | undefined, view: { document?: Document; iframe?: HTMLIFrameElement }) => {
      const doc = view?.document ?? view?.iframe?.contentDocument;
      if (section?.href) this.currentSectionHref = section.href;
      if (!doc || !section?.href) return;
      this.injectFonts(doc);
      options.onRendered(doc, section.href);
    });

    rendition.on('relocated', (location: RelocatedEvent) => {
      const href = location?.start?.href;
      this.currentSectionHref = href;
      const displayed = location?.end?.displayed;
      options.onRelocated({
        cfi: location?.start?.cfi ?? '',
        percent: typeof location?.start?.percentage === 'number' ? location.start.percentage : 0,
        chapterHref: href,
        chapterLabel: href ? findTocLabel(this.toc, href) : undefined,
        atPageEnd:
          this.currentFlow === 'paginated' && typeof displayed?.page === 'number' && typeof displayed.total === 'number'
            ? displayed.page >= displayed.total
            : undefined,
      });
    });

    rendition.on('selected', (cfiRange: string, contents: { window?: Window } | undefined) => {
      const selection = contents?.window?.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!selection || !text) return;
      let point = { x: 0, y: 0 };
      try {
        point = anchorOf(toHostRect(selection.getRangeAt(0).getBoundingClientRect(), contents?.window));
      } catch {
        // best-effort positioning only
      }
      options.onSelected({ cfiRange, text, ...point });
    });
  }

  /** Font, theme, flow, direction, and spread. Safe while a page is on screen. */
  applyPreferences(prefs: ReaderPreferences, theme: ResolvedTheme): void {
    const rendition = this.rendition;
    if (!rendition) return;
    const dir = this.getEffectiveDirection(prefs.pageDirection);
    const { bg, ink } = PAGE_COLORS[theme];
    rendition.themes.default({
      html: { background: `${bg} !important` },
      body: {
        direction: dir,
        'font-family': `${prefs.fontFamily} !important`,
        'line-height': `${prefs.lineHeight} !important`,
        background: `${bg} !important`,
        color: `${ink} !important`,
      },
      // Many EPUB stylesheets set paragraph color explicitly (often #000),
      // which beats body's inherited color. Spans aren't forced, so intentional
      // coloring -- saved words included -- still wins.
      p: { direction: dir, 'text-align': dir === 'rtl' ? 'right' : 'left', color: `${ink} !important` },
    });
    rendition.themes.fontSize(`${prefs.fontSizePct}%`);

    // direction()/flow()/spread() mutate epub.js's view manager directly. Run
    // outside its page-turn queue, they can clear the views out from under an
    // in-flight next()/prev(), after which page turns silently stop working
    // until the book is reopened.
    if (dir !== this.currentDirection) {
      this.currentDirection = dir;
      enqueue(rendition, () => rendition.direction(dir));
    }
    // flow() clears and re-displays the page, so only on an actual change.
    if (prefs.readingFlow !== this.currentFlow) {
      this.currentFlow = prefs.readingFlow;
      enqueue(rendition, () => rendition.flow(epubFlow(prefs.readingFlow)));
    }
    if (prefs.twoColumnEnabled !== this.currentTwoColumn) {
      this.currentTwoColumn = prefs.twoColumnEnabled;
      enqueue(rendition, () => rendition.spread(prefs.twoColumnEnabled ? 'always' : 'none', prefs.twoColumnEnabled ? 1 : undefined));
    }
  }

  /** Re-paginates against the container's current content-box size (epub.js's
   * own measurement includes the container's padding and overflows it). Queued
   * for the same reason as the layout changes in applyPreferences. */
  resize(): void {
    const { rendition, container } = this;
    if (!rendition || !container) return;
    enqueue(rendition, () => rendition.resize(container.clientWidth, container.clientHeight));
  }

  getToc(): TocItem[] {
    return this.toc;
  }

  /** Section documents don't inherit the host page's @font-face rules. URLs
   * resolve against the host page -- including its base path, so they work
   * under a subpath deploy such as GitHub Pages. */
  private injectFonts(doc: Document): void {
    if (doc.getElementById('ar-reader-fonts')) return;
    const fontUrl = (file: string) => new URL(`fonts/${file}`, document.baseURI).href;
    const style = doc.createElement('style');
    style.id = 'ar-reader-fonts';
    style.textContent = `
      @font-face {
        font-family: 'Noto Naskh Arabic';
        font-style: normal;
        font-weight: 400 700;
        font-display: swap;
        src: url('${fontUrl('NotoNaskhArabic-arabic.woff2')}') format('woff2');
        unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFC;
      }
      @font-face {
        font-family: 'Noto Naskh Arabic';
        font-style: normal;
        font-weight: 400 700;
        font-display: swap;
        src: url('${fontUrl('NotoNaskhArabic-latin.woff2')}') format('woff2');
        unicode-range: U+0000-00FF, U+2000-206F;
      }
    `;
    doc.head.appendChild(style);
  }

  /** Renders a highlight; safe before its section renders (epub.js applies
   * registered annotations as sections come into view). */
  renderHighlight(cfiRange: string, color: HighlightColor, onClick?: (event: Event) => void): void {
    if (this.renderedAnnotationCfis.has(cfiRange)) return;
    this.renderedAnnotationCfis.add(cfiRange);
    this.rendition?.annotations.highlight(
      cfiRange,
      {},
      (event: Event) => onClick?.(event),
      'ar-highlight',
      { fill: HIGHLIGHT_FILL[color], 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' }
    );
  }

  removeHighlight(cfiRange: string): void {
    this.renderedAnnotationCfis.delete(cfiRange);
    this.rendition?.annotations.remove(cfiRange, 'highlight');
  }

  clearSelection(): void {
    if (!this.rendition) return;
    for (const contents of renderedContents(this.rendition)) contents.window?.getSelection()?.removeAllRanges();
  }

  getCurrentSectionHref(): string | undefined {
    return this.currentSectionHref;
  }

  /** The parsed epub.js Book, for whole-book text passes (bookVocabIndex). */
  getBookHandle(): Book | null {
    return this.book;
  }

  /** The direction in effect ('auto' resolved), e.g. for swipe mapping. */
  getCurrentDirection(): EffectiveDirection {
    return this.currentDirection;
  }

  /** Restores a cached locations index instead of regenerating it. */
  loadLocations(serialized: string): void {
    if (this.book) bookLocations(this.book).load(serialized);
  }

  /** Builds epub.js's locations index (approximate page numbers). Slow -- it
   * walks the whole book -- so it runs once per book in the background and
   * the result is cached via serializeLocations(). */
  async generateLocations(): Promise<number> {
    if (!this.book) return 0;
    const locations = bookLocations(this.book);
    // ~1000 characters per location lands near a printed page.
    await locations.generate(1000);
    return locations.total ?? 0;
  }

  serializeLocations(): string | null {
    const locations = this.book ? bookLocations(this.book) : null;
    return locations?.total ? locations.save() : null;
  }

  /** "Page N of Total" once locations exist; undefined before that. */
  getPageLabel(cfi: string): string | undefined {
    const locations = this.book ? bookLocations(this.book) : null;
    if (!locations?.total) return undefined;
    const index = locations.locationFromCfi(cfi);
    if (typeof index !== 'number' || index < 0) return undefined;
    return `Page ${index + 1} of ${locations.total + 1}`;
  }

  /**
   * Shows the `indexInSection`-th occurrence of `word` in a section and
   * flashes it (Vocabulary Levels). Resolves false if the word never renders.
   */
  async goToWordOccurrence(sectionHref: string, word: string, indexInSection: number): Promise<boolean> {
    const rendition = this.rendition;
    if (!rendition) return false;
    await rendition.display(sectionHref);

    // Words are wrapped on 'rendered', which can land after display() resolves.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      for (const contents of renderedContents(rendition)) {
        // Filtered in JS rather than an attribute selector: no escaping needed.
        const matches = Array.from(contents.document?.querySelectorAll<HTMLElement>('.ar-word') ?? []).filter(
          (el) => el.dataset.word === word
        );
        const el = matches[indexInSection];
        if (!el) continue;
        // In paginated flow the word can sit on another page (column) of the
        // section, which scrollIntoView can't turn to -- navigate by CFI.
        if (this.currentFlow === 'paginated') await rendition.display(contents.cfiFromNode(el));
        else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('ar-word--jump-flash');
        window.setTimeout(() => el.classList.remove('ar-word--jump-flash'), 1400);
        return true;
      }
      await new Promise((r) => window.setTimeout(r, 80));
    }
    return false;
  }

  /** A footnote link's content, resolved inline (see resolveFootnote.ts). */
  async loadFootnote(anchor: HTMLAnchorElement, doc: Document, sectionHref: string): Promise<FootnoteContent | null> {
    if (!this.book) return null;
    return resolveFootnote(anchor, doc, sectionHref, this.book);
  }

  getChapterLabelFor(href?: string): string | undefined {
    return href ? findTocLabel(this.toc, href) : undefined;
  }

  /** Diacritic-insensitive text search over this book (see bookSearch.ts). */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.book) return [];
    return searchBook(this.book, query, options, (href) => this.getChapterLabelFor(href));
  }

  next(): void {
    this.rendition?.next();
  }

  prev(): void {
    this.rendition?.prev();
  }

  goTo(target: string): void {
    this.rendition?.display(target);
  }

  /** Navigates to a footnote the normal way when it couldn't be shown inline.
   * `href` is the link's raw attribute, relative to the section it's in. */
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
    this.container = null;
  }
}
