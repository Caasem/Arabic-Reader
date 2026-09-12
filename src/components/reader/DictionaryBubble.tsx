import { useRef } from 'react';
import type { DictionaryLookupResult } from '../../types';
import './DictionaryBubble.css';

/** Condensed bubble shown for touch gestures bound to "Show definition
 * bubble" (see Settings → Touch gestures). Deliberately much smaller than
 * the full DictionaryPopup: one gloss, no root/sentence/rarity/stats — the
 * point is a glance-and-keep-reading answer, with a single "+" to save and
 * a tap-the-definition path to the full popup for anyone who wants more. */
const BUBBLE_GLOSS_MAX_CHARS = 60;

// iOS Safari fires a trailing synthetic 'click' as part of its touch-to-
// mouse compatibility emulation for the same tap that opened this bubble --
// dispatched via a hit-test against whatever's now on screen at that point,
// not the original tap target. Since the full-screen backdrop below gets
// inserted at exactly that point the instant this bubble opens (in the HOST
// document, a different document than the tap's original target inside the
// epub iframe, so the iframe's own touchend preventDefault can't suppress
// it), that trailing click lands on the backdrop and immediately dismisses
// the bubble the same tap just opened -- invisible to the user, since both
// happen within one gesture. Ignoring any dismiss-click in the first
// instant after mount (well past iOS's compatibility-click delay) avoids
// swallowing that ghost click without meaningfully delaying a genuine,
// separate dismiss tap afterwards.
const IGNORE_DISMISS_MS = 400;

export function DictionaryBubble({
  word,
  result,
  loading,
  saved,
  x,
  y,
  onOpenFull,
  onSave,
  onDismiss,
}: {
  word: string;
  result: DictionaryLookupResult | null;
  loading: boolean;
  saved: boolean;
  x: number;
  y: number;
  onOpenFull: () => void;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const primary = result?.entries[0];
  const gloss = primary?.senses[0]?.gloss;
  const condensed =
    gloss && gloss.length > BUBBLE_GLOSS_MAX_CHARS ? gloss.slice(0, BUBBLE_GLOSS_MAX_CHARS - 1) + '…' : gloss;

  const mountedAtRef = useRef(Date.now());
  function handleBackdropClick() {
    if (Date.now() - mountedAtRef.current < IGNORE_DISMISS_MS) return;
    onDismiss();
  }

  // Small footprint compared to the full popup — a lower height estimate
  // is enough to decide whether it fits above the tapped word, same
  // above/below-flip and horizontal-clamp approach as DictionaryPopup.
  const BUBBLE_HEIGHT_ESTIMATE = 90;
  const clampedX = Math.min(Math.max(x, 120), window.innerWidth - 120);
  const showBelow = y < BUBBLE_HEIGHT_ESTIMATE + 16;
  const clampedY = showBelow ? Math.min(y, window.innerHeight - 40) : Math.min(y, window.innerHeight - 20);

  return (
    <div className="dict-bubble-backdrop" onClick={handleBackdropClick}>
      <div
        className={'dict-bubble' + (showBelow ? ' dict-bubble--below' : '')}
        style={{ left: clampedX, top: clampedY }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="dict-bubble__def" onClick={onOpenFull} disabled={loading} aria-label={`${word} — open full entry`}>
          <span className="dict-bubble__word">{word}</span>
          <span className="dict-bubble__gloss">
            {loading ? 'Looking up…' : (condensed ?? 'No definition found — tap for more')}
          </span>
        </button>
        <button
          className={'dict-bubble__save' + (saved ? ' dict-bubble__save--saved' : '')}
          onClick={onSave}
          disabled={saved || loading || !result?.entries.length}
          aria-label={saved ? 'Already in vocabulary' : 'Save to vocabulary'}
        >
          {saved ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
}
