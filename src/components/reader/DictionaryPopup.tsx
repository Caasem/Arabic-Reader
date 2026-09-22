import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DictionaryEntry, DictionaryLookupResult, WordInstance, WordRarity } from '../../types';
import { getWordRarity, isRarityDataReady, TIER_LABELS } from '../../vocabRarity/rarity';
import { normalize } from '../../reader/tokenizer/arabicTokenizer';
import { usePreferences } from '../../state/PreferencesContext';
import { IconEdit, IconChevronLeft, IconChevronRight } from '../shared/icons';
import { buildEntryTokenSenses, reconstructSelection, type DefinitionToken } from './definitionTokens';
import './DictionaryPopup.css';

const VIEWPORT_MARGIN = 12;
const WORD_GAP = 14;

// Below this, there isn't room for a genuine two-column side-by-side split
// (see the popup's own width cap, calc(100vw - 24px)) -- Split falls back
// to a tab switcher between dictionaries instead of expanding sideways.
const NARROW_BREAKPOINT_PX = 480;

// See the matching constant/comment in DictionaryBubble.tsx -- iOS Safari's
// trailing synthetic 'click' for the tap that opened this popup can land on
// this backdrop (freshly inserted at that exact screen point, in the host
// document rather than the epub iframe's) and immediately dismiss the popup
// the same tap just opened. Ignoring a dismiss-click in the first instant
// after mount avoids that without delaying a genuine later dismiss tap.
const IGNORE_DISMISS_MS = 400;

type EntryGroup = { providerId: string; providerName: string; entries: { entry: DictionaryEntry; index: number }[] };

/** A root/lemma value that shows the Arabic text by default; tapping it
 * crossfades to the "root"/"form" label in the exact same spot, then fades
 * back to the value after a moment. Replaces a static always-visible label
 * — the label only appears when asked for, right where the value was. */
function MorphValue({ kind, value }: { kind: 'form' | 'root'; value: string }) {
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  function handleTap() {
    setRevealed(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setRevealed(false), 1400);
  }

  return (
    <span
      className="dict-popup__morph-item"
      onClick={handleTap}
      role="button"
      tabIndex={0}
      aria-label={`${kind}: ${value}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTap();
        }
      }}
    >
      <span className={'dict-popup__morph-swap' + (revealed ? ' dict-popup__morph-swap--label' : '')}>
        <bdi className="dict-popup__entry-morph-value dict-popup__morph-face" aria-hidden={revealed}>
          {value}
        </bdi>
        <span className="dict-popup__morph-face dict-popup__morph-face--label" aria-hidden={!revealed}>
          {kind}
        </span>
      </span>
    </span>
  );
}

/** Folds consecutive same-provider entries into one group so the popup can
 * show the provider name once per group instead of once per entry. Keeps
 * each entry's original index (needed for the per-entry save-state Set,
 * which is keyed by position in the flat `result.entries` array). */
function groupEntriesByProvider(entries: DictionaryEntry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const last = groups[groups.length - 1];
    if (last && last.providerId === entry.providerId) {
      last.entries.push({ entry, index: i });
    } else {
      groups.push({ providerId: entry.providerId, providerName: entry.providerName, entries: [{ entry, index: i }] });
    }
  }
  return groups;
}

export function DictionaryPopup({
  word,
  result,
  instance,
  saved,
  loading,
  x,
  y,
  wordRect,
  sizePct = 100,
  onClose,
  onSave,
  onSaveEntry,
  onSaveSelection,
  onEdit,
}: {
  word: string;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
  loading: boolean;
  /** Fallback anchor point (word's horizontal center, top edge) used only
   * when `wordRect` isn't supplied -- kept so any caller that hasn't been
   * updated to measure the word's full rect still gets *a* position. */
  x: number;
  y: number;
  /** The tapped `.ar-word` element's own `getBoundingClientRect()` (already
   * adjusted for the epub.js iframe's own offset, same as x/y above) --
   * lets recalcPosition below place the popup above/below/beside the word
   * without covering it, rather than just centering on a single point. */
  wordRect?: { top: number; bottom: number; left: number; right: number };
  /** Settings → "Dictionary popup size" -- 100 = the popup's normal size. */
  sizePct?: number;
  onClose: () => void;
  /** The main "Save Vocabulary" button — saves every entry the lookup found
   * onto one card (see vocabularyService.saveToVocabulary). Toggles: a
   * second press un-saves the word entirely (every card for it). */
  onSave: () => void;
  /** Per-entry "+" — saves just that one entry as its own card, for when a
   * word has more than one genuinely distinct meaning and the reader only
   * wants the one they're looking at. */
  onSaveEntry?: (entry: DictionaryEntry) => void;
  /** For a long entry (Al-Wasit's paragraphs commonly run several
   * sub-senses together) where only part of it is relevant -- saves just
   * the text the reader selected, instead of the whole entry. */
  onSaveSelection?: (entry: DictionaryEntry, selectedText: string) => void;
  /** Opens the compact edit modal for this word's saved (or not-yet-saved)
   * card. */
  onEdit?: () => void;
}) {
  const { prefs, updatePrefs } = usePreferences();

  // Purely local, resets whenever the popup moves to a new word -- not
  // meant to track "is this permanently saved" (that's `saved`, computed
  // from vocabularyService for the word as a whole), just enough feedback
  // that tapping a per-entry "+" visibly did something.
  const [savedEntryKeys, setSavedEntryKeys] = useState<Set<number>>(new Set());
  useEffect(() => {
    setSavedEntryKeys(new Set());
  }, [word]);
  const morphology = result?.morphology?.[0];

  // Rarity badge — a small, best-effort enrichment on top of the dictionary
  // lookup, not the popup's main purpose, so it fails silently (no badge)
  // rather than blocking or erroring the rest of the popup if the
  // vocabulary-rarity dataset isn't enabled yet (see Settings).
  const [rarity, setRarity] = useState<WordRarity | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRarity(null);
    isRarityDataReady().then((ready) => {
      if (!ready || cancelled) return;
      getWordRarity(normalize(word), morphology?.pos, morphology?.lemma).then((r) => {
        if (!cancelled) setRarity(r);
      });
    });
    return () => {
      cancelled = true;
    };
    // morphology arrives asynchronously alongside `result` -- re-running
    // once it's in gets the complexity-aware, lemma-fallback tier instead of
    // a surface-form-only one computed before the analysis was ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, morphology?.pos, morphology?.lemma]);

  // Settings → "Multiple dictionaries" (see DictionaryPanelLayout): 'merged'
  // stacks every provider's entries in one list (unchanged, longstanding
  // behavior); 'split' rearranges that *same* information into two columns
  // (or a tab switcher below NARROW_BREAKPOINT_PX, where there's no room
  // for a real side-by-side split); 'single' filters down to one chosen
  // provider. Nothing is ever hidden by 'merged' or 'split' -- only
  // 'single' actually removes information from view.
  const allGroups = groupEntriesByProvider(result?.entries ?? []);
  const canSplit = allGroups.length > 1;
  const effectiveLayout: 'merged' | 'split' | 'single' =
    prefs.dictionaryPanelLayout === 'single' ? 'single' : prefs.dictionaryPanelLayout === 'split' && canSplit ? 'split' : 'merged';

  const singleGroups =
    effectiveLayout === 'single'
      ? allGroups.filter((g) => g.providerId === prefs.dictionaryPanelSingleProviderId).length > 0
        ? allGroups.filter((g) => g.providerId === prefs.dictionaryPanelSingleProviderId)
        : allGroups.slice(0, 1)
      : [];
  const [primaryGroup, ...restGroups] = allGroups;
  const secondaryGroups = restGroups;

  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX}px)`).matches);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX}px)`);
    const apply = () => setIsNarrow(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  // Which dictionary's entries the narrow-screen tab switcher currently
  // shows -- resets to the first provider whenever the popup moves to a
  // new word, same as savedEntryKeys above.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  useEffect(() => {
    setActiveTab(null);
  }, [word]);
  const activeTabId = activeTab ?? primaryGroup?.providerId;

  // Split view: each column scrolls independently (a long Al-Wasit entry
  // shouldn't force AraMorph's shorter column to match its height) --
  // except a narrow strip along the *inner* edge (the one touching the
  // shared divider between them), which scrolls both together so the two
  // stay aligned for side-by-side comparison. Primary renders first in DOM
  // (rightmost in this RTL layout) so its inner edge is its left; secondary
  // renders second (leftmost) so its inner edge is its right.
  const SYNC_ZONE_PX = 28;
  const primaryColRef = useRef<HTMLDivElement>(null);
  const secondaryColRef = useRef<HTMLDivElement>(null);
  function handleColumnWheel(e: React.WheelEvent<HTMLDivElement>, isPrimary: boolean) {
    const selfEl = isPrimary ? primaryColRef.current : secondaryColRef.current;
    const otherEl = isPrimary ? secondaryColRef.current : primaryColRef.current;
    if (!selfEl) return;
    const rect = selfEl.getBoundingClientRect();
    const inSyncZone = isPrimary ? e.clientX - rect.left < SYNC_ZONE_PX : rect.right - e.clientX < SYNC_ZONE_PX;
    if (inSyncZone) {
      e.preventDefault();
      selfEl.scrollTop += e.deltaY;
      if (otherEl) otherEl.scrollTop += e.deltaY;
    }
    // Outer zone: no-op here -- native per-column scrolling already handles it.
  }

  // Viewport-safe positioning: rather than guessing the popup's size ahead
  // of time (the old approach — a fixed height estimate — could still clip
  // a genuinely tall entry list, and didn't account for the size
  // preference at all), render it invisibly first, measure its *actual*
  // rendered box, then place it so it's fully on-screen. Vertical overflow
  // past that still scrolls inside the popup (see .dict-popup's
  // max-height/overflow-y in the stylesheet) rather than growing off-screen.
  const popupRef = useRef<HTMLDivElement>(null);

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

  const entryTokenData = useMemo(() => {
    const map = new Map<number, { flat: DefinitionToken[]; bySense: DefinitionToken[][] }>();
    result?.entries.forEach((e, i) => {
      if (e.providerId === 'alwasit') map.set(i, buildEntryTokenSenses(e));
    });
    return map;
  }, [result]);

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
    const tokens = entryTokenData.get(entryIdx)?.flat;
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

  /** The main "Save Vocabulary" (and its header-shortcut twin) button's
   * click handler -- when a selection is active, saves *only* that
   * selection instead of the whole lookup, so the safety this feature
   * promises ("won't accidentally save more than intended") actually
   * covers every save path, not just the per-entry one. */
  function handleMainSave() {
    if (activeSelectionEntry !== null && activeSelection && activeSelection.size > 0 && onSaveSelection) {
      const entry = result?.entries[activeSelectionEntry];
      const tokens = entryTokenData.get(activeSelectionEntry)?.flat;
      if (entry && tokens) {
        onSaveSelection(entry, reconstructSelection(tokens, activeSelection));
        clearEntrySelection(activeSelectionEntry);
        return;
      }
    }
    onSave();
  }

  const [style, setStyle] = useState<{ left: number; top: number; visibility: 'hidden' | 'visible' }>({
    left: x,
    top: y,
    visibility: 'hidden',
  });

  const recalcPosition = useCallback(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampLeft = (left: number) => Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vw - rect.width - VIEWPORT_MARGIN));
    const clampTop = (top: number) => Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vh - rect.height - VIEWPORT_MARGIN));

    if (wordRect) {
      // Word-aware placement: below the word, then above, then beside it,
      // each tried only if the popup would land fully on-screen there --
      // the last resort (clamp only) is the one place this can still cover
      // the word, same graceful-degradation the feature accepts for small
      // screens/Split layout's narrower columns rather than never showing
      // a usable popup at all.
      const centerLeft = clampLeft((wordRect.left + wordRect.right) / 2 - rect.width / 2);

      const belowTop = wordRect.bottom + WORD_GAP;
      if (belowTop + rect.height <= vh - VIEWPORT_MARGIN) {
        setStyle({ left: centerLeft, top: belowTop, visibility: 'visible' });
        return;
      }

      const aboveTop = wordRect.top - WORD_GAP - rect.height;
      if (aboveTop >= VIEWPORT_MARGIN) {
        setStyle({ left: centerLeft, top: aboveTop, visibility: 'visible' });
        return;
      }

      // Neither direction has room (a short landscape viewport, typically)
      // -- shift beside the word instead, vertically centered on it. This
      // app's own chrome is RTL, so "forward" is the left side (matching
      // e.g. the reader footer's Next button already being on the left) --
      // tried first, then the right, whichever actually has room for the
      // popup's width.
      const sideTop = clampTop((wordRect.top + wordRect.bottom) / 2 - rect.height / 2);
      const spaceLeft = wordRect.left - VIEWPORT_MARGIN;
      const spaceRight = vw - VIEWPORT_MARGIN - wordRect.right;
      if (spaceLeft >= rect.width + WORD_GAP) {
        setStyle({ left: wordRect.left - WORD_GAP - rect.width, top: sideTop, visibility: 'visible' });
        return;
      }
      if (spaceRight >= rect.width + WORD_GAP) {
        setStyle({ left: wordRect.right + WORD_GAP, top: sideTop, visibility: 'visible' });
        return;
      }

      // Popup doesn't fit anywhere without covering the word (a small
      // screen, or a narrow Split-layout column) -- fall back to simply
      // keeping it fully on-screen, word visibility no longer guaranteed.
      setStyle({ left: centerLeft, top: clampTop(wordRect.top), visibility: 'visible' });
      return;
    }

    // No measured word rect (a caller that only has a point, not the
    // element itself) -- the old point-based heuristic: prefer above the
    // point, then below, then vertically centered on it, always clamped.
    const left = clampLeft(x - rect.width / 2);
    const fitsAbove = y - WORD_GAP - rect.height >= VIEWPORT_MARGIN;
    let top: number;
    if (fitsAbove) {
      top = y - WORD_GAP - rect.height;
    } else {
      const fitsBelow = y + WORD_GAP + rect.height <= vh - VIEWPORT_MARGIN;
      top = fitsBelow ? y + WORD_GAP : clampTop(y - rect.height / 2);
    }
    setStyle({ left, top: clampTop(top), visibility: 'visible' });
  }, [x, y, wordRect]);

  useLayoutEffect(() => {
    recalcPosition();
    // Re-measure whenever the word, loading state, or size preference
    // changes the popup's content/size, the target point moves, or Split
    // toggles (which changes the popup's own width). The Split->width
    // change is animated (~300ms CSS transition, see .dict-popup--split),
    // so this call catches the *start* of that resize -- the transitionend
    // handler on the popup element below catches the settled end of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, loading, result, x, y, wordRect, sizePct, effectiveLayout, isNarrow]);

  const scale = sizePct / 100;

  const mountedAtRef = useRef(0);
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);
  function handleBackdropClick() {
    if (Date.now() - mountedAtRef.current < IGNORE_DISMISS_MS) return;
    onClose();
  }

  function toggleSplit() {
    updatePrefs({ dictionaryPanelLayout: prefs.dictionaryPanelLayout === 'split' ? 'merged' : 'split' });
  }

  function renderGroupList(groups: EntryGroup[]) {
    return groups.map((group) => (
      <div className="dict-popup__group" key={group.providerId}>
        <div className="dict-popup__group-header">{group.providerName}</div>
        {group.entries.map(({ entry, index: i }) => {
          // Non-contiguous word selection (click to toggle, drag to add a
          // range) -- Al-Wasit only, and only while a save-selection
          // callback actually exists to hand it to. Every other provider's
          // entries keep the plain, non-interactive sense list below.
          const tokenData = entry.providerId === 'alwasit' ? entryTokenData.get(i) : undefined;
          const sel = tokenData ? tokenSelections.get(i) : undefined;
          const hasSelection = !!sel && sel.size > 0;

          function saveThisSelection() {
            if (!tokenData || !sel || !onSaveSelection) return;
            onSaveSelection(entry, reconstructSelection(tokenData.flat, sel));
            clearEntrySelection(i);
          }

          return (
            <div className="dict-popup__entry" data-entry-index={i} key={entry.providerId + i}>
              <div className="dict-popup__entry-head">
                <span className="dict-popup__headword">{entry.headword}</span>
                {/* Sits between the headword and the per-entry save
                    button -- root before form (read first, right next to
                    the headword it belongs to), both smaller than the
                    headword since they're a secondary identifier, not
                    the entry's main content. Different entries in the
                    same provider's group can genuinely come from
                    different roots/lemmas (e.g. an unvocalized verb form
                    ambiguous between Form I and Form IV), so this stays
                    per-entry rather than folded into the group header.
                    Only shown when it says something the headword
                    doesn't already -- a plain root-keyed entry (e.g.
                    Al-Wasit) would otherwise repeat its own headword
                    right back as "root". */}
                {((entry.lemma && entry.lemma !== entry.headword) || (entry.root && entry.root !== entry.headword)) && (
                  <span
                    className={
                      'dict-popup__entry-morph' + (prefs.morphDisplayStyle === 'badges' ? ' dict-popup__entry-morph--badges' : '')
                    }
                  >
                    {entry.root && entry.root !== entry.headword && <MorphValue kind="root" value={entry.root} />}
                    {entry.lemma && entry.lemma !== entry.headword && <MorphValue kind="form" value={entry.lemma} />}
                  </span>
                )}
                {onSaveEntry && result!.entries.length > 1 && (
                  <button
                    className={'dict-popup__entry-save' + (hasSelection ? ' dict-popup__entry-save--selection' : '')}
                    onClick={() => {
                      if (hasSelection) {
                        saveThisSelection();
                        return;
                      }
                      onSaveEntry(entry);
                      setSavedEntryKeys((prev) => new Set(prev).add(i));
                    }}
                    disabled={!hasSelection && savedEntryKeys.has(i)}
                    aria-label={hasSelection ? `Save just the ${sel!.size} selected words for "${entry.headword}"` : `Add just "${entry.headword}" to vocabulary`}
                    title={hasSelection ? 'Will save only the selected words, not the full definition' : 'Add just this definition'}
                  >
                    {hasSelection ? '✓ sel' : savedEntryKeys.has(i) ? '✓' : '+'}
                  </button>
                )}
              </div>
              {tokenData ? (
                <div className="dict-popup__tokens" dir="rtl" onPointerMove={handleTokensPointerMove}>
                  {entry.senses.map((s, si) => (
                    <div className="dict-popup__token-sense" key={si}>
                      {tokenData.bySense[si].map((t) =>
                        !t.isWord ? (
                          <span key={t.globalIdx}>{t.text}</span>
                        ) : (
                          <span
                            key={t.globalIdx}
                            data-entry={i}
                            data-idx={t.globalIdx}
                            className={'dict-popup__token' + (sel?.has(t.globalIdx) ? ' dict-popup__token--selected' : '')}
                            onPointerDown={(e) => handleTokenPointerDown(i, t.globalIdx, e)}
                          >
                            {t.text}
                          </span>
                        )
                      )}
                      {(s.pos || s.gender) && <span className="dict-popup__tag">{[s.pos, s.gender].filter(Boolean).join(' · ')}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="dict-popup__senses">
                  {entry.senses.map((s, si) => (
                    <li key={si}>
                      {s.gloss}
                      {(s.pos || s.gender) && <span className="dict-popup__tag">{[s.pos, s.gender].filter(Boolean).join(' · ')}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {hasSelection && (
                <button className="dict-popup__save-selection" onClick={saveThisSelection}>
                  + Save selection ({sel!.size})
                </button>
              )}
            </div>
          );
        })}
      </div>
    ));
  }

  const footer = (
    <>
      <div className="dict-popup__stats">
        <span>
          {instance?.encounterCount ?? 1} encounter{(instance?.encounterCount ?? 1) === 1 ? '' : 's'}
        </span>
        <span className="dict-popup__stats-dot">·</span>
        <span>
          {instance?.lookupCount ?? 1} lookup{(instance?.lookupCount ?? 1) === 1 ? '' : 's'}
        </span>
      </div>

      <div className="dict-popup__actions">
        <button
          className={
            'dict-popup__save' + (saved ? ' dict-popup__save--saved' : '') + (activeSelectionCount > 0 ? ' dict-popup__save--selection' : '')
          }
          onClick={handleMainSave}
          title={
            activeSelectionCount > 0
              ? `Will save only the ${activeSelectionCount} selected word${activeSelectionCount === 1 ? '' : 's'}, not the full definition`
              : undefined
          }
        >
          {activeSelectionCount > 0
            ? `Save selection (${activeSelectionCount})`
            : saved
              ? '✓ Vocabulary'
              : 'Save Vocabulary'}
        </button>
        {onEdit && (
          <button className="dict-popup__edit" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="dict-popup-backdrop" onClick={handleBackdropClick}>
      <div
        ref={popupRef}
        className={
          'dict-popup' +
          (effectiveLayout === 'split' && !isNarrow ? ' dict-popup--split' : '') +
          (prefs.dictionaryPopupPinFooter ? ' dict-popup--pinned-footer' : '')
        }
        style={{ left: style.left, top: style.top, visibility: style.visibility, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'width') recalcPosition();
        }}
      >
        {canSplit && effectiveLayout !== 'single' && (
          <button
            className="dict-popup__chevron"
            onClick={toggleSplit}
            aria-label={effectiveLayout === 'split' ? 'Show one dictionary column' : 'Compare dictionaries side by side'}
            title={effectiveLayout === 'split' ? 'Collapse' : 'Compare dictionaries'}
          >
            {effectiveLayout === 'split' ? <IconChevronRight size={13} /> : <IconChevronLeft size={13} />}
          </button>
        )}

      <div className="dict-popup__scroll">
        <button className="dict-popup__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {/* Quick-access header shortcuts, alongside the full "Save
            Vocabulary"/"Edit" buttons in the footer below -- these exist for
            reaching either action without scrolling down past a long entry
            list, not as a replacement for the footer pair. */}
        <div className="dict-popup__header-actions">
          <button
            className={'dict-popup__header-btn' + (activeSelectionCount > 0 ? ' dict-popup__header-btn--selection' : '')}
            onClick={handleMainSave}
            aria-label={activeSelectionCount > 0 ? `Save just the ${activeSelectionCount} selected words` : 'Add to vocabulary'}
            title={activeSelectionCount > 0 ? 'Will save only the selected words, not the full definition' : 'Add to vocabulary'}
          >
            +
          </button>
          {onEdit && (
            <button className="dict-popup__header-btn" onClick={onEdit} aria-label="Edit" title="Edit">
              <IconEdit size={12} />
            </button>
          )}
        </div>

        <div className="dict-popup__word">
          {word}
          {rarity && (
            <span className={'dict-popup__rarity dict-popup__rarity--' + rarity.tier}>
              {TIER_LABELS[rarity.tier]}
              {rarity.percentile !== null ? ` · top ${Math.max(1, Math.round((1 - rarity.percentile) * 100))}%` : ' · not in frequency list'}
            </span>
          )}
        </div>

        {loading && <div className="dict-popup__loading">Looking up…</div>}

        {!loading && result?.failedProviders?.length ? (
          <div className="dict-popup__provider-error" role="status">
            Couldn't load: {result.failedProviders.map((p) => p.name).join(', ')}
          </div>
        ) : null}

        {!loading && !result?.entries.length && <div className="dict-popup__empty">No entry found for this word yet.</div>}

        {!loading && result?.entries.length ? (
          effectiveLayout === 'split' ? (
            isNarrow ? (
              <>
                <div className="dict-popup__tabs">
                  {allGroups.map((g) => (
                    <button
                      key={g.providerId}
                      className={'dict-popup__tab' + (g.providerId === activeTabId ? ' dict-popup__tab--active' : '')}
                      onClick={() => setActiveTab(g.providerId)}
                    >
                      {g.providerName}
                    </button>
                  ))}
                </div>
                {renderGroupList(allGroups.filter((g) => g.providerId === activeTabId))}
              </>
            ) : (
              <div className="dict-popup__split-cols">
                <div className="dict-popup__split-col" ref={primaryColRef} onWheel={(e) => handleColumnWheel(e, true)}>
                  {renderGroupList(primaryGroup ? [primaryGroup] : [])}
                </div>
                <div className="dict-popup__split-col" ref={secondaryColRef} onWheel={(e) => handleColumnWheel(e, false)}>
                  {renderGroupList(secondaryGroups)}
                </div>
              </div>
            )
          ) : effectiveLayout === 'single' ? (
            renderGroupList(singleGroups)
          ) : (
            renderGroupList(allGroups)
          )
        ) : null}

        {instance?.sentence && <div className="dict-popup__sentence">“{instance.sentence}”</div>}

        {/* Settings → "Pin Save/Edit buttons": unpinned (default), this
            stays right here and scrolls away with a long entry list, same
            as always. Pinned, it renders outside .dict-popup__scroll
            instead (below), fixed at the bottom regardless of scroll. */}
        {!prefs.dictionaryPopupPinFooter && footer}
      </div>
      {prefs.dictionaryPopupPinFooter && <div className="dict-popup__footer-pinned">{footer}</div>}
      </div>
    </div>
  );
}
