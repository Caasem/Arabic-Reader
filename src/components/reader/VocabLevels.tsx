import { useEffect, useMemo, useState } from 'react';
import type { Book } from 'epubjs';
import type { BookMeta, BookVocabWord, VocabTier } from '../../types';
import { getBookVocabIndex } from '../../vocabRarity/bookVocabIndex';
import { isRarityDataReady, enableRarityData } from '../../vocabRarity/rarity';
import { formatVocabularyExport, downloadTextFile } from '../../vocabRarity/exportVocabulary';
import type { IngestProgress } from '../../vocabRarity/frequencyIndex';
import './VocabLevels.css';

const TIERS: { id: VocabTier; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

export function VocabLevels({
  book,
  bookHandle,
  collapsed,
  onToggleCollapse,
  onClose,
  onJumpToWord,
}: {
  book: BookMeta;
  /** The live epub.js Book instance, once the reader has finished opening
   * it — null while still loading, in which case this panel just waits. */
  bookHandle: Book | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Fully hides the panel (distinct from collapsing it to a strip) — wired
   * to the "Vocab Levels" nav tab's open/closed state in App.tsx. */
  onClose: () => void;
  onJumpToWord: (sectionHref: string, word: string, indexInSection: number) => void;
}) {
  const [rarityReady, setRarityReady] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [index, setIndex] = useState<BookVocabWord[] | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [activeTier, setActiveTier] = useState<VocabTier>('beginner');
  const [expanded, setExpanded] = useState<{ word: string; occurrenceIdx: number } | null>(null);

  useEffect(() => {
    isRarityDataReady().then(setRarityReady);
  }, []);

  useEffect(() => {
    if (!rarityReady || !bookHandle || collapsed) return;
    let cancelled = false;
    setIndexing(true);
    getBookVocabIndex(book.id, bookHandle)
      .then((result) => {
        if (!cancelled) setIndex(result);
      })
      .finally(() => {
        if (!cancelled) setIndexing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rarityReady, bookHandle, book.id, collapsed]);

  async function handleEnable() {
    setEnabling(true);
    setEnableError(null);
    try {
      await enableRarityData((p) => setProgress(p));
      setRarityReady(true);
    } catch (e) {
      setEnableError(e instanceof Error ? e.message : 'Could not download the frequency data.');
    } finally {
      setEnabling(false);
    }
  }

  const wordsForTier = useMemo(() => (index ?? []).filter((w) => tierGroup(w.rarity.tier) === activeTier), [
    index,
    activeTier,
  ]);

  function handleExport() {
    const content = formatVocabularyExport(book.title, wordsForTier);
    const safeTitle = book.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60) || 'book';
    downloadTextFile(`${safeTitle}-vocabulary-${activeTier}.txt`, content);
  }

  function toggleWord(w: BookVocabWord) {
    setExpanded((prev) => {
      if (prev?.word === w.word) return null; // clicking an already-expanded word collapses it
      // Clicking a word jumps straight to its first occurrence, not just
      // opens the stepper — "click it, see it in the book" is the point.
      const first = w.occurrences[0];
      if (first) onJumpToWord(first.sectionHref, w.word, first.indexInSection);
      return { word: w.word, occurrenceIdx: 0 };
    });
  }

  function stepOccurrence(w: BookVocabWord, delta: number) {
    setExpanded((prev) => {
      if (!prev || prev.word !== w.word) return prev;
      const next = Math.min(Math.max(prev.occurrenceIdx + delta, 0), w.occurrences.length - 1);
      const loc = w.occurrences[next];
      if (loc) onJumpToWord(loc.sectionHref, w.word, loc.indexInSection);
      return { ...prev, occurrenceIdx: next };
    });
  }

  if (collapsed) {
    return (
      <div className="vocab-levels__collapse-strip">
        <button className="vocab-levels__expand-btn" onClick={onToggleCollapse} aria-label="Expand Vocabulary Levels" title="Expand">
          ‹
        </button>
      </div>
    );
  }

  return (
    <aside className="vocab-levels">
      <div className="vocab-levels__header">
        <span className="vocab-levels__title">Vocabulary Levels</span>
        <div className="vocab-levels__header-actions">
          <button className="vocab-levels__collapse-btn" onClick={onToggleCollapse} aria-label="Collapse" title="Collapse">
            ›
          </button>
          <button className="vocab-levels__collapse-btn vocab-levels__close-btn" onClick={onClose} aria-label="Close Vocabulary Levels" title="Close">
            ×
          </button>
        </div>
      </div>

      {rarityReady === false && (
        <div className="vocab-levels__status">
          Rarity tiers are computed from a bundled Arabic word-frequency dataset (~65MB, downloaded once and cached by
          the browser; takes a few seconds to process each time you open the app).
          <br />
          <button className="vocab-levels__enable-btn" onClick={handleEnable} disabled={enabling}>
            {enabling ? 'Preparing…' : 'Enable vocabulary levels'}
          </button>
          {enabling && progress && (
            <div className="vocab-levels__progress">
              {progress.linesProcessed.toLocaleString()} words processed…
            </div>
          )}
          {enableError && <div className="vocab-levels__progress">{enableError}</div>}
        </div>
      )}

      {rarityReady === true && (
        <>
          <div className="vocab-levels__tiers">
            {TIERS.map((t) => (
              <button
                key={t.id}
                className={'vocab-levels__tier-btn' + (activeTier === t.id ? ' vocab-levels__tier-btn--active' : '')}
                onClick={() => setActiveTier(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="vocab-levels__body">
            {(indexing || !bookHandle) && <div className="vocab-levels__status">Scanning book…</div>}
            {!indexing && bookHandle && wordsForTier.length === 0 && (
              <div className="vocab-levels__status">No {TIERS.find((t) => t.id === activeTier)?.label.toLowerCase()} words found in this book.</div>
            )}
            {!indexing &&
              wordsForTier.map((w) => (
                <div className="vocab-levels__word" key={w.word}>
                  <button className="vocab-levels__word-row" onClick={() => toggleWord(w)}>
                    <span className="vocab-levels__word-text">{w.word}</span>
                    <span className="vocab-levels__word-count">{w.count}×</span>
                  </button>
                  {expanded?.word === w.word && (
                    <div className="vocab-levels__stepper">
                      <button onClick={() => stepOccurrence(w, -1)} disabled={expanded.occurrenceIdx === 0}>
                        ‹ Prev
                      </button>
                      <span className="vocab-levels__stepper-label">
                        {expanded.occurrenceIdx + 1} of {w.occurrences.length}
                        {w.occurrences.length < w.count ? '+' : ''}
                      </span>
                      <button
                        onClick={() => stepOccurrence(w, 1)}
                        disabled={expanded.occurrenceIdx >= w.occurrences.length - 1}
                      >
                        Next ›
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>

          <div className="vocab-levels__footer">
            <button className="vocab-levels__export-btn" onClick={handleExport} disabled={!wordsForTier.length}>
              Export {TIERS.find((t) => t.id === activeTier)?.label.toLowerCase()} words
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

/** `unlisted` words are shown grouped under the Advanced tab (see
 * `TIER_LABELS` in rarity.ts for why they're tracked separately in data
 * but not given their own tab). */
function tierGroup(tier: VocabTier): VocabTier {
  return tier === 'unlisted' ? 'advanced' : tier;
}
