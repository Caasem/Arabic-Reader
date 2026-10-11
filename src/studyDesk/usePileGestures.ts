import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { deleteItem, patchItems, restoreItems } from './deskStore';
import { groupOf, planName, planPile, planPileMany, planUnpile, shortLabel, undoPatches, type ItemPatch } from './piles';
import type { Desk, DeskItem, DeskPin } from './types';

/**
 * Piles of margin cards, shared by both margins: the quiet reader's (MarginLayer.tsx) and the strip beside PDF
 * pages (PdfMargin.tsx). Dragging a card (rest on another ~300ms to pile it, drop sooner to move it, drag out of a
 * fan to take it off), the fan a pile spreads into, naming, the lasso and Shift-click choice, P and Delete, and
 * changes that offer Undo. Each margin says only what differs: where a card sits, which margin a drop lands in,
 * and what place a drop at some height means (a line of text, or a level on a PDF page).
 */

export type Side = 'left' | 'right';

/** How long a dragged card rests on another before dropping piles it; dropping sooner moves it. */
const HOLD_MS = 300;

export interface PileAdapter {
  bookId: string;
  items: DeskItem[];
  desks: Desk[];
  /** The piles among the items (groupPiles), each top card first. */
  piles: Map<string, DeskItem[]>;
  /** With `undo`, the message offers Undo. */
  onToast(m: string, undo?: () => Promise<void>): void;
  layerRef: RefObject<HTMLDivElement | null>;
  /** The placed (top) cards inside the layer, e.g. ".sd-margins > [data-gloss]". */
  cards: string;
  /** Where a card sits now: its place and side, or null when it is not on screen. */
  placeOf(top: DeskItem): DeskPin | null;
  /** The margin a drop at this x lands in, or null when outside every margin. */
  sideAt(x: number): Side | null;
  /** The place beside a drop at this y (a line, or a level of a PDF page), or null when there is none. */
  placeAt(y: number): string | null;
  /** How far down from the pointer the card's line sits (the leader joins 16px down). */
  lineOffset?: number;
}

/** Several plans for the same items, merged (later ones win field by field). */
export function mergePatches(...lists: ItemPatch[][]): ItemPatch[] {
  const byId = new Map<string, ItemPatch['patch']>();
  for (const { id, patch } of lists.flat()) byId.set(id, { ...byId.get(id), ...patch });
  return [...byId].map(([id, patch]) => ({ id, patch }));
}

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

export function usePileGestures(a: PileAdapter) {
  const ad = useRef(a);
  ad.current = a;

  // --- the fan, naming, the choice and the lasso -----------------------------------------------------------
  const [fan, setFan] = useState<{ id: string; pinned: boolean } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [lassoBox, setLassoBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const fanGroup = fan ? a.piles.get(fan.id) : undefined;
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

  // --- changes that can be undone ------------------------------------------------------------------------------
  const applyUndoable = useCallback(async (patches: ItemPatch[], message: string) => {
    if (!patches.length) return;
    const before = ad.current.items.filter((i) => patches.some((p) => p.id === i.id));
    await patchItems(patches);
    ad.current.onToast(message, () => patchItems(undoPatches(before, patches)));
  }, []);
  /** Deletes cards (whole piles or one card of a pile); the rest of a pile closes up, and a pile of one dissolves. */
  const deleteCards = useCallback(async (gone: DeskItem[]) => {
    if (!gone.length) return;
    const { piles, items, desks, onToast } = ad.current;
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
    const before = items.filter((i) => restPatches.some((p) => p.id === i.id));
    const gDesks = desks.filter((d) => gone.some((i) => i.deskId === d.id));
    await patchItems(restPatches);
    for (const item of gone) await deleteItem(item.id);
    setSel(new Set());
    onToast(gone.length === 1 ? `Deleted “${shortLabel(gone[0])}”` : `Deleted ${gone.length} cards`, async () => {
      await restoreItems(gone, gDesks);
      await patchItems(undoPatches(before, restPatches));
    });
  }, []);
  // P: the chosen cards and piles become one pile, the highest on the page on top.
  const pileSelection = useCallback(() => {
    const { items, piles, layerRef, cards, placeOf, onToast } = ad.current;
    const tops = [...latestSel.current].map((id) => items.find((i) => i.id === id)).filter((i): i is DeskItem => !!i);
    if (tops.length < 2) return onToast('Choose two or more cards first: drag over the empty Ḥāshiya, or Shift-click');
    const at = (i: DeskItem) => layerRef.current?.querySelector(`${cards}[data-gloss="${i.id}"]`)?.getBoundingClientRect();
    tops.sort((x, y) => (at(x)?.top ?? 0) - (at(y)?.top ?? 0) || (at(x)?.left ?? 0) - (at(y)?.left ?? 0));
    const groups = tops.map((t) => groupOf(t, piles));
    setSel(new Set());
    void applyUndoable(planPileMany(groups, placeOf(tops[0])), `Piled ${groups.flat().length} cards under “${shortLabel(tops[0])}”`);
  }, [applyUndoable]);
  const namePile = useCallback(async (group: DeskItem[], name: string, color: string | undefined) => {
    setNaming(null);
    await patchItems(planName(group, name, color));
    ad.current.onToast(name.trim() ? `Pile named “${name.trim()}”` : 'Pile name cleared');
  }, []);

  const latestFan = useRef(fan);
  latestFan.current = fan;
  const latestSel = useRef(sel);
  latestSel.current = sel;

  // --- dragging cards -----------------------------------------------------------------------------------------
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
    if (src.kind === 'group' && src.group.length > 1 && latestFan.current?.id === src.group[0].pile?.id) closeFan();
    return { ...src, ghost, dy: start.y - rect.top, start, target: null, targetEl: null, armed: false, timer: 0 };
  }

  function dragMove(d: Drag, ev: PointerEvent) {
    d.ghost.style.transform = `translate(${ev.clientX - d.start.x}px, ${ev.clientY - d.start.y}px) rotate(-1.5deg)`;
    const { items, piles } = ad.current;
    const hit = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const fanEl = hit?.closest<HTMLElement>('.sd-fan') ?? null;
    const glossEl = hit?.closest<HTMLElement>('[data-gloss]') ?? null;
    let group: DeskItem[] | null = null;
    let el: HTMLElement | null = null;
    if (fanEl) {
      group = piles.get(fanEl.dataset.fan ?? '') ?? null;
      el = fanEl;
    } else if (glossEl) {
      const it = items.find((i) => i.id === glossEl.dataset.gloss);
      group = it ? groupOf(it, piles) : null;
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
    const { bookId, placeOf, sideAt, placeAt, layerRef, lineOffset = 16 } = ad.current;
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
    const y = ev.clientY - d.dy + lineOffset;
    if (d.kind === 'member') {
      const f = layerRef.current?.querySelector('.sd-fan')?.getBoundingClientRect();
      if (f && ev.clientX >= f.left && ev.clientX <= f.right && ev.clientY >= f.top && ev.clientY <= f.bottom) return;
      const location = placeAt(y) ?? placeOf(d.group[0])?.location;
      if (!location) return;
      const dissolves = d.group.length === 2;
      if (dissolves) closeFan();
      return void applyUndoable(planUnpile(d.group, d.item.id, { bookId, location, side }), `Took ${label} off the pile${dissolves ? ' · a pile of one dissolves' : ''}`);
    }
    // A move: to the other margin, and a pile or a plain margin note to the place beside the drop. A card tied to
    // words or a region (a quote, a tied note, a captured box) keeps its place and only changes side.
    const free = d.group.length > 1 || (d.item.fromMargin && !d.item.text);
    const location = (free ? placeAt(y) : null) ?? placeOf(d.group[0])?.location;
    if (!location) return;
    void patchItems(d.group.map((m) => ({ id: m.id, patch: { pin: { bookId, location, side } } })));
  }

  /** On the margin layer: a press on a card, a pile, or inside a fan is a drag once it moves, a click otherwise. */
  function onLayerPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, .sd-frame, .sd-fan__namer, .sd-mset')) return;
    const ta = t.closest('textarea');
    if (ta && document.activeElement === ta) return; // typing: text selects as usual
    const { items, piles } = ad.current;
    const f = latestFan.current;
    const fanEl = t.closest<HTMLElement>('.sd-fan');
    const glossEl = t.closest<HTMLElement>('[data-gloss]');
    const inFan = fanEl ? piles.get(fanEl.dataset.fan ?? '') : undefined;
    let src: Pick<Drag, 'kind' | 'group' | 'item' | 'el'> | null = null;
    if (fanEl && inFan && t.closest('.sd-fan__grip')) src = { kind: 'group', group: inFan, item: inFan[0], el: fanEl };
    else if (glossEl) {
      const item = items.find((i) => i.id === glossEl.dataset.gloss);
      if (!item) return;
      src = fanEl && inFan ? { kind: 'member', group: inFan, item, el: glossEl } : { kind: 'group', group: groupOf(item, piles), item, el: glossEl };
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
      pinFan(pileId);
      if (twice) setNaming(pileId);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** On empty margin space: drag for the lasso. Shift adds to what is chosen. */
  const lassoed = useRef(false);
  function startLasso(e: React.PointerEvent) {
    if (e.button !== 0 || e.pointerType === 'touch' || e.target !== e.currentTarget) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const keep = e.shiftKey ? new Set(latestSel.current) : new Set<string>();
    lassoed.current = false;
    const move = (ev: PointerEvent) => {
      if (!lassoed.current && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      lassoed.current = true;
      const l = Math.min(start.x, ev.clientX),
        t = Math.min(start.y, ev.clientY),
        r = Math.max(start.x, ev.clientX),
        b = Math.max(start.y, ev.clientY);
      setLassoBox({ left: l, top: t, width: r - l, height: b - t });
      const next = new Set(keep);
      ad.current.layerRef.current?.querySelectorAll<HTMLElement>(ad.current.cards).forEach((el) => {
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
      const f = latestFan.current;
      const s = latestSel.current;
      const { items, piles } = ad.current;
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
          return it ? groupOf(it, piles) : [];
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

  return { fan, fanGroup, naming, setNaming, sel, lassoBox, lassoed, hoverPile, enterFan, leaveFan, closeFan, pinFan, namePile, deleteCards, onLayerPointerDown, startLasso };
}
