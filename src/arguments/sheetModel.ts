import { gaps, type Gap } from './gaps';
import { BOX_SIZE, layoutSheet } from './layout';
import { linkTypeOf, numbering, rolesOf, tagOf, type ArgItem, type ArgumentRole, type LinkType } from './roles';

export const GHOST_SIZE = { w: 190, h: 70 };

export interface SheetBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  num: number;
  tag: string;
  roles: ArgumentRole[];
  text: string;
  marginOnly: boolean;
}

export interface SheetEdge {
  id: string;
  from: string;
  to: string;
  type: LinkType;
  /** Start and end, on the boxes' borders. */
  a: [number, number];
  b: [number, number];
  /** The text on the arrow: the link type, then any qualifier, with ⚑ when an exception is stated. */
  label: string;
  /** Where the label sits, along the arrow (0 to 1): further on when a warrant card is in the middle. */
  labelAt: number;
  exception: string | null;
  warrant: { id: string; num: number; text: string; backing: { id: string; num: number; text: string } | null; x: number; y: number } | null;
}

export interface Sheet {
  boxes: SheetBox[];
  edges: SheetEdge[];
  gaps: Gap[];
  width: number;
  height: number;
}

const LINK_LABEL: Record<LinkType, string> = { grounds: 'grounds', attacks: 'attacks', replies: 'replies' };

/** The point where the line from the centre of `r` towards (tx, ty) leaves `r`. */
export function clipToBox(r: { x: number; y: number; w: number; h: number }, tx: number, ty: number): [number, number] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const sx = dx ? r.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? r.h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return Number.isFinite(t) ? [cx + dx * t, cy + dy * t] : [cx, cy];
}

/**
 * The sheet, drawn from the margin's items and never entered by hand. Boxes are claims, grounds, objections and
 * replies; a warrant is a card on the arrow it belongs to, its backing a line inside it; a qualifier is added to the
 * arrow's label and an exception adds ⚑. `textOf` gives each item's words.
 */
export function buildSheet(items: readonly ArgItem[], textOf: (id: string) => string): Sheet {
  const nums = numbering(items);
  const { boxes: raw, pos, rows, maxLevel } = layoutSheet(items);
  const boxes: SheetBox[] = raw.map((n) => ({
    id: n.id,
    ...pos.get(n.id)!,
    ...BOX_SIZE,
    num: nums.get(n.id)!,
    tag: tagOf(n),
    roles: rolesOf(n),
    text: textOf(n.id),
    marginOnly: !!n.marginOnly,
  }));
  const box = new Map(boxes.map((b) => [b.id, b]));
  const attached = (role: ArgumentRole, id: string) => items.filter((m) => m.role === role && m.for === id).sort((a, b) => a.spot - b.spot);

  const edges: SheetEdge[] = [];
  for (const n of raw) {
    const type = linkTypeOf(n);
    const from = box.get(n.id);
    const to = n.for ? box.get(n.for) : undefined;
    if (!type || !from || !to) continue;
    const a = clipToBox(from, to.x + to.w / 2, to.y + to.h / 2);
    const b = clipToBox(to, from.x + from.w / 2, from.y + from.h / 2);
    const w = attached('warrant', n.id)[0];
    const back = w ? attached('backing', w.id)[0] : undefined;
    const q = attached('qualifier', n.id).map((m) => textOf(m.id));
    const ex = attached('rebuttal', n.id)[0];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    edges.push({
      id: n.id,
      from: n.id,
      to: n.for!,
      type,
      a,
      b,
      label: [LINK_LABEL[type], ...q].join(' · ') + (ex ? ' ⚑' : ''),
      labelAt: w ? 0.86 : 0.5,
      exception: ex ? textOf(ex.id) : null,
      warrant: w
        ? {
            id: w.id,
            num: nums.get(w.id)!,
            text: textOf(w.id),
            backing: back ? { id: back.id, num: nums.get(back.id)!, text: textOf(back.id) } : null,
            x: mx - GHOST_SIZE.w / 2,
            y: my - GHOST_SIZE.h / 2,
          }
        : null,
    });
  }
  return {
    boxes,
    edges,
    gaps: gaps(items),
    width: 16 + (maxLevel + 1) * 300,
    height: 24 + rows * 128,
  };
}
