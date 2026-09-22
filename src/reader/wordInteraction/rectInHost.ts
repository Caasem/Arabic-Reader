export interface HostRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Converts a rect measured inside a (possibly iframe) document into host-page
 * coordinates: book sections render in iframes, offset by the frame's position. */
export function toHostRect(rect: HostRect, view: Window | null | undefined): HostRect {
  const frame = (view?.frameElement as Element | null | undefined)?.getBoundingClientRect();
  const dx = frame?.left ?? 0;
  const dy = frame?.top ?? 0;
  return { top: rect.top + dy, bottom: rect.bottom + dy, left: rect.left + dx, right: rect.right + dx };
}

export function rectInHost(el: Element): HostRect {
  return toHostRect(el.getBoundingClientRect(), el.ownerDocument.defaultView);
}

/** The point popups anchor to: horizontal center of the top edge. */
export function anchorOf(rect: HostRect): { x: number; y: number } {
  return { x: (rect.left + rect.right) / 2, y: rect.top };
}
