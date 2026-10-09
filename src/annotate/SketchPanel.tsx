import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { formatCleanLocation } from '../quietReader/location';
import { sketchForPassage } from './geometry';
import { bookSketches, isEmptySketch, newSketch, onInkChange, saveSketch } from './inkStore';
import { COLOR_NAMES, keyOwner, PEN_WIDTHS, setInkUi, THEME_COLORS, useInkUi } from './inkUi';
import { SketchSurface, type DiagramTool, type DrawTool, type SurfaceState } from './sketchSurface';
import type { InkColor, Sketch } from './types';
import { IconArrow, IconClose, IconEraser, IconExpand, IconHand, IconLink, IconNode, IconPen, IconQuote, IconRedo, IconSelect, IconTrash, IconUndo } from './icons';

/** Where the reader is: a PDF page, or the passage of a chapter on screen in the quiet reader. */
export type Place = { kind: 'pdf'; page: number } | { kind: 'clean'; chapter: number; start: number; end: number };

const placeKey = (p: Place) => (p.kind === 'pdf' ? `pdf:${p.page}` : `clean:${p.chapter}`);
const placeLabel = (p: Place) => (p.kind === 'pdf' ? `Page ${p.page}` : 'This passage');

/** The saved sketch for the place, or null when it has none yet. */
function sheetFor(sketches: Sketch[], place: Place): Sketch | undefined {
  if (place.kind === 'pdf') return sketches.find((s) => s.key === `pdf:${place.page}`);
  return sketchForPassage(
    sketches.filter((s) => s.key === `clean:${place.chapter}`),
    place.chapter,
    place.start,
    place.end
  );
}

/**
 * The sketch sheet beside the page (Alt+K): freehand writing and a diagram of nodes and connectors on one
 * surface, saved with the PDF page or the passage it was started on. It docks at the right; Expand gives it
 * the whole reader. Tapping the page outside it, or Esc, closes it.
 */
export function SketchPanel({ book, place }: { book: BookMeta; place: Place | null }) {
  const ui = useInkUi();
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
  const saveTimer = useRef(0);
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
    saveSketch(structuredClone(s.sketch)).then(
      () => setSaveState('saved'),
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
  }, [flush]);

  // Show the sheet for where the reader is; a new place gets a blank sheet, saved once something is on it.
  useEffect(() => {
    const s = surface.current;
    if (!s || !place || !sketches) return;
    const found = sheetFor(sketches, place);
    const cur = sheet.current;
    if (found && cur?.sketch.id === found.id) return;
    if (!found && cur && !cur.stored && cur.sketch.key === placeKey(place)) {
      // Still blank: it simply belongs to what is now on screen.
      if (place.kind === 'clean') cur.sketch.location = formatCleanLocation(place);
      return;
    }
    flush();
    const next = found ?? newSketch(book.id, placeKey(place), place.kind === 'pdf' ? `pdf:${place.page}` : formatCleanLocation(place));
    sheet.current = { sketch: structuredClone(next), stored: !!found };
    s.load(next);
  }, [place, sketches, book.id, flush]);

  useEffect(() => surface.current?.setTool(tool), [tool]);
  useEffect(() => surface.current?.setDiagramTool(dtool), [dtool]);
  useEffect(() => surface.current?.setPen(ui.color, ui.width), [ui.color, ui.width]);

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = surface.current;
      const t = e.target as HTMLElement;
      if (!s || !ours.current || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.altKey) return;
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
        if (ui.full) setInkUi({ full: false });
        else setInkUi({ sketch: false });
        return;
      }
      if (mode === 'draw') {
        const t2 = ({ KeyP: 'pen', KeyE: 'eraser', KeyH: 'hand' } as Record<string, DrawTool>)[e.code];
        if (t2) return take(), setTool(t2);
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
  }, [ui.full]);

  const addQuote = () => {
    const text = window.getSelection()?.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    surface.current?.setMode('diagram');
    surface.current?.addNode(undefined, text.length > 120 ? text.slice(0, 118) + '…' : text, 'quote', sheet.current?.sketch.location);
  };

  const mode = state?.mode ?? 'draw';
  return (
    <aside ref={panelRef} className={'sk-panel' + (ui.full ? ' sk-panel--full' : '')} aria-label="Sketch">
      <div className="sk-head">
        <div className="sk-head__where">
          <span className="sk-eyebrow">Sketch</span>
          <b>{place ? placeLabel(place) : 'Open a page'}</b>
        </div>
        <span className="sk-seg" role="group" aria-label="Sketch mode">
          <button type="button" aria-pressed={mode === 'draw'} onClick={() => surface.current?.setMode('draw')}>
            Freehand
          </button>
          <button type="button" aria-pressed={mode === 'diagram'} onClick={() => surface.current?.setMode('diagram')}>
            Diagram
          </button>
        </span>
        <button type="button" className="ink-ib sk-full" aria-pressed={ui.full} aria-label="Use the whole reader" title="Full size" onClick={() => setInkUi({ full: !ui.full })}>
          <IconExpand />
        </button>
        <button type="button" className="ink-ib" aria-label="Close the sketch (Esc)" title="Close · Esc" onClick={() => setInkUi({ sketch: false, full: false })}>
          <IconClose />
        </button>
      </div>

      {mode === 'draw' ? (
        <div className="sk-tools" role="toolbar" aria-label="Freehand tools">
          {(
            [
              ['pen', 'Pen', 'P', IconPen],
              ['eraser', 'Eraser', 'E', IconEraser],
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
              onClick={() => (setInkUi({ color: c }), setTool('pen'))}
            />
          ))}
          <span className="ink-sep" aria-hidden="true" />
          {PEN_WIDTHS.map((w, i) => (
            <button key={w} type="button" className="ink-width" aria-pressed={ui.width === w} aria-label={['Fine', 'Medium', 'Thick'][i] + ' line'} onClick={() => (setInkUi({ width: w }), setTool('pen'))}>
              <i style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
            </button>
          ))}
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
            title="Select words on the page first"
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
          <span className="sk-grow" />
          <UndoRedo onUndo={() => surface.current?.undo()} onRedo={() => surface.current?.redo()} state={state} />
        </div>
      )}

      <div className="sk-stage">
        <div ref={hostRef} />
        {state?.empty && (
          <div className="sk-empty">
            {mode === 'draw' ? (
              <>
                <b>Blank sheet</b>
                <span>Write with a pen, finger or mouse. It is kept with {place?.kind === 'pdf' ? `page ${place.page}` : 'this passage'}.</span>
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
        <span>{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved' : 'Saved on this device'}</span>
        <span className="sk-grow" />
        <span>{ui.penSeen ? 'Stylus found: fingers move the sheet' : 'Pinch or Ctrl+scroll to zoom'}</span>
      </div>
    </aside>
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
