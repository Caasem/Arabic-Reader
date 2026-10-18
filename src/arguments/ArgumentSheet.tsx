import { useMemo, useState } from 'react';
import { goToBookLocation } from '../readerChords';
import type { DeskItem } from '../studyDesk/types';
import { bookOf, type SheetScope } from './bridge';
import { NO_GAPS, nextOffender } from './gaps';
import type { ArgItem } from './roles';
import { BOX_SIZE } from './layout';
import { GHOST_SIZE, buildSheet } from './sheetModel';
import { LayersControl } from './LayersControl';
import type { Layers } from './layers';
import type { ReaderPreferences } from '../types';

export type SheetSize = 'side' | 'full';

const SCOPES: { id: SheetScope; label: string }[] = [
  { id: 'chapter', label: 'This chapter' },
  { id: 'book', label: 'This book' },
  { id: 'all', label: 'Across books' },
];

const EMPTY = 'Select words on the page and press 1 to 8. The sheet appears here, laid out for you.';

interface Props {
  bookId: string;
  argItems: ArgItem[];
  byId: Map<string, DeskItem>;
  scope: SheetScope;
  onScope(s: SheetScope): void;
  size: SheetSize;
  onSize(s: SheetSize): void;
  onClose(): void;
  layers: Layers;
  onLayers(patch: Partial<ReaderPreferences>): void;
}

const where = (i: DeskItem | undefined) => i?.source?.location ?? i?.pin?.location;

/**
 * The argument sheet: boxes for claims, grounds, objections and replies, arrows between them, a card for each
 * warrant on its arrow, and a strip of what is missing. Drawn from the margin's items (buildSheet), never by hand;
 * clicking a box or a gap goes to its place in the book.
 */
export function ArgumentSheet({ bookId, argItems, byId, scope, onScope, size, onSize, onClose, layers, onLayers }: Props) {
  const sheet = useMemo(() => buildSheet(argItems, (id) => byId.get(id)?.text ?? ''), [argItems, byId]);
  const [selected, setSelected] = useState<string | null>(null);
  const [last, setLast] = useState<Record<string, string>>({});

  const go = (id: string) => {
    setSelected(id);
    const item = byId.get(id);
    const at = where(item);
    if (at && item && bookOf(item) === bookId) goToBookLocation(at);
  };
  const jump = (key: string, ids: string[]) => {
    const next = nextOffender(ids, last[key] ?? null);
    if (!next) return;
    setLast({ ...last, [key]: next });
    go(next);
  };
  const book = (id: string) => {
    const item = byId.get(id);
    return item && bookOf(item) !== bookId ? item.source?.bookTitle || 'another book' : null;
  };

  return (
    <aside className={`arg-sheet arg-sheet--${size}`} aria-label="Argument sheet">
      <header className="arg-sheet__head">
        <strong>Argument</strong>
        <div className="arg-sheet__tabs" role="tablist">
          {SCOPES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} onClick={() => onScope(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <LayersControl layers={layers} onChange={onLayers} compact />
        <button type="button" onClick={() => onSize(size === 'side' ? 'full' : 'side')} aria-label={size === 'side' ? 'Fill the window' : 'Dock to the side'} title={size === 'side' ? 'Fill the window' : 'Dock to the side'}>
          {size === 'side' ? '⤢' : '⤡'}
        </button>
        <button type="button" onClick={onClose} aria-label="Close the sheet" title="Close (Alt+Shift+A)">
          ×
        </button>
      </header>
      <div className="arg-sheet__surface">
        {sheet.boxes.length === 0 ? (
          <p className="arg-sheet__empty">{EMPTY}</p>
        ) : (
          <div className="arg-sheet__inner" style={{ width: sheet.width + BOX_SIZE.w, height: sheet.height + BOX_SIZE.h }}>
            <svg className="arg-sheet__edges" width={sheet.width + BOX_SIZE.w} height={sheet.height + BOX_SIZE.h} aria-hidden="true">
              <defs>
                {(['grounds', 'attacks', 'replies'] as const).map((t) => (
                  <marker key={t} id={`arg-head-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10z" className={`arg-edge--${t}`} fill="currentColor" />
                  </marker>
                ))}
              </defs>
              {sheet.edges.map((e) => (
                <line key={e.id} className={`arg-edge arg-edge--${e.type}${selected === e.id ? ' arg-edge--on' : ''}`} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} markerEnd={`url(#arg-head-${e.type})`} />
              ))}
            </svg>
            {sheet.edges.map((e) => (
              <span key={`l${e.id}`} className={`arg-elabel arg-edge--${e.type}`} title={e.exception ? `Exception: ${e.exception}` : undefined} style={{ left: e.a[0] + (e.b[0] - e.a[0]) * e.labelAt, top: e.a[1] + (e.b[1] - e.a[1]) * e.labelAt }}>
                {e.label}
              </span>
            ))}
            {sheet.edges.flatMap((e) =>
              e.warrant
                ? [
                    <button key={`w${e.warrant.id}`} type="button" className={`arg-ghost${selected === e.warrant.id ? ' arg-ghost--on' : ''}`} style={{ left: e.warrant.x, top: e.warrant.y, width: GHOST_SIZE.w, height: GHOST_SIZE.h }} onClick={() => go(e.warrant!.id)}>
                      <b>Warrant #{e.warrant.num}</b>
                      <span dir="auto">{e.warrant.text}</span>
                      {e.warrant.backing && <em>Backing: #{e.warrant.backing.num}</em>}
                    </button>,
                  ]
                : []
            )}
            {sheet.boxes.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`arg-box${b.marginOnly ? ' arg-box--margin' : ''}${selected === b.id ? ' arg-box--on' : ''}`}
                data-roles={b.roles.join(' ')}
                style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                onClick={() => go(b.id)}
              >
                <small>
                  #{b.num} {b.tag}
                  {book(b.id) ? ` · ↗ ${book(b.id)}` : ''}
                </small>
                <span dir="auto">{b.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <footer className="arg-sheet__gaps">
        {sheet.boxes.length === 0 ? null : sheet.gaps.length === 0 ? (
          <p>{NO_GAPS}</p>
        ) : (
          sheet.gaps.map((g) => (
            <button key={g.key} type="button" onClick={() => jump(g.key, g.ids)}>
              <b>{g.ids.length}</b> {g.title}
            </button>
          ))
        )}
      </footer>
    </aside>
  );
}
