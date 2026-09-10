import ePub, { type Book, type Rendition, type NavItem } from 'epubjs';
import type { HighlightColor, PageDirection, ReaderPreferences, ReadingFlow, TocItem } from '../../types';
import { resolveFootnote, type FootnoteContent } from '../footnotes/resolveFootnote';
import { normalizeForSearch } from '../tokenizer/arabicTokenizer';

/** epub.js's own flow keyword for our simpler paginated/scrolled toggle. */
function epubFlow(flow: ReadingFlow): 'paginated' | 'scrolled-doc' {
  return flow === 'scrolled' ? 'scrolled-doc' : 'paginated';
}

// Book text/background color, mirrored from index.css's :root custom
// properties (--bg/--ink per theme) as literal values -- CSS custom
// properties don't cross into epub.js's sandboxed per-section iframes (a
// separate document each), so `var(--ink)` here would simply fail to
// resolve. Keep in sync with index.css if that palette ever changes.
const BOOK_THEME_COLORS: Record<'light' | 'dark' | 'sepia', { bg: string; ink: string }> = {
  light: { bg: '#faf7f2', ink: '#1c1b19' },
  dark: { bg: '#16151a', ink: '#efe9df' },
  sepia: { bg: '#f1e7d3', ink: '#3a2e1e' },
};

/** 'system' resolves the same way the host app's own theme does (see
 * PreferencesContext) -- via the <html> `data-theme` attribute it keeps in
 * sync with the OS preference, since epub.js's rendition has no view of
 * that media query itself. */
function resolveBookTheme(theme: ReaderPreferences['theme']): 'light' | 'dark' | 'sepia' {
  if (theme !== 'system') return theme;
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export type EffectiveDirection = 'rtl' | 'ltr';

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

/**
 * Match-quality tier, in the priority order results should be presented:
 * an unaccented literal match first, then one that only lines up once
 * diacritics/hamza-variants are normalized, then a looser word-mode match
 * (all query words present, not necessarily adjacent). No 'fuzzy' tier is
 * populated today (see SearchOptions.mode below) -- the type has room for
 * one so a future edit-distance or root/morphology-based tier could slot
 * in above the display layer's sort without changing its shape, but none
 * of the existing dictionary/search backend does that matching today, so
 * building it now would just be unimplemented surface area.
 */
export type SearchMatchType = 'exact' | 'normalized' | 'partial';

export interface SearchResult {
  cfi: string;
  excerpt: string;
  href: string;
  label?: string;
  matchType: SearchMatchType;
}

export interface SearchOptions {
  /** 'phrase' (default): the query must appear as one literal substring,
   * in order -- what `normalizeForSearch`-based matching already did.
   * 'word': every whitespace-separated word in the query must appear
   * somewhere in the same text node, not necessarily adjacent or in
   * order -- always tiered 'partial' (see SearchMatchType), since it's a
   * deliberately looser match than a phrase. */
  mode?: 'phrase' | 'word';
  /** Restricts the search to one section (href) -- the "Current page"
   * scope. Omit to search the whole book. */
  sectionHref?: string;
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
  private currentDirection: EffectiveDirection = 'rtl';

  /** Resolves the "Page direction" setting against the open book: 'auto'
   * reads the OPF spine's page-progression-direction (epub.js exposes this
   * as `book.packaging.metadata.direction`) and falls back to 'rtl' if the
   * book doesn't declare one -- Arabic books frequently omit it, and this
   * being an Arabic reader, RTL is the sensible default rather than
   * epub.js's own 'ltr' default. 'rtl'/'ltr' explicitly override either way. */
  getEffectiveDirection(pageDirection: PageDirection): EffectiveDirection {
    if (pageDirection === 'rtl' || pageDirection === 'ltr') return pageDirection;
    const declared = (this.book as any)?.packaging?.metadata?.direction as string | undefined;
    return declared === 'ltr' ? 'ltr' : 'rtl';
  }

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
    this.currentDirection = this.getEffectiveDirection(prefs.pageDirection);
    const rendition = book.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: epubFlow(prefs.readingFlow),
      spread: 'auto',
      // `defaultDirection` is only a *fallback* epub.js uses if the book's
      // own OPF metadata doesn't declare a direction -- an explicit
      // RTL/LTR override needs to win outright, so `.direction()` is called
      // explicitly right below regardless of what this resolves to.
      defaultDirection: this.currentDirection,
      script: undefined,
    });
    if (this.destroyed) {
      rendition.destroy();
      this.book = null;
      return;
    }
    this.rendition = rendition;
    rendition.direction(this.currentDirection);

    this.applyPreferences(prefs);

    const nav = await book.loaded.navigation;
    if (this.destroyed) return;
    this.toc = (nav.toc || []).map((item: NavItem) => this.mapNavItem(item));

    await rendition.display(startCfi || undefined);
  }

  /** Reading controls (font/theme/width/flow/direction — Settings panel).
   * Safe to call at any point after `open()`, including while a section is
   * on-screen. */
  applyPreferences(prefs: ReaderPreferences): void {
    if (!this.rendition) return;
    const dir = this.getEffectiveDirection(prefs.pageDirection);
    const { bg, ink } = BOOK_THEME_COLORS[resolveBookTheme(prefs.theme)];
    this.rendition.themes.default({
      html: { background: `${bg} !important` },
      body: {
        direction: dir,
        'font-family': `${prefs.fontFamily} !important`,
        'line-height': `${prefs.lineHeight} !important`,
        background: `${bg} !important`,
        color: `${ink} !important`,
      },
      // Some EPUBs' stylesheets set paragraph text color explicitly (often
      // literally `color: #000`, common from Word-to-EPUB converters) --
      // body's inherited color loses to that, so it's forced here too.
      // Deliberately *not* extended down to span/a/etc: an element's own
      // explicitly-set color already beats an inherited value regardless of
      // !important (inheritance isn't a competing declaration), so intentional
      // per-span coloring -- including this app's own saved-word highlight,
      // see wordStyle() in Reader.tsx -- keeps working without needing to be
      // named here individually.
      p: { direction: dir, 'text-align': dir === 'rtl' ? 'right' : 'left', color: `${ink} !important` },
    });
    this.rendition.themes.fontSize(`${prefs.fontSizePct}%`);

    // epub.js's own rendition.direction() drives actual page-turn semantics
    // (which way next()/prev() advance, spread order, swipe-adjacent
    // internal math) -- the themes.default() call above only affects how
    // text renders *within* a page, which is a separate concern from which
    // way turning the page moves.
    if (dir !== this.currentDirection) {
      this.currentDirection = dir;
      this.rendition.direction(dir);
    }

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
      if (doc) {
        this.injectFonts(doc);
        cb(doc, section?.href);
      }
    });
  }

  /** Each rendered section is its own separate iframe `Document` -- cross-
   * document iframes never inherit the host page's <style>/<link> tags, so
   * the app's self-hosted Noto Naskh Arabic (declared in src/index.css) was
   * never actually reaching the book text itself; `themes.default()` below
   * only sets which font-family to use, not where its @font-face comes
   * from, so the reading pane was silently falling back to whatever generic
   * serif the device has. Injecting the same @font-face rules directly into
   * every section's document (idempotent per-document, since epub.js gives
   * each section a fresh one) fixes that at the source. */
  private injectFonts(doc: Document): void {
    if (doc.getElementById('ar-reader-fonts')) return;
    // Always the *host* page's origin, deliberately not the iframe's own --
    // epub.js renders each section into a sandboxed blob: URL, where
    // `location.origin` is the literal string "null" (an opaque origin per
    // spec), which silently corrupted this into a bogus relative URL
    // (resolved against the section's own blob path) the first time this
    // was written.
    const origin = window.location.origin;
    const style = doc.createElement('style');
    style.id = 'ar-reader-fonts';
    style.textContent = `
      @font-face {
        font-family: 'Noto Naskh Arabic';
        font-style: normal;
        font-weight: 400 700;
        font-display: swap;
        src: url('${origin}/fonts/NotoNaskhArabic-arabic.woff2') format('woff2');
        unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFC;
      }
      @font-face {
        font-family: 'Noto Naskh Arabic';
        font-style: normal;
        font-weight: 400 700;
        font-display: swap;
        src: url('${origin}/fonts/NotoNaskhArabic-latin.woff2') format('woff2');
        unicode-range: U+0000-00FF, U+2000-206F;
      }
    `;
    doc.head.appendChild(style);
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

  /** The direction actually in effect right now (after resolving 'auto')
   * -- used by the Reader's swipe-gesture handler to know which physical
   * swipe direction means "next" vs "previous" for the open book. */
  getCurrentDirection(): EffectiveDirection {
    return this.currentDirection;
  }

  /** Restores a previously-generated locations index (see
   * `serializeLocations`/`generateLocations` below) instead of walking the
   * whole book's text again -- should be tried first every time a book
   * opens, falling back to `generateLocations` only when there's nothing
   * cached yet for this book. */
  loadLocations(serialized: string): void {
    (this.book as any)?.locations?.load(serialized);
  }

  /** Walks the entire book's text to build epub.js's `locations` index --
   * real, if approximate, page numbers (bookmarks' "minimal location
   * reference"), computed by splitting the book into fixed-size character
   * chunks. This is genuinely slow for a long book (it loads and measures
   * every section), so it's meant to run once per book, in the background,
   * well after the book is already readable -- never awaited before
   * displaying anything -- with the result cached via `serializeLocations`
   * so it isn't repeated on the next open. */
  async generateLocations(): Promise<number> {
    if (!this.book) return 0;
    // 1000 chars/location is a coarser split than epub.js's own default
    // (150, closer to "screen" than "page") -- meant to land in the same
    // rough ballpark as a printed page.
    await (this.book as any).locations.generate(1000);
    return (this.book as any).locations.total ?? 0;
  }

  /** Serializes the current locations index (epub.js's own format) for
   * `loadLocations` to restore later, so `generateLocations`'s full-book
   * walk only ever has to happen once per book. */
  serializeLocations(): string | null {
    const locations = (this.book as any)?.locations;
    return locations?.total ? locations.save() : null;
  }

  /** A short "Page N of Total" label for `cfi`, once locations are
   * available (see above) -- undefined before that (callers fall back to
   * a percent label, see Reader.tsx's bookmark creation). */
  getPageLabel(cfi: string): string | undefined {
    const locations = (this.book as any)?.locations;
    if (!locations?.total) return undefined;
    const index = locations.locationFromCfi(cfi);
    if (typeof index !== 'number' || index < 0) return undefined;
    return `Page ${index + 1} of ${locations.total + 1}`;
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

  /** Text search, scoped to the whole book by default or to one section
   * (SearchOptions.sectionHref -- the "Current page" scope). epub.js only
   * keeps the *current* section's content parsed into a Document -- the
   * rest of the book is just spine metadata until asked for -- so this
   * loads each section in turn, walks its text nodes directly (rather than
   * epub.js's own `Section.find()`, which does a plain case-insensitive
   * substring match with no Arabic diacritic/hamza-variant awareness),
   * then unloads it again before moving on, so a large book doesn't end up
   * with every chapter's DOM held in memory at once just because the
   * reader searched it once.
   *
   * Diacritic-insensitive and أ/إ/آ/ٱ-folding (see normalizeForSearch):
   * both the query and each text node's content are normalized before
   * matching, then a match position in the *normalized* string is mapped
   * back to a real offset in the *original* text (diacritics are deletions,
   * so those positions don't otherwise line up) to build a correct DOM
   * Range/CFI and an excerpt that still shows the real, un-normalized text.
   *
   * Results come back sorted by match quality (see SearchMatchType) --
   * exact literal matches first, then ones that only line up after
   * normalization, then (mode: 'word' only) loose word-presence matches --
   * rather than in whatever order sections happen to be walked in. */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!this.book || !trimmed) return [];
    const mode = options.mode ?? 'phrase';
    const { normalized: normalizedQuery } = normalizeForSearch(trimmed);
    if (!normalizedQuery) return [];
    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
    const EXCERPT_LIMIT = 150;
    const results: SearchResult[] = [];
    const excerptOf = (text: string, origStart: number, origEnd: number) =>
      text.length <= EXCERPT_LIMIT
        ? text
        : '...' +
          text.slice(Math.max(0, origStart - EXCERPT_LIMIT / 2), Math.min(text.length, origEnd + EXCERPT_LIMIT / 2)) +
          '...';

    // epub.js's own TS defs don't declare `spineItems` (only its runtime
    // Spine class does) -- cast through `any` the same way this file
    // already does for epub.js internals it doesn't have full types for.
    const allSections = (this.book.spine as any).spineItems as any[];
    const sections = options.sectionHref ? allSections.filter((s) => s.href === options.sectionHref) : allSections;

    for (const section of sections) {
      try {
        await section.load(this.book.load.bind(this.book));
        const doc: Document | undefined = section.document;
        if (!doc) continue;
        const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = node.textContent ?? '';
          if (!text.trim()) continue;
          const { normalized, toOriginal } = normalizeForSearch(text);

          if (mode === 'word') {
            // Every query word must appear somewhere in this node -- not
            // necessarily adjacent or in order, so this is always the
            // loosest ('partial') tier. Anchored on the first word's first
            // occurrence for the CFI/excerpt.
            const firstIdx = normalized.indexOf(queryWords[0]);
            if (firstIdx === -1) continue;
            if (!queryWords.every((w) => normalized.includes(w))) continue;
            const origStart = toOriginal[firstIdx];
            const matchEndIdx = firstIdx + queryWords[0].length;
            const origEnd = matchEndIdx < toOriginal.length ? toOriginal[matchEndIdx] : text.length;
            const range = doc.createRange();
            range.setStart(node, origStart);
            range.setEnd(node, origEnd);
            results.push({
              cfi: section.cfiFromRange(range),
              excerpt: excerptOf(text, origStart, origEnd),
              href: section.href,
              label: this.getChapterLabelFor(section.href),
              matchType: 'partial',
            });
            continue;
          }

          let searchFrom = 0;
          for (;;) {
            const idx = normalized.indexOf(normalizedQuery, searchFrom);
            if (idx === -1) break;
            const origStart = toOriginal[idx];
            const matchEndIdx = idx + normalizedQuery.length;
            const origEnd = matchEndIdx < toOriginal.length ? toOriginal[matchEndIdx] : text.length;
            searchFrom = matchEndIdx;

            const range = doc.createRange();
            range.setStart(node, origStart);
            range.setEnd(node, origEnd);
            const cfi = section.cfiFromRange(range);
            const matchType: SearchMatchType = text.slice(origStart, origEnd) === trimmed ? 'exact' : 'normalized';
            results.push({
              cfi,
              excerpt: excerptOf(text, origStart, origEnd),
              href: section.href,
              label: this.getChapterLabelFor(section.href),
              matchType,
            });
          }
        }
      } finally {
        section.unload();
      }
    }

    const TIER_ORDER: Record<SearchMatchType, number> = { exact: 0, normalized: 1, partial: 2 };
    results.sort((a, b) => TIER_ORDER[a.matchType] - TIER_ORDER[b.matchType]);
    return results;
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
