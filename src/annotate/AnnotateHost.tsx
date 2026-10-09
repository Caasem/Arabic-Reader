import { useEffect, useState } from 'react';
import type { BookMeta } from '../types';
import { usePreferences } from '../state/PreferencesContext';
import { useChordHotkey } from '../readerChords';
import { registerPdfPageExtension } from '../pdf/pages/extensions';
import { textInBox } from '../studyDesk/pageGeometry';
import { parseCleanLocation } from '../quietReader/location';
import { CleanInkLayer } from './CleanInk';
import { InkBar } from './InkBar';
import { InkSwitch } from './InkSwitch';
import { inkUi, keyOwner, redoInk, resetInkHistory, setInkUi, undoInk, useInkUi } from './inkUi';
import { PdfInkLayer, PdfInkToolbar } from './PdfInk';
import { SketchPanel, type Place } from './SketchPanel';
import './annotate.css';

/** Mounted once beside the active reader (ReaderSwitch); renders nothing when switched off. */
export function AnnotateHost({ book }: { book: BookMeta }) {
  const { prefs } = usePreferences();
  return prefs.annotateEnabled ? <Active book={book} /> : null;
}

/** Where the reader is now: the PDF page being read, or the passage of the quiet reader on screen. */
function readPlace(): Place | null {
  const ui = inkUi();
  if (document.querySelector('.pdfp') && ui.pdfPage) return { kind: 'pdf', page: ui.pdfPage };
  const stage = document.querySelector<HTMLElement>('.qr .qr-stage');
  if (!stage) return null;
  const r = stage.getBoundingClientRect();
  const column = stage.querySelector('.qr-column')?.getBoundingClientRect();
  const box = { left: Math.max(r.left, column?.left ?? r.left), right: Math.min(r.right, column?.right ?? r.right), top: r.top, bottom: r.bottom };
  const at = parseCleanLocation(textInBox(box)?.location);
  return at ? { kind: 'clean', ...at } : null;
}

const samePlace = (a: Place | null, b: Place | null) => JSON.stringify(a) === JSON.stringify(b);

function Active({ book }: { book: BookMeta }) {
  const ui = useInkUi();
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => registerPdfPageExtension({ id: 'annotate', Layer: PdfInkLayer, Toolbar: PdfInkToolbar }), []);

  // A new book starts with the pen put down and its own Undo.
  useEffect(() => {
    resetInkHistory();
    return () => setInkUi({ inking: false, sketch: false, full: false });
  }, [book.id]);

  useChordHotkey('KeyW', true, () => setInkUi({ inking: !inkUi().inking }));
  useChordHotkey('KeyK', true, () => setInkUi({ sketch: !inkUi().sketch, full: false }));

  // Follow the reader while the sketch is open, so the sheet belongs to what is on screen.
  useEffect(() => {
    if (!ui.sketch) return;
    const check = () => setPlace((p) => {
      const now = readPlace();
      return samePlace(p, now) ? p : now;
    });
    check();
    let t = 0;
    const soon = () => {
      window.clearTimeout(t);
      t = window.setTimeout(check, 350);
    };
    document.addEventListener('scroll', soon, true);
    const tick = window.setInterval(check, 1200);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(tick);
      document.removeEventListener('scroll', soon, true);
    };
  }, [ui.sketch, ui.pdfPage]);

  // While writing on the page: tool keys, Undo and Redo, Esc puts the pen down.
  useEffect(() => {
    if (!ui.inking) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((ui.sketch && keyOwner.sketch) || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.altKey) return;
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') return take(), void (e.shiftKey ? redoInk() : undoInk());
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') return take(), void redoInk();
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') return take(), setInkUi({ inking: false });
      const tool = ({ KeyP: 'pen', KeyM: 'marker', KeyE: 'eraser' } as const)[e.code as 'KeyP' | 'KeyM' | 'KeyE'];
      if (tool) return take(), setInkUi({ tool });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ui.inking, ui.sketch]);

  // The quiet reader's selection and dictionary stay out of the way while the pen is down.
  useEffect(() => {
    document.body.classList.toggle('ink-writing', ui.inking);
    if (ui.inking) window.getSelection()?.removeAllRanges();
    return () => document.body.classList.remove('ink-writing');
  }, [ui.inking]);
  useEffect(() => {
    document.body.classList.toggle('ink-sketching', ui.sketch && !ui.full);
    return () => document.body.classList.remove('ink-sketching');
  }, [ui.sketch, ui.full]);

  const where = ui.pdfPage && document.querySelector('.pdfp') ? `page ${ui.pdfPage}` : 'the page';
  return (
    <>
      <CleanInkLayer book={book} />
      <InkSwitch />
      {ui.inking && <InkBar where={where} />}
      {ui.sketch && <SketchPanel book={book} place={place} />}
    </>
  );
}
