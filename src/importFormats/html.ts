import { sanitizeSectionDocument } from '../reader/epub/sanitizeSection';

/**
 * Cleans a parsed HTML document for use inside a converted book and returns its body as XHTML:
 * scripts, event handlers and script URLs go (the same rules as for any book section), and images
 * that point at the network or at files we don't have are dropped, since a converted book must not
 * fetch anything. Returns the markup and how many images were dropped.
 */
export function bodyToXhtml(doc: Document, keepImage: (src: string) => boolean = () => false): { html: string; droppedImages: number } {
  sanitizeSectionDocument(doc);
  let droppedImages = 0;
  for (const img of Array.from(doc.querySelectorAll('img, image'))) {
    const src = img.getAttribute('src') ?? img.getAttribute('href') ?? img.getAttribute('xlink:href') ?? '';
    if (!keepImage(src)) {
      img.remove();
      droppedImages++;
    }
  }
  for (const el of Array.from(doc.querySelectorAll('link, style, base, iframe, object, embed, form, input, button, video, audio'))) el.remove();
  const serializer = new XMLSerializer();
  const html = Array.from(doc.body?.childNodes ?? [])
    .map((node) => serializer.serializeToString(node))
    .join('')
    // Each top-level element gets a redundant XHTML namespace from the serializer.
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
  return { html, droppedImages };
}

/** Splits a body at its `<h1>`/`<h2>` headings into chapters; content before the first heading is its own chapter. */
export function splitAtHeadings(doc: Document, fallbackTitle: string): Document[] {
  const body = doc.body;
  const parts: Document[] = [];
  let current: Document | null = null;
  let currentTitle = fallbackTitle;
  const start = (title: string) => {
    current = document.implementation.createHTMLDocument(title);
    currentTitle = title;
    parts.push(current);
  };
  for (const node of Array.from(body.childNodes)) {
    const isHeading = node.nodeType === 1 && /^H[12]$/.test((node as Element).tagName);
    if (isHeading || !current) start(isHeading ? (node.textContent ?? '').trim() || fallbackTitle : currentTitle);
    current!.body.appendChild(current!.importNode(node, true));
  }
  return parts.filter((d) => (d.body.textContent ?? '').trim());
}
