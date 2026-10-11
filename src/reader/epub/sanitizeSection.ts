/**
 * Strips everything executable out of an (X)HTML document. Written for the
 * Original layout's epub.js section iframes (removed in 0.96.0); now used on
 * HTML books as they are imported (importFormats/html.ts), so a hostile file's
 * own script never reaches this app's IndexedDB.
 */

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** Elements that run script or embed another browsing context. */
const EXECUTABLE_ELEMENTS = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal'];

/** SVG animation elements can rewrite a link's href to `javascript:` at runtime. */
const ANIMATION_ELEMENTS = ['animate', 'set', 'animateMotion', 'animateTransform'];

const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background']);

const SCRIPT_URL_RE = /^(?:javascript|vbscript|data:text\/html)/i;

// Browsers ignore control characters and whitespace when parsing a URL
// scheme ("java\tscript:"), so they're stripped before matching.
// eslint-disable-next-line no-control-regex
const IGNORED_URL_CHARS_RE = /[\u0000-\u0020]/g;

export const SECTION_CSP = "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'";

export function sanitizeSectionDocument(doc: Document): void {
  const root = doc.documentElement;
  if (!root) return;

  for (const tag of EXECUTABLE_ELEMENTS) {
    for (const el of Array.from(doc.getElementsByTagNameNS('*', tag))) el.remove();
  }
  for (const tag of ANIMATION_ELEMENTS) {
    for (const el of Array.from(doc.getElementsByTagNameNS('*', tag))) {
      if (/href/i.test(el.getAttribute('attributeName') ?? '')) el.remove();
    }
  }
  for (const meta of Array.from(doc.getElementsByTagNameNS('*', 'meta'))) {
    if ((meta.getAttribute('http-equiv') ?? '').toLowerCase() === 'refresh') meta.remove();
  }

  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.localName.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttributeNode(attr);
      } else if (URL_ATTRIBUTES.has(name) && SCRIPT_URL_RE.test(attr.value.replace(IGNORED_URL_CHARS_RE, ''))) {
        el.removeAttributeNode(attr);
      }
    }
  }

  injectCsp(doc, root);
}

function injectCsp(doc: Document, root: Element): void {
  const ns = root.namespaceURI || XHTML_NS;
  let head = doc.getElementsByTagNameNS('*', 'head')[0];
  if (!head) {
    head = doc.createElementNS(ns, 'head');
    root.insertBefore(head, root.firstChild);
  }
  const meta = doc.createElementNS(ns, 'meta');
  meta.setAttribute('http-equiv', 'Content-Security-Policy');
  meta.setAttribute('content', SECTION_CSP);
  head.insertBefore(meta, head.firstChild);
}
