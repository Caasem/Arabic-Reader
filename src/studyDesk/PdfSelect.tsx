import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { updateItem } from './deskStore';
import { formatPdfLocation, pdfRegionInBox } from './pageGeometry';
import { pdfDeskState, setPdfDeskFocus, setPdfDeskTie, usePdfDesk } from './pdfDesk';
import { setSnapEnabled, snapDrag, snapEnabled, type FracBox, type Snapped } from './pdfSnap';
import { capture, looksArabic, type DeskData } from './useDesk';

/**
 * Highlighting straight on PDF pages, without Alt+X. On a scanned page, drag over words with a mouse or pen
 * (touch keeps scrolling); on a page with a text layer, select text as usual. The box snaps to the words
 * inside it (pdfSnap.ts) and a bar beside it offers Gloss in the margin, Send to inbox, snapping on or off,
 * and Cancel. While a margin note waits to be tied (Tie to words), the bar ties it instead.
 * Works from the pages view's DOM (`.pdfp-page[data-page]`, `.pdfp-text`); the reader is not changed.
 */

const MIN_DRAG = 8;

interface Pending {
  page: number;
  frame: HTMLElement;
  drag: FracBox;
  snapped: Snapped | null;
}

const isTextPage = (frame: HTMLElement) => Array.from(frame.querySelectorAll('.pdfp-text span')).some((s) => (s.textContent ?? '').trim());

function fracOf(frame: HTMLElement, a: { x: number; y: number }, b: { x: number; y: number }): FracBox {
  const f = frame.getBoundingClientRect();
  const x0 = Math.max(0, Math.min(a.x, b.x) - f.left) / f.width;
  const y0 = Math.max(0, Math.min(a.y, b.y) - f.top) / f.height;
  const x1 = Math.min(f.width, Math.max(a.x, b.x) - f.left) / f.width;
  const y1 = Math.min(f.height, Math.max(a.y, b.y) - f.top) / f.height;
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function onScreen(frame: HTMLElement, b: FracBox) {
  const f = frame.getBoundingClientRect();
  return { left: f.left + b.x * f.width, top: f.top + b.y * f.height, width: b.w * f.width, height: b.h * f.height };
}

export function PdfSelect({ book, data, active, onToast }: { book: BookMeta; data: DeskData; active: boolean; onToast(m: string): void }) {
  const { prefs } = usePreferences();
  const { tie } = usePdfDesk();
  const [pending, setPending] = useState<Pending | null>(null);
  const [live, setLive] = useState<{ frame: HTMLElement; a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [snap, setSnap] = useState(snapEnabled);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const run = useRef(0);

  const snapNow = useCallback(async (p: Pending, on: boolean) => {
    const mine = ++run.current;
    setPending({ ...p, snapped: null });
    const snapped = await snapDrag(p.frame, p.page, p.drag, { snap: on, opened: pdfDeskState().opened });
    if (mine === run.current) setPending({ ...p, snapped });
  }, []);

  // Drags on scanned pages, and text selections on pages with a text layer.
  useEffect(() => {
    if (!active) return;
    let down: { frame: HTMLElement; x: number; y: number; id: number } | null = null;
    let dragging = false;
    let swallowClick = false;
    const pageAt = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('.pdfp-page[data-page]') : null);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === 'touch' || e.altKey || e.ctrlKey || e.metaKey) return;
      const frame = pageAt(e.target);
      if (!frame || isTextPage(frame)) return;
      down = { frame, x: e.clientX, y: e.clientY, id: e.pointerId };
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) < MIN_DRAG) return;
      dragging = true;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      setLive({ frame: down.frame, a: { x: down.x, y: down.y }, b: { x: e.clientX, y: e.clientY } });
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down;
      down = null;
      setLive(null);
      if (!dragging) return;
      // The click that follows a drag is not a tap on a word.
      swallowClick = true;
      const drag = fracOf(d.frame, { x: d.x, y: d.y }, { x: e.clientX, y: e.clientY });
      if (drag.w < 0.005 || drag.h < 0.005) return;
      void snapNow({ page: Number(d.frame.dataset.page) || 1, frame: d.frame, drag, snapped: null }, snapEnabled());
    };
    // Text pages: a finished selection inside the text layer.
    const onMouseUp = (e: MouseEvent) => {
      const frame = pageAt(e.target);
      if (!frame || !isTextPage(frame)) return;
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, ' ').trim();
      if (!sel || sel.isCollapsed || !text || !frame.contains(sel.anchorNode)) return;
      const rects = Array.from(sel.getRangeAt(0).getClientRects()).filter((r) => r.width && r.height);
      if (!rects.length) return;
      swallowClick = true;
      const f = frame.getBoundingClientRect();
      const x0 = Math.min(...rects.map((r) => r.left));
      const y0 = Math.min(...rects.map((r) => r.top));
      const x1 = Math.max(...rects.map((r) => r.right));
      const y1 = Math.max(...rects.map((r) => r.bottom));
      const box = { x: (x0 - f.left) / f.width, y: (y0 - f.top) / f.height, w: (x1 - x0) / f.width, h: (y1 - y0) / f.height };
      run.current++;
      setPending({ page: Number(frame.dataset.page) || 1, frame, drag: box, snapped: { box, text, via: 'text' } });
    };
    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      if (pageAt(e.target)) e.stopPropagation();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [active, snapNow]);

  // Esc: drop the box, or stop waiting to tie.
  useEffect(() => {
    if (!pending && !tie) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (pending) setPending(null);
      else {
        setPdfDeskTie(null);
        onToast('Tie cancelled');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pending, tie, onToast]);

  // The page scrolls under the box: follow it.
  useEffect(() => {
    if (!pending) return;
    const move = () => setTick((t) => t + 1);
    document.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    return () => {
      document.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', move);
    };
  }, [pending]);

  async function keep(where: 'margin' | 'inbox') {
    const p = pending;
    if (!p?.snapped || busy) return;
    setBusy(true);
    try {
      const { box, text, via } = p.snapped;
      const location = formatPdfLocation(p.page, box.x, box.y, box.w, box.h);
      // Scanned pages keep the picture of the words too: what was read can be checked against it.
      const s = onScreen(p.frame, box);
      const image = via === 'text' ? null : (await pdfRegionInBox({ left: s.left, top: s.top, right: s.left + s.width, bottom: s.top + s.height }))?.image ?? null;
      const item = await capture(
        book,
        data.deskId,
        {
          type: text ? 'quote' : 'capture',
          text: text || `Region of page ${p.page}`,
          ar: looksArabic(text),
          source: { bookId: book.id, bookTitle: book.title, location, chapterLabel: `Page ${p.page}` },
          inInbox: where === 'inbox' || prefs.studyDeskMarginsToInbox === 'auto',
        },
        image ?? undefined
      );
      setPending(null);
      window.getSelection()?.removeAllRanges();
      if (where === 'margin') setPdfDeskFocus(item.id);
      onToast(where === 'inbox' ? 'Sent to the inbox' : text ? 'Gloss it in the margin' : 'Region kept; gloss it in the margin');
    } finally {
      setBusy(false);
    }
  }

  async function tieHere() {
    const p = pending;
    if (!p?.snapped || !tie) return;
    const { box, text } = p.snapped;
    await updateItem(tie, { text: text || `Region of page ${p.page}`, ar: looksArabic(text), pin: { bookId: book.id, location: formatPdfLocation(p.page, box.x, box.y, box.w, box.h), side: 'right' } });
    setPdfDeskTie(null);
    setPending(null);
    window.getSelection()?.removeAllRanges();
    onToast('Tied to the words');
  }

  const dragBox = live && fracOf(live.frame, live.a, live.b);
  const shown = pending && (pending.snapped ? pending.snapped.box : pending.drag);
  const s = pending && shown ? onScreen(pending.frame, shown) : null;
  const tiedNote = tie ? data.items.find((i) => i.id === tie) : undefined;

  return (
    <>
      {tie && !pending && (
        <div className="sd-pdfsel__tie" role="status">
          Drag over the words on the page this note belongs to{tiedNote?.body ? `: “${tiedNote.body.split('\n')[0].slice(0, 40)}”` : ''} · <kbd>Esc</kbd> cancels
        </div>
      )}
      {live && dragBox && <div className="sd-pdfsel__box" style={onScreen(live.frame, dragBox)} />}
      {pending && s && (
        <>
          <div className={'sd-pdfsel__box' + (pending.snapped ? ' sd-pdfsel__box--snapped' : '')} style={s} />
          <div
            className="sd-pdfsel__bar"
            role="dialog"
            aria-label="Highlight on the page"
            style={{ left: Math.min(Math.max(8, s.left), window.innerWidth - 470), top: Math.min(s.top + s.height + 8, window.innerHeight - 64) }}
          >
            {!pending.snapped ? (
              <span className="sd-pdfsel__msg">Reading the words…</span>
            ) : tie ? (
              <button type="button" className="sd-btn sd-btn--pri" onClick={() => void tieHere()}>
                Tie the note to {pending.snapped.text ? 'these words' : 'this region'}
              </button>
            ) : (
              <>
                <button type="button" className="sd-btn sd-btn--pri" disabled={busy} onClick={() => void keep('margin')}>
                  {pending.snapped.text ? 'Gloss in the margin' : 'Gloss this region'}
                </button>
                <button type="button" className="sd-btn" disabled={busy} onClick={() => void keep('inbox')}>
                  Send to inbox
                </button>
              </>
            )}
            {pending.snapped?.via !== 'text' && (
              <button
                type="button"
                className="sd-pdfsel__snap"
                aria-pressed={snap}
                title={snap ? 'The box snaps to the words read on the page' : 'The box stays as dragged, an image region'}
                onClick={() => {
                  setSnap(!snap);
                  setSnapEnabled(!snap);
                  void snapNow(pending, !snap);
                }}
              >
                Snap to words · {snap ? 'on' : 'off'}
              </button>
            )}
            <button type="button" className="sd-pdfsel__x" aria-label="Cancel" title="Cancel (Esc)" onClick={() => setPending(null)}>
              ×
            </button>
            {pending.snapped?.text && (
              <div className="sd-pdfsel__text" dir="auto">
                {pending.snapped.text.length > 120 ? pending.snapped.text.slice(0, 120) + '…' : pending.snapped.text}
              </div>
            )}
            {pending.snapped && pending.snapped.via === 'none' && snap && <div className="sd-pdfsel__note">No words read there: kept as an image region.</div>}
          </div>
        </>
      )}
    </>
  );
}
