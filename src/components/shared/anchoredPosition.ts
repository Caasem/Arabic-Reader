interface Viewport {
  width: number;
  height: number;
}

const currentViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

/** Keeps a horizontally centered element `halfWidth` px from either screen edge. */
export function clampX(x: number, halfWidth: number, viewportWidth = window.innerWidth): number {
  return Math.min(Math.max(x, halfWidth), viewportWidth - halfWidth);
}

export interface AnchoredPosition {
  left: number;
  top: number;
  /** Placed below the anchor instead of above (the popup's `--below` modifier). */
  below: boolean;
}

export interface AnchorOptions {
  halfWidth: number;
  /** Anchors closer than this to the top of the screen flip the popup below. */
  flipBelowY: number;
  /** Minimum room kept under the anchor point, when placed below / above. */
  bottomMarginBelow?: number;
  bottomMarginAbove?: number;
}

/** Where a small popup anchored at (x, y) -- the top center of what it
 * describes -- goes so it stays on screen. The popup's CSS does the actual
 * above/below offset. */
export function anchoredPosition(
  x: number,
  y: number,
  { halfWidth, flipBelowY, bottomMarginBelow = 40, bottomMarginAbove = 20 }: AnchorOptions,
  viewport: Viewport = currentViewport()
): AnchoredPosition {
  const below = y < flipBelowY;
  return {
    left: clampX(x, halfWidth, viewport.width),
    top: Math.min(y, viewport.height - (below ? bottomMarginBelow : bottomMarginAbove)),
    below,
  };
}
