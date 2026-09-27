import { useEffect, useState } from 'react';
import { SAMPLE_CLIPS } from '../../watcher/clips';
import { extractClipVocab } from '../../watcher/extractClipVocab';
import type { Clip, ClipVocabCard } from '../../watcher/types';
import './ClipLessonView.css';

type Phase = 'preteach' | 'watch' | 'recap' | 'done';

const PHASE_LABEL: Record<Phase, string> = {
  preteach: 'Learn the words',
  watch: 'Watch the clip',
  recap: 'Test yourself again',
  done: 'Done',
};

/**
 * Prototype "graded watcher" lesson: pre-teach the clip's new vocabulary as
 * flashcards, watch the clip with that vocabulary already primed, then
 * re-test the same cards to see what actually stuck. One hardcoded clip for
 * now (see watcher/clips.ts) -- proves the lesson shape before building
 * clip ingestion or wiring into the FSRS-scheduled vocabulary store.
 */
export function ClipLessonView() {
  const [clip] = useState<Clip>(SAMPLE_CLIPS[0]);
  const [cards, setCards] = useState<ClipVocabCard[] | null>(null);
  const [phase, setPhase] = useState<Phase>('preteach');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [preteachKnown, setPreteachKnown] = useState<Set<string>>(new Set());
  const [recapKnown, setRecapKnown] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    extractClipVocab(clip).then((result) => {
      if (!cancelled) setCards(result);
    });
    return () => {
      cancelled = true;
    };
  }, [clip]);

  function restart() {
    setPhase('preteach');
    setIndex(0);
    setFlipped(false);
    setPreteachKnown(new Set());
    setRecapKnown(new Set());
  }

  function startRecap() {
    setPhase('recap');
    setIndex(0);
    setFlipped(false);
  }

  function grade(known: boolean) {
    const current = cards?.[index];
    if (!current) return;
    if (known) {
      const setter = phase === 'preteach' ? setPreteachKnown : setRecapKnown;
      setter((prev) => new Set(prev).add(current.normalizedForm));
    }
    setFlipped(false);
    if (cards && index + 1 < cards.length) {
      setIndex((i) => i + 1);
      return;
    }
    if (phase === 'preteach') {
      setPhase('watch');
      setIndex(0);
    } else {
      setPhase('done');
    }
  }

  if (cards === null) {
    return (
      <div className="clip-lesson">
        <div className="clip-lesson__empty">Loading…</div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="clip-lesson">
        <header className="clip-lesson__header">
          <h1>Watch</h1>
        </header>
        <div className="clip-lesson__empty">
          <p>No dictionary entries matched this clip's vocabulary.</p>
          <p className="clip-lesson__empty-sub">
            Set up a dictionary provider under Settings → Dictionary, then come back here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="clip-lesson">
      <header className="clip-lesson__header">
        <h1>{clip.title}</h1>
        <span className="clip-lesson__phase-label">{PHASE_LABEL[phase]}</span>
      </header>

      {(phase === 'preteach' || phase === 'recap') && (
        <FlashcardStep
          card={cards[index]}
          index={index}
          total={cards.length}
          flipped={flipped}
          onFlip={() => setFlipped(true)}
          onGrade={grade}
        />
      )}

      {phase === 'watch' && <WatchStep clip={clip} cards={cards} onContinue={startRecap} />}

      {phase === 'done' && (
        <DoneStep cards={cards} preteachKnown={preteachKnown} recapKnown={recapKnown} onRestart={restart} />
      )}
    </div>
  );
}

function FlashcardStep({
  card,
  index,
  total,
  flipped,
  onFlip,
  onGrade,
}: {
  card: ClipVocabCard;
  index: number;
  total: number;
  flipped: boolean;
  onFlip: () => void;
  onGrade: (known: boolean) => void;
}) {
  return (
    <>
      <p className="clip-lesson__progress">
        {index + 1} of {total}
      </p>
      <div className="clip-lesson__card" onClick={() => !flipped && onFlip()}>
        <div className="clip-lesson__card-word" lang="ar" dir="rtl">
          {card.surfaceForm}
        </div>
        {!flipped && <div className="clip-lesson__card-hint">Tap to reveal</div>}
        {flipped && (
          <div className="clip-lesson__card-back">
            <span className="clip-lesson__card-meaning">{card.meaning}</span>
            {card.root && (
              <span className="clip-lesson__card-root">
                Root <bdi lang="ar">{card.root}</bdi>
              </span>
            )}
          </div>
        )}
      </div>
      {flipped ? (
        <div className="clip-lesson__actions">
          <button className="clip-lesson__btn clip-lesson__btn--miss" onClick={() => onGrade(false)}>
            Didn't know it
          </button>
          <button className="clip-lesson__btn clip-lesson__btn--hit" onClick={() => onGrade(true)}>
            Knew it
          </button>
        </div>
      ) : (
        <div className="clip-lesson__actions">
          <button className="clip-lesson__btn clip-lesson__btn--reveal" onClick={onFlip}>
            Reveal
          </button>
        </div>
      )}
    </>
  );
}

function WatchStep({ clip, cards, onContinue }: { clip: Clip; cards: ClipVocabCard[]; onContinue: () => void }) {
  const embedSrc = `https://www.youtube.com/embed/${clip.videoId}?start=${clip.startSec}&end=${clip.endSec}&rel=0`;
  return (
    <>
      <div className="clip-lesson__video">
        <iframe
          src={embedSrc}
          title={clip.title}
          allow="autoplay; encrypted-media"
          allowFullScreen
          frameBorder={0}
        />
      </div>
      <div className="clip-lesson__vocab-strip">
        {cards.map((card) => (
          <span key={card.normalizedForm} className="clip-lesson__chip" lang="ar" dir="rtl">
            {card.surfaceForm}
          </span>
        ))}
      </div>
      {clip.source && <p className="clip-lesson__source">{clip.source}</p>}
      <div className="clip-lesson__actions">
        <button className="clip-lesson__btn clip-lesson__btn--hit" onClick={onContinue}>
          Done watching — test me again
        </button>
      </div>
    </>
  );
}

function DoneStep({
  cards,
  preteachKnown,
  recapKnown,
  onRestart,
}: {
  cards: ClipVocabCard[];
  preteachKnown: Set<string>;
  recapKnown: Set<string>;
  onRestart: () => void;
}) {
  return (
    <>
      <p className="clip-lesson__summary">
        Before watching: {preteachKnown.size} of {cards.length} known. After: {recapKnown.size} of {cards.length}.
      </p>
      <ul className="clip-lesson__breakdown">
        {cards.map((card) => {
          const before = preteachKnown.has(card.normalizedForm);
          const after = recapKnown.has(card.normalizedForm);
          const status = before && after ? 'already knew' : !before && after ? 'learned it' : after ? 'knew it' : 'still shaky';
          return (
            <li key={card.normalizedForm} className={'clip-lesson__breakdown-row' + (after ? ' clip-lesson__breakdown-row--hit' : '')}>
              <span lang="ar" dir="rtl">
                {card.surfaceForm}
              </span>
              <span className="clip-lesson__breakdown-meaning">{card.meaning}</span>
              <span className="clip-lesson__breakdown-status">{status}</span>
            </li>
          );
        })}
      </ul>
      <div className="clip-lesson__actions">
        <button className="clip-lesson__btn clip-lesson__btn--reveal" onClick={onRestart}>
          Restart lesson
        </button>
      </div>
    </>
  );
}
