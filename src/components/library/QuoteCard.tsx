import { useState } from 'react';
import type { Highlight } from '../../types';
import { relativeDay } from './libraryInsights';
import { shareQuoteCard } from './quoteImage';

interface Props {
  /** Newest first. */
  highlights: Highlight[];
  onOpen(highlight: Highlight): void;
}

/** One of the reader's own highlights, big, with a way back to it in the book. */
export function QuoteCard({ highlights, onOpen }: Props) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  if (highlights.length === 0) {
    return (
      <figure className="lib-quote lib-quote--empty">
        <div className="lib-quote__eyebrow">From your highlights</div>
        <p className="lib-quote__empty">
          Select a passage while reading and choose a colour. Your highlights come back here, one at a time.
        </p>
      </figure>
    );
  }
  const i = ((index % highlights.length) + highlights.length) % highlights.length;
  const h = highlights[i];

  async function share() {
    setStatus(null);
    try {
      const result = await shareQuoteCard(h);
      if (result === 'downloaded') setStatus('Image saved');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not make the image.');
    }
  }

  return (
    <figure className="lib-quote" aria-label="From your highlights">
      <div className="lib-quote__head">
        <div className="lib-quote__eyebrow">From your highlights</div>
        {highlights.length > 1 && (
          <div className="lib-quote__nav">
            <button type="button" className="lib-quote__arrow" aria-label="Previous highlight" onClick={() => setIndex(i - 1)}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button type="button" className="lib-quote__arrow" aria-label="Next highlight" onClick={() => setIndex(i + 1)}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div className="lib-quote__mark" aria-hidden="true">
        ”
      </div>
      <blockquote className="lib-quote__text" dir="auto">
        <span className={`lib-mark lib-mark--${h.color}`}>{h.text}</span>
      </blockquote>
      {h.note && (
        <div className="lib-quote__note" dir="auto">
          {h.note}
        </div>
      )}
      <figcaption className="lib-quote__source">
        <span className="lib-quote__book" dir="auto">
          {h.bookTitle}
        </span>
        {h.chapterLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span dir="auto">{h.chapterLabel}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{relativeDay(h.createdAt)}</span>
      </figcaption>
      <div className="lib-quote__actions">
        <button type="button" className="btn lib-quote__open" onClick={() => onOpen(h)}>
          Open in book
        </button>
        <button type="button" className="btn lib-quote__share" onClick={() => void share()}>
          Share as card
        </button>
        <span className="lib-quote__pos" role="status">
          {status ?? `${i + 1} of ${highlights.length}`}
        </span>
      </div>
    </figure>
  );
}
