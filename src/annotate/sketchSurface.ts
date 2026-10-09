import { newId } from '../utils/id';
import { borderPoint, clamp, contentBox, hitStroke, pathD, pressureWidth, r1 } from './geometry';
import { setInkUi } from './inkUi';
import type { InkColor, InkPoint, Sketch, SketchEdge, SketchNode, SketchNodeKind } from './types';

/**
 * The sketch sheet's drawing surface, kept out of React: pointer input runs at stylus rates and the sheet is
 * redrawn directly. Freehand strokes and the diagram (nodes, connectors) share one surface and one coordinate
 * space; panning and zooming change only the view. The panel (SketchPanel.tsx) owns the buttons and calls in.
 */

export type DrawTool = 'pen' | 'eraser' | 'hand';
export type DiagramTool = 'select' | 'link' | 'hand';

export interface SurfaceState {
  mode: Sketch['mode'];
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  empty: boolean;
  selected: boolean;
  /** The selected connector, and whether it has an arrow. */
  edge: { id: string; dir: boolean } | null;
}

interface Options {
  colors: Record<InkColor, string>;
  /** The sheet changed (content, mode or view); the panel saves it. `content` is false for view-only changes. */
  onChange(sketch: Sketch, content: boolean): void;
  onState(state: SurfaceState): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
type Snap = string;

type Act =
  | { k: 'pan'; p0: [number, number]; tx: number; ty: number }
  | { k: 'ink'; pts: InkPoint[]; pen: boolean }
  | { k: 'erase'; pre: Snap; hit: boolean }
  | { k: 'move'; id: string; el: HTMLElement; p0: [number, number]; x0: number; y0: number; pre: Snap; moved: boolean; wasSel: boolean; touch: boolean }
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
    this.sel = this.selEdge = null;
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
    this.render();
    this.opts.onChange(this.sketch, false);
  }
  setTool(tool: DrawTool): void {
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
  private emitState(): void {
    const e = this.selEdge ? this.sketch.edges.find((x) => x.id === this.selEdge) : undefined;
    this.opts.onState({
      mode: this.sketch.mode,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      zoom: this.sketch.view.s,
      empty: !this.sketch.strokes.length && !this.sketch.nodes.length,
      selected: !!(this.sel || this.selEdge),
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
    this.inkG.innerHTML = this.sketch.strokes
      .map((s) => `<path class="ink-stroke" d="${pathD(s.pts)}" style="stroke:${this.opts.colors[s.color]};stroke-width:${s.width}"/>`)
      .join('');
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
          `<div class="sk-node sk-node--${n.kind}${this.sel === n.id ? ' sk-node--sel' : ''}${this.linkFrom === n.id ? ' sk-node--from' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;min-height:${n.h}px">` +
          (n.kind === 'quote' ? '<span class="sk-node__tag">Quote</span>' : '') +
          `<div class="sk-node__text" dir="auto">${esc(n.text)}</div><span class="sk-port" title="Drag to connect"></span><span class="sk-resize"></span></div>`
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
  addNode(at?: [number, number], text = '', kind: SketchNodeKind = 'plain', location?: string): void {
    this.commitEdit();
    const c = at ?? this.centre();
    const k = this.sketch.nodes.length % 6;
    const w = kind === 'quote' ? 190 : 160;
    this.checkpoint();
    const id = newId('node');
    this.sketch.nodes.push({ id, x: r1(c[0] - w / 2 + (at ? 0 : k * 12)), y: r1(c[1] - 26 + (at ? 0 : k * 12)), w, h: 52, text, kind, ...(location ? { location } : {}) });
    this.sel = id;
    this.selEdge = null;
    this.changed();
    if (!text) this.startEdit(id, true);
  }
  deleteSelection(): void {
    if (this.selEdge) {
      this.checkpoint();
      this.sketch.edges = this.sketch.edges.filter((e) => e.id !== this.selEdge);
      this.selEdge = null;
      this.changed();
    } else if (this.sel) {
      const id = this.sel;
      this.checkpoint();
      this.sketch.nodes = this.sketch.nodes.filter((n) => n.id !== id);
      this.sketch.edges = this.sketch.edges.filter((e) => e.a !== id && e.b !== id);
      this.sel = null;
      this.changed();
    }
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
        this.renderNodes();
        this.renderEdges();
        this.emitState();
        return;
      }
      if (this.sel || this.selEdge || this.linkFrom) {
        this.sel = this.selEdge = this.linkFrom = null;
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
    if (this.tool === 'pen') {
      const w = this.toWorld(p);
      this.act = { k: 'ink', pts: [[w[0], w[1], e.pressure || 0.5]], pen: e.pointerType === 'pen' };
      this.live.style.stroke = this.opts.colors[this.color];
      this.live.style.strokeWidth = String(this.width);
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
    const wasSel = this.sel === id;
    if (!wasSel) {
      this.sel = id;
      this.selEdge = null;
      this.nodesEl.querySelectorAll('.sk-node--sel').forEach((x) => x.classList.remove('sk-node--sel'));
      el.classList.add('sk-node--sel');
      this.renderEdges();
      this.emitState();
    }
    this.act = { k: 'move', id, el, p0: p, x0: n.x, y0: n.y, pre, moved: false, wasSel, touch: e.pointerType !== 'mouse' };
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
        n.x = r1(a.x0 + (p[0] - a.p0[0]) / v.s);
        n.y = r1(a.y0 + (p[1] - a.p0[1]) / v.s);
        a.el.style.left = `${n.x}px`;
        a.el.style.top = `${n.y}px`;
        this.renderEdges();
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
      case 'ink':
        this.live.setAttribute('d', '');
        this.checkpoint();
        this.sketch.strokes.push({ id: newId('sks'), color: this.color, width: pressureWidth(this.width, a.pts, a.pen), pts: a.pts });
        this.changed();
        break;
      case 'erase':
        if (a.hit) this.changed();
        break;
      case 'move':
      case 'resize':
        if (a.moved) {
          this.pushUndo(a.pre);
          this.changed();
        } else if (a.k === 'move' && a.wasSel && a.touch) this.startEdit(a.id, false);
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

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.spaceDown) this.setSpace(false);
  };
}
