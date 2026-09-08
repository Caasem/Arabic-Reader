import { useEffect, useState } from 'react';
import type { DictionaryLookupResult, WordInstance, WordRarity } from '../../types';
import { getWordRarity, isRarityDataReady, TIER_LABELS } from '../../vocabRarity/rarity';
import { normalize } from '../../reader/tokenizer/arabicTokenizer';
import './DictionaryPopup.css';

export function DictionaryPopup({
  word,
  result,
  instance,
  saved,
  loading,
  x,
  y,
  onClose,
  onSave,
}: {
  word: string;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
  loading: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onSave: () => void;
}) {
  const primary = result?.entries[0];
  const morphology = result?.morphology?.[0];
  const root = primary?.root ?? morphology?.root;

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
      getWordRarity(normalize(word)).then((r) => {
        if (!cancelled) setRarity(r);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  // Keep the popup on-screen: clamp horizontally, and flip to below the
  // clicked word when there isn't enough room above it (e.g. a word near
  // the top of the page) rather than letting the card run off-screen.
  const POPUP_HEIGHT_ESTIMATE = 280;
  const clampedX = Math.min(Math.max(x, 160), window.innerWidth - 160);
  const showBelow = y < POPUP_HEIGHT_ESTIMATE + 24;
  const clampedY = showBelow ? Math.min(y, window.innerHeight - 40) : Math.min(y, window.innerHeight - 20);

  return (
    <div className="dict-popup-backdrop" onClick={onClose}>
      <div
        className={'dict-popup' + (showBelow ? ' dict-popup--below' : '')}
        style={{ left: clampedX, top: clampedY }}
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
          result?.entries.map((entry) => (
            <div className="dict-popup__entry" key={entry.providerId}>
              <div className="dict-popup__entry-head">
                <span className="dict-popup__headword">{entry.headword}</span>
                <span className="dict-popup__provider">{entry.providerName}</span>
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

        {root && (
          <div className="dict-popup__root">
            <span className="dict-popup__root-label">Root</span>
            <span className="dict-popup__root-value">{root}</span>
          </div>
        )}

        {instance?.sentence && <div className="dict-popup__sentence">“{instance.sentence}”</div>}

        <div className="dict-popup__stats">
          <span>{instance?.encounterCount ?? 1} encounter{(instance?.encounterCount ?? 1) === 1 ? '' : 's'}</span>
          <span className="dict-popup__stats-dot">·</span>
          <span>{instance?.lookupCount ?? 1} lookup{(instance?.lookupCount ?? 1) === 1 ? '' : 's'}</span>
        </div>

        <button className={'dict-popup__save' + (saved ? ' dict-popup__save--saved' : '')} onClick={onSave} disabled={saved}>
          {saved ? '✓ In vocabulary' : '+ Add to vocabulary'}
        </button>
      </div>
    </div>
  );
}
