import { useEffect, useRef, useState } from 'react';
import { getReaderMarks } from '../readerChords';
import type { BookMeta } from '../types';
import { capture, looksArabic } from './useDesk';

/** Alt+C: one line under the page. Enter sends it to the inbox and the desk; focus goes back to the book. */
export function ConceptStrip({ book, deskId, deskName, onClose, onToast }: { book: BookMeta; deskId: string; deskName: string; onClose(): void; onToast(m: string): void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  async function send() {
    const t = text.trim();
    if (!t) return onClose();
    const page = getReaderMarks()?.capturePage();
    await capture(book, deskId, { type: 'concept', text: t, ar: looksArabic(t), source: { bookId: book.id, bookTitle: book.title, location: page?.location, chapterLabel: page?.chapterLabel } });
    onToast(`Concept added to ${deskName}`);
    onClose();
  }

  return (
    <div className="sd-strip" role="dialog" aria-label="Write a concept">
      <span className="sd-strip__label">Concept</span>
      <input
        ref={ref}
        dir="auto"
        value={text}
        placeholder="Write it down. Enter sends it to the inbox."
        aria-label="Concept"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void send();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <kbd>Alt C</kbd>
    </div>
  );
}
