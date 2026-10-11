import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { formatCleanLocation } from '../quietReader/location';
import { saveFile } from '../utils/saveFile';
import { getReaderMarks } from '../readerChords';
import { openDictionaryPage } from '../dictionaryPage/events';
import { updateItem } from '../studyDesk/deskStore';
import { goToPlace, placeRects } from './placeLinks';
import { TEMPLATES } from './templates';
import { HIGHLIGHTER_PRESETS } from '../studyDesk/highlighterColour';
import { bookSketches, deleteSketch, isEmptySketch, newSketch, onInkChange, saveSketch } from './inkStore';
import { refreshSketchCards, sendSketchToMargin, sketchOutline, sketchPng, sketchSvgBlob, type SendHow } from './toMargin';
import { usePreferences } from '../state/PreferencesContext';
import { COLOR_NAMES, inkUi, keyOwner, PEN_WIDTHS, setInkUi, THEME_COLORS, useInkUi } from './inkUi';
import { SketchSurface, type DiagramTool, type DrawTool, type SurfaceState } from './sketchSurface';
import { covers, nextTitle, placeKey, searchSheets, rangeScope, recallTab, rememberTab, scopeLabel, scopeOf, sheetName, sheetUnit, tabsAt, type Place } from './sheets';
import type { InkColor, Sketch } from './types';
import { IconArrow, IconClose, IconEraser, IconExpand, IconHand, IconLasso, IconLink, IconMarker, IconNode, IconPen, IconQuote, IconRedo, IconSelect, IconTrash, IconUndo } from './icons';

export type { Place } from './sheets';

const placeLabel = (p: Place) => (p.kind === 'pdf' ? `Page ${p.page}` : 'This passage');
const fileName = (book: BookMeta, s: Sketch, name: string, ext: string) => `${book.title} - ${name} (${scopeLabel(s)}).${ext}`.replace(/[\\/:*?"<>|]+/g, ' ');

/**
 * The sketch panel beside the page (Alt+K): sheets of freehand writing and diagrams, as tabs. Every sheet that
 * belongs to the place on screen is a tab (sheets.ts): the place's own sheets, sheets kept for a range of pages or
 * chapters, and whole-book sheets. + opens a new sheet (kept once something is on it); a tab's ✕ closes it (it
 * stays in All sheets); its menu renames it, changes what it belongs to, duplicates, moves, exports or deletes it.
 * The tab last used at a place opens there again; the pin keeps the sheet on screen while the reader moves.
 * It docks at the right; Expand gives it the whole reader. Tapping the page outside it, or Esc, closes it.
 */
export function SketchPanel({ book, place }: { book: BookMeta; place: Place | null }) {
  const ui = useInkUi();
  const { prefs } = usePreferences();
  const [menu, setMenu] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [tabMenu, setTabMenu] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [find, setFind] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [undoDelete, setUndoDelete] = useState<Sketch | null>(null);
  /** The line from a pointed-at quote to its words on the page. */
  const [lead, setLead] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const surface = useRef<SketchSurface | null>(null);
  const [state, setState] = useState<SurfaceState | null>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [dtool, setDtool] = useState<DiagramTool>('select');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [sketches, setSketches] = useState<Sketch[] | null>(null);
  /** The sheet on the surface, and whether it is in the database yet. */
  const sheet = useRef<{ sketch: Sketch; stored: boolean } | null>(null);
  /** Re-render when the sheet on the surface changes (the tabs show which is current). */
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const saveTimer = useRef(0);
  /** A sheet opened on purpose (All sheets, a margin card's Open sketch): it stays until another tab is chosen. */
  const opened = useRef<string | null>(null);
  /** Keys go to the sheet after a tap inside the panel, until a tap elsewhere. */
  const ours = useRef(true);

  // The book's sketches, kept up to date.
  useEffect(() => {
    let live = true;
    const load = () => void bookSketches(book.id).then((all) => live && setSketches(all));
    load();
    const off = onInkChange(load);
    return () => {
      live = false;
      off();
    };
  }, [book.id]);

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const s = sheet.current;
    if (!s || (!s.stored && isEmptySketch(s.sketch))) return;
    s.stored = true;
    setSaveState('saving');
    const copy = structuredClone(s.sketch);
    saveSketch(copy).then(
      () => {
        setSaveState('saved');
        // Cards of this sheet in the margin follow it.
        void refreshSketchCards(copy).catch(() => undefined);
      },
      () => setSaveState('failed')
    );
  }, []);

  // The surface lives as long as the panel.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const s = new SketchSurface(host, {
      colors: THEME_COLORS,
      onState: setState,
      onGo(node) {
        // Going to the words moves the reader: the sheet stays (as one opened on purpose does).
        opened.current = sheet.current?.sketch.id ?? null;
        if (node.location && !goToPlace(node.location)) setSent('Open the book at its page to go there');
      },
      onWord(word) {
        const w = word.replace(/[^\p{L}\p{M}'-]/gu, '');
        if (w) openDictionaryPage({ word: w, book });
      },
      onHoverNode(node, el) {
        // A line from the node to its words, when they are on screen.
        const r = node?.location && el ? placeRects(node.location)[0] : null;
        if (!r || !el) return setLead(null);
        const n = el.getBoundingClientRect();
        const x1 = n.left;
        const y1 = n.top + Math.min(n.height, 40) / 2;
        const x2 = r.left + r.width < x1 ? r.right + 2 : r.left - 2;
        const y2 = r.top + r.height / 2;
        const mx = (x1 + x2) / 2;
        setLead(`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
      },
      onChange(sketch) {
        // Only the sheet the panel loaded is ever saved (never the surface's blank placeholder).
        if (!sheet.current || sheet.current.sketch.id !== sketch.id) return;
        sheet.current.sketch = sketch;
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(flush, 400);
      },
    });
    surface.current = s;
    return () => {
      flush();
      s.destroy();
      surface.current = null;
    };
    // book: for the dictionary; the surface is made once per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  /** Puts a sheet on the surface (saving the one there first). */
  const show = useCallback(
    (next: Sketch, stored: boolean) => {
      const s = surface.current;
      if (!s) return;
      opened.current = null;
      if (sheet.current?.sketch.id === next.id) return;
      flush();
      sheet.current = { sketch: structuredClone(next), stored };
      s.load(next);
      setCurrentId(next.id);
      setTabMenu(false);
      setRange(null);
      setMoveTo(null);
      if (place && stored) rememberTab(book.id, place, next.id);
    },
    [flush, place, book.id]
  );

  /** A blank sheet for the place, named after the tabs already there; saved once something is on it. */
  const blank = useCallback(
    (tabs: Sketch[]) => {
      if (!place) return null;
      const s = newSketch(book.id, placeKey(place), place.kind === 'pdf' ? `pdf:${place.page}` : formatCleanLocation(place));
      s.title = nextTitle(tabs);
      s.order = Date.now();
      return s;
    },
    [place, book.id]
  );

  const tabs = useMemo(() => (sketches && place ? tabsAt(sketches, place) : []), [sketches, place]);
  /** The tabs, with a new sheet not saved yet shown at the end while it is on the surface. */
  const shown = useMemo(() => {
    const c = sheet.current;
    if (c && !c.stored && !tabs.some((t) => t.id === c.sketch.id)) return [...tabs, c.sketch];
    return tabs.map((t) => (c && t.id === c.sketch.id ? { ...t, title: c.sketch.title, scope: c.sketch.scope } : t));
    // currentId, rev: the sheet on the surface, or its name or scope, changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, currentId, rev]);

  // Which sheet to show: a margin card's sheet, the pinned one, the one on screen if it still belongs here, the
  // tab last used here, the first tab, or a new blank sheet.
  useEffect(() => {
    if (!surface.current || !sketches) return;
    const c = sheet.current;
    if (ui.openSketch) {
      const wanted = sketches.find((x) => x.id === ui.openSketch);
      if (wanted) {
        if (wanted.hidden) void saveSketch({ ...wanted, hidden: false });
        show({ ...wanted, hidden: false }, true);
        opened.current = wanted.id;
        setInkUi({ openSketch: null });
        return;
      }
    }
    if (pinned && c) return;
    if (c && c.sketch.id === opened.current) return;
    if (!place) return;
    if (c && (covers(c.sketch, place) || (!c.stored && c.sketch.key === placeKey(place)))) {
      // Still blank: it simply belongs to what is now on screen.
      if (!c.stored && place.kind === 'clean') c.sketch.location = formatCleanLocation(place);
      return;
    }
    const remembered = recallTab(book.id, place);
    const next = tabs.find((t) => t.id === remembered) ?? tabs[0];
    if (next) show(next, true);
    else {
      const b = blank(tabs);
      if (b) show(b, false);
    }
  }, [place, sketches, tabs, book.id, show, blank, ui.openSketch, pinned]);

  // A new sheet asked for from outside (Alt+Shift+K).
  useEffect(() => {
    if (!ui.newSheet || !sketches) return;
    const b = blank(tabs);
    if (b) show(b, false);
    setInkUi({ newSheet: 0 });
    // Once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.newSheet, sketches]);

  // Quotes from the page (the Highlighter's Quote in sketch, PdfSelect.tsx): a quote node, or a picture node for a
  // region with no words read; the highlight it came from is marked as being in this sheet.
  useEffect(() => {
    const onQuote = (e: Event) => {
      const q = (e as CustomEvent<{ text: string; location: string; deskItemId?: string; image?: string }>).detail;
      const s = surface.current;
      const c = sheet.current;
      if (!q || !s || !c) return;
      s.setMode('diagram');
      const text = q.text.length > 160 ? q.text.slice(0, 158) + '…' : q.text;
      s.addNode(undefined, q.image && !q.text ? '' : text, q.image && !q.text ? 'image' : 'quote', q.location, { ...(q.deskItemId ? { deskItemId: q.deskItemId } : {}), ...(q.image && !q.text ? { image: q.image } : {}) });
      flush();
      if (q.deskItemId) void updateItem(q.deskItemId, { inSketch: c.sketch.id });
      setSent(q.text ? 'Quoted in the sheet' : 'Picture of the region in the sheet');
    };
    window.addEventListener('annotate:quote', onQuote);
    return () => window.removeEventListener('annotate:quote', onQuote);
  }, [flush]);

  useEffect(() => surface.current?.setTool(tool), [tool]);
  useEffect(() => surface.current?.setDiagramTool(dtool), [dtool]);
  useEffect(() => surface.current?.setPen(ui.color, ui.width), [ui.color, ui.width]);

  /** Changes the sheet on the surface outside its drawing (name, scope, place), and saves it if it has anything on it. */
  const patchCurrent = useCallback(
    (patch: Partial<Sketch>) => {
      const c = sheet.current;
      const s = surface.current;
      if (!c || !s) return;
      Object.assign(c.sketch, patch);
      Object.assign(s.current, patch);
      if (c.stored || !isEmptySketch(c.sketch)) {
        c.stored = false;
        flush();
      }
      setRev((r) => r + 1);
    },
    [flush]
  );

  const switchTab = (dir: 1 | -1) => {
    if (shown.length < 2) return;
    const i = shown.findIndex((t) => t.id === currentId);
    const next = shown[(i + dir + shown.length) % shown.length];
    show(next, tabs.some((t) => t.id === next.id));
  };

  const closeTab = (id: string) => {
    const t = shown.find((x) => x.id === id);
    if (!t) return;
    const index = shown.indexOf(t);
    if (id === currentId) {
      const c = sheet.current!;
      const wasStored = c.stored || tabs.some((x) => x.id === id);
      window.clearTimeout(saveTimer.current);
      if (wasStored) void saveSketch({ ...structuredClone(c.sketch), hidden: true });
      sheet.current = null;
      const rest = tabs.filter((x) => x.id !== id);
      if (rest[0]) show(rest[Math.min(index, rest.length - 1)], true);
      else {
        const b = blank(rest);
        if (b) show(b, false);
      }
    } else void saveSketch({ ...t, hidden: true });
    if (tabs.some((x) => x.id === id)) setSent(`${sheetName(t, index)} closed · it is in All sheets`);
  };

  const removeCurrent = () => {
    const c = sheet.current;
    if (!c) return;
    window.clearTimeout(saveTimer.current);
    const copy = structuredClone(c.sketch);
    sheet.current = null;
    if (c.stored || tabs.some((t) => t.id === copy.id)) {
      void deleteSketch(copy.id);
      setUndoDelete(copy);
    }
    setSent(null);
    const rest = tabs.filter((t) => t.id !== copy.id);
    if (rest[0]) show(rest[0], true);
    else {
      const b = blank(rest);
      if (b) show(b, false);
    }
  };

  const duplicate = () => {
    const c = sheet.current;
    if (!c) return;
    flush();
    const fresh = newSketch(book.id, c.sketch.key, c.sketch.location);
    const copy: Sketch = { ...structuredClone(c.sketch), id: fresh.id, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt, order: Date.now(), hidden: false };
    copy.title = `${sheetName(c.sketch, Math.max(0, shown.findIndex((t) => t.id === c.sketch.id)))} (copy)`;
    void saveSketch(structuredClone(copy)).then(() => show(copy, true));
  };

  const move = (page: number) => {
    const c = sheet.current;
    if (!c || c.sketch.key.startsWith('clean:') || !Number.isInteger(page) || page < 1) return;
    patchCurrent({ key: `pdf:${page}`, location: `pdf:${page}`, scope: { kind: 'place' } });
    setSent(`Moved to page ${page}`);
    setMoveTo(null);
    setTabMenu(false);
  };

  const exportAs = async (kind: 'svg' | 'png' | 'md') => {
    const c = sheet.current;
    setTabMenu(false);
    if (!c || isEmptySketch(c.sketch)) return setSent('Draw or add a node first');
    const name = sheetName(c.sketch, Math.max(0, shown.findIndex((t) => t.id === c.sketch.id)));
    if (kind === 'svg') await saveFile(fileName(book, c.sketch, name, 'svg'), sketchSvgBlob(c.sketch));
    else if (kind === 'png') await saveFile(fileName(book, c.sketch, name, 'png'), await sketchPng(c.sketch));
    else await saveFile(fileName(book, c.sketch, name, 'md'), sketchMarkdown(book.title, name, c.sketch), 'text/markdown');
    setSent('Exported');
  };

  // A tap on the page outside the panel closes it (not while writing on the page, and not in full size).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const inside = !!panelRef.current?.contains(e.target as Node);
      ours.current = inside;
      keyOwner.sketch = inside;
      if (inside || ui.inking || ui.full) return;
      const t = e.target as Element;
      if (t.closest('.qr-stage, .pdfp__stage') && !t.closest('button, a, input, textarea, [contenteditable="true"]')) {
        const start = { x: e.clientX, y: e.clientY };
        const up = (u: PointerEvent) => {
          window.removeEventListener('pointerup', up, true);
          const still = Math.hypot(u.clientX - start.x, u.clientY - start.y) < 6;
          window.setTimeout(() => {
            const sel = window.getSelection();
            if (still && (!sel || sel.isCollapsed)) setInkUi({ sketch: false, full: false });
          }, 30);
        };
        window.addEventListener('pointerup', up, true);
      }
    };
    window.addEventListener('pointerdown', down, true);
    keyOwner.sketch = true;
    return () => {
      window.removeEventListener('pointerdown', down, true);
      keyOwner.sketch = false;
    };
  }, [ui.inking, ui.full]);

  // Keys for the sheet, while it has the reader's attention.
  const switchRef = useRef(switchTab);
  switchRef.current = switchTab;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = surface.current;
      const t = e.target as HTMLElement;
      if (!s || !ours.current || e.altKey) return;
      // Ctrl+Tab and Ctrl+Shift+Tab go through the tabs.
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        return switchRef.current(e.shiftKey ? -1 : 1);
      }
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const mode = s.current?.mode;
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') return take(), e.shiftKey ? s.redo() : s.undo();
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') return take(), s.redo();
      if (e.ctrlKey || e.metaKey) return;
      if (e.code === 'Space') return take(), s.setSpace(true);
      if (e.key === 'Escape') {
        take();
        if (s.cancelLink()) return;
        if (inkUi().full) setInkUi({ full: false });
        else setInkUi({ sketch: false });
        return;
      }
      if (mode === 'draw') {
        const t2 = ({ KeyP: 'pen', KeyM: 'marker', KeyE: 'eraser', KeyS: 'lasso', KeyH: 'hand' } as Record<string, DrawTool>)[e.code];
        if (t2) return take(), setTool(t2);
        if ((e.key === 'Delete' || e.key === 'Backspace') && s.deleteHeld()) return take();
      } else {
        const t2 = ({ KeyV: 'select', KeyL: 'link', KeyH: 'hand' } as Record<string, DiagramTool>)[e.code];
        if (t2) return take(), setDtool(t2);
        if (e.code === 'KeyN') return take(), s.addNode();
        if (e.key === 'Delete' || e.key === 'Backspace') return take(), s.deleteSelection();
        if (e.key === 'Enter') return take(), s.editSelected();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  /**
   * Quote: the words selected in the reader (with their exact place, so the quote can go back to them), else a
   * selection on a PDF page; with words dragged over on a PDF page waiting in the Highlighter's bar, those.
   */
  const addQuote = () => {
    const mark = getReaderMarks()?.captureSelection();
    const text = (mark?.text ?? window.getSelection()?.toString() ?? '').replace(/\s+/g, ' ').trim();
    if (text) {
      surface.current?.setMode('diagram');
      surface.current?.addNode(undefined, text.length > 160 ? text.slice(0, 158) + '…' : text, 'quote', mark?.location ?? sheet.current?.sketch.location);
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (document.querySelector('.sd-pdfsel__bar')) {
      window.dispatchEvent(new CustomEvent('desk:quote-pending'));
      return;
    }
    setSent(place?.kind === 'pdf' ? 'Drag over words on the page, then Quote in sketch' : 'Select words on the page first');
  };

  const send = (how: SendHow) => {
    setMenu(false);
    const c = sheet.current;
    if (!c || isEmptySketch(c.sketch)) return setSent('Draw or add a node first');
    if (how === 'ink' && !c.sketch.strokes.length) return setSent('Only handwriting makes an ink card: draw in Freehand first');
    flush();
    const name = sheetName(c.sketch, Math.max(0, shown.findIndex((t) => t.id === c.sketch.id)));
    sendSketchToMargin(book, structuredClone(c.sketch), how, state?.node, name).then(
      () => setSent(how === 'node' ? 'Node sent to the Ḥāshiya' : how === 'outline' ? 'Outline sent to the Ḥāshiya' : how === 'ink' ? 'Ink card in the Ḥāshiya' : 'Sketch sent to the Ḥāshiya'),
      (e: Error) => setSent(e.message || 'Could not send it')
    );
  };
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => setSent(null), 2600);
    return () => window.clearTimeout(t);
  }, [sent]);
  useEffect(() => {
    if (!undoDelete) return;
    const t = window.setTimeout(() => setUndoDelete(null), 8000);
    return () => window.clearTimeout(t);
  }, [undoDelete]);

  const mode = state?.mode ?? 'draw';
  const current = sheet.current?.sketch;
  const pdf = current ? current.key.startsWith('pdf:') : place?.kind === 'pdf';
  const all = useMemo(
    () => (sketches ?? []).filter((s) => s.key.startsWith(place?.kind === 'clean' ? 'clean:' : 'pdf:')).sort((a, b) => b.updatedAt - a.updatedAt),
    [sketches, place?.kind]
  );

  return (
    <aside ref={panelRef} className={'sk-panel' + (ui.full ? ' sk-panel--full' : '')} aria-label="Sketch">
      <div className="sk-head">
        <div className="sk-head__where">
          <span className="sk-eyebrow">Sketch</span>
          <b>{current && scopeOf(current).kind !== 'place' ? scopeLabel(current) : place ? placeLabel(place) : 'Open a page'}</b>
        </div>
        <span className="sk-seg" role="group" aria-label="Sketch mode">
          <button type="button" aria-pressed={mode === 'draw'} onClick={() => surface.current?.setMode('draw')}>
            Freehand
          </button>
          <button type="button" aria-pressed={mode === 'diagram'} onClick={() => surface.current?.setMode('diagram')}>
            Diagram
          </button>
        </span>
        {prefs.studyDeskEnabled && (
          <span className="sk-send">
            <button type="button" className="sk-send__btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} title="Put this sheet in the Ḥāshiya beside its page">
              To Ḥāshiya ▾
            </button>
            {menu && (
              <span className="sk-send__menu" role="menu">
                <button type="button" role="menuitem" onClick={() => send('picture')}>
                  <b>Whole sheet, as a picture</b>
                  <span>A card of the drawing; it follows the sheet</span>
                </button>
                <button type="button" role="menuitem" onClick={() => send('ink')}>
                  <b>Handwriting, as an ink card</b>
                  <span>The freehand strokes, written in the Ḥāshiya</span>
                </button>
                <button type="button" role="menuitem" onClick={() => send('outline')}>
                  <b>Whole sheet, as an outline</b>
                  <span>Nodes and arrows as lines of a Ḥāshiya note</span>
                </button>
                <button type="button" role="menuitem" disabled={!state?.node} onClick={() => send('node')}>
                  <b>Selected node only</b>
                  <span>{state?.node ? 'Its words as a Ḥāshiya note' : 'Select a node in Diagram first'}</span>
                </button>
              </span>
            )}
          </span>
        )}
        <button type="button" className="ink-ib" aria-pressed={listOpen} aria-label="All sheets" title="All sheets in this book" onClick={() => setListOpen(!listOpen)}>
          <IconList />
        </button>
        <button
          type="button"
          className="ink-ib"
          aria-pressed={pinned}
          aria-label="Keep this sheet while the page changes"
          title={pinned ? 'Pinned: the sheet stays while you read on' : 'Pin: keep this sheet while you read on'}
          onClick={() => setPinned(!pinned)}
        >
          <IconPin />
        </button>
        <button type="button" className="ink-ib sk-full" aria-pressed={ui.full} aria-label="Use the whole reader" title="Full size" onClick={() => setInkUi({ full: !ui.full })}>
          <IconExpand />
        </button>
        <button type="button" className="ink-ib" aria-label="Close the sketch (Esc)" title="Close · Esc" onClick={() => setInkUi({ sketch: false, full: false })}>
          <IconClose />
        </button>
      </div>

      <div className="sk-tabs" role="tablist" aria-label="Sheets">
        {shown.map((t, i) => {
          const on = t.id === currentId;
          const name = sheetName(t, i);
          return (
            <span key={t.id} className={'sk-tab' + (on ? ' sk-tab--on' : '')}>
              {renaming === t.id ? (
                <input
                  className="sk-tab__name"
                  aria-label="Sheet name"
                  defaultValue={name}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== name) patchCurrent({ title: v });
                    setRenaming(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={on ? `${name} · double-click to rename` : name}
                  onClick={() => show(t, tabs.some((x) => x.id === t.id))}
                  onDoubleClick={() => {
                    if (!on) show(t, tabs.some((x) => x.id === t.id));
                    setRenaming(t.id);
                  }}
                >
                  {scopeOf(t).kind === 'book' && (
                    <span className="sk-tab__scope" title="Whole book">
                      ▤
                    </span>
                  )}
                  {scopeOf(t).kind === 'range' && (
                    <span className="sk-tab__scope" title={scopeLabel(t)}>
                      ⇕
                    </span>
                  )}
                  {name}
                </button>
              )}
              {on && (
                <button type="button" className="sk-tab__more" aria-haspopup="menu" aria-expanded={tabMenu} aria-label={`More for ${name}`} onClick={() => setTabMenu(!tabMenu)}>
                  ⋯
                </button>
              )}
              <button type="button" className="sk-tab__x" aria-label={`Close ${name}`} title="Close (stays in All sheets)" onClick={() => closeTab(t.id)}>
                ×
              </button>
            </span>
          );
        })}
        <button
          type="button"
          className="sk-tab__add"
          aria-label="New sheet (Alt+Shift+K)"
          title="New sheet · Alt+Shift+K"
          onClick={() => {
            const b = blank(tabs);
            if (b) show(b, false);
          }}
        >
          +
        </button>
      </div>
      {tabMenu && current && (
        <div className="sk-send__menu sk-tabmenu" role="menu" aria-label="Sheet">
          <button type="button" role="menuitem" onClick={() => (setTabMenu(false), setRenaming(current.id))}>
            <b>Rename</b>
          </button>
          <span className="sk-tabmenu__label">Belongs to</span>
          <button type="button" role="menuitemradio" aria-checked={scopeOf(current).kind === 'place'} onClick={() => (patchCurrent({ scope: { kind: 'place' } }), setTabMenu(false))}>
            <b>{pdf ? `Page ${sheetUnit(current)} only` : 'This passage only'}</b>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={scopeOf(current).kind === 'range'}
            onClick={() => {
              const sc = scopeOf(current);
              const off = pdf ? 0 : 1;
              setRange(sc.kind === 'range' ? { from: String(sc.from + off), to: String(sc.to + off) } : { from: String(sheetUnit(current) + off), to: String(sheetUnit(current) + off + 1) });
            }}
          >
            <b>{pdf ? 'A range of pages…' : 'A range of chapters…'}</b>
          </button>
          {range && (
            <span className="sk-tabmenu__range">
              <input aria-label="From" inputMode="numeric" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              <span>to</span>
              <input aria-label="To" inputMode="numeric" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
              <button
                type="button"
                onClick={() => {
                  const off = pdf ? 0 : 1;
                  const a = Number(range.from) - off;
                  const b = Number(range.to) - off;
                  if (!Number.isFinite(a) || !Number.isFinite(b)) return;
                  patchCurrent({ scope: rangeScope(current, a, b) });
                  setRange(null);
                  setTabMenu(false);
                }}
              >
                Set
              </button>
            </span>
          )}
          <button type="button" role="menuitemradio" aria-checked={scopeOf(current).kind === 'book'} onClick={() => (patchCurrent({ scope: { kind: 'book' } }), setTabMenu(false))}>
            <b>The whole book</b>
          </button>
          <span className="sk-tabmenu__label">Sheet</span>
          <button type="button" role="menuitem" onClick={() => (setTabMenu(false), duplicate())}>
            <b>Duplicate</b>
          </button>
          {pdf && (
            <button type="button" role="menuitem" onClick={() => setMoveTo(String(sheetUnit(current)))}>
              <b>Move to another page…</b>
            </button>
          )}
          {moveTo !== null && (
            <span className="sk-tabmenu__range">
              <span>Page</span>
              <input aria-label="Page" inputMode="numeric" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && move(Number(moveTo))} />
              <button type="button" onClick={() => move(Number(moveTo))}>
                Move
              </button>
            </span>
          )}
          <button type="button" role="menuitem" onClick={() => void exportAs('svg')}>
            <b>Export as SVG</b>
          </button>
          <button type="button" role="menuitem" onClick={() => void exportAs('png')}>
            <b>Export as PNG</b>
          </button>
          <button type="button" role="menuitem" onClick={() => void exportAs('md')}>
            <b>Export as Markdown</b>
            <span>The diagram as an outline</span>
          </button>
          <button type="button" role="menuitem" className="sk-tabmenu__danger" onClick={() => (setTabMenu(false), removeCurrent())}>
            <b>Delete sheet</b>
          </button>
        </div>
      )}

      {listOpen && (
        <div className="sk-list" role="dialog" aria-label="All sheets">
          <div className="sk-list__head">
            <b>All sheets</b>
            <span>{all.length ? `${all.length} in this book` : 'None yet'}</span>
            <button type="button" className="ink-ib" aria-label="Close the list" onClick={() => setListOpen(false)}>
              <IconClose />
            </button>
          </div>
          <input className="sk-list__find" type="search" placeholder="Search names and words on the sheets" aria-label="Search the sheets" value={find} onChange={(e) => setFind(e.target.value)} />
          <ul>
            {searchSheets(all, find).map(({ sketch: s, snippet }) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={'sk-list__item' + (s.id === currentId ? ' sk-list__item--on' : '')}
                  onClick={() => {
                    setListOpen(false);
                    setInkUi({ openSketch: s.id });
                  }}
                >
                  <SheetThumb sketch={s} />
                  <span className="sk-list__text">
                    <b>{sheetName(s, 0)}</b>
                    <span>
                      {scopeLabel(s)}
                      {s.hidden ? ' · closed' : ''} · {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                    {snippet && (
                      <span className="sk-list__hit" dir="auto">
                        {snippet}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'draw' ? (
        <div className="sk-tools" role="toolbar" aria-label="Freehand tools">
          {(
            [
              ['pen', 'Pen', 'P', IconPen],
              ['marker', 'Marker', 'M', IconMarker],
              ['eraser', 'Eraser', 'E', IconEraser],
              ['lasso', 'Lasso: circle strokes to move, resize or delete them', 'S', IconLasso],
              ['hand', 'Move the sheet', 'H', IconHand],
            ] as const
          ).map(([id, label, key, Icon]) => (
            <button key={id} type="button" className="ink-ib" aria-pressed={tool === id} aria-label={`${label} (${key})`} title={`${label} · ${key}`} onClick={() => setTool(id)}>
              <Icon />
            </button>
          ))}
          <span className="ink-sep" aria-hidden="true" />
          {(Object.keys(COLOR_NAMES) as InkColor[]).map((c) => (
            <button
              key={c}
              type="button"
              className="ink-swatch"
              style={{ background: THEME_COLORS[c] }}
              aria-pressed={ui.color === c}
              aria-label={`Colour: ${COLOR_NAMES[c]}`}
              onClick={() => (setInkUi({ color: c }), setTool(tool === 'marker' ? 'marker' : 'pen'))}
            />
          ))}
          <span className="ink-sep" aria-hidden="true" />
          {PEN_WIDTHS.map((w, i) => (
            <button key={w} type="button" className="ink-width" aria-pressed={ui.width === w} aria-label={['Fine', 'Medium', 'Thick'][i] + ' line'} onClick={() => (setInkUi({ width: w }), setTool('pen'))}>
              <i style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
            </button>
          ))}
          {!!state?.strokes && (
            <button type="button" className="ink-ib" aria-label="Delete the strokes in the lasso (Delete)" title="Delete · Del" onClick={() => surface.current?.deleteHeld()}>
              <IconTrash />
            </button>
          )}
          <span className="sk-grow" />
          <UndoRedo onUndo={() => surface.current?.undo()} onRedo={() => surface.current?.redo()} state={state} />
        </div>
      ) : (
        <div className="sk-tools" role="toolbar" aria-label="Diagram tools">
          {(
            [
              ['select', 'Select and move', 'V', IconSelect],
              ['link', 'Connect: tap one node, then another', 'L', IconLink],
              ['hand', 'Move the sheet', 'H', IconHand],
            ] as const
          ).map(([id, label, key, Icon]) => (
            <button key={id} type="button" className="ink-ib" aria-pressed={dtool === id} aria-label={`${label} (${key})`} title={`${label} · ${key}`} onClick={() => setDtool(id)}>
              <Icon />
            </button>
          ))}
          <span className="ink-sep" aria-hidden="true" />
          <button type="button" className="ink-ib ink-ib--wide" aria-label="Add a node (N)" title="Add node · N, or double-click the sheet" onClick={() => surface.current?.addNode()}>
            <IconNode /> Node
          </button>
          <button
            type="button"
            className="ink-ib ink-ib--wide"
            aria-label="Add the selected text as a quote"
            title={place?.kind === 'pdf' ? 'Drag over words on the page (or select them) first' : 'Select words on the page first'}
            onPointerDown={(e) => e.preventDefault()}
            onClick={addQuote}
          >
            <IconQuote /> Quote
          </button>
          <button type="button" className="ink-ib ink-ib--wide" disabled={!state?.edge} aria-pressed={!!state?.edge?.dir} aria-label="Arrow on the selected connector" onClick={() => surface.current?.toggleArrow()}>
            <IconArrow /> Arrow
          </button>
          <button type="button" className="ink-ib" disabled={!state?.selected} aria-label="Delete the selection (Delete)" title="Delete · Del" onClick={() => surface.current?.deleteSelection()}>
            <IconTrash />
          </button>
          <span className="ink-sep" aria-hidden="true" />
          <button type="button" className="ink-ib ink-ib--wide" disabled={state?.empty} aria-label="Tidy the diagram" title="Lay the diagram out as a tree" onClick={() => surface.current?.tidy()}>
            Tidy
          </button>
          <span className="sk-send">
            <button type="button" className="ink-ib ink-ib--wide" aria-haspopup="menu" aria-expanded={templates} onClick={() => setTemplates(!templates)}>
              Templates ▾
            </button>
            {templates && (
              <span className="sk-send__menu" role="menu" aria-label="Templates">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTemplates(false);
                      surface.current?.addTemplate(t.nodes, t.edges);
                    }}
                  >
                    <b>{t.label}</b>
                    <span>{t.hint}</span>
                  </button>
                ))}
              </span>
            )}
          </span>
          <span className="sk-grow" />
          <UndoRedo onUndo={() => surface.current?.undo()} onRedo={() => surface.current?.redo()} state={state} />
        </div>
      )}

      {mode === 'diagram' && !!state?.nodes && (
        <div className="sk-tools sk-tools--sub" role="toolbar" aria-label="Box colour">
          <span className="sk-tools__label">{state.nodes > 1 ? `${state.nodes} boxes` : 'Box'}</span>
          <button type="button" className="ink-swatch sk-swatch--none" aria-pressed={!state.nodeColor} aria-label="Colour: none" title="No colour" onClick={() => surface.current?.setNodeColor(null)} />
          {HIGHLIGHTER_PRESETS.map((c) => (
            <button key={c.id} type="button" className="ink-swatch" style={{ background: c.id }} aria-pressed={state.nodeColor === c.id} aria-label={`Colour: ${c.label}`} onClick={() => surface.current?.setNodeColor(c.id)} />
          ))}
          <span className="sk-grow" />
          <span className="sk-tools__hint">Shift-click or Shift-drag selects more</span>
        </div>
      )}

      <div className="sk-stage">
        <div ref={hostRef} />
        {state?.empty && (
          <div className="sk-empty">
            {mode === 'draw' ? (
              <>
                <b>Blank sheet</b>
                <span>
                  Write with a pen, finger or mouse. It is kept with{' '}
                  {current && scopeOf(current).kind !== 'place' ? scopeLabel(current).toLowerCase() : place?.kind === 'pdf' ? `page ${place.page}` : 'this passage'}.
                </span>
              </>
            ) : (
              <>
                <b>No diagram yet</b>
                <span>Press N or double-click to add a node. Drag a node’s dot onto another to connect them.</span>
              </>
            )}
          </div>
        )}
        <div className="sk-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => surface.current?.zoomBy(1 / 1.2)}>
            −
          </button>
          <output>{Math.round((state?.zoom ?? 1) * 100)}%</output>
          <button type="button" aria-label="Zoom in" onClick={() => surface.current?.zoomBy(1.2)}>
            +
          </button>
          <button type="button" onClick={() => surface.current?.fit()}>
            Fit
          </button>
        </div>
      </div>
      <div className="sk-foot">
        <span className={'sk-dot' + (saveState === 'failed' ? ' sk-dot--bad' : '')} />
        {undoDelete ? (
          <span role="status">
            Sheet deleted ·{' '}
            <button
              type="button"
              className="sk-foot__undo"
              onClick={() => {
                const s = undoDelete;
                setUndoDelete(null);
                void saveSketch(s).then(() => setInkUi({ openSketch: s.id }));
              }}
            >
              Undo
            </button>
          </span>
        ) : (
          <span role="status">{sent ?? (saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved' : 'Saved on this device')}</span>
        )}
        <span className="sk-grow" />
        <span>{pinned ? 'Pinned to this sheet' : shown.length > 1 ? 'Ctrl+Tab: next sheet' : ui.penSeen ? 'Stylus found: fingers move the sheet' : 'Pinch or Ctrl+scroll to zoom'}</span>
      </div>
      {lead && (
        <svg className="sk-lead" aria-hidden="true">
          <path d={lead} />
        </svg>
      )}
    </aside>
  );
}

/** A sheet as Markdown: its name, where it belongs, and the diagram as a nested list. */
export function sketchMarkdown(bookTitle: string, name: string, s: Sketch): string {
  const lines = sketchOutline(s)
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      if (l.startsWith('(+ ')) return `\n_${l.slice(1, -1)}_`;
      const m = /^(\s*)→ (.*)$/.exec(l);
      return m ? `${'  '.repeat(m[1].length / 2 + 1)}- ${m[2]}` : `- ${l}`;
    });
  return `# ${name}\n\n*${bookTitle} · ${scopeLabel(s)}*\n\n${lines.join('\n')}\n`;
}

/** A small picture of a sheet for the list of all sheets. */
function SheetThumb({ sketch }: { sketch: Sketch }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (isEmptySketch(sketch)) return;
    const url = URL.createObjectURL(sketchSvgBlob(sketch));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [sketch]);
  return <span className="sk-list__thumb">{src && <img src={src} alt="" />}</span>;
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" />
    </svg>
  );
}

function UndoRedo({ onUndo, onRedo, state }: { onUndo(): void; onRedo(): void; state: SurfaceState | null }) {
  return (
    <>
      <button type="button" className="ink-ib" disabled={!state?.canUndo} aria-label="Undo (Ctrl+Z)" title="Undo · Ctrl+Z" onClick={onUndo}>
        <IconUndo />
      </button>
      <button type="button" className="ink-ib" disabled={!state?.canRedo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo · Ctrl+Shift+Z" onClick={onRedo}>
        <IconRedo />
      </button>
    </>
  );
}
