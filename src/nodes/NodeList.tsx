import { useMemo, useState } from 'react';
import { FloatingCard } from '../floatingCard/FloatingCard';
import { jumpToAnchor } from './anchorDom';
import type { Rows } from './model';
import { listEntries, type ListEntry } from './listEntries';
import { carryNode, stopCarrying } from './nodeStore';
import './nodes.css';

/** Where a node brought here lands: across the page, a little above the middle. */
const BRING_AT = { x: 0.5, y: 0.35 };

/**
 * Every node in the book, in book order. Tap one to go to its home. A node can also be brought here: it is carried to
 * wherever you are reading and keeps its home, marked by a faint ring when that page is on screen.
 */
export function NodeList({ rows, onClose }: { rows: Rows; onClose(): void }) {
  const entries = useMemo(() => listEntries(rows), [rows]);
  const [message, setMessage] = useState<string | null>(null);

  const go = (e: ListEntry) => setMessage(jumpToAnchor(e.anchor) ? null : `“${e.title}” is in the ${e.anchor.kind === 'pdf' ? 'PDF pages' : 'text'} view of this book. Switch to that view to see it.`);

  return (
    <FloatingCard label="Nodes" keyHint="Alt Shift O" posKey="nodes-list" defaultPos={(w) => ({ x: Math.max(12, window.innerWidth - w - 24), y: 88 })} width={320} onClose={onClose}>
      <div className="nx-list">
        {entries.length === 0 ? (
          <p className="nx-list__empty">No nodes in this book yet. Press Alt+O, then tap the page.</p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li key={e.id} className="nx-list__row">
                <button type="button" className="nx-list__go" onClick={() => go(e)} title={`Go to ${e.where}`}>
                  <i className={`nx-list__dot nx-st-${e.style}`} aria-hidden="true" />
                  <span className="nx-list__title">{e.title}</span>
                  <span className="nx-list__meta">
                    {e.where}
                    {e.count ? ` · ${e.count}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="nx-list__carry"
                  aria-pressed={e.carried}
                  title={e.carried ? 'Send it back to where it belongs' : 'Carry it to the page you are reading'}
                  onClick={() => void (e.carried ? stopCarrying(e.id) : carryNode(e.id, BRING_AT))}
                >
                  {e.carried ? 'Put away' : 'Bring here'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p className="nx-list__note" role="status">
            {message}
          </p>
        )}
      </div>
    </FloatingCard>
  );
}
