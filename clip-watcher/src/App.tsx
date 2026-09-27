import { useState } from 'react';
import { SAMPLE_CLIPS } from './clips';
import { FlashcardPanel } from './FlashcardPanel';
import { Transcript } from './Transcript';
import type { Clip, ClipVocabWord } from './types';

type PanelMode = 'preteach' | 'recap' | null;

export function App() {
  const [clipId, setClipId] = useState(SAMPLE_CLIPS[0].id);
  const clip = SAMPLE_CLIPS.find((c) => c.id === clipId)!;

  return (
    <div className="page">
      {SAMPLE_CLIPS.length > 1 && (
        <nav className="clip-picker">
          {SAMPLE_CLIPS.map((c) => (
            <button
              key={c.id}
              className={'link' + (c.id === clipId ? ' clip-picker__active' : '')}
              onClick={() => setClipId(c.id)}
            >
              {c.title}
            </button>
          ))}
        </nav>
      )}
      {/* key resets the lesson's local state (panel/known-words) when the clip changes */}
      <Lesson key={clip.id} clip={clip} />
    </div>
  );
}

function Lesson({ clip }: { clip: Clip }) {
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [preteachKnown, setPreteachKnown] = useState<Set<string> | null>(null);
  const [recapKnown, setRecapKnown] = useState<Set<string> | null>(null);
  // Words added from the transcript, on top of the curated set -- kept
  // separate so RecapSummary can still tell "curated" from "added" if
  // that distinction turns out to matter later.
  const [addedWords, setAddedWords] = useState<ClipVocabWord[]>([]);
  const vocab = [...clip.vocab, ...addedWords];
  const vocabForms = new Set(vocab.map((w) => w.surfaceForm));

  function addWord(word: ClipVocabWord) {
    setAddedWords((prev) => (prev.some((w) => w.surfaceForm === word.surfaceForm) ? prev : [...prev, word]));
  }

  const embedSrc = `https://www.youtube.com/embed/${clip.videoId}?start=${clip.startSec}&end=${clip.endSec}&rel=0`;

  return (
    <>
      <header className="page__header">
        <h1 lang="ar" dir="rtl">
          {clip.title}
        </h1>
        {clip.source && <p className="page__source">{clip.source}</p>}
      </header>

      <section className="section">
        <div className="section__top">
          <h2>Vocabulary</h2>
          <button className="link" onClick={() => setPanelMode(panelMode === 'preteach' ? null : 'preteach')}>
            {panelMode === 'preteach' ? 'Close' : 'Revise words'}
          </button>
        </div>
        <div className="vocab-grid">
          {vocab.map((w) => (
            <div key={w.surfaceForm} className="vocab-grid__item">
              <span className="vocab-grid__word" lang="ar" dir="rtl">
                {w.surfaceForm}
              </span>
              <span className="vocab-grid__meaning">{w.meaning}</span>
            </div>
          ))}
        </div>
        {panelMode === 'preteach' && (
          <FlashcardPanel
            words={vocab}
            onClose={() => setPanelMode(null)}
            onComplete={(known) => {
              setPreteachKnown(known);
              setPanelMode(null);
            }}
          />
        )}
      </section>

      <section className="section">
        <h2>Video</h2>
        <div className="video">
          <iframe src={embedSrc} title={clip.title} allow="autoplay; encrypted-media" allowFullScreen frameBorder={0} />
        </div>
      </section>

      <section className="section">
        <h2>Transcript</h2>
        <Transcript clip={clip} vocabForms={vocabForms} onAddWord={addWord} />
      </section>

      <section className="section">
        <div className="section__top">
          <h2>Recap</h2>
          {!recapKnown && (
            <button className="link" onClick={() => setPanelMode(panelMode === 'recap' ? null : 'recap')}>
              {panelMode === 'recap' ? 'Close' : 'Test myself'}
            </button>
          )}
        </div>
        {panelMode === 'recap' && (
          <FlashcardPanel
            words={vocab}
            onClose={() => setPanelMode(null)}
            onComplete={(known) => {
              setRecapKnown(known);
              setPanelMode(null);
            }}
          />
        )}
        {recapKnown && (
          <RecapSummary
            vocab={vocab}
            preteachKnown={preteachKnown}
            recapKnown={recapKnown}
            onRetest={() => {
              setRecapKnown(null);
              setPanelMode('recap');
            }}
          />
        )}
      </section>
    </>
  );
}

function RecapSummary({
  vocab,
  preteachKnown,
  recapKnown,
  onRetest,
}: {
  vocab: { surfaceForm: string; meaning: string }[];
  preteachKnown: Set<string> | null;
  recapKnown: Set<string>;
  onRetest: () => void;
}) {
  return (
    <>
      <p className="section__hint">
        {recapKnown.size} of {vocab.length} known now
        {preteachKnown ? ` (${preteachKnown.size} of ${vocab.length} before watching)` : ''}.
      </p>
      <div className="vocab-grid">
        {vocab.map((w) => {
          const after = recapKnown.has(w.surfaceForm);
          const before = preteachKnown?.has(w.surfaceForm) ?? false;
          const status = !preteachKnown ? (after ? 'knew it' : 'still shaky') : before && after ? 'already knew' : !before && after ? 'learned it' : after ? 'knew it' : 'still shaky';
          return (
            <div key={w.surfaceForm} className="vocab-grid__item">
              <span className="vocab-grid__word" lang="ar" dir="rtl">
                {w.surfaceForm}
              </span>
              <span className="vocab-grid__meaning">{w.meaning}</span>
              <span className="vocab-grid__status">{status}</span>
            </div>
          );
        })}
      </div>
      <button className="link" onClick={onRetest}>
        Test again
      </button>
    </>
  );
}
