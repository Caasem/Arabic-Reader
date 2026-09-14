/** The spine index an EPUB CFI points into (from its second step, e.g.
 * `/6/14` is spine item 6), or null for anything that isn't a CFI. */
export function spineIndexOfCfi(cfi: string): number | null {
  const match = /^epubcfi\(\/\d+\/(\d+)/.exec(cfi);
  return match ? Number(match[1]) / 2 - 1 : null;
}
