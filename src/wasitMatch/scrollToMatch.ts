/** Marks a sense the popup coloured as the looked-up word's sub-entry (see findMatchedSenses). */
export const SUB_ENTRY_MATCH_ATTR = 'data-subentry-match';

/** With `startIsEnough`: how far above the container's bottom edge the match must start to count as in view. */
const START_ROOM_PX = 32;

/** Space left above the match, so the line before it shows and the reader sees where they are. */
const CONTEXT_PX = 48;

/**
 * The scrollTop that brings a match into view near the top of its scroll container, or null when it is
 * already fully visible (then nothing moves). Rects are viewport coordinates.
 */
export function scrollTopFor(
  container: { top: number; bottom: number },
  match: { top: number; bottom: number },
  scrollTop: number,
  context = CONTEXT_PX,
  /** Leave the scroll alone when the match's first line is on screen, even if its end is cut off (the popup: it opens at the top). */
  startIsEnough = false,
): number | null {
  if (match.top >= container.top && (startIsEnough ? match.top <= container.bottom - START_ROOM_PX : match.bottom <= container.bottom)) return null;
  return Math.max(0, scrollTop + match.top - container.top - context);
}

function scrollParent(el: HTMLElement, root: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    if (node === root) break;
  }
  return null;
}

/**
 * Scrolls each scroll container inside `root` (the popup's own, or each Split column) to the first
 * match it holds, unless that match is already in view. Only scrollTop changes: the page never moves.
 */
export function scrollToFirstMatches(root: HTMLElement, { startIsEnough = false }: { startIsEnough?: boolean } = {}): void {
  const done = new Set<HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>(`[${SUB_ENTRY_MATCH_ATTR}]`)) {
    const container = scrollParent(el, root);
    if (!container || done.has(container)) continue;
    done.add(container);
    const top = scrollTopFor(container.getBoundingClientRect(), el.getBoundingClientRect(), container.scrollTop, undefined, startIsEnough);
    if (top !== null) container.scrollTop = top;
  }
}
