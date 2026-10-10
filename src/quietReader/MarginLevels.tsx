import { useEffect, useMemo, useState } from 'react';
import { dictionaryManager } from '../dictionary';
import { normalize } from '../reader/tokenizer/arabicTokenizer';
import type { BookMeta, VocabTier, VocabularyItem } from '../types';
import { saveFile } from '../utils/saveFile';
import { formatVocabularyExport } from '../vocabRarity/exportVocabulary';
import { enableRarityData, isRarityDataReady } from '../vocabRarity/rarity';
import type { BookModel } from './bookModel';
import { cleanVocabIndex, type CleanVocabWord } from './cleanVocabIndex';
import { IconClose, IconJump } from './icons';
import { statusKindOf, statusLabel, type StatusKind } from './vocabStatus';

const TIERS: { id: VocabTier; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];
const PAGE = 40;

/** Words not in the frequency list are shown under Advanced. */
const tierOf = (tier: VocabTier): VocabTier => (tier === 'unlisted' ? 'advanced' : tier);

/** Glosses for the rows on screen, looked up a few at a time and kept for the session. */
const glossCache = new Map<string, Promise<string>>();
function glossOf(word: string): Promise<string> {
  let cached = glossCache.get(word);
  if (!cached) {
    cached = dictionaryManager
      .lookup(word)
      .then((r) => (r.entries.find((e) => e.providerId === 'aramorph') ?? r.entries[0])?.senses[0]?.gloss ?? '')
      .catch(() => '');
    glossCache.set(word, cached);
  }
  return cached;
}

/** Vocab levels in the margin: the book's words by how common they are, each a jump into the text. */
export function MarginLevels({
  book,
  model,
  savedItems,
  onJump,
  onClose,
  indexKey = book.id,
}: {
  book: BookMeta;
  model: BookModel;
  /** Which cached word index this model is (PDF pages keep theirs apart from the book's reflowed text). */
  indexKey?: string;
  savedItems: VocabularyItem[];
  onJump(word: string, occurrence: CleanVocabWord['occurrences'][number]): void;
  onClose(): void;
}) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState('');
  const [index, setIndex] = useState<CleanVocabWord[] | null>(null);
  const [tier, setTier] = useState<VocabTier>('intermediate');
  const [shown, setShown] = useState(PAGE);
  const [glosses, setGlosses] = useState<Record<string, string>>({});
  const [step, setStep] = useState<{ word: string; at: number } | null>(null);

  useEffect(() => {
    void isRarityDataReady().then(setReady);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let stale = false;
    cleanVocabIndex(indexKey, model)
      .catch(() => [] as CleanVocabWord[])
      .then((words) => !stale && setIndex(words));
    return () => {
      stale = true;
    };
  }, [ready, indexKey, model]);

  const words = useMemo(() => (index ?? []).filter((w) => tierOf(w.rarity.tier) === tier), [index, tier]);
  const visible = words.slice(0, shown);

  useEffect(() => {
    let stale = false;
    for (const w of visible) {
      if (glosses[w.word] !== undefined) continue;
      void glossOf(w.word).then((g) => !stale && setGlosses((prev) => (prev[w.word] === undefined ? { ...prev, [w.word]: g } : prev)));
    }
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((w) => w.word).join('|')]);

  const statusByWord = useMemo(() => {
    const map = new Map<string, StatusKind>();
    for (const item of savedItems) map.set(normalize(item.surfaceForm), statusKindOf(item));
    return map;
  }, [savedItems]);

  async function enable() {
    setEnabling(true);
    setError('');
    try {
      await enableRarityData();
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable vocabulary levels.');
    } finally {
      setEnabling(false);
    }
  }

  function jump(w: CleanVocabWord) {
    // Pressing again moves on to the word's next occurrence.
    const at = step?.word === w.word ? (step.at + 1) % w.occurrences.length : 0;
    setStep({ word: w.word, at });
    const occurrence = w.occurrences[at];
    if (occurrence) onJump(w.word, occurrence);
  }

  function exportTier() {
    const asBookWords = words.map((w) => ({ word: w.word, count: w.count, rarity: w.rarity, occurrences: [] }));
    const name = book.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60) || 'book';
    void saveFile(`${name}-vocabulary-${tier}.txt`, formatVocabularyExport(book.title, asBookWords), 'text/plain;charset=utf-8');
  }

  return (
    <aside className="qr-margin qr-levels" aria-label="Vocab levels">
      <div className="qr-levels__head">
        <h3 className="qr-sheet__title">Vocab levels</h3>
        <button type="button" className="qr-close" onClick={onClose} aria-label="Close vocab levels">
          <IconClose />
        </button>
      </div>
      <p className="qr-levels__blurb">Words in this book, grouped by how common they are in Arabic.</p>

      {ready === false && (
        <div className="qr-levels__enable">
          <p>Levels come from a frequency list built into the app. Nothing is downloaded.</p>
          <button type="button" className="qr-btn qr-btn--primary" onClick={() => void enable()} disabled={enabling}>
            {enabling ? 'Preparing…' : 'Turn on vocab levels'}
          </button>
          {error && <p className="qr-levels__error">{error}</p>}
        </div>
      )}

      {ready && (
        <>
          <div className="qr-seg qr-levels__tiers" role="group" aria-label="Level">
            {TIERS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={'qr-seg__btn' + (tier === t.id ? ' qr-seg__btn--on' : '')}
                aria-pressed={tier === t.id}
                onClick={() => {
                  setTier(t.id);
                  setShown(PAGE);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="qr-margin__scroll qr-levels__list">
            {!index && <p className="qr-empty">Reading the book…</p>}
            {index && words.length === 0 && <p className="qr-empty">No {tier} words in this book.</p>}
            {visible.map((w) => {
              const kind = statusByWord.get(normalize(w.word)) ?? 'none';
              const n = step?.word === w.word ? step.at + 1 : 0;
              return (
                <div key={w.word} className="qr-levels__row">
                  <div className="qr-levels__text">
                    <span className="qr-levels__gloss">{glosses[w.word] || (glosses[w.word] === '' ? '—' : '…')}</span>
                    <span className="qr-levels__meta">
                      ×{w.count} in this book
                      <span className={'qr-status qr-status--' + kind}>{statusLabel(kind)}</span>
                    </span>
                  </div>
                  <span className="qr-levels__word" dir="rtl" lang="ar">
                    {w.word}
                  </span>
                  <button
                    type="button"
                    className="qr-round-btn qr-round-btn--xs"
                    onClick={() => jump(w)}
                    aria-label="Show in the book"
                    title={n ? `Show in the book (${n} of ${w.occurrences.length})` : 'Show in the book'}
                  >
                    <IconJump />
                  </button>
                </div>
              );
            })}
            {words.length > shown && (
              <button type="button" className="qr-link qr-levels__more" onClick={() => setShown((s) => s + PAGE)}>
                Show more ({words.length - shown})
              </button>
            )}
          </div>
          <div className="qr-margin__foot qr-margin__foot--plain">
            <button type="button" className="qr-link" onClick={exportTier} disabled={!words.length}>
              Export these words
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
