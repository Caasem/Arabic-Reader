import { useMemo, useState } from 'react';
import { patchItems } from '../studyDesk/deskStore';
import type { DeskItem } from '../studyDesk/types';
import { findThoughts, linkPatches, unlinkedPatches } from './links';
import { isThought, short, thoughtText } from './passages';
import { say } from './say';

/** Find a thought by its words and pick it: the box and the results under it (the composer's links, and Link to another thought). */
export function ThoughtFinder({ items, exclude, onPick, autoFocus }: { items: DeskItem[]; exclude: string[]; onPick(thought: DeskItem): void; autoFocus?: boolean }) {
  const [find, setFind] = useState('');
  const found = useMemo(() => findThoughts(items, find, exclude), [find, items, exclude]);
  return (
    <>
      <input
        className="th-input th-links__find"
        dir="auto"
        value={find}
        autoFocus={autoFocus}
        placeholder="Link to another thought…"
        aria-label="Find a thought to link"
        onChange={(e) => setFind(e.target.value)}
      />
      {found.length > 0 && (
        <div className="th-links__found" role="listbox" aria-label="Thoughts">
          {found.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                onPick(t);
                setFind('');
              }}
            >
              <bdi>{short(thoughtText(t), 70)}</bdi>
              <span className="th-faint">{t.source?.bookTitle ?? 'yours'}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Link to another thought, after it was written: opens the thoughts it is linked to (each with an unlink ×) and the finder.
 * Links are kept on both thoughts; Undo puts both back.
 */
export function ThoughtLinks({ thought, items }: { thought: DeskItem; items: DeskItem[] }) {
  const [open, setOpen] = useState(false);
  const linked = (thought.links ?? []).map((id) => items.find((i) => i.id === id)).filter((i): i is DeskItem => !!i && isThought(i));
  const exclude = useMemo(() => [thought.id, ...(thought.links ?? [])], [thought]);
  const change = async (other: DeskItem, link: boolean) => {
    await patchItems(linkPatches(thought, other, link));
    say(link ? 'Linked' : 'Unlinked', () => patchItems(unlinkedPatches(thought, other)));
  };
  if (!open)
    return (
      <button type="button" className="th-link" onClick={() => setOpen(true)}>
        Link to another thought…
      </button>
    );
  return (
    <div className="th-links th-links--edit" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))}>
      {linked.map((t) => (
        <span key={t.id} className="th-chip th-chip--on">
          <bdi>{short(thoughtText(t), 40)}</bdi>
          <button type="button" className="th-x" aria-label="Unlink" onClick={() => void change(t, false)}>
            ×
          </button>
        </span>
      ))}
      <ThoughtFinder items={items} exclude={exclude} autoFocus onPick={(t) => void change(t, true)} />
      <button type="button" className="th-link" onClick={() => setOpen(false)}>
        Done
      </button>
    </div>
  );
}
