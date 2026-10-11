/**
 * attachSectionInteractions (word taps, double taps, holds, hover) was written
 * for an epub section's own Document. The clean reader renders text straight
 * into the page, so this presents one element as just enough of a Document for
 * that function -- letting both readers share one set of gesture rules instead
 * of duplicating them. Only the members attachSectionInteractions touches are
 * provided.
 */
export function elementAsDocument(root: HTMLElement): Document {
  const shim = {
    body: root,
    scrollingElement: root,
    documentElement: root,
    addEventListener: root.addEventListener.bind(root),
    getSelection: () => window.getSelection(),
  };
  return shim as unknown as Document;
}
