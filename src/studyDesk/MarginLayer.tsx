import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isCleanLocation } from '../quietReader/location';
import { getReaderMarks } from '../readerChords';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta, ReaderPreferences } from '../types';
import { vocabularyService } from '../vocabulary';
import { deleteItem, patchItems, restoreItems, turnItemIntoHeading, updateItem } from './deskStore';
import { cleanLocationNearY, rectsOfCleanLocation } from './pageGeometry';
import { capture, TYPE_LABEL, useDeskImage, type DeskData } from './useDesk';
import { shownInDocument } from './DeskDocument';
import { attachImage, carriesFiles, imageIn } from './marginImages';
import type { DeskItem, DeskItemType, DeskPin } from './types';
import { MarginRing, marginActions, useRingTrigger, type DeskCommands, type RingAction, type RingState } from './MarginRing';
import { fromOtherBooks, groupOf, groupPiles, isBeneath, planName, planPile, planPileMany, planUnpile, shortLabel, undoPatches, type ItemPatch } from './piles';
import { PileFan } from './PileFan';
import './marginLayer.css';

/**
 * The desk in the quiet reader's margins (Alt+M). Items whose place is on the visible page sit beside it,
 * joined to the page edge by a thin line. Double-tap empty margin space to write: a plain note tied to the
 * line beside it, which can later be turned into something else. Works from the page's geometry only
 * (see pageGeometry.ts); the reader itself is not changed.
 */

type Side = 'left' | 'right';
interface Geo {
  stage: DOMRect;
  column: DOMRect;
}
interface Placed {
  item: DeskItem;
  side: Side;
  /** Viewport y of the line it belongs to. */
  y: number;
  rects: DOMRect[];
}

const EDGE = 64; // keeps clear of the page-turn buttons
/** How long a dragged card rests on another before dropping piles it; dropping sooner moves it. */
const HOLD_MS = 300;
const GUTTER = 28;
const MIN_SIDE = 140;
/** How far the page moves from the edge for one-sided margins (marginLayer.css). */
const SHIFT = 72;
const TURN: { type: DeskItemType | 'heading'; label: string }[] = [
  { type: 'line', label: 'Plain' },
  { type: 'note', label: 'Note' },
  { type: 'question', label: 'Question' },
  { type: 'concept', label: 'Concept' },
  { type: 'card', label: 'Flashcard' },
  { type: 'heading', label: 'Heading' },
];

function readGeo(): Geo | null {
  const stage = document.querySelector<HTMLElement>('.qr-stage');
  const column = document.querySelector<HTMLElement>('.qr-column');
  if (!stage || !column || document.querySelector('.qr--narrow')) return null;
  return { stage: stage.getBoundingClientRect(), column: column.getBoundingClientRect() };
}

/** Re-measures the page whenever it moves: scrolling, page turns, resizing, chapters changing. */
function useGeometry(): [Geo | null, number, () => void] {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [tick, setTick] = useState(0);
  const measureRef = useRef<() => void>(() => {});
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setGeo(readGeo());
        setTick((t) => t + 1);
      });
    };
    measureRef.current = measure;
    let observed: Element | null = null;
    const mo = new MutationObserver(measure);
    // The page also moves without any change inside the reader: the app sidebar folding away (Focus), panels
    // opening beside it. Size changes of the stage and column, and the end of any transition, catch those.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const attach = () => {
      const root = document.querySelector('.qr');
      if (root && root !== observed) {
        mo.disconnect();
        ro?.disconnect();
        mo.observe(root, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });
        ro?.observe(root);
        const stage = root.querySelector('.qr-stage');
        const column = root.querySelector('.qr-column');
        if (stage) ro?.observe(stage);
        if (column) ro?.observe(column);
        observed = root;
        measure();
      }
    };
    document.addEventListener('transitionend', measure, true);
    attach();
    const poll = window.setInterval(attach, 800);
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      mo.disconnect();
      ro?.disconnect();
      document.removeEventListener('transitionend', measure, true);
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
    };
  }, []);
  const remeasure = useCallback(() => measureRef.current(), []);
  return [geo, tick, remeasure];
}

function visibleRects(location: string, geo: Geo): DOMRect[] {
  return rectsOfCleanLocation(location).filter(
    (r) => r.right > geo.column.left - 2 && r.left < geo.column.right + 2 && r.bottom > geo.stage.top && r.top < geo.stage.bottom && r.width + r.height > 0
  );
}

interface Props {
  book: BookMeta;
  data: DeskData;
  /** With `undo`, the message offers Undo (piles made, cards taken off one, cards deleted). */
  onToast(m: string, undo?: () => Promise<void>): void;
  onOpenDocument(itemId?: string): void;
  /** For the right-click ring (MarginRing.tsx). */
  commands: DeskCommands;
}

/** Several plans for the same items, merged (later ones win field by field). */
function mergePatches(...lists: ItemPatch[][]): ItemPatch[] {
  const byId = new Map<string, ItemPatch['patch']>();
  for (const { id, patch } of lists.flat()) byId.set(id, { ...byId.get(id), ...patch });
  return [...byId].map(([id, patch]) => ({ id, patch }));
}

export function MarginLayer({ book, data, onToast, onOpenDocument, commands }: Props) {
  const { prefs, updatePrefs } = usePreferences();
  const chosen = prefs.studyDeskMargins;
  const [geo, tick, remeasure] = useGeometry();
  // "Both sides" on a window too narrow for two margins: move the page over and use one wide margin.
  // Decided per window width only: the reader's own panels (Focus hiding the sidebar, the drawer) come and go,
  // and re-deciding on each would move the page under the reader's pointer.
  const [fallback, setFallback] = useState<{ width: number; on: boolean } | null>(null);
  useEffect(() => {
    if (chosen !== 'both' || !geo) return;
    if (fallback && fallback.width === window.innerWidth) return;
    const free = geo.stage.width - geo.column.width;
    const each = free / 2 - EDGE - GUTTER;
    setFallback({ width: window.innerWidth, on: each < MIN_SIDE && free - SHIFT - EDGE - GUTTER >= MIN_SIDE });
  }, [chosen, geo, fallback]);
  const mode = chosen === 'both' && fallback?.on ? 'right' : chosen;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Right-click (or long-press) empty margin space: the ring of shortcuts.
  const [ring, setRing] = useState<RingState | null>(null);
  const areaRing = useRingTrigger((x, y, el) => {
    const side = (el.dataset.side as Side) || 'right';
    setRing({ x, y, title: 'Margin', actions: marginActions(commands, () => void startNote(side, y), () => setSettingsOpen(true)) });
  });
  const layerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Shift the page for one-sided margins (CSS in marginLayer.css).
  useEffect(() => {
    const cls = mode === 'right' ? 'sd-margins--right' : mode === 'left' ? 'sd-margins--left' : null;
    if (cls) document.body.classList.add(cls);
    remeasure();
    return () => {
      if (cls) document.body.classList.remove(cls);
    };
  }, [mode, remeasure]);

  const sides = useMemo(() => {
    if (!geo) return null;
    const left = { from: geo.stage.left + EDGE, to: geo.column.left - GUTTER };
    const right = { from: geo.column.right + GUTTER, to: geo.stage.right - EDGE };
    const ok = (s: { from: number; to: number }) => s.to - s.from >= MIN_SIDE;
    return { left: ok(left) ? left : null, right: ok(right) ? right : null };
  }, [geo]);

  // Piles (piles.ts): only a pile's top card is placed; the rest show in its fan.
  const piles = useMemo(() => groupPiles(data.items), [data.items]);
  const placed = useMemo<Placed[]>(() => {
    if (!geo || !sides || (!sides.left && !sides.right)) return [];
    const out: Placed[] = [];
    for (const item of data.items) {
      if (isBeneath(item, piles)) continue;
      const pinned = item.pin?.bookId === book.id;
      const location = pinned ? item.pin!.location : item.source?.bookId === book.id && !item.hidden ? item.source.location : undefined;
      if (!location || !isCleanLocation(location)) continue;
      const rects = visibleRects(location, geo);
      if (!rects.length) continue;
      let side: Side = mode === 'left' ? 'left' : mode === 'right' ? 'right' : (item.pin?.side ?? 'right');
      if (!sides[side]) side = side === 'left' ? 'right' : 'left';
      const r = rects[0];
      out.push({ item, side, y: r.top + Math.min(r.height, 40) / 2, rects });
    }
    return out.sort((a, b) => a.y - b.y);
    // tick: the page moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.items, piles, book.id, geo, sides, mode, tick]);

  // --- piles (piles.ts): the fan, naming, the lasso selection, and changes that can be undone ---
  const [fan, setFan] = useState<{ id: string; pinned: boolean } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [lassoBox, setLassoBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const fanGroup = fan ? piles.get(fan.id) : undefined;
  const fanTop = fanGroup ? placed.find((p) => p.item.id === fanGroup[0].id) : undefined;
  const dragging = useRef(false);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    []
  );
  const leaveFan = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (!dragging.current) setFan((f) => (f && !f.pinned ? null : f));
    }, 220);
  }, []);
  // Pointing at a pile spreads it out; it folds again once the pointer has left it and its fan.
  const hoverPile = useCallback(
    (id: string, on: boolean) => {
      window.clearTimeout(openTimer.current);
      if (!on) return leaveFan();
      if (dragging.current) return;
      window.clearTimeout(closeTimer.current);
      openTimer.current = window.setTimeout(() => setFan((f) => (f?.pinned || f?.id === id ? f : { id, pinned: false })), 140);
    },
    [leaveFan]
  );
  const enterFan = useCallback(() => window.clearTimeout(closeTimer.current), []);
  const closeFan = useCallback(() => {
    setFan(null);
    setNaming(null);
  }, []);
  const pinFan = useCallback((id: string) => {
    window.clearTimeout(closeTimer.current);
    setFan({ id, pinned: true });
  }, []);

  /** Where a pile sits: its top card's place on the page, and its side. */
  const placeOf = useCallback(
    (top: DeskItem): DeskPin | null => {
      const p = placed.find((x) => x.item.id === top.id);
      const location = top.pin?.bookId === book.id ? top.pin.location : top.source?.location;
      return p && location ? { bookId: book.id, location, side: p.side } : null;
    },
    [placed, book.id]
  );
  const applyUndoable = useCallback(
    async (patches: ItemPatch[], message: string) => {
      if (!patches.length) return;
      const before = data.items.filter((i) => patches.some((p) => p.id === i.id));
      await patchItems(patches);
      onToast(message, () => patchItems(undoPatches(before, patches)));
    },
    [data.items, onToast]
  );
  /** Deletes cards (whole piles or one card of a pile); the rest of a pile closes up, and a pile of one dissolves. */
  const deleteCards = useCallback(
    async (gone: DeskItem[]) => {
      if (!gone.length) return;
      const ids = new Set(gone.map((i) => i.id));
      const rest: ItemPatch[][] = [];
      for (const group of piles.values()) {
        let left = group;
        for (const m of group.filter((x) => ids.has(x.id))) {
          rest.push(planUnpile(left, m.id).filter((p) => !ids.has(p.id)));
          left = left.filter((x) => x.id !== m.id);
        }
      }
      const restPatches = mergePatches(...rest);
      const before = data.items.filter((i) => restPatches.some((p) => p.id === i.id));
      const desks = data.desks.filter((d) => gone.some((i) => i.deskId === d.id));
      await patchItems(restPatches);
      for (const item of gone) await deleteItem(item.id);
      setSel(new Set());
      onToast(gone.length === 1 ? `Deleted “${shortLabel(gone[0])}”` : `Deleted ${gone.length} cards`, async () => {
        await restoreItems(gone, desks);
        await patchItems(undoPatches(before, restPatches));
      });
    },
    [piles, data.items, data.desks, onToast]
  );
  // P: the chosen cards and piles become one pile, the highest on the page on top.
  const pileSelection = useCallback(() => {
    const tops = [...sel].map((id) => data.items.find((i) => i.id === id)).filter((i): i is DeskItem => !!i);
    if (tops.length < 2) return onToast('Choose two or more cards first: drag over empty margin, or Shift-click');
    const at = (i: DeskItem) => layerRef.current?.querySelector(`.sd-margins > [data-gloss="${i.id}"]`)?.getBoundingClientRect();
    tops.sort((a, b) => (at(a)?.top ?? 0) - (at(b)?.top ?? 0) || (at(a)?.left ?? 0) - (at(b)?.left ?? 0));
    const groups = tops.map((t) => groupOf(t, piles));
    setSel(new Set());
    void applyUndoable(planPileMany(groups, placeOf(tops[0])), `Piled ${groups.flat().length} cards under “${shortLabel(tops[0])}”`);
  }, [sel, data.items, piles, placeOf, applyUndoable, onToast]);
  const namePile = useCallback(
    async (group: DeskItem[], name: string, color: string | undefined) => {
      setNaming(null);
      await patchItems(planName(group, name, color));
      onToast(name.trim() ? `Pile named “${name.trim()}”` : 'Pile name cleared');
    },
    [onToast]
  );

  // What the pointer and key handlers read; they run outside React's render.
  const latest = useRef({ piles, placed, sides, fan, sel, items: data.items, mode });
  latest.current = { piles, placed, sides, fan, sel, items: data.items, mode };

  /** The margin a drop lands in; over the text column, the nearer one. */
  const sideAt = (x: number): Side | null => {
    const { sides: s, mode: m } = latest.current;
    const left = s?.left && (m === 'both' || m === 'left') ? s.left : null;
    const right = s?.right && (m === 'both' || m === 'right') ? s.right : null;
    if (!left) return right ? 'right' : null;
    if (!right) return 'left';
    if (x <= left.to + GUTTER) return 'left';
    if (x >= right.from - GUTTER) return 'right';
    return x - left.to < right.from - x ? 'left' : 'right';
  };

  // --- dragging cards: rest on another card ~300ms to pile, drop sooner to move, drag out of a fan to take off ---
  interface Drag {
    kind: 'group' | 'member';
    group: DeskItem[];
    item: DeskItem;
    el: HTMLElement;
    ghost: HTMLElement;
    dy: number;
    start: { x: number; y: number };
    target: DeskItem[] | null;
    targetEl: HTMLElement | null;
    armed: boolean;
    timer: number;
  }
  const lastClick = useRef({ id: '', t: 0 });

  function beginDrag(src: Pick<Drag, 'kind' | 'group' | 'item' | 'el'>, start: { x: number; y: number }): Drag {
    const rect = src.el.getBoundingClientRect();
    const ghost = src.el.cloneNode(true) as HTMLElement;
    // The copy keeps what was typed (a textarea's value is not copied).
    const from = src.el.querySelectorAll('textarea');
    ghost.querySelectorAll('textarea').forEach((t, i) => (t.value = from[i]?.value ?? ''));
    ghost.querySelectorAll('[data-gloss], [data-fan]').forEach((n) => (n.removeAttribute('data-gloss'), n.removeAttribute('data-fan')));
    ghost.removeAttribute('data-gloss');
    ghost.removeAttribute('data-fan');
    ghost.classList.add('sd-ghost');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
    document.body.appendChild(ghost);
    src.el.classList.add('sd-dragging');
    document.body.classList.add('sd-dragging-card');
    dragging.current = true;
    window.clearTimeout(openTimer.current);
    if (src.kind === 'group' && src.group.length > 1 && latest.current.fan?.id === src.group[0].pile?.id) closeFan();
    return { ...src, ghost, dy: start.y - rect.top, start, target: null, targetEl: null, armed: false, timer: 0 };
  }

  function dragMove(d: Drag, ev: PointerEvent) {
    d.ghost.style.transform = `translate(${ev.clientX - d.start.x}px, ${ev.clientY - d.start.y}px) rotate(-1.5deg)`;
    const { items, piles: ps } = latest.current;
    const hit = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const fanEl = hit?.closest<HTMLElement>('.sd-fan') ?? null;
    const glossEl = hit?.closest<HTMLElement>('[data-gloss]') ?? null;
    let group: DeskItem[] | null = null;
    let el: HTMLElement | null = null;
    if (fanEl) {
      group = ps.get(fanEl.dataset.fan ?? '') ?? null;
      el = fanEl;
    } else if (glossEl) {
      const it = items.find((i) => i.id === glossEl.dataset.gloss);
      group = it ? groupOf(it, ps) : null;
      el = glossEl;
    }
    // Never onto itself, its own pile or its own fan.
    if (group && group.some((m) => d.group.some((g) => g.id === m.id))) group = null;
    if ((group?.[0].id ?? null) === (d.target?.[0].id ?? null)) return;
    window.clearTimeout(d.timer);
    d.targetEl?.classList.remove('sd-pile-pending', 'sd-pile-armed');
    d.target = group;
    d.targetEl = group ? el : null;
    d.armed = false;
    if (!group || !el) return;
    el.classList.add('sd-pile-pending');
    d.timer = window.setTimeout(() => {
      d.armed = true;
      el.classList.remove('sd-pile-pending');
      el.classList.add('sd-pile-armed');
    }, HOLD_MS);
  }

  function endDrag(d: Drag) {
    window.clearTimeout(d.timer);
    d.ghost.remove();
    d.el.classList.remove('sd-dragging');
    d.targetEl?.classList.remove('sd-pile-pending', 'sd-pile-armed');
    document.body.classList.remove('sd-dragging-card');
    dragging.current = false;
  }

  function drop(d: Drag, ev: PointerEvent) {
    endDrag(d);
    const label = `“${shortLabel(d.item)}”`;
    if (d.armed && d.target) {
      const place = placeOf(d.target[0]);
      const under = `“${shortLabel(d.target[0])}”`;
      if (d.kind === 'group') {
        const what = d.group.length > 1 ? `${d.group.length} cards` : label;
        return void applyUndoable(planPile(d.target, d.group, place), `Piled ${what} under ${under} · ${d.target.length + d.group.length} in the pile`);
      }
      const dissolves = d.group.length === 2;
      if (dissolves) closeFan();
      return void applyUndoable(
        mergePatches(planUnpile(d.group, d.item.id), planPile(d.target, [d.item], place)),
        `Moved ${label} to the bottom of the pile under ${under}${dissolves ? ' · the pile it left dissolves' : ''}`
      );
    }
    const side = sideAt(ev.clientX);
    if (!side) return;
    const y = ev.clientY - d.dy + 16;
    if (d.kind === 'member') {
      const f = layerRef.current?.querySelector('.sd-fan')?.getBoundingClientRect();
      if (f && ev.clientX >= f.left && ev.clientX <= f.right && ev.clientY >= f.top && ev.clientY <= f.bottom) return;
      const location = cleanLocationNearY(y, 36) ?? placeOf(d.group[0])?.location;
      if (!location) return;
      const dissolves = d.group.length === 2;
      if (dissolves) closeFan();
      return void applyUndoable(planUnpile(d.group, d.item.id, { bookId: book.id, location, side }), `Took ${label} off the pile${dissolves ? ' · a pile of one dissolves' : ''}`);
    }
    // A move: to the other margin, and a pile or a plain margin note to the line beside the drop. A card tied to
    // words (a quote, a tied note) keeps its words and only changes side.
    const free = d.group.length > 1 || (d.item.fromMargin && !d.item.text);
    const location = (free ? cleanLocationNearY(y, 36) : null) ?? placeOf(d.group[0])?.location;
    if (!location) return;
    void patchItems(d.group.map((m) => ({ id: m.id, patch: { pin: { bookId: book.id, location, side } } })));
  }

  // A press on a card, a pile, or inside a fan: a drag once it moves, a click otherwise.
  function onLayerPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, .sd-frame, .sd-fan__namer, .sd-mset')) return;
    const ta = t.closest('textarea');
    if (ta && document.activeElement === ta) return; // typing: text selects as usual
    const { items, piles: ps, fan: f } = latest.current;
    const fanEl = t.closest<HTMLElement>('.sd-fan');
    const glossEl = t.closest<HTMLElement>('[data-gloss]');
    const inFan = fanEl ? ps.get(fanEl.dataset.fan ?? '') : undefined;
    let src: Pick<Drag, 'kind' | 'group' | 'item' | 'el'> | null = null;
    if (fanEl && inFan && t.closest('.sd-fan__grip')) src = { kind: 'group', group: inFan, item: inFan[0], el: fanEl };
    else if (glossEl) {
      const item = items.find((i) => i.id === glossEl.dataset.gloss);
      if (!item) return;
      src = fanEl && inFan ? { kind: 'member', group: inFan, item, el: glossEl } : { kind: 'group', group: groupOf(item, ps), item, el: glossEl };
    }
    if (!src && !fanEl) return;
    // Focus and text selection wait until it is clear this is not a drag.
    if (src) e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let d: Drag | null = null;
    const move = (ev: PointerEvent) => {
      if (!d) {
        if (!src || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        d = beginDrag(src, start);
      }
      dragMove(d, ev);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (d) return ev.type === 'pointercancel' ? endDrag(d) : drop(d, ev);
      // A click.
      if (fanEl) {
        if (!f?.pinned && fanEl.dataset.fan) pinFan(fanEl.dataset.fan);
        (ta as HTMLTextAreaElement | null)?.focus();
        return;
      }
      if (!src) return;
      if (ev.shiftKey) {
        const id = src.group[0].id;
        setSel((s) => {
          const next = new Set(s);
          if (!next.delete(id)) next.add(id);
          return next;
        });
        return;
      }
      const pileId = src.group.length > 1 ? src.group[0].pile?.id : undefined;
      if (ta) {
        (ta as HTMLTextAreaElement).focus();
        return;
      }
      if (!pileId) return;
      const now = performance.now();
      const twice = lastClick.current.id === pileId && now - lastClick.current.t < 400;
      lastClick.current = { id: pileId, t: now };
      if (twice) {
        pinFan(pileId);
        setNaming(pileId);
      } else pinFan(pileId);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // Drag over empty margin space: the lasso. Shift adds to what is chosen.
  const lassoed = useRef(false);
  function startLasso(e: React.PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch' || e.target !== e.currentTarget) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const keep = e.shiftKey ? new Set(latest.current.sel) : new Set<string>();
    lassoed.current = false;
    const move = (ev: PointerEvent) => {
      if (!lassoed.current && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      lassoed.current = true;
      const l = Math.min(start.x, ev.clientX), t = Math.min(start.y, ev.clientY), r = Math.max(start.x, ev.clientX), b = Math.max(start.y, ev.clientY);
      setLassoBox({ left: l, top: t, width: r - l, height: b - t });
      const next = new Set(keep);
      layerRef.current?.querySelectorAll<HTMLElement>('.sd-margins > [data-gloss]').forEach((el) => {
        const q = el.getBoundingClientRect();
        if (q.left < r && q.right > l && q.top < b && q.bottom > t) next.add(el.dataset.gloss!);
      });
      setSel(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLassoBox(null);
      // A plain click on empty margin lets go of what was chosen.
      if (!lassoed.current && !e.shiftKey) setSel((s) => (s.size ? new Set() : s));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // P piles the chosen cards, Delete deletes them, Esc closes a fan or lets go of the choice.
  const keys = useRef({ pileSelection, deleteCards, closeFan });
  keys.current = { pileSelection, deleteCards, closeFan };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const { fan: f, sel: s, items, piles: ps } = latest.current;
      if (e.key === 'Escape') {
        if (f) {
          e.stopPropagation();
          e.preventDefault();
          keys.current.closeFan();
        } else if (s.size) {
          e.stopPropagation();
          setSel(new Set());
        }
        return;
      }
      if (!s.size || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        keys.current.pileSelection();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const gone = [...s].flatMap((id) => {
          const it = items.find((i) => i.id === id);
          return it ? groupOf(it, ps) : [];
        });
        void keys.current.deleteCards(gone);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // A click outside a fan kept open closes it.
  useEffect(() => {
    if (!fan?.pinned) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.sd-fan, .sd-gloss--pile, .sd-toast, .sd-ring')) return;
      closeFan();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [fan?.pinned, closeFan]);

  // Pointing at the words an item belongs to lights its card (and the line to it), as hovering the card lights the words.
  const fromText = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('.sd-gloss, .sd-margins__area')) return;
      const hit = placed.find((p) => p.rects.some((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom));
      if (hit) {
        fromText.current = true;
        setHoverId((h) => (h === hit.item.id ? h : hit.item.id));
      } else if (fromText.current) {
        fromText.current = false;
        setHoverId(null);
      }
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, [placed]);
  useEffect(() => {
    layerRef.current?.querySelectorAll('.sd-gloss--lit').forEach((el) => el.classList.remove('sd-gloss--lit'));
    if (hoverId) layerRef.current?.querySelector(`[data-gloss="${hoverId}"]`)?.classList.add('sd-gloss--lit');
  });

  // Stack the cards beside their lines and draw the leader lines (DOM, after render, once heights are known).
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const svg = svgRef.current;
    if (!layer || !svg || !geo) return;
    const bottoms: Record<Side, number> = { left: geo.stage.top + 8, right: geo.stage.top + 8 };
    const paths: string[] = [];
    for (const p of placed) {
      const el = layer.querySelector<HTMLElement>(`.sd-margins > [data-gloss="${p.item.id}"]`);
      if (!el) continue;
      const tabbed = el.classList.contains('sd-gloss--tabbed') ? 22 : 0;
      const top = Math.max(p.y - 16, bottoms[p.side] + tabbed);
      el.style.top = `${top}px`;
      bottoms[p.side] = top + el.offsetHeight + 10 + (el.classList.contains('sd-gloss--pile') ? 10 : 0);
      const sx = p.side === 'right' ? geo.column.right + 6 : geo.column.left - 6;
      const r = el.getBoundingClientRect();
      const gx = p.side === 'right' ? r.left + 1 : r.right - 1;
      const gy = top + 16;
      const mx = (sx + gx) / 2;
      const cls = (p.item.id === hoverId || p.item.id === focusId ? 'on' : '') + (p.item.fromMargin && !p.item.text ? ' free' : '');
      paths.push(`<g class="${cls}"><path d="M${sx} ${p.y} C${mx} ${p.y} ${mx} ${gy} ${gx} ${gy}"/><circle cx="${sx}" cy="${p.y}" r="2.4"/></g>`);
    }
    svg.innerHTML = paths.join('');
    // The fan opens where its pile is, moved up as far as needed to stay on screen (scrolling inside if taller).
    const fanEl = layer.querySelector<HTMLElement>('.sd-fan');
    if (fanEl && fanGroup) {
      const anchor = layer.querySelector<HTMLElement>(`.sd-margins > [data-gloss="${fanGroup[0].id}"]`);
      const room = window.innerHeight - 24;
      fanEl.style.maxHeight = `${room}px`;
      const want = (anchor ? parseFloat(anchor.style.top) : geo.stage.top) - 40;
      fanEl.style.top = `${Math.max(12, Math.min(want, window.innerHeight - 12 - fanEl.offsetHeight))}px`;
    }
  });

  // --- double-tap to write ---
  const lastTap = useRef<{ t: number; y: number; side: Side } | null>(null);
  // The line beside a tap or a drop: the nearest visible line, if one is that close (pageGeometry.ts).
  const lineBeside = useCallback((_side: Side, y: number): string | null => (geo ? cleanLocationNearY(y, 36) : null), [geo]);
  const startNote = useCallback(
    async (side: Side, y: number) => {
      const location = lineBeside(side, y);
      if (!location) return onToast('Tap beside a line of text');
      const item = await capture(book, data.deskId, { type: 'line', text: '', body: '', fromMargin: true, inInbox: false, pin: { bookId: book.id, location, side } });
      setFocusId(item.id);
    },
    [lineBeside, book, data.deskId, onToast]
  );
  // An image file dropped on a margin: a screenshot note at that height (marginImages.ts).
  const [dropSide, setDropSide] = useState<Side | null>(null);
  const dropImage = useCallback(
    async (side: Side, y: number, image: File | null) => {
      setDropSide(null);
      if (!image) return onToast('Only images can be dropped in a margin');
      const location = lineBeside(side, y);
      if (!location) return onToast('Drop beside a line of text');
      await capture(book, data.deskId, { type: 'capture', text: '', body: '', fromMargin: true, inInbox: false, pin: { bookId: book.id, location, side } }, image);
      onToast('Image placed in the margin');
    },
    [lineBeside, book, data.deskId, onToast]
  );

  if (mode === 'off' || !geo || !sides || (!sides.left && !sides.right)) return null;

  const areas = (['left', 'right'] as Side[]).filter((s) => sides[s] && (mode === 'both' || mode === s));
  const hovered = placed.find((p) => p.item.id === hoverId || p.item.id === focusId);

  return (
    <div ref={layerRef} className="sd-margins" aria-label="Margins" onPointerDown={onLayerPointerDown}>
      <svg ref={svgRef} className="sd-margins__lines" aria-hidden="true" />
      {hovered?.rects.map((r, i) => (
        <div key={i} className="sd-margins__mark" style={{ left: r.left - 2, top: r.top - 1, width: r.width + 4, height: r.height + 2 }} />
      ))}
      {areas.map((side) => {
        const s = sides[side]!;
        return (
          <div
            key={side}
            className={'sd-margins__area' + (dropSide === side ? ' sd-margins__area--drop' : '')}
            data-side={side}
            style={{ left: s.from, width: s.to - s.from, top: geo.stage.top, height: geo.stage.height }}
            onContextMenu={(e) => e.target === e.currentTarget && areaRing.onContextMenu(e)}
            onPointerDown={(e) => {
              areaRing.onPointerDown(e);
              startLasso(e);
            }}
            onPointerMove={areaRing.onPointerMove}
            onPointerUp={(e) => {
              areaRing.onPointerUp();
              if (e.target !== e.currentTarget) return;
              if (lassoed.current) {
                lassoed.current = false;
                lastTap.current = null;
                return;
              }
              const now = Date.now();
              const last = lastTap.current;
              if (last && last.side === side && now - last.t < 420 && Math.abs(last.y - e.clientY) < 24) {
                lastTap.current = null;
                void startNote(side, e.clientY);
              } else lastTap.current = { t: now, y: e.clientY, side };
            }}
            onDoubleClick={(e) => e.preventDefault()}
            onDragOver={(e) => {
              if (!carriesFiles(e.dataTransfer)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (dropSide !== side) setDropSide(side);
            }}
            onDragLeave={(e) => e.target === e.currentTarget && setDropSide(null)}
            onDrop={(e) => {
              if (!carriesFiles(e.dataTransfer)) return;
              e.preventDefault();
              void dropImage(side, e.clientY, imageIn(e.dataTransfer));
            }}
          >
            <span className="sd-margins__hint">{dropSide === side ? 'Drop the image here' : 'Double-tap to write'}</span>
          </div>
        );
      })}
      {placed.map((p) => {
        const s = sides[p.side]!;
        const group = groupOf(p.item, piles);
        const pileId = group.length > 1 ? p.item.pile!.id : null;
        return (
          <Gloss
            key={p.item.id}
            item={p.item}
            side={p.side}
            left={s.from}
            width={s.to - s.from}
            book={book}
            docMode={prefs.studyDeskMarginsInDocument}
            toInbox={prefs.studyDeskMarginsToInbox}
            autoFocus={p.item.id === focusId}
            onFocused={(on) => setFocusId(on ? p.item.id : null)}
            onHover={(on) => {
              setHoverId(on ? p.item.id : null);
              if (pileId) hoverPile(pileId, on);
            }}
            onToast={onToast}
            onOpenDocument={onOpenDocument}
            onRing={setRing}
            selected={sel.has(p.item.id)}
            showSource={!!pileId}
            pile={
              pileId
                ? { count: group.length, name: p.item.pile?.name, color: p.item.pile?.color, others: fromOtherBooks(group, book.id), onOpen: () => pinFan(pileId) }
                : undefined
            }
            fanned={!!pileId && fan?.id === pileId}
          />
        );
      })}
      {fan && fanGroup && fanTop && (
        <PileFan
          key={fan.id}
          pileId={fan.id}
          group={fanGroup}
          left={sides[fanTop.side]!.from - 8}
          width={sides[fanTop.side]!.to - sides[fanTop.side]!.from + 16}
          pinned={fan.pinned}
          naming={naming === fan.id}
          onEnter={enterFan}
          onLeave={leaveFan}
          onClose={closeFan}
          onStartNaming={() => (pinFan(fan.id), setNaming(fan.id))}
          onCancelNaming={() => setNaming(null)}
          onName={(name, color) => void namePile(fanGroup, name, color)}
          renderCard={(m) => (
            <Gloss
              key={m.id}
              item={m}
              side={fanTop.side}
              left={0}
              width={0}
              inline
              showSource
              book={book}
              docMode={prefs.studyDeskMarginsInDocument}
              toInbox={prefs.studyDeskMarginsToInbox}
              autoFocus={false}
              onFocused={() => {}}
              onHover={(on) => setHoverId(on ? m.id : null)}
              onToast={onToast}
              onOpenDocument={onOpenDocument}
              onRing={setRing}
              onRemove={() => void deleteCards([m])}
            />
          )}
        />
      )}
      {lassoBox && <div className="sd-lasso" style={lassoBox} aria-hidden="true" />}
      {sel.size > 0 && (
        <div className="sd-selbar" role="status" style={{ top: geo.stage.top - 30, left: geo.column.left + geo.column.width / 2 }}>
          {sel.size > 1 ? (
            <>
              {sel.size} chosen · <kbd>P</kbd> piles them · <kbd>Del</kbd> deletes · <kbd>Esc</kbd> lets go
            </>
          ) : (
            <>1 chosen · Shift-click or drag over the margin to add more</>
          )}
        </div>
      )}
      {sides.right && (mode === 'both' || mode === 'right') ? (
        <button type="button" className="sd-margins__set" style={{ left: sides.right.to - 120, top: geo.stage.top - 26 }} onClick={() => setSettingsOpen((v) => !v)}>
          Margin settings
        </button>
      ) : (
        sides.left && (
          <button type="button" className="sd-margins__set" style={{ left: sides.left.from, top: geo.stage.top - 26 }} onClick={() => setSettingsOpen((v) => !v)}>
            Margin settings
          </button>
        )
      )}
      {settingsOpen && <MarginSettings prefs={prefs} update={updatePrefs} onClose={() => setSettingsOpen(false)} />}
      {ring && <MarginRing {...ring} onClose={() => setRing(null)} />}
    </div>
  );
}

const SETS: { key: 'studyDeskMargins' | 'studyDeskMarginsInDocument' | 'studyDeskMarginsToInbox'; label: string; options: [string, string][] }[] = [
  { key: 'studyDeskMargins', label: 'Margins', options: [['both', 'Both sides'], ['right', 'Right only'], ['left', 'Left only'], ['off', 'Hidden']] },
  { key: 'studyDeskMarginsInDocument', label: 'Margin notes in the document', options: [['all', 'All'], ['chosen', 'Only chosen'], ['none', 'None']] },
  { key: 'studyDeskMarginsToInbox', label: 'Send margin notes to the inbox', options: [['ask', 'When I choose'], ['auto', 'Automatically']] },
];

export function MarginSettings({ prefs, update, onClose }: { prefs: ReaderPreferences; update(p: Partial<ReaderPreferences>): void; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sd-mset" role="dialog" aria-label="Margin settings">
      <div className="sd-mset__head">
        <b>Margin settings</b>
        <kbd>Alt M</kbd>
        <button type="button" className="dsearch__close" aria-label="Close margin settings" onClick={onClose}>
          ×
        </button>
      </div>
      {SETS.map((s) => (
        <div key={s.key} className="sd-mset__row">
          <span>{s.label}</span>
          <span className="sd-seg" role="group" aria-label={s.label}>
            {s.options.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={prefs[s.key] === v} onClick={() => update({ [s.key]: v } as Partial<ReaderPreferences>)}>
                {l}
              </button>
            ))}
          </span>
        </div>
      ))}
      <p className="sd-mset__note">
        {prefs.studyDeskMarginsInDocument === 'chosen'
          ? 'Margin notes stay out of the document until you mark them In document.'
          : prefs.studyDeskMarginsInDocument === 'none'
            ? 'Margin notes live only on the page.'
            : 'Every margin note also appears in the desk document. Leave one out from its own options.'}
      </p>
    </div>
  );
}

// --- one card in a margin ---------------------------------------------------------------------------

interface GlossProps {
  item: DeskItem;
  side: Side;
  left: number;
  width: number;
  book: BookMeta;
  docMode: 'all' | 'chosen' | 'none';
  toInbox: 'ask' | 'auto';
  autoFocus: boolean;
  onFocused(on: boolean): void;
  onHover(on: boolean): void;
  onToast(m: string): void;
  onOpenDocument(itemId?: string): void;
  /** Offer Tie to words. */
  canTie?: boolean;
  /** Tie to words another way (PDF pages: drag over the words next); the quiet reader uses the text selection. */
  onTie?(): void;
  /** Opens the right-click ring for this card (its own actions). */
  onRing?(ring: RingState): void;
  /** The top card of a pile: drawn with the cards beneath it, a count badge and the pile's tab. */
  pile?: PileChrome;
  /** In the fan of a pile: laid out in its column instead of beside its line. */
  inline?: boolean;
  /** A source chip when the item comes from another book (cards in piles). */
  showSource?: boolean;
  /** A × to delete the card (in a pile's fan). */
  onRemove?(): void;
  /** Chosen with the lasso or Shift-click. */
  selected?: boolean;
  /** Its pile is fanned out: the fan shows it instead. */
  fanned?: boolean;
}

/** What the top card of a pile shows of the pile. */
export interface PileChrome {
  count: number;
  name?: string;
  color?: string;
  /** Cards from other books. */
  others: number;
  /** Click or Space on the badge: keep the fan open. */
  onOpen(): void;
}

/** One card in a margin; also used beside PDF pages (PdfMargin). */
export function Gloss({ item, side, left, width, book, docMode, toInbox, autoFocus, onFocused, onHover, onToast, onOpenDocument, canTie = true, onTie, onRing, pile, inline, showSource, onRemove, selected, fanned }: GlossProps) {
  const [body, setBody] = useState(item.body ?? '');
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState<'hover' | 'pinned' | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const hoverTimer = useRef(0);
  const img = useDeskImage(item.imageHash);

  // Take changes made elsewhere (the document, another device) while not typing here.
  useEffect(() => {
    if (!focused) setBody(item.body ?? '');
  }, [item.body, focused]);

  useEffect(() => {
    if (autoFocus) {
      // An empty gloss is hidden until its card is focused: show it first, then focus it.
      setFocused(true);
      requestAnimationFrame(() => ref.current?.focus());
    }
    // An empty note left behind (the page was closed before typing) is cleared the next time it shows.
    else if (item.fromMargin && !item.body && !item.text && !item.imageHash && Date.now() - item.createdAt > 5000) void deleteItem(item.id);
    // Once, when the card appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }, [body, width]);

  /** Typed text not yet saved; saved straight away if the card goes (the document opens, the page turns). */
  const pending = useRef<string | null>(null);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(hoverTimer.current);
      if (pending.current !== null) void updateItem(item.id, { body: pending.current });
    },
    [item.id]
  );

  function edit(value: string) {
    setBody(value);
    pending.current = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      pending.current = null;
      void updateItem(item.id, { body: value });
    }, 350);
  }

  async function leave() {
    window.clearTimeout(timer.current);
    pending.current = null;
    const text = body.trim();
    if (item.fromMargin && !text && !item.text && !item.imageHash) {
      await deleteItem(item.id);
      return;
    }
    const patch: Partial<DeskItem> = {};
    if (body !== (item.body ?? '')) patch.body = body;
    if (item.fromMargin && toInbox === 'auto' && !item.inInbox && text) {
      patch.inInbox = true;
      onToast('Sent to the inbox');
    }
    if (Object.keys(patch).length) await updateItem(item.id, patch);
  }

  async function turnInto(type: DeskItemType | 'heading') {
    const lines = body.split('\n');
    if (type === 'heading') {
      const title = (item.text || lines[0] || '').trim() || 'Untitled heading';
      await turnItemIntoHeading(item.id, title);
      onToast('Heading added to the desk document');
      return;
    }
    if (type === 'card') {
      // Front and back: "word = meaning" on one line, or the first line and the rest.
      const one = !item.text && lines.length === 1 && /=/.test(lines[0]);
      const front = (item.text || (one ? lines[0].split('=')[0] : lines[0]) || '').trim();
      const back = (one ? lines[0].split('=').slice(1).join('=') : item.text ? body : lines.slice(1).join('\n')).trim();
      if (!front || !back) return onToast('A flashcard needs a front and a back: "word = meaning", or two lines');
      const card = await vocabularyService.saveCustomCard({ front, back, book, location: item.pin?.location ?? item.source?.location, chapterHref: item.pin?.location ?? item.source?.location });
      getReaderMarks()?.wordSaved(front);
      await updateItem(item.id, { type: 'card', text: front, body: back, reviewId: card.id });
      setBody(back);
      onToast('Added to review, due today');
      return;
    }
    const titled = type === 'concept';
    if (titled && !item.text && lines[0]?.trim()) {
      await updateItem(item.id, { type, text: lines[0].trim(), body: lines.slice(1).join('\n') });
      setBody(lines.slice(1).join('\n'));
    } else await updateItem(item.id, { type });
    onToast(type === 'line' ? 'Plain text again' : `Turned into ${TYPE_LABEL[type].toLowerCase()}`);
  }

  function tie() {
    if (onTie) return onTie();
    const sel = getReaderMarks()?.captureSelection();
    if (!sel || !isCleanLocation(sel.location)) return onToast('Select the words on the page first, then press Tie to words');
    void updateItem(item.id, { text: sel.text, pin: { bookId: book.id, location: sel.location, side } });
    onToast('Tied to the words');
  }

  // Right-click (or long-press) the card, outside its text box: the ring with this card's own actions.
  function ringActions(): RingAction[] {
    if (item.fromMargin) {
      const turn = (type: DeskItemType | 'heading', label: string): RingAction => ({ id: type, label, run: () => void turnInto(type) });
      return [
        turn('question', 'Question'),
        turn('concept', 'Concept'),
        turn('card', 'Flashcard'),
        turn('heading', 'Heading'),
        ...(canTie ? [{ id: 'tie', label: 'Tie to words', run: tie }] : []),
        item.inInbox
          ? turn('line', 'Plain note')
          : { id: 'inbox', label: 'Send to inbox', run: () => void updateItem(item.id, { inInbox: true }).then(() => onToast('Sent to the inbox')) },
        { id: 'doc', label: 'Show in document', run: () => onOpenDocument(item.id) },
        { id: 'delete', label: 'Delete', danger: true, run: () => void deleteItem(item.id) },
      ];
    }
    return [
      {
        id: 'gloss',
        label: 'Write a gloss',
        run: () => {
          setFocused(true);
          requestAnimationFrame(() => ref.current?.focus());
        },
      },
      ...(img ? [{ id: 'look', label: 'Preview the image', keys: 'Space', run: () => setPreview('pinned') }] : []),
      { id: 'doc', label: 'Show in document', run: () => onOpenDocument(item.id) },
      { id: 'hide', label: 'Hide', run: () => void updateItem(item.id, { hidden: true }).then(() => onToast('Hidden from the margin and the document. Show it again from the inbox.')) } as RingAction,
    ];
  }
  const cardRing = useRingTrigger((x, y) => onRing?.({ x, y, title: item.fromMargin ? 'Margin note' : TYPE_LABEL[item.type], actions: ringActions() }));
  const outsideText = (e: React.SyntheticEvent) => !!onRing && !(e.target as HTMLElement).closest('textarea, button');

  const suggest = {
    question: /\?\s*$/.test(body.trim()) || /^\s*(why|how|what|is|does|can)\b/i.test(body),
    card: /\S\s*=\s*\S/.test(body),
  };
  const shownInDoc = shownInDocument(item, docMode);
  const plain = item.fromMargin && item.type === 'line';
  // In piles every card names its kind, plain notes too.
  const kind = item.sketchId
    ? item.type === 'capture'
      ? 'Sketch'
      : 'From sketch'
    : item.fromMargin
      ? plain
        ? pile || inline
          ? 'Note'
          : null
        : TYPE_LABEL[item.type]
      : TYPE_LABEL[item.type];
  const elsewhere = showSource && item.source && item.source.bookId !== book.id ? item.source.bookTitle || 'another book' : null;

  return (
    <div
      ref={boxRef}
      data-gloss={item.id}
      className={
        'sd-gloss sd-gloss--' + side + (item.fromMargin ? ' sd-gloss--m sd-gloss--' + item.type : '') + (focused ? ' sd-gloss--focus' : '') + (item.fromMargin && !shownInDoc ? ' sd-gloss--out' : '') +
        (pile ? ' sd-gloss--pile' : '') + (pile?.name || pile?.color ? ' sd-gloss--tabbed' : '') + (inline ? ' sd-gloss--inline' : '') + (selected ? ' sd-gloss--sel' : '') + (fanned ? ' sd-gloss--fanned' : '')
      }
      style={inline ? undefined : { left, width, ...(pile?.color ? ({ '--tab': pile.color } as React.CSSProperties) : {}) }}
      aria-label={pile ? `Pile${pile.name ? ` ${pile.name}` : ''}, ${pile.count} cards` : undefined}
      onContextMenu={(e) => outsideText(e) && cardRing.onContextMenu(e)}
      onPointerDown={(e) => outsideText(e) && cardRing.onPointerDown(e)}
      onPointerMove={cardRing.onPointerMove}
      onPointerUp={cardRing.onPointerUp}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDragOver={(e) => {
        if (!carriesFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        if (!carriesFiles(e.dataTransfer)) return;
        e.preventDefault();
        const image = imageIn(e.dataTransfer);
        if (!image) return onToast('Only images can be dropped on a note');
        void attachImage(item, image).then(() => onToast('Image added to the note'));
      }}
      onFocus={() => {
        setFocused(true);
        onFocused(true);
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setFocused(false);
        onFocused(false);
        void leave();
      }}
    >
      {pile && (
        <>
          <span className="sd-pile__under sd-pile__under--2" aria-hidden="true" />
          <span className="sd-pile__under sd-pile__under--1" aria-hidden="true" />
          {(pile.name || pile.color) && <span className="sd-pile__tab">{pile.name}</span>}
          <button
            type="button"
            className="sd-pile__count"
            title={`${pile.count} cards. Click or Space keeps them spread out`}
            aria-label={`Open the pile of ${pile.count}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={pile.onOpen}
          >
            {pile.count}
          </button>
        </>
      )}
      {onRemove && (
        <button type="button" className="sd-gloss__x" aria-label="Delete this card" title="Delete (Undo in the message)" onMouseDown={(e) => e.preventDefault()} onClick={onRemove}>
          ×
        </button>
      )}
      {kind && (
        <div className="sd-gloss__k">
          {kind}
          {elsewhere && (
            <b className="sd-gloss__src" title={`From ${elsewhere}`} dir="auto">
              ↗ {elsewhere}
            </b>
          )}
          {!item.fromMargin && item.source?.chapterLabel && <span>{item.source.chapterLabel}</span>}
          {item.type === 'card' && <span className="sd-gloss__due">Review · due today</span>}
          {item.sketchId && (
            // The sketch panel (src/annotate) listens for this and opens the sheet.
            <button
              type="button"
              className="sd-gloss__open"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => window.dispatchEvent(new CustomEvent('annotate:open-sketch', { detail: { sketchId: item.sketchId } }))}
            >
              Open sketch
            </button>
          )}
        </div>
      )}
      {item.text && item.type !== 'card' && (
        <div className={'sd-gloss__q' + (item.ar ? ' sd-gloss__q--ar' : '')} dir="auto">
          {item.text}
        </div>
      )}
      {item.type === 'card' && (
        <div className="sd-gloss__front">
          <span>Front</span> {item.text}
        </div>
      )}
      {img && (
        <button
          type="button"
          className="sd-frame"
          aria-label="Preview the image"
          onMouseEnter={() => {
            window.clearTimeout(hoverTimer.current);
            hoverTimer.current = window.setTimeout(() => setPreview((p) => p ?? 'hover'), 380);
          }}
          onMouseLeave={() => {
            window.clearTimeout(hoverTimer.current);
            setPreview((p) => (p === 'hover' ? null : p));
          }}
          onClick={() => setPreview((p) => (p === 'pinned' ? null : 'pinned'))}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault();
              setPreview((p) => (p === 'pinned' ? null : 'pinned'));
            }
          }}
        >
          <img src={img} alt="" />
        </button>
      )}
      <textarea
        ref={ref}
        className="sd-gloss__body"
        dir="auto"
        rows={1}
        value={body}
        placeholder={item.fromMargin ? 'Write…' : 'Write a gloss…'}
        aria-label={item.fromMargin ? 'Margin note' : 'Gloss'}
        onChange={(e) => edit(e.target.value)}
        onPaste={(e) => {
          // A pasted image (a screenshot on the clipboard) goes on the note; text pastes as usual.
          const image = imageIn(e.clipboardData);
          if (!image) return;
          e.preventDefault();
          void attachImage(item, image).then(() => onToast(item.imageHash ? 'Image replaced' : 'Image added to the note'));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
      {item.fromMargin && (
        <div className="sd-gloss__flags">
          {item.inInbox && <span>In inbox</span>}
          {!shownInDoc && <span>Not in document</span>}
        </div>
      )}
      <div className="sd-gloss__tools" role="toolbar" aria-label="Note options">
        {item.fromMargin && (
          <>
            <span>Turn into</span>
            {TURN.map((t) => (
              <button
                key={t.type}
                type="button"
                aria-pressed={t.type === item.type}
                className={(t.type === 'question' && suggest.question) || (t.type === 'card' && suggest.card) ? 'sd-sug' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void turnInto(t.type)}
              >
                {t.label}
              </button>
            ))}
            {canTie && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={tie}>
                Tie to words
              </button>
            )}
            <i />
            {docMode !== 'none' && (
              <button type="button" aria-pressed={shownInDoc} onMouseDown={(e) => e.preventDefault()} onClick={() => void updateItem(item.id, { inDocument: !shownInDoc })}>
                {shownInDoc ? 'In document' : 'Not in document'}
              </button>
            )}
            <button type="button" disabled={item.inInbox} onMouseDown={(e) => e.preventDefault()} onClick={() => void updateItem(item.id, { inInbox: true }).then(() => onToast('Sent to the inbox'))}>
              {item.inInbox ? 'In inbox' : 'Send to inbox'}
            </button>
          </>
        )}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onOpenDocument(item.id)}>
          Show in document
        </button>
        {item.fromMargin && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void deleteItem(item.id)}>
            Delete
          </button>
        )}
      </div>
      {pile && pile.others > 0 && (
        <div className="sd-pile__src">
          {pile.others} of {pile.count} from other books
        </div>
      )}
      {preview && img && <QuickLook src={img} side={side} anchor={boxRef.current} pinned={preview === 'pinned'} caption={item.text || item.source?.bookTitle || 'Screenshot'} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** A large preview beside the margin, never over the text column. Click or Space keeps it open; Esc closes. */
function QuickLook({ src, side, anchor, pinned, caption, onClose }: { src: string; side: Side; anchor: HTMLElement | null; pinned: boolean; caption: string; onClose(): void }) {
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pinned, onClose]);
  // The text column, or the PDF pages beside their margin.
  const column = document.querySelector('.qr-column, .pdfp__stage')?.getBoundingClientRect();
  const a = anchor?.getBoundingClientRect();
  if (!column || !a) return null;
  const room = side === 'right' ? window.innerWidth - column.right - 24 : column.left - 24;
  const width = Math.max(300, Math.min(room, 640));
  const left = side === 'right' ? Math.min(window.innerWidth - width - 10, column.right + 12) : Math.max(10, column.left - width - 12);
  const top = Math.max(70, Math.min(a.top - 10, window.innerHeight - 420));
  return (
    <div className={'sd-ql' + (pinned ? ' sd-ql--pinned' : '')} style={{ left, top, width }} role="dialog" aria-label="Preview">
      <img src={src} alt="" />
      <div className="sd-ql__bar">
        <span>{caption}</span>
        {pinned ? (
          <button type="button" onClick={onClose}>
            Close · Esc
          </button>
        ) : (
          <span className="sd-ql__hint">Click or Space to keep open</span>
        )}
      </div>
    </div>
  );
}
