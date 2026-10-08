import { useEffect, useRef, useState } from 'react';
import { getReaderMarks } from '../readerChords';
import type { BookMeta } from '../types';
import { pdfRegionInBox, textInBox, type Box, type PdfRegion, type TextRegion } from './pageGeometry';
import type { DeskItem, NewDeskItem } from './types';
import { capture, looksArabic } from './useDesk';

type Found = { kind: 'text'; region: TextRegion } | { kind: 'pdf'; region: PdfRegion; preview: string | null };

/**
 * Alt+X: drag a box over the page. On text pages the words inside become a quote (and can be highlighted);
 * on PDF pages the region is cut out of the page image, with any text-layer words as its text.
 */
export function RegionCapture({
  book,
  deskId,
  deskName,
  extra,
  onClose,
  onSent,
  onToast,
}: {
  book: BookMeta;
  deskId: string;
  deskName: string;
  /** Added to the captured item (a capture trip files it in a margin of the page the reader came from). */
  extra?: Partial<NewDeskItem>;
  onClose(): void;
  /** After a capture was saved, with the item made, instead of onClose. */
  onSent?(item: DeskItem): void;
  onToast(m: string): void;
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [busy, setBusy] = useState(false);
  const sendRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    const words = found?.kind === 'text' ? found.region.words : [];
    words.forEach((w) => w.classList.add('sd-picked'));
    return () => words.forEach((w) => w.classList.remove('sd-picked'));
  }, [found]);

  useEffect(() => () => {
    if (found?.kind === 'pdf' && found.preview) URL.revokeObjectURL(found.preview);
  }, [found]);

  useEffect(() => {
    if (found) sendRef.current?.focus();
  }, [found]);

  async function finish(b: Box) {
    if (b.right - b.left < 8 || b.bottom - b.top < 8) {
      setBox(null);
      return;
    }
    const text = textInBox(b);
    if (text) return setFound({ kind: 'text', region: text });
    const pdf = await pdfRegionInBox(b);
    if (pdf) return setFound({ kind: 'pdf', region: pdf, preview: pdf.image ? URL.createObjectURL(pdf.image) : null });
    onToast('Nothing to capture there. Drag over the text of the page.');
    setBox(null);
  }

  async function send() {
    if (!found || busy) return;
    setBusy(true);
    try {
      let item: DeskItem;
      if (found.kind === 'text') {
        const r = found.region;
        item = await capture(book, deskId, { type: 'quote', text: r.text, ar: looksArabic(r.text), source: { bookId: book.id, bookTitle: book.title, location: r.location, chapterLabel: getReaderMarks()?.capturePage()?.chapterLabel }, ...extra });
        if (highlight) {
          const marks = getReaderMarks();
          if (marks && !marks.existing({ text: r.text, location: r.location, chapterHref: `clean:${r.chapter}`, chapterLabel: '' }))
            await marks.saveNote({ text: r.text, location: r.location, chapterHref: `clean:${r.chapter}`, chapterLabel: '' }, '', 'yellow');
        }
      } else {
        const r = found.region;
        item = await capture(book, deskId, { type: 'capture', text: r.text || `Region of page ${r.page}`, ar: looksArabic(r.text), source: { bookId: book.id, bookTitle: book.title, location: r.location, chapterLabel: `Page ${r.page}` }, ...extra }, r.image ?? undefined);
      }
      if (onSent) return onSent(item);
      onToast(`Captured to ${deskName}${found.kind === 'text' && highlight ? ' and highlighted' : ''}`);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const style = box ? { left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top } : undefined;

  return (
    <>
      <div
        className="sd-region"
        onPointerDown={(e) => {
          if (found) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          setStart({ x: e.clientX, y: e.clientY });
          setBox({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY });
        }}
        onPointerMove={(e) => {
          if (!start) return;
          setBox({ left: Math.min(start.x, e.clientX), top: Math.min(start.y, e.clientY), right: Math.max(start.x, e.clientX), bottom: Math.max(start.y, e.clientY) });
        }}
        onPointerUp={() => {
          if (!start || !box) return;
          setStart(null);
          void finish(box);
        }}
      >
        {!found && <span className="sd-region__hint">Drag over the page to capture · Esc cancels</span>}
      </div>
      {box && <div className="sd-region__box" style={style} />}
      {found && (
        <div className="sd-capbar" role="dialog" aria-label="Capture">
          <div className="sd-capbar__thumb">
            {found.kind === 'pdf' && found.preview ? <img src={found.preview} alt="" /> : <span dir="auto">{found.kind === 'text' ? found.region.text : found.region.text || 'Image region'}</span>}
          </div>
          <div className="sd-capbar__mid">
            <b>{found.kind === 'pdf' ? `Region of page ${found.region.page}` : 'Words from the page'}</b>
            {found.kind === 'text' && (
              <label className="sd-capbar__chk">
                <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Also highlight these words
              </label>
            )}
          </div>
          <div className="sd-capbar__acts">
            <button ref={sendRef} type="button" className="sd-btn sd-btn--pri" disabled={busy} onClick={() => void send()}>
              Send to {deskName}
            </button>
            <button type="button" className="sd-btn" onClick={() => (setFound(null), setBox(null))}>
              Redraw
            </button>
            <button type="button" className="sd-btn" onClick={onClose}>
              Discard
            </button>
          </div>
        </div>
      )}
    </>
  );
}
