import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DictionaryEntry, DictionaryLookupResult, WordInstance, WordRarity } from '../../types';
import { getWordRarity, isRarityDataReady, TIER_LABELS } from '../../vocabRarity/rarity';
import { normalize } from '../../reader/tokenizer/arabicTokenizer';
import './DictionaryPopup.css';

const VIEWPORT_MARGIN = 12;
const WORD_GAP = 14;

export function DictionaryPopup({
  word,
  result,
  instance,
  saved,
  loading,
  x,
  y,
  sizePct = 100,
  onClose,
  onSave,
  onSaveEntry,
  onEdit,
}: {
  word: string;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
  loading: boolean;
  x: number;
  y: number;
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
  /** Opens the compact edit modal for this word's saved (or not-yet-saved)
   * card. */
  onEdit?: () => void;
}) {
  // Purely local, resets whenever the popup moves to a new word -- not
  // meant to track "is this permanently saved" (that's `saved`, computed
  // from vocabularyService for the word as a whole), just enough feedback
  // that tapping a per-entry "+" visibly did something.
  const [savedEntryKeys, setSavedEntryKeys] = useState<Set<number>>(new Set());
  useEffect(() => {
    setSavedEntryKeys(new Set());
  }, [word]);
  const primary = result?.entries[0];
  const morphology = result?.morphology?.[0];
  const root = primary?.root ?? morphology?.root;
  const lemma = primary?.lemma;

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

  // Viewport-safe positioning: rather than guessing the popup's size ahead
  // of time (the old approach — a fixed height estimate — could still clip
  // a genuinely tall entry list, and didn't account for the size
  // preference at all), render it invisibly first, measure its *actual*
  // rendered box, then place it so it's fully on-screen. Vertical overflow
  // past that still scrolls inside the popup (see .dict-popup's
  // max-height/overflow-y in the stylesheet) rather than growing off-screen.
  const popupRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ left: number; top: number; visibility: 'hidden' | 'visible' }>({
    left: x,
    top: y,
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x - rect.width / 2;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), vw - rect.width - VIEWPORT_MARGIN);

    const fitsAbove = y - WORD_GAP - rect.height >= VIEWPORT_MARGIN;
    let top: number;
    if (fitsAbove) {
      top = y - WORD_GAP - rect.height;
    } else {
      // Not enough room above -- try below, then fall back to whichever
      // side has more room, clamped so the popup is always fully visible
      // (never permanently clipped) even if that means covering the word.
      const fitsBelow = y + WORD_GAP + rect.height <= vh - VIEWPORT_MARGIN;
      top = fitsBelow ? y + WORD_GAP : Math.min(Math.max(y - rect.height / 2, VIEWPORT_MARGIN), vh - rect.height - VIEWPORT_MARGIN);
    }
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), vh - rect.height - VIEWPORT_MARGIN);

    setStyle({ left, top, visibility: 'visible' });
    // Re-measure whenever the word, loading state, or size preference
    // changes the popup's content/size, or the target point moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, loading, result, x, y, sizePct]);

  const scale = sizePct / 100;

  return (
    <div className="dict-popup-backdrop" onClick={onClose}>
      <div
        ref={popupRef}
        className="dict-popup"
        style={{ left: style.left, top: style.top, visibility: style.visibility, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="dict-popup__close" onClick={onClose} aria-label="Close">
          ×
        </button>

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

        {!loading && !result?.entries.length && (
          <div className="dict-popup__empty">No entry found for this word yet.</div>
        )}

        {!loading &&
          result?.entries.map((entry, i) => (
            <div className="dict-popup__entry" key={entry.providerId + i}>
              <div className="dict-popup__entry-head">
                <span className="dict-popup__headword">{entry.headword}</span>
                <span className="dict-popup__entry-head-right">
                  <span className="dict-popup__provider">{entry.providerName}</span>
                  {onSaveEntry && result.entries.length > 1 && (
                    <button
                      className="dict-popup__entry-save"
                      onClick={() => {
                        onSaveEntry(entry);
                        setSavedEntryKeys((prev) => new Set(prev).add(i));
                      }}
                      disabled={savedEntryKeys.has(i)}
                      aria-label={`Add just "${entry.headword}" to vocabulary`}
                      title="Add just this definition"
                    >
                      {savedEntryKeys.has(i) ? '✓' : '+'}
                    </button>
                  )}
                </span>
              </div>
              <ul className="dict-popup__senses">
                {entry.senses.map((s, i) => (
                  <li key={i}>
                    {s.gloss}
                    {(s.pos || s.gender) && (
                      <span className="dict-popup__tag">
                        {[s.pos, s.gender].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {(root || lemma) && (
          <div className="dict-popup__root">
            {lemma && (
              <div className="dict-popup__root-row">
                <span className="dict-popup__root-label">Dictionary form</span>
                <span className="dict-popup__root-value">{lemma}</span>
              </div>
            )}
            {root && (
              <div className="dict-popup__root-row">
                <span className="dict-popup__root-label">Root</span>
                <span className="dict-popup__root-value">{root}</span>
              </div>
            )}
          </div>
        )}

        {instance?.sentence && <div className="dict-popup__sentence">“{instance.sentence}”</div>}

        <div className="dict-popup__stats">
          <span>{instance?.encounterCount ?? 1} encounter{(instance?.encounterCount ?? 1) === 1 ? '' : 's'}</span>
          <span className="dict-popup__stats-dot">·</span>
          <span>{instance?.lookupCount ?? 1} lookup{(instance?.lookupCount ?? 1) === 1 ? '' : 's'}</span>
        </div>

        <div className="dict-popup__actions">
          <button className={'dict-popup__save' + (saved ? ' dict-popup__save--saved' : '')} onClick={onSave}>
            {saved ? '✓ Vocabulary' : 'Save Vocabulary'}
          </button>
          {onEdit && (
            <button className="dict-popup__edit" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
