import { COLOR_NAMES, PEN_WIDTHS, redoInk, setInkUi, THEME_COLORS, undoInk, useInkUi, type InkToolChoice } from './inkUi';
import type { InkColor } from './types';
import { IconEraser, IconMarker, IconPen, IconRedo, IconUndo } from './icons';

const TOOLS: { id: InkToolChoice; label: string; key: string; Icon: () => React.ReactElement }[] = [
  { id: 'pen', label: 'Pen', key: 'P', Icon: () => <IconPen /> },
  { id: 'marker', label: 'Marker', key: 'M', Icon: () => <IconMarker /> },
  { id: 'eraser', label: 'Eraser', key: 'E', Icon: () => <IconEraser /> },
];

/** The bar shown while writing on the page: tools, colours, widths, Undo and Redo, Done. */
export function InkBar({ where }: { where: string }) {
  const ui = useInkUi();
  return (
    <div className="ink-bar" role="toolbar" aria-label="Write on the page">
      <span className="ink-bar__label">
        Writing on <b>{where}</b>
      </span>
      {TOOLS.map(({ id, label, key, Icon }) => (
        <button key={id} type="button" className="ink-ib" aria-pressed={ui.tool === id} aria-label={`${label} (${key})`} title={`${label} · ${key}`} onClick={() => setInkUi({ tool: id })}>
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
          title={COLOR_NAMES[c]}
          onClick={() => setInkUi({ color: c, tool: ui.tool === 'eraser' ? 'pen' : ui.tool })}
        />
      ))}
      <span className="ink-sep" aria-hidden="true" />
      {PEN_WIDTHS.map((w, i) => (
        <button
          key={w}
          type="button"
          className="ink-width"
          aria-pressed={ui.width === w}
          aria-label={['Fine', 'Medium', 'Thick'][i] + ' line'}
          title={['Fine', 'Medium', 'Thick'][i]}
          onClick={() => setInkUi({ width: w, tool: 'pen' })}
        >
          <i style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
        </button>
      ))}
      <span className="ink-sep" aria-hidden="true" />
      <button type="button" className="ink-ib" disabled={!ui.undo} aria-label="Undo (Ctrl+Z)" title="Undo · Ctrl+Z" onClick={() => void undoInk()}>
        <IconUndo />
      </button>
      <button type="button" className="ink-ib" disabled={!ui.redo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo · Ctrl+Shift+Z" onClick={() => void redoInk()}>
        <IconRedo />
      </button>
      <button type="button" className="ink-done" onClick={() => setInkUi({ inking: false })} title="Stop writing (Esc)">
        Done
      </button>
    </div>
  );
}
