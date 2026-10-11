import { useEffect, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { usePreferences } from '../state/PreferencesContext';
import { useChordHotkey } from '../readerChords';
import { registerPdfPageExtension } from '../pdf/pages/extensions';
import { textInBox } from '../studyDesk/pageGeometry';
import { parseCleanLocation } from '../quietReader/location';
import { CleanInkLayer } from './CleanInk';
import { InkBar } from './InkBar';
import { refreshReaderTools, registerReaderTool } from '../readerTools';
import { IconPen, IconSketch } from './icons';
import { inkUi, keyOwner, redoInk, resetInkHistory, setInkUi, undoInk, useInkUi } from './inkUi';
import { PdfInkLayer, PdfInkToolbar } from './PdfInk';
import { SketchPanel } from './SketchPanel';
import { tabsAt, type Place } from './sheets';
import { bookSketches, newSketch, onInkChange, saveSketch } from './inkStore';
import { getItem } from '../studyDesk/deskStore';
import { isCleanLocation, parseCleanLocation as parseClean } from '../quietReader/location';
import type { Sketch } from './types';
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

  // The book's sheets, for the count on the Sketch button (how many sheets the place on screen has).
  const sheets = useRef<Sketch[]>([]);
  useEffect(() => {
    let live = true;
    const load = () =>
      void bookSketches(book.id).then((all) => {
        if (!live) return;
        sheets.current = all;
        refreshReaderTools();
      });
    load();
    const off = onInkChange(load);
    // The reader moving to another passage changes the count too (checked now and then, not on every scroll).
    let t = 0;
    const soon = () => {
      window.clearTimeout(t);
      t = window.setTimeout(refreshReaderTools, 500);
    };
    document.addEventListener('scroll', soon, true);
    return () => {
      live = false;
      off();
      window.clearTimeout(t);
      document.removeEventListener('scroll', soon, true);
    };
  }, [book.id]);

  // A margin ink card's Open as sheet (studyDesk/MarginLayer.tsx dispatches this): a new sheet of its handwriting.
  useEffect(() => {
    const toSheet = (e: Event) => {
      const id = (e as CustomEvent<{ itemId?: string }>).detail?.itemId;
      if (!id) return;
      void getItem(id).then(async (item) => {
        const at = item?.pin?.location ?? item?.source?.location;
        if (!item?.ink || !at) return;
        const pdf = /^pdf:(\d+)/.exec(at);
        const clean = isCleanLocation(at) ? parseClean(at) : null;
        if (!pdf && !clean) return;
        const s = newSketch(book.id, pdf ? `pdf:${pdf[1]}` : `clean:${clean!.chapter}`, pdf ? `pdf:${pdf[1]}` : at);
        s.title = 'Ḥāshiya ink';
        s.order = Date.now();
        // The ink's own units are pixels, as a sheet's are; a little room around it.
        s.strokes = item.ink.strokes.map((st, i) => ({ id: `${s.id}-${i}`, color: st.color, width: st.width, pts: st.pts.map(([x, y, p]) => [x + 24, y + 24, p]) }));
        await saveSketch(s);
        setInkUi({ sketch: true, openSketch: s.id });
      });
    };
    window.addEventListener('annotate:ink-to-sheet', toSheet);
    return () => window.removeEventListener('annotate:ink-to-sheet', toSheet);
  }, [book.id]);

  // Write and Sketch in the shared tool list: the dock (reader and PDF pages) and the Focus rail.
  useEffect(() => {
    const offs = [
      registerReaderTool({ id: 'ink:write', label: 'Write', title: 'Write on the page', keys: 'Alt+W', group: 'ink', order: 0, readers: ['clean', 'pdf'], icon: <IconPen size={18} />, isOn: () => inkUi().inking, run: () => setInkUi({ inking: !inkUi().inking }) }),
      registerReaderTool({
        id: 'ink:sketch',
        label: 'Sketch',
        title: 'Sketch beside the page',
        keys: 'Alt+K',
        group: 'ink',
        order: 1,
        readers: ['clean', 'pdf'],
        icon: <IconSketch size={18} />,
        isOn: () => inkUi().sketch,
        // How many sheets belong where the reader is, so sheets are not forgotten.
        live: () => {
          const p = readPlace();
          const n = p ? tabsAt(sheets.current, p).length : 0;
          return n ? String(n) : null;
        },
        run: () => setInkUi({ sketch: !inkUi().sketch, full: false }),
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => refreshReaderTools(), [ui.inking, ui.sketch, ui.pdfPage]);

  // A margin card sent from a sketch opens its sheet (studyDesk/MarginLayer.tsx dispatches this).
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<{ sketchId?: string }>).detail?.sketchId;
      if (id) setInkUi({ sketch: true, openSketch: id });
    };
    window.addEventListener('annotate:open-sketch', open);
    return () => window.removeEventListener('annotate:open-sketch', open);
  }, []);
  useEffect(() => {
    if (!ui.sketch) setInkUi({ openSketch: null });
  }, [ui.sketch]);

  useChordHotkey('KeyW', true, () => setInkUi({ inking: !inkUi().inking }));
  useChordHotkey('KeyK', true, () => setInkUi({ sketch: !inkUi().sketch, full: false }));
  // Alt+Shift+K: a new sheet, opening the panel if needed.
  useChordHotkey('KeyK', true, () => setInkUi({ sketch: true, full: false, newSheet: Date.now() }), true);

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
      {ui.inking && <InkBar where={where} />}
      {ui.sketch && <SketchPanel book={book} place={place} />}
    </>
  );
}
