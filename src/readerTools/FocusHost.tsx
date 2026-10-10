import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BookMeta } from '../types';
import type { OpenedPdf } from '../pdf/pages/pdfjsLoader';
import { registerPdfPageExtension } from '../pdf/pages/extensions';
import { readerFocus, setFocusRail, setFocusReader, setFocusWhere, setReaderFocus, useReaderFocus } from './focus';
import { toolTitle, useReaderTools, type ReaderKind, type ReaderTool } from './tools';
import './readerTools.css';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/**
 * Focus for every reader that has it: the F key, the pill at the top (where you are, Tools, Leave focus; it
 * fades while you read), the tool rail (Alt twice) built from the shared tool list, and Esc. The quiet reader
 * hides its own header and dock; the PDF pages lose their top bar and footer through a body class.
 * Mounted once beside the reader by ReaderSwitch; `reader` is null for the original epub layout (no Focus).
 */
export function FocusHost({ reader, onChromeHidden }: { reader: ReaderKind | null; onChromeHidden?(hidden: boolean): void }) {
  const focus = useReaderFocus();
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(0);
  const on = focus.on && !!reader;

  useEffect(() => {
    setFocusReader(reader);
    return () => setFocusReader(null);
  }, [reader]);

  // The PDF pages' top bar shows the shared tools and a Focus button; it also says which page is open.
  useEffect(() => registerPdfPageExtension({ id: 'reader-tools', Toolbar: PdfToolsBar }), []);

  // Body classes: the PDF view hides its bar and footer, every reader can style itself for Focus.
  useEffect(() => {
    document.body.classList.toggle('rt-focus', on);
    document.body.classList.toggle('rt-focus--pdf', on && reader === 'pdf');
    // The quiet reader tells the app itself; the PDF pages hide the app's sidebar from here.
    if (reader === 'pdf') onChromeHidden?.(on);
    return () => {
      document.body.classList.remove('rt-focus', 'rt-focus--pdf');
      if (reader === 'pdf') onChromeHidden?.(false);
    };
  }, [on, reader, onChromeHidden]);

  // The pill fades after a few still seconds and comes back when the pointer moves.
  useEffect(() => {
    if (!on) return;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setIdle(true), 2600);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(idleTimer.current);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [on]);

  // F: Focus on and off. Alt pressed twice: the rail. Esc: the rail first, then (PDF) Focus.
  useEffect(() => {
    if (!reader) return;
    let lastAlt = 0;
    let altDirty = false;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altDirty = false;
        return;
      }
      if (e.altKey) altDirty = true;
      if (e.key === 'Escape' && readerFocus().on) {
        // Popups, the ink bar and the sketch panel close first, by their own Esc.
        if (document.querySelector('.dict-popup, .ink-bar, .sk-panel')) return;
        if (readerFocus().rail) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setFocusRail(false);
          return;
        }
        // The quiet reader's own Esc leaves Focus after closing what it has open.
        if (reader === 'pdf' && !e.defaultPrevented) setReaderFocus(false);
        return;
      }
      if (e.code === 'KeyF' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat && !isTyping(e.target)) {
        if (document.querySelector('.dict-popup, .dsearch, .bsearch, .bvocab, .fcard')) return;
        e.preventDefault();
        setReaderFocus(!readerFocus().on);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Alt' || altDirty || !readerFocus().on) return;
      const t = Date.now();
      if (t - lastAlt < 450) {
        lastAlt = 0;
        setFocusRail(!readerFocus().rail);
      } else lastAlt = t;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [reader]);

  if (!on || !reader) return null;
  return createPortal(
    <>
      <div className={'rt-pill' + (idle && !focus.rail ? ' rt-pill--idle' : '')} role="group" aria-label="Focus">
        <span>
          Focus{focus.where && <> · <strong>{focus.where}</strong></>} · <kbd>Alt</kbd> <kbd>Alt</kbd> tools
        </span>
        <button type="button" aria-pressed={focus.rail} onClick={() => setFocusRail(!focus.rail)}>
          Tools
        </button>
        <button type="button" onClick={() => setReaderFocus(false)} title="Leave focus (Esc or F)">
          Leave focus
        </button>
      </div>
      {focus.rail && <FocusRail reader={reader} />}
    </>,
    document.body
  );
}

function FocusRail({ reader }: { reader: ReaderKind }) {
  const tools = useReaderTools(reader);
  let group = '';
  return (
    <nav className="rt-rail" aria-label="Reader tools">
      {tools.map((t) => {
        const sep = group && group !== t.group;
        group = t.group;
        return (
          <span key={t.id} className="rt-rail__item">
            {sep && <span className="rt-rail__sep" aria-hidden="true" />}
            <RailButton tool={t} />
          </span>
        );
      })}
    </nav>
  );
}

function RailButton({ tool }: { tool: ReaderTool }) {
  const on = tool.isOn?.();
  return (
    <button type="button" className="rt-rail__btn" aria-pressed={tool.isOn ? !!on : undefined} title={toolTitle(tool)} onClick={() => tool.run()}>
      {tool.icon}
      <span>{tool.label}</span>
      {tool.keys && <kbd>{tool.keys}</kbd>}
    </button>
  );
}

/** In the PDF pages' top bar: the desk and ink tools, then Focus. Also publishes the page for the pill. */
function PdfToolsBar({ page, total }: { book: BookMeta; page: number; total: number; opened: OpenedPdf }) {
  const tools = useReaderTools('pdf', ['desk', 'ink']);
  useEffect(() => setFocusWhere(total ? `Page ${page} of ${total}` : `Page ${page}`), [page, total]);
  useEffect(() => () => setFocusWhere(''), []);
  return (
    <>
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={'reader__toc-toggle rt-tbtn' + (t.isOn?.() ? ' rt-tbtn--on' : '')}
          aria-pressed={t.isOn ? !!t.isOn() : undefined}
          title={toolTitle(t)}
          onClick={() => t.run()}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
      <button type="button" className="reader__toc-toggle rt-tbtn" title="Focus: just the page (F)" onClick={() => setReaderFocus(true)}>
        Focus
      </button>
    </>
  );
}

/** The registered desk and ink tools in the quiet reader's dock, after its own buttons. */
export function DockTools({ labels }: { labels: boolean }) {
  const tools = useReaderTools('clean', ['desk', 'ink']).filter((t) => !t.noDock);
  let group = '';
  return (
    <>
      {tools.map((t) => {
        const sep = group !== t.group;
        group = t.group;
        const on = t.isOn?.();
        return (
          <span key={t.id} className="qr-dock__extra">
            {sep && <span className="qr-dock__sep" aria-hidden="true" />}
            <button
              type="button"
              className={'qr-dock__btn' + (on ? ' qr-dock__btn--on' : '')}
              aria-pressed={t.isOn ? !!on : undefined}
              aria-label={t.label}
              title={toolTitle(t)}
              onClick={() => t.run()}
            >
              {t.icon}
              {labels && <span>{t.label}</span>}
            </button>
          </span>
        );
      })}
    </>
  );
}
