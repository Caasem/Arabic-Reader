import { newId } from '../utils/id';
import { borderPoint, clamp, contentBox, hitStroke, pathD, pressureWidth, r1 } from './geometry';
import { MARKER_WIDTH, setInkUi } from './inkUi';
import type { InkColor, InkPoint, Sketch, SketchEdge, SketchNode, SketchNodeKind } from './types';

/**
 * The sketch sheet's drawing surface, kept out of React: pointer input runs at stylus rates and the sheet is
 * redrawn directly. Freehand strokes and the diagram (nodes, connectors) share one surface and one coordinate
 * space; panning and zooming change only the view. The panel (SketchPanel.tsx) owns the buttons and calls in.
 */

export type DrawTool = 'pen' | 'marker' | 'eraser' | 'lasso' | 'hand';
export type DiagramTool = 'select' | 'link' | 'hand';

export interface SurfaceState {
  mode: Sketch['mode'];
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  empty: boolean;
  selected: boolean;
  /** The selected node, if a node (not a connector) is selected. */
  node: string | null;
  /** How many nodes are selected (Shift-click or Shift-drag adds more). */
  nodes: number;
  /** How many strokes the lasso holds. */
  strokes: number;
  /** The colour shared by the selected nodes, if they share one. */
  nodeColor: string | null;
  /** The selected connector, and whether it has an arrow. */
  edge: { id: string; dir: boolean } | null;
}

interface Options {
  colors: Record<InkColor, string>;
  /** A quote's or picture's ↗: go to its place on the page. */
  onGo?(node: SketchNode): void;
  /** A word of a selected quote was clicked: look it up. */
  onWord?(word: string): void;
  /** The pointer is over a node (or left it), so the panel can draw its line to the page. */
  onHoverNode?(node: SketchNode | null, el: HTMLElement | null): void;
  /** The sheet changed (content, mode or view); the panel saves it. `content` is false for view-only changes. */
  onChange(sketch: Sketch, content: boolean): void;
  onState(state: SurfaceState): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** A quote's words, each one clickable once the quote is selected (it opens the dictionary). */
const quoteWords = (text: string) =>
  text
    .split(/(\s+)/)
    .map((w) => (/\S/.test(w) ? `<span class="sk-w">${esc(w)}</span>` : w))
    .join('');
type Snap = string;

/** Whether (x, y) is inside the polygon (even-odd rule). */
function inPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

type Act =
  | { k: 'pan'; p0: [number, number]; tx: number; ty: number }
  | { k: 'ink'; pts: InkPoint[]; pen: boolean }
  | { k: 'erase'; pre: Snap; hit: boolean }
  | { k: 'move'; id: string; el: HTMLElement; p0: [number, number]; x0: number; y0: number; pre: Snap; moved: boolean; wasSel: boolean; touch: boolean; word?: string; group: { id: string; x0: number; y0: number }[] }
  | { k: 'box'; p0: [number, number]; el: HTMLDivElement }
  | { k: 'lasso'; pts: [number, number][] }
  | { k: 'smove'; p0: [number, number]; pre: Snap; orig: Map<string, InkPoint[]>; moved: boolean }
  | { k: 'sscale'; p0: [number, number]; pre: Snap; orig: Map<string, { pts: InkPoint[]; width: number }>; box: { x: number; y: number; w: number; h: number }; moved: boolean }
  | { k: 'resize'; id: string; el: HTMLElement; p0: [number, number]; w0: number; h0: number; pre: Snap; moved: boolean }
  | { k: 'link'; from: string };

export class SketchSurface {
  /** A blank sheet until the panel loads one. */
  private sketch: Sketch = { id: '', bookId: '', key: '', location: '', mode: 'draw', view: { tx: 24, ty: 24, s: 1 }, strokes: [], nodes: [], edges: [], createdAt: 0, updatedAt: 0 };
  private undoStack: Snap[] = [];
  private redoStack: Snap[] = [];
  private tool: DrawTool = 'pen';
  private dtool: DiagramTool = 'select';
  private color: InkColor = 'ink';
  private width = 2.5;
  private sel: string | null = null;
  /** Nodes selected besides `sel` (Shift-click, Shift-drag). */
  private multi = new Set<string>();
  /** Strokes the lasso holds (Freehand): moved, resized or deleted together. */
  private held = new Set<string>();
  private selEdge: string | null = null;
  private linkFrom: string | null = null;
  private editing: string | null = null;
  private act: Act | null = null;
  private pinch: { d: number; m: [number, number]; tx: number; ty: number; s: number } | null = null;
  private ptrs = new Map<number, [number, number]>();
  private penSeen = false;
  private spaceDown = false;

  private edgeG: SVGGElement;
  private inkG: SVGGElement;
  private liveG: SVGGElement;
  private live: SVGPathElement;
  private nodesEl: HTMLDivElement;

  private host: HTMLElement;
  private opts: Options;

  constructor(host: HTMLElement, opts: Options) {
    this.host = host;
    this.opts = opts;
    host.classList.add('sk-surface');
    host.innerHTML =
      `<svg class="sk-lay" aria-hidden="true"><defs>` +
      `<marker id="sk-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="sk-arrowhead"/></marker>` +
      `<marker id="sk-arr-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="sk-arrowhead sk-arrowhead--on"/></marker>` +
      `</defs><g class="sk-edges"></g></svg>` +
      `<div class="sk-nodes"></div>` +
      `<svg class="sk-lay" aria-hidden="true"><g class="sk-ink"></g><g class="sk-live"><path class="ink-stroke"/></g></svg>`;
    this.edgeG = host.querySelector('.sk-edges')!;
    this.nodesEl = host.querySelector('.sk-nodes')!;
    this.inkG = host.querySelector('.sk-ink')!;
    this.liveG = host.querySelector('.sk-live')!;
    this.live = this.liveG.querySelector('path')!;
    host.addEventListener('pointerdown', this.onDown);
    host.addEventListener('pointermove', this.onMove);
    host.addEventListener('pointerup', this.onUp);
    host.addEventListener('pointercancel', this.onUp);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    host.addEventListener('dblclick', this.onDbl);
    host.addEventListener('mouseover', this.onOver);
    host.addEventListener('mouseleave', this.onLeave);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy(): void {
    this.commitEdit();
    const host = this.host;
    host.removeEventListener('pointerdown', this.onDown);
    host.removeEventListener('pointermove', this.onMove);
    host.removeEventListener('pointerup', this.onUp);
    host.removeEventListener('pointercancel', this.onUp);
    host.removeEventListener('wheel', this.onWheel);
    host.removeEventListener('dblclick', this.onDbl);
    host.removeEventListener('mouseover', this.onOver);
    host.removeEventListener('mouseleave', this.onLeave);
    window.removeEventListener('keyup', this.onKeyUp);
    host.classList.remove('sk-surface', 'sk-surface--diagram', 'sk-surface--hand', 'sk-surface--erase');
    host.innerHTML = '';
  }

  // --- the sheet --------------------------------------------------------------------------------------
  load(sketch: Sketch): void {
    this.commitEdit();
    this.sketch = structuredClone(sketch);
    this.undoStack = [];
    this.redoStack = [];
    this.sel = this.selEdge = this.linkFrom = null;
    this.multi.clear();
    this.held.clear();
    this.act = null;
    this.render();
  }
  get current(): Sketch {
    return this.sketch;
  }

  private snap(): Snap {
    const { strokes, nodes, edges } = this.sketch;
    return JSON.stringify({ strokes, nodes, edges });
  }
  private pushUndo(pre: Snap): void {
    this.undoStack.push(pre);
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack = [];
  }
  private checkpoint(): void {
    this.pushUndo(this.snap());
  }
  private apply(s: Snap): void {
    Object.assign(this.sketch, JSON.parse(s));
    this.clearSel();
    this.changed();
  }
  undo(): void {
    const s = this.undoStack.pop();
    if (s === undefined) return;
    this.redoStack.push(this.snap());
    this.apply(s);
  }
  redo(): void {
    const s = this.redoStack.pop();
    if (s === undefined) return;
    this.undoStack.push(this.snap());
    this.apply(s);
  }
  private changed(): void {
    this.render();
    this.opts.onChange(this.sketch, true);
  }
  private viewChanged(): void {
    this.renderView();
    this.opts.onChange(this.sketch, false);
  }

  // --- settings from the panel ------------------------------------------------------------------------
  setMode(mode: Sketch['mode']): void {
    if (this.sketch.mode === mode) return;
    this.commitEdit();
    this.sketch.mode = mode;
    this.sel = this.selEdge = this.linkFrom = null;
    this.multi.clear();
    this.held.clear();
    this.render();
    this.opts.onChange(this.sketch, false);
  }
  setTool(tool: DrawTool): void {
    if (tool !== 'lasso') this.release();
    this.tool = tool;
    this.renderCursor();
  }
  setDiagramTool(tool: DiagramTool): void {
    this.dtool = tool;
    this.linkFrom = null;
    this.renderNodes();
    this.renderCursor();
  }
  setPen(color: InkColor, width: number): void {
    this.color = color;
    this.width = width;
  }
  setSpace(down: boolean): void {
    this.spaceDown = down;
    this.renderCursor();
  }

  // --- rendering --------------------------------------------------------------------------------------
  private render(): void {
    this.host.classList.toggle('sk-surface--diagram', this.sketch.mode === 'diagram');
    this.renderView();
    this.renderInk();
    this.renderNodes();
    this.renderEdges();
    this.renderCursor();
    this.emitState();
  }
  /** Every selected node. */
  private selected(): string[] {
    return [...new Set([...(this.sel ? [this.sel] : []), ...this.multi])].filter((id) => this.node(id));
  }
  private clearSel(): void {
    this.sel = this.selEdge = null;
    this.multi.clear();
    this.held.clear();
  }
  private emitState(): void {
    const e = this.selEdge ? this.sketch.edges.find((x) => x.id === this.selEdge) : undefined;
    const ids = this.selected();
    const colors = new Set(ids.map((id) => this.node(id)?.color ?? ''));
    this.opts.onState({
      mode: this.sketch.mode,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      zoom: this.sketch.view.s,
      empty: !this.sketch.strokes.length && !this.sketch.nodes.length,
      selected: !!(this.sel || this.selEdge || this.multi.size || this.held.size),
      node: this.sel,
      nodes: ids.length,
      strokes: this.held.size,
      nodeColor: colors.size === 1 ? [...colors][0] || null : null,
      edge: e ? { id: e.id, dir: e.dir } : null,
    });
  }
  private renderCursor(): void {
    const t = this.sketch?.mode === 'diagram' ? this.dtool : this.tool;
    this.host.classList.toggle('sk-surface--hand', t === 'hand' || this.spaceDown);
    this.host.classList.toggle('sk-surface--erase', this.sketch?.mode === 'draw' && t === 'eraser');
  }
  private renderView(): void {
    const v = this.sketch.view;
    const tf = `translate(${v.tx} ${v.ty}) scale(${v.s})`;
    this.edgeG.setAttribute('transform', tf);
    this.inkG.setAttribute('transform', tf);
    this.liveG.setAttribute('transform', tf);
    this.nodesEl.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
    this.host.style.backgroundSize = `${22 * v.s}px ${22 * v.s}px`;
    this.host.style.backgroundPosition = `${v.tx}px ${v.ty}px`;
    this.emitState();
  }
  private renderInk(): void {
    this.inkG.innerHTML =
      this.sketch.strokes
        .map((s) => `<path class="ink-stroke${s.marker ? ' ink-stroke--marker' : ''}${this.held.has(s.id) ? ' sk-held' : ''}" d="${pathD(s.pts)}" style="stroke:${this.opts.colors[s.color]};stroke-width:${s.width}"/>`)
        .join('') + this.heldBoxSvg();
  }
  /** The box around the strokes the lasso holds, in sheet units, with its resize handle. */
  private heldBox(): { x: number; y: number; w: number; h: number } | null {
    if (!this.held.size) return null;
    const strokes = this.sketch.strokes.filter((s) => this.held.has(s.id));
    const b = contentBox(strokes, []);
    if (!b) return null;
    const pad = 6;
    return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }
  private heldBoxSvg(): string {
    const b = this.heldBox();
    if (!b) return '';
    const k = 1 / this.sketch.view.s;
    return `<rect class="sk-heldbox" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" style="stroke-width:${k}"/><rect class="sk-heldbox__h" x="${b.x + b.w - 5 * k}" y="${b.y + b.h - 5 * k}" width="${10 * k}" height="${10 * k}"/>`;
  }
  /** Lets go of the lasso's strokes. */
  private release(): void {
    if (!this.held.size) return;
    this.held.clear();
    this.renderInk();
    this.emitState();
  }
  /** Deletes the strokes the lasso holds. */
  deleteHeld(): boolean {
    if (!this.held.size) return false;
    this.checkpoint();
    this.sketch.strokes = this.sketch.strokes.filter((s) => !this.held.has(s.id));
    this.held.clear();
    this.changed();
    return true;
  }
  private edgePath(e: SketchEdge): string | null {
    const a = this.node(e.a);
    const b = this.node(e.b);
    if (!a || !b) return null;
    const p1 = borderPoint(a, b, 2);
    const p2 = borderPoint(b, a, e.dir ? 4 : 2);
    return `M${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}`;
  }
  private renderEdges(tmp?: string): void {
    this.edgeG.innerHTML =
      this.sketch.edges
        .map((e) => {
          const d = this.edgePath(e);
          if (!d) return '';
          const on = this.selEdge === e.id;
          return `<path class="sk-edge${on ? ' sk-edge--on' : ''}" d="${d}"${e.dir ? ` marker-end="url(#${on ? 'sk-arr-on' : 'sk-arr'})"` : ''}/><path class="sk-edge-hit" data-id="${e.id}" d="${d}"/>`;
        })
        .join('') + (tmp ? `<path class="sk-edge sk-edge--tmp" d="${tmp}"/>` : '');
  }
  private renderNodes(): void {
    if (this.editing) return;
    this.nodesEl.innerHTML = this.sketch.nodes
      .map(
        (n) =>
          `<div class="sk-node sk-node--${n.kind}${this.sel === n.id || this.multi.has(n.id) ? ' sk-node--sel' : ''}${this.linkFrom === n.id ? ' sk-node--from' : ''}${n.color ? ' sk-node--tinted' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;min-height:${n.h}px${n.color ? `;--node-c:${esc(n.color)}` : ''}">` +
          (n.kind === 'quote' ? '<span class="sk-node__tag">Quote</span>' : n.kind === 'image' ? '<span class="sk-node__tag">Picture</span>' : '') +
          (n.location ? '<button type="button" class="sk-node__go" title="Go to it on the page" aria-label="Go to it on the page">↗</button>' : '') +
          (n.image ? `<img class="sk-node__img" src="${esc(n.image)}" alt="" draggable="false">` : '') +
          `<div class="sk-node__text" dir="auto">${n.kind === 'quote' ? quoteWords(n.text) : esc(n.text)}</div><span class="sk-port" title="Drag to connect"></span><span class="sk-resize"></span></div>`
      )
      .join('');
    // Connectors meet a node's real edge, so take the height its text needs.
    for (const el of this.nodesEl.children as HTMLCollectionOf<HTMLElement>) {
      const n = this.node(el.dataset.id!);
      if (n && el.offsetHeight && Math.abs(el.offsetHeight - n.h) > 0.5) n.h = el.offsetHeight;
    }
  }
  private node(id: string): SketchNode | undefined {
    return this.sketch.nodes.find((n) => n.id === id);
  }

  // --- geometry ---------------------------------------------------------------------------------------
  private local(e: { clientX: number; clientY: number }): [number, number] {
    const b = this.host.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  }
  private toWorld(p: [number, number]): [number, number] {
    const v = this.sketch.view;
    return [r1((p[0] - v.tx) / v.s), r1((p[1] - v.ty) / v.s)];
  }
  private centre(): [number, number] {
    return this.toWorld([this.host.clientWidth / 2, this.host.clientHeight / 2]);
  }
  zoomBy(f: number, at?: [number, number]): void {
    const v = this.sketch.view;
    const p = at ?? [this.host.clientWidth / 2, this.host.clientHeight / 2];
    const s = clamp(v.s * f, 0.25, 4);
    const wx = (p[0] - v.tx) / v.s;
    const wy = (p[1] - v.ty) / v.s;
    v.s = Math.round(s * 1000) / 1000;
    v.tx = r1(p[0] - wx * v.s);
    v.ty = r1(p[1] - wy * v.s);
    this.viewChanged();
  }
  fit(): void {
    const b = contentBox(this.sketch.strokes, this.sketch.nodes);
    const W = this.host.clientWidth;
    const H = this.host.clientHeight;
    if (!b) this.sketch.view = { tx: 24, ty: 24, s: 1 };
    else {
      const s = clamp(Math.min((W - 60) / Math.max(b.w, 1), (H - 60) / Math.max(b.h, 1)), 0.25, 2);
      this.sketch.view = { s: Math.round(s * 1000) / 1000, tx: r1(W / 2 - (b.x + b.w / 2) * s), ty: r1(H / 2 - (b.y + b.h / 2) * s) };
    }
    this.viewChanged();
  }

  // --- diagram actions ----------------------------------------------------------------------------------
  addNode(at?: [number, number], text = '', kind: SketchNodeKind = 'plain', location?: string, extra: Partial<SketchNode> = {}): void {
    this.commitEdit();
    const c = at ?? this.centre();
    const k = this.sketch.nodes.length % 6;
    const w = kind === 'image' ? 210 : kind === 'quote' ? 190 : 160;
    this.checkpoint();
    const id = newId('node');
    this.sketch.nodes.push({ id, x: r1(c[0] - w / 2 + (at ? 0 : k * 12)), y: r1(c[1] - 26 + (at ? 0 : k * 12)), w, h: 52, text, kind, ...(location ? { location } : {}), ...extra });
    this.sel = id;
    this.selEdge = null;
    this.changed();
    if (!text && kind !== 'image') this.startEdit(id, true);
  }
  deleteSelection(): void {
    if (this.selEdge) {
      this.checkpoint();
      this.sketch.edges = this.sketch.edges.filter((e) => e.id !== this.selEdge);
      this.selEdge = null;
      this.changed();
    } else if (this.sel || this.multi.size) {
      const ids = new Set(this.selected());
      this.checkpoint();
      this.sketch.nodes = this.sketch.nodes.filter((n) => !ids.has(n.id));
      this.sketch.edges = this.sketch.edges.filter((e) => !ids.has(e.a) && !ids.has(e.b));
      this.clearSel();
      this.changed();
    }
  }
  /** Tints every selected node (null: the plain box). */
  setNodeColor(color: string | null): void {
    const ids = this.selected();
    if (!ids.length) return;
    this.checkpoint();
    for (const id of ids) {
      const n = this.node(id)!;
      if (color) n.color = color;
      else delete n.color;
    }
    this.changed();
  }

  /**
   * Lays the diagram out as a tree, top to bottom: nodes nothing points to first, then each connector's other end
   * a row lower (in the order of their parents), every row centred; loose nodes in a last row.
   */
  tidy(): void {
    const nodes = this.sketch.nodes;
    if (!nodes.length) return;
    this.checkpoint();
    const kids = new Map<string, string[]>();
    const incoming = new Set<string>();
    for (const e of this.sketch.edges) {
      if (!kids.has(e.a)) kids.set(e.a, []);
      kids.get(e.a)!.push(e.b);
      incoming.add(e.b);
    }
    const linked = new Set(this.sketch.edges.flatMap((e) => [e.a, e.b]));
    const byX = (a: string, b: string) => this.node(a)!.x - this.node(b)!.x;
    let row = nodes.filter((n) => linked.has(n.id) && !incoming.has(n.id)).map((n) => n.id).sort(byX);
    if (!row.length && linked.size) row = [nodes.find((n) => linked.has(n.id))!.id];
    const placed = new Set<string>();
    const rows: string[][] = [];
    while (row.length) {
      row = row.filter((id) => !placed.has(id));
      row.forEach((id) => placed.add(id));
      if (row.length) rows.push(row);
      row = row.flatMap((id) => kids.get(id) ?? []).filter((id, i, all) => !placed.has(id) && all.indexOf(id) === i);
    }
    const rest = nodes.filter((n) => !placed.has(n.id)).map((n) => n.id).sort(byX);
    if (rest.length) rows.push(rest);
    const cx = this.centre()[0];
    let y = Math.min(...nodes.map((n) => n.y));
    for (const r of rows) {
      const ws = r.map((id) => this.node(id)!.w);
      const total = ws.reduce((a, b) => a + b, 0) + (r.length - 1) * 36;
      let x = cx - total / 2;
      let tallest = 0;
      r.forEach((id) => {
        const n = this.node(id)!;
        n.x = r1(x);
        n.y = r1(y);
        x += n.w + 36;
        tallest = Math.max(tallest, n.h);
      });
      y += tallest + 64;
    }
    this.changed();
    this.fit();
  }

  /** Adds a ready-made diagram (a template) around the middle of the view; its first node is selected. */
  addTemplate(nodes: { text: string; kind?: SketchNodeKind; x: number; y: number }[], edges: [number, number][]): void {
    this.commitEdit();
    if (this.sketch.mode !== 'diagram') this.setMode('diagram');
    this.checkpoint();
    const c = this.centre();
    const ids = nodes.map(() => newId('node'));
    nodes.forEach((n, i) => this.sketch.nodes.push({ id: ids[i], x: r1(c[0] + n.x - 80), y: r1(c[1] + n.y - 26), w: 160, h: 52, text: n.text, kind: n.kind ?? 'plain' }));
    for (const [a, b] of edges) this.sketch.edges.push({ id: newId('edge'), a: ids[a], b: ids[b], dir: true });
    this.clearSel();
    this.sel = ids[0];
    this.changed();
    this.fit();
  }

  toggleArrow(): void {
    const e = this.sketch.edges.find((x) => x.id === this.selEdge);
    if (!e) return;
    this.checkpoint();
    e.dir = !e.dir;
    this.changed();
  }
  editSelected(): void {
    if (this.sel) this.startEdit(this.sel, false);
  }
  cancelLink(): boolean {
    if (!this.linkFrom) return false;
    this.linkFrom = null;
    this.renderNodes();
    return true;
  }
  private addEdge(a: string, b: string): void {
    if (a === b || this.sketch.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) {
      this.renderNodes();
      this.renderEdges();
      return;
    }
    this.checkpoint();
    const id = newId('edge');
    this.sketch.edges.push({ id, a, b, dir: true });
    this.selEdge = id;
    this.sel = null;
    this.changed();
  }
  private startEdit(id: string, fresh: boolean): void {
    const el = this.nodesEl.querySelector<HTMLElement>(`[data-id="${id}"]`);
    const n = this.node(id);
    if (!el || !n) return;
    const pre = this.snap();
    const before = n.text;
    this.editing = id;
    this.sel = id;
    el.classList.add('sk-node--editing', 'sk-node--sel');
    const t = el.querySelector<HTMLElement>('.sk-node__text')!;
    t.contentEditable = 'true';
    t.focus();
    const range = document.createRange();
    range.selectNodeContents(t);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
    t.onkeydown = (ev) => {
      ev.stopPropagation();
      if ((ev.key === 'Enter' && !ev.shiftKey) || ev.key === 'Escape') {
        ev.preventDefault();
        t.blur();
      }
    };
    t.onblur = () => {
      t.onblur = null;
      t.contentEditable = 'false';
      this.editing = null;
      const node = this.node(id);
      if (!node) return;
      const next = t.innerText.replace(/ /g, ' ').trim() || before || 'Untitled';
      if (next !== before) {
        if (!fresh) this.pushUndo(pre);
        node.text = next;
        this.changed();
      } else {
        this.renderNodes();
        this.renderEdges();
      }
    };
  }
  private commitEdit(): void {
    if (!this.editing) return;
    this.nodesEl.querySelector<HTMLElement>('.sk-node--editing .sk-node__text')?.blur();
  }

  // --- pointer input ----------------------------------------------------------------------------------
  private onDown = (e: PointerEvent): void => {
    const target = e.target as Element;
    if (target.closest('.sk-zoom')) return;
    const go = target.closest<HTMLElement>('.sk-node__go');
    if (go) {
      e.preventDefault();
      e.stopPropagation();
      const n = this.node(go.closest<HTMLElement>('.sk-node')?.dataset.id ?? '');
      if (n) this.opts.onGo?.(n);
      return;
    }
    if (this.editing && target.closest('.sk-node--editing')) return;
    this.commitEdit();
    if (e.pointerType === 'pen' && !this.penSeen) {
      this.penSeen = true;
      setInkUi({ penSeen: true });
    }
    this.ptrs.set(e.pointerId, this.local(e));
    try {
      this.host.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety.
    }
    if (this.ptrs.size === 2) {
      this.abort();
      const [a, b] = [...this.ptrs.values()];
      const v = this.sketch.view;
      this.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tx: v.tx, ty: v.ty, s: v.s };
      return;
    }
    if (this.ptrs.size > 2) return;
    e.preventDefault();
    const p = this.local(e);
    const v = this.sketch.view;
    const mode = this.sketch.mode;
    let pan =
      e.button === 1 ||
      this.spaceDown ||
      (mode === 'draw' ? this.tool === 'hand' : this.dtool === 'hand') ||
      (mode === 'draw' && e.pointerType === 'touch' && this.penSeen);
    if (mode === 'diagram' && !pan) {
      const nodeEl = target.closest<HTMLElement>('.sk-node');
      const hit = target.closest<SVGElement>('.sk-edge-hit');
      if (nodeEl) return this.nodeDown(e, nodeEl, p);
      if (hit) {
        this.selEdge = hit.dataset.id ?? null;
        this.sel = null;
        this.multi.clear();
        this.renderNodes();
        this.renderEdges();
        this.emitState();
        return;
      }
      if (e.shiftKey && this.dtool === 'select') {
        // Shift-drag on the sheet: a box that selects the nodes it touches.
        const el = document.createElement('div');
        el.className = 'sk-marquee';
        this.host.appendChild(el);
        this.act = { k: 'box', p0: p, el };
        return;
      }
      if (this.sel || this.selEdge || this.linkFrom || this.multi.size) {
        this.sel = this.selEdge = this.linkFrom = null;
        this.multi.clear();
        this.renderNodes();
        this.renderEdges();
        this.emitState();
      }
      pan = true;
    }
    if (pan) {
      this.act = { k: 'pan', p0: p, tx: v.tx, ty: v.ty };
      this.host.classList.add('sk-surface--panning');
      return;
    }
    // The lasso's strokes: drag inside their box to move them, its corner to resize them.
    const held = this.heldBox();
    if (held) {
      const w = this.toWorld(p);
      const k = 1 / v.s;
      const onHandle = Math.abs(w[0] - (held.x + held.w)) < 9 * k && Math.abs(w[1] - (held.y + held.h)) < 9 * k;
      const inside = w[0] >= held.x && w[0] <= held.x + held.w && w[1] >= held.y && w[1] <= held.y + held.h;
      const strokes = this.sketch.strokes.filter((s) => this.held.has(s.id));
      if (onHandle) {
        this.act = { k: 'sscale', p0: w, pre: this.snap(), orig: new Map(strokes.map((s) => [s.id, { pts: s.pts.map((q) => [...q] as InkPoint), width: s.width }])), box: held, moved: false };
        return;
      }
      if (inside) {
        this.act = { k: 'smove', p0: w, pre: this.snap(), orig: new Map(strokes.map((s) => [s.id, s.pts.map((q) => [...q] as InkPoint)])), moved: false };
        return;
      }
      this.release();
    }
    if (this.tool === 'lasso') {
      this.act = { k: 'lasso', pts: [this.toWorld(p)] };
      this.live.style.stroke = 'var(--accent)';
      this.live.style.strokeWidth = String(1.2 / v.s);
      this.live.setAttribute('class', 'ink-stroke sk-lasso-line');
      this.live.setAttribute('d', pathD(this.act.pts));
      return;
    }
    if (this.tool === 'pen' || this.tool === 'marker') {
      const w = this.toWorld(p);
      const marker = this.tool === 'marker';
      this.act = { k: 'ink', pts: [[w[0], w[1], e.pressure || 0.5]], pen: e.pointerType === 'pen' };
      this.live.setAttribute('class', 'ink-stroke' + (marker ? ' ink-stroke--marker' : ''));
      this.live.style.stroke = this.opts.colors[this.color];
      this.live.style.strokeWidth = String(marker ? MARKER_WIDTH : this.width);
      this.live.setAttribute('d', pathD(this.act.pts));
      this.host.classList.add('sk-surface--writing');
    } else if (this.tool === 'eraser') {
      this.act = { k: 'erase', pre: this.snap(), hit: false };
      this.eraseAt(p);
    }
  };

  private nodeDown(e: PointerEvent, el: HTMLElement, p: [number, number]): void {
    const id = el.dataset.id!;
    const n = this.node(id);
    if (!n) return;
    const target = e.target as Element;
    if (this.dtool === 'link') {
      if (!this.linkFrom) {
        this.linkFrom = id;
        this.renderNodes();
      } else if (this.linkFrom !== id) {
        const from = this.linkFrom;
        this.linkFrom = null;
        this.addEdge(from, id);
      } else this.cancelLink();
      return;
    }
    if (target.classList.contains('sk-port')) {
      this.act = { k: 'link', from: id };
      return;
    }
    const pre = this.snap();
    if (target.classList.contains('sk-resize')) {
      this.act = { k: 'resize', id, el, p0: p, w0: n.w, h0: n.h, pre, moved: false };
      return;
    }
    // Shift-click adds the node to the selection, or takes it out.
    if (e.shiftKey) {
      if (this.sel === id || this.multi.has(id)) {
        this.multi.delete(id);
        if (this.sel === id) this.sel = [...this.multi][0] ?? null;
        if (this.sel) this.multi.delete(this.sel);
      } else if (this.sel) this.multi.add(id);
      else this.sel = id;
      this.selEdge = null;
      this.renderNodes();
      this.renderEdges();
      this.emitState();
      return;
    }
    const wasSel = this.sel === id || this.multi.has(id);
    if (!wasSel) {
      this.sel = id;
      this.selEdge = null;
      this.multi.clear();
      this.nodesEl.querySelectorAll('.sk-node--sel').forEach((x) => x.classList.remove('sk-node--sel'));
      el.classList.add('sk-node--sel');
      this.renderEdges();
      this.emitState();
    }
    // Dragging one of several selected nodes moves them all.
    const group = this.selected()
      .filter((x) => x !== id)
      .map((x) => ({ id: x, x0: this.node(x)!.x, y0: this.node(x)!.y }));
    const word = n.kind === 'quote' ? target.closest<HTMLElement>('.sk-w')?.textContent ?? undefined : undefined;
    this.act = { k: 'move', id, el, p0: p, x0: n.x, y0: n.y, pre, moved: false, wasSel: this.sel === id && wasSel, touch: e.pointerType !== 'mouse', word, group };
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.set(e.pointerId, this.local(e));
    const v = this.sketch.view;
    if (this.pinch && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const s = clamp((this.pinch.s * d) / this.pinch.d, 0.25, 4);
      const wx = (this.pinch.m[0] - this.pinch.tx) / this.pinch.s;
      const wy = (this.pinch.m[1] - this.pinch.ty) / this.pinch.s;
      v.s = Math.round(s * 1000) / 1000;
      v.tx = r1(m[0] - wx * s);
      v.ty = r1(m[1] - wy * s);
      this.renderView();
      return;
    }
    const a = this.act;
    if (!a) return;
    const p = this.local(e);
    switch (a.k) {
      case 'pan':
        v.tx = r1(a.tx + p[0] - a.p0[0]);
        v.ty = r1(a.ty + p[1] - a.p0[1]);
        this.renderView();
        break;
      case 'ink': {
        const events = e.getCoalescedEvents?.() ?? [];
        for (const ev of events.length ? events : [e]) {
          const w = this.toWorld(this.local(ev));
          const last = a.pts[a.pts.length - 1];
          if (Math.hypot(w[0] - last[0], w[1] - last[1]) * v.s >= 1.5) a.pts.push([w[0], w[1], Math.round((ev.pressure || 0.5) * 100) / 100]);
        }
        this.live.setAttribute('d', pathD(a.pts));
        break;
      }
      case 'erase':
        this.eraseAt(p);
        break;
      case 'move': {
        if (!a.moved && Math.hypot(p[0] - a.p0[0], p[1] - a.p0[1]) < 3) return;
        a.moved = true;
        const n = this.node(a.id)!;
        const dx = (p[0] - a.p0[0]) / v.s;
        const dy = (p[1] - a.p0[1]) / v.s;
        n.x = r1(a.x0 + dx);
        n.y = r1(a.y0 + dy);
        a.el.style.left = `${n.x}px`;
        a.el.style.top = `${n.y}px`;
        for (const g of a.group) {
          const m = this.node(g.id);
          const gel = this.nodesEl.querySelector<HTMLElement>(`[data-id="${g.id}"]`);
          if (!m) continue;
          m.x = r1(g.x0 + dx);
          m.y = r1(g.y0 + dy);
          if (gel) {
            gel.style.left = `${m.x}px`;
            gel.style.top = `${m.y}px`;
          }
        }
        this.renderEdges();
        break;
      }
      case 'lasso': {
        a.pts.push(this.toWorld(p));
        this.live.setAttribute('d', pathD(a.pts) + 'Z');
        break;
      }
      case 'smove': {
        const w = this.toWorld(p);
        const dx = w[0] - a.p0[0];
        const dy = w[1] - a.p0[1];
        if (!a.moved && Math.hypot(dx, dy) * v.s < 2) break;
        a.moved = true;
        for (const s of this.sketch.strokes) {
          const o = a.orig.get(s.id);
          if (o) s.pts = o.map(([x, y, q]) => [r1(x + dx), r1(y + dy), q]);
        }
        this.renderInk();
        break;
      }
      case 'sscale': {
        const w = this.toWorld(p);
        const f = Math.max(0.2, Math.min((w[0] - a.box.x) / Math.max(1, a.box.w), (w[1] - a.box.y) / Math.max(1, a.box.h)));
        a.moved = true;
        for (const s of this.sketch.strokes) {
          const o = a.orig.get(s.id);
          if (!o) continue;
          s.pts = o.pts.map(([x, y, q]) => [r1(a.box.x + (x - a.box.x) * f), r1(a.box.y + (y - a.box.y) * f), q]);
          s.width = Math.round(o.width * f * 1000) / 1000;
        }
        this.renderInk();
        break;
      }
      case 'box': {
        const x = Math.min(a.p0[0], p[0]);
        const y = Math.min(a.p0[1], p[1]);
        Object.assign(a.el.style, { left: `${x}px`, top: `${y}px`, width: `${Math.abs(p[0] - a.p0[0])}px`, height: `${Math.abs(p[1] - a.p0[1])}px` });
        break;
      }
      case 'resize': {
        const n = this.node(a.id)!;
        n.w = r1(Math.max(90, a.w0 + (p[0] - a.p0[0]) / v.s));
        n.h = r1(Math.max(40, a.h0 + (p[1] - a.p0[1]) / v.s));
        a.el.style.width = `${n.w}px`;
        a.el.style.minHeight = `${n.h}px`;
        a.moved = true;
        this.renderEdges();
        break;
      }
      case 'link': {
        const n = this.node(a.from)!;
        const w = this.toWorld(p);
        this.renderEdges(`M${r1(n.x + n.w)} ${r1(n.y + n.h / 2)}L${w[0]} ${w[1]}`);
        break;
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId);
    if (this.pinch) {
      if (this.ptrs.size < 2) {
        this.pinch = null;
        this.opts.onChange(this.sketch, false);
      }
      return;
    }
    const a = this.act;
    if (!a) return;
    this.act = null;
    this.host.classList.remove('sk-surface--panning', 'sk-surface--writing');
    switch (a.k) {
      case 'pan':
        this.opts.onChange(this.sketch, false);
        break;
      case 'ink': {
        this.live.setAttribute('d', '');
        this.checkpoint();
        const marker = this.tool === 'marker';
        this.sketch.strokes.push({ id: newId('sks'), color: this.color, width: marker ? MARKER_WIDTH : pressureWidth(this.width, a.pts, a.pen), pts: a.pts, ...(marker ? { marker: true } : {}) });
        this.changed();
        break;
      }
      case 'lasso': {
        this.live.setAttribute('d', '');
        this.live.setAttribute('class', 'ink-stroke');
        // Strokes with most of their points inside the loop.
        const poly = a.pts;
        this.held = new Set(this.sketch.strokes.filter((s) => s.pts.filter((q) => inPolygon(q[0], q[1], poly)).length * 2 >= s.pts.length).map((s) => s.id));
        this.renderInk();
        this.emitState();
        break;
      }
      case 'smove':
      case 'sscale':
        if (a.moved) {
          this.pushUndo(a.pre);
          this.changed();
        }
        break;
      case 'erase':
        if (a.hit) this.changed();
        break;
      case 'box': {
        const r = a.el.getBoundingClientRect();
        a.el.remove();
        const hits = [...this.nodesEl.children as HTMLCollectionOf<HTMLElement>]
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
          })
          .map((el) => el.dataset.id!);
        if (hits.length) {
          if (!this.sel) this.sel = hits.shift()!;
          hits.forEach((id) => id !== this.sel && this.multi.add(id));
          this.selEdge = null;
          this.renderNodes();
          this.renderEdges();
          this.emitState();
        }
        break;
      }
      case 'move':
      case 'resize':
        if (a.moved) {
          this.pushUndo(a.pre);
          this.changed();
        } else if (a.k === 'move' && a.wasSel && a.word) this.opts.onWord?.(a.word);
        else if (a.k === 'move' && a.wasSel && a.touch) this.startEdit(a.id, false);
        break;
      case 'link': {
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.sk-node');
        if (over && over.dataset.id !== a.from) this.addEdge(a.from, over.dataset.id!);
        else this.renderEdges();
        break;
      }
    }
  };

  private abort(): void {
    if (this.act?.k === 'ink') this.live.setAttribute('d', '');
    if (this.act?.k === 'box') this.act.el.remove();
    this.act = null;
    this.host.classList.remove('sk-surface--panning', 'sk-surface--writing');
  }

  private eraseAt(p: [number, number]): void {
    const a = this.act;
    if (!a || a.k !== 'erase') return;
    const [x, y] = this.toWorld(p);
    const r = 9 / this.sketch.view.s;
    const kept = this.sketch.strokes.filter((s) => !hitStroke(s.pts, s.width, x, y, r));
    if (kept.length === this.sketch.strokes.length) return;
    if (!a.hit) {
      this.pushUndo(a.pre);
      a.hit = true;
    }
    this.sketch.strokes = kept;
    this.renderInk();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) this.zoomBy(Math.exp(-e.deltaY * 0.01), this.local(e));
    else {
      const v = this.sketch.view;
      v.tx = r1(v.tx - e.deltaX);
      v.ty = r1(v.ty - e.deltaY);
      this.viewChanged();
    }
  };

  private onDbl = (e: MouseEvent): void => {
    if (this.sketch.mode !== 'diagram' || (e.target as Element).closest('.sk-zoom')) return;
    const n = (e.target as Element).closest<HTMLElement>('.sk-node');
    if (n) this.startEdit(n.dataset.id!, false);
    else {
      const w = this.toWorld(this.local(e));
      this.addNode([w[0] + 80, w[1]]);
    }
  };

  private hovered: string | null = null;
  private onOver = (e: MouseEvent): void => {
    const el = (e.target as Element).closest<HTMLElement>('.sk-node');
    const id = el?.dataset.id ?? null;
    if (id === this.hovered) return;
    this.hovered = id;
    this.opts.onHoverNode?.(id ? this.node(id) ?? null : null, el ?? null);
  };
  private onLeave = (): void => {
    if (!this.hovered) return;
    this.hovered = null;
    this.opts.onHoverNode?.(null, null);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.spaceDown) this.setSpace(false);
  };
}
