import { useEffect, useRef, useState } from 'react';
import type { DefinitionToken } from '../definitionTokens';

/** What the hook needs of an entry's tokens: the flat stream, to know which indices are words. */
type TokenStreams = ReadonlyMap<number, { flat: DefinitionToken[] }>;

/**
 * Word selection inside dictionary entries: click toggles one word, drag adds a range, the
 * selection is kept per entry and cleared when the popup moves to a new word.
 */
export function useTokenSelection(word: string, entryTokenData: TokenStreams, exampleTokenData: TokenStreams) {
  // Select-and-save: for a long entry (Al-Wasit's own paragraphs commonly
  // run several sub-senses together) where only part of it is relevant,
  // clicking/dragging across its words builds a (possibly non-contiguous)
  // selection to save instead of the whole entry -- see DefinitionToken and
  // buildEntryTokenSenses above. Keyed by entry index (the same flat index
  // into result.entries savedEntryKeys already uses) so a scattered
  // selection in one entry survives switching to look at another entry;
  // only a genuinely new word/lookup clears it.
  const [tokenSelections, setTokenSelections] = useState<Map<number, Set<number>>>(new Map());
  // Which entry a footer/header-level "Save" action should act on when more
  // than one entry could theoretically have an active selection at once --
  // always the entry most recently touched, mirroring how there's only ever
  // one *effectively current* selection even though the Map can hold more.
  const [activeSelectionEntry, setActiveSelectionEntry] = useState<number | null>(null);
  useEffect(() => {
    setTokenSelections(new Map());
    setActiveSelectionEntry(null);
  }, [word]);

  function toggleToken(entryIdx: number, idx: number) {
    setTokenSelections((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(entryIdx) ?? []);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      if (set.size === 0) next.delete(entryIdx);
      else next.set(entryIdx, set);
      return next;
    });
    setActiveSelectionEntry(entryIdx);
  }

  function addTokenRange(entryIdx: number, lo: number, hi: number) {
    const tokens = entryTokenData.get(entryIdx)?.flat ?? exampleTokenData.get(entryIdx)?.flat;
    if (!tokens) return;
    setTokenSelections((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(entryIdx) ?? []);
      for (let idx = lo; idx <= hi; idx++) {
        if (tokens[idx]?.isWord) set.add(idx);
      }
      next.set(entryIdx, set);
      return next;
    });
    setActiveSelectionEntry(entryIdx);
  }

  function clearEntrySelection(entryIdx: number) {
    setTokenSelections((prev) => {
      const next = new Map(prev);
      next.delete(entryIdx);
      return next;
    });
    setActiveSelectionEntry((prev) => (prev === entryIdx ? null : prev));
  }

  // Drag tracking mirrors VocabularyEditModal's own pointer-based range
  // selection (see its own comment for why plain refs, not state, and why
  // touch needs elementFromPoint rather than per-token pointerenter) --
  // except a plain click here must *toggle* the one token under it rather
  // than always adding, so pointerdown only records the anchor; pointerup
  // decides which happened based on whether the pointer ever actually moved
  // to a different token in between.
  const dragAnchorRef = useRef<{ entry: number; idx: number } | null>(null);
  const dragMovedRef = useRef(false);
  const draggingRef = useRef(false);

  function handleTokenPointerDown(entryIdx: number, idx: number, e: React.PointerEvent) {
    e.preventDefault();
    dragAnchorRef.current = { entry: entryIdx, idx };
    dragMovedRef.current = false;
    draggingRef.current = true;
  }

  function handleTokensPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !dragAnchorRef.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tokenEl = (el as HTMLElement | null)?.closest<HTMLElement>('[data-idx]');
    if (!tokenEl) return;
    const entryAttr = tokenEl.dataset.entry;
    const idxAttr = tokenEl.dataset.idx;
    if (entryAttr == null || idxAttr == null) return;
    const entry = Number(entryAttr);
    if (entry !== dragAnchorRef.current.entry) return; // never extend a drag across entries
    const idx = Number(idxAttr);
    if (idx === dragAnchorRef.current.idx && !dragMovedRef.current) return;
    dragMovedRef.current = true;
    addTokenRange(entry, Math.min(dragAnchorRef.current.idx, idx), Math.max(dragAnchorRef.current.idx, idx));
  }

  useEffect(() => {
    function stop() {
      if (draggingRef.current && dragAnchorRef.current && !dragMovedRef.current) {
        toggleToken(dragAnchorRef.current.entry, dragAnchorRef.current.idx);
      }
      draggingRef.current = false;
      dragAnchorRef.current = null;
      dragMovedRef.current = false;
    }
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSelection = activeSelectionEntry !== null ? tokenSelections.get(activeSelectionEntry) : undefined;
  const activeSelectionCount = activeSelection?.size ?? 0;


  return {
    tokenSelections,
    activeSelectionEntry,
    activeSelectionCount,
    activeSelection,
    clearEntrySelection,
    handleTokenPointerDown,
    handleTokensPointerMove,
  };
}
