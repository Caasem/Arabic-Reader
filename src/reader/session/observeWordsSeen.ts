/**
 * Reports each `.ar-word` in a rendered section once at least half of it has
 * actually been on screen, so the Dashboard's "words read" reflects what was
 * displayed rather than whole chapters (paginated mode renders an entire
 * chapter at once). Keys are `${sectionHref}#${index}`, stable across
 * re-renders of the same section. IntersectionObserver's implicit root
 * accounts for the clipping of the iframe and epub.js's scroll container.
 */
export function observeWordsSeen(doc: Document, sectionHref: string, onSeen: (key: string) => void): () => void {
  const words = Array.from(doc.querySelectorAll<HTMLElement>('.ar-word'));
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win || typeof win.IntersectionObserver !== 'function') {
    words.forEach((_, i) => onSeen(`${sectionHref}#${i}`));
    return () => {};
  }

  const indexOf = new Map<Element, number>(words.map((el, i) => [el, i]));
  const observer = new win.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        onSeen(`${sectionHref}#${indexOf.get(entry.target)}`);
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.5 }
  );
  words.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}
