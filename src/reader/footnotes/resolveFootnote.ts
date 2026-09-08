import type { Book } from 'epubjs';

/**
 * Footnote handling.
 *
 * By default, epub.js intercepts every internal `<a href>` click in rendered
 * content and calls `rendition.display(...)` on it (see its own
 * `Contents.linksHandler()` / `Rendition.handleLinks()`) — which is exactly
 * why clicking a footnote marker jumps you away to wherever the note lives
 * (end of chapter, or a separate notes file) instead of showing it inline.
 * There's no per-link opt-out for that built into epub.js, so Reader.tsx
 * intercepts footnote-shaped links itself, in the *capture* phase (before
 * epub.js's own click handler — attached directly on the `<a>` — gets a
 * chance to run), and shows the note's content in a small popup instead.
 *
 * If we can't confidently resolve a link as a footnote, we deliberately
 * don't intercept it — falling through to epub.js's normal navigation is
 * always safe. When we DO intercept but then fail to load the note's actual
 * content (e.g. an unusual cross-file structure we didn't anticipate), the
 * popup offers a "Go to note" fallback that performs the normal navigation
 * on demand, so nothing is ever permanently unreachable.
 */

const EPUB_OPS_NS = 'http://www.idpf.org/2007/ops';

export interface FootnoteContent {
  html: string;
}

/** Heuristic: does this link look like a footnote/endnote reference? */
export function isFootnoteLink(el: HTMLAnchorElement): boolean {
  const href = el.getAttribute('href') || '';
  if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
    return false;
  }

  // EPUB3 standard: epub:type="noteref" (may appear via the namespaced
  // attribute, or unprefixed depending on how the book/epub.js serialized it).
  const epubType = el.getAttributeNS(EPUB_OPS_NS, 'type') || el.getAttribute('epub:type') || '';
  if (/\bnoteref\b/i.test(epubType)) return true;

  // ARIA/DAOM equivalent used by some conversion pipelines.
  if (el.getAttribute('role') === 'doc-noteref') return true;

  // Common class-name conventions from EPUB conversion tools (Calibre,
  // Pandoc, Sigil, Word-to-EPUB exporters).
  const cls = el.className || '';
  if (/\b(footnote|endnote|fnref|noteref)/i.test(cls)) return true;

  // Classic fallback for older/converted books with no semantic markup at
  // all: a same-document link whose visible text is just a bare or
  // bracketed/superscript number — the traditional footnote marker.
  const text = (el.textContent || '').trim();
  if (href.startsWith('#') && /^\[?\d{1,3}\]?$/.test(text)) return true;

  return false;
}

/** Accepts either a real `Document` (the same-document case, where
 * `currentDoc` genuinely is one) or an `Element` (the cross-file case —
 * see the note on `section.load()` below) — `getElementById` only exists
 * on the former, so both paths go through `querySelector` instead, which
 * works identically on either. */
function findTargetInDoc(doc: Document | Element, id: string): Element | null {
  const escaped = cssEscape(id);
  return doc.querySelector(`#${escaped}`) || doc.querySelector(`a[name="${escaped}"]`);
}

function cssEscape(id: string): string {
  return (window.CSS?.escape ? window.CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
}

/**
 * Resolves a footnote link's actual note content. `currentDoc` is the
 * iframe document the link was clicked in; `currentSectionHref` is that
 * section's own href (needed to resolve a relative cross-file link like
 * "notes.xhtml#fn3" against the right directory — the anchor's `href`
 * attribute is relative to its own file, not the book root).
 */
export async function resolveFootnote(
  anchor: HTMLAnchorElement,
  currentDoc: Document,
  currentSectionHref: string,
  book: Book
): Promise<FootnoteContent | null> {
  const href = anchor.getAttribute('href');
  if (!href) return null;
  const [filePart, idPart] = href.split('#');

  // Same-document note (by far the most common case: the note sits at the
  // bottom of the same chapter file it's referenced from).
  if (!filePart) {
    if (!idPart) return null;
    const target = findTargetInDoc(currentDoc, idPart);
    return target ? { html: sanitizeFootnoteHtml(target.innerHTML) } : null;
  }

  // Cross-file note (e.g. a shared "endnotes.xhtml" referenced from every
  // chapter). Resolve the relative path against the *current section's*
  // directory, then ask epub.js's spine for that section and load it.
  try {
    const resolved = new URL(filePart, `file:///${currentSectionHref}`).pathname.replace(/^\//, '');
    const section = book.spine.get(resolved) ?? book.spine.get(filePart);
    if (!section) return null;
    // epub.js's Section.load() resolves with `xml.documentElement` (an
    // Element — the <html> root), not a full Document as its own JSDoc
    // claims, so neither `.getElementById` nor `.body` can be assumed to
    // exist on it — `querySelector('body')` works on either shape.
    const loaded = (await section.load(book.load.bind(book))) as unknown as Element | Document;
    if (!loaded) return null;
    const target = idPart ? findTargetInDoc(loaded, idPart) : loaded.querySelector('body');
    return target ? { html: sanitizeFootnoteHtml(target.innerHTML) } : null;
  } catch {
    return null;
  }
}

const ALLOWED_TAGS = new Set(['B', 'I', 'EM', 'STRONG', 'SUP', 'SUB', 'BR', 'SPAN', 'P', 'A', 'DIV', 'UL', 'OL', 'LI']);
// Unlike other disallowed tags (unwrapped, keeping their visible text), these
// carry content that was never meant to be shown as text at all — drop the
// element AND its content outright.
const DROP_ENTIRELY_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE']);

/**
 * The footnote's HTML comes straight from the book file and gets rendered
 * via dangerouslySetInnerHTML *outside* epub.js's sandboxed content iframe
 * (in the main app's own DOM, so the popup can float above the page) — so,
 * unlike the book's main content, it isn't isolated by the iframe boundary.
 * Strip everything except a small inline-formatting allowlist and drop any
 * non-http(s) link targets before it's ever handed to React.
 */
function sanitizeFootnoteHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;
  if (!root) return '';

  const clean = (node: Element) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (DROP_ENTIRELY_TAGS.has(el.tagName)) {
          node.removeChild(el);
          return;
        }
        if (!ALLOWED_TAGS.has(el.tagName)) {
          while (el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
          return;
        }
        Array.from(el.attributes).forEach((attr) => {
          if (attr.name === 'href') {
            if (!/^https?:\/\//i.test(attr.value)) el.removeAttribute('href');
            else el.setAttribute('target', '_blank');
          } else if (attr.name !== 'class') {
            el.removeAttribute(attr.name);
          }
        });
        clean(el);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        node.removeChild(child);
      }
    });
  };
  clean(root);
  return root.innerHTML.trim();
}
