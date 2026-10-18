import { useEffect, useRef, useState } from 'react';
import { patchItems } from '../studyDesk/deskStore';
import { capture } from '../studyDesk/useDesk';
import type { Desk, DeskItem, NewDeskItem } from '../studyDesk/types';
import type { BookMeta } from '../types';
import { stripBox } from './geometry';
import { citeOf, short, thoughtText } from './passages';
import { say } from './say';
import { thinkingState } from './state';
import { ThoughtFinder } from './ThoughtLinks';
import { newQuestion, newThought } from './thoughts';
import { threadLabel } from './threads';

/**
 * A new thought in the Ḥāshiya strip: what do you make of it? Optionally your claim, and linked to other thoughts.
 * Or a new masʾala (`kind` question): what do you want to know? On a passage, or at a place on the page.
 */
export function Composer({
  kind = 'thought',
  passage,
  place,
  book,
  deskId,
  items,
  desks,
  toInbox,
  extra,
  onClose,
}: {
  kind?: 'thought' | 'question';
  passage?: DeskItem;
  /** A masʾala with no passage: the place on the page it was asked at. */
  place?: string;
  book: BookMeta;
  deskId: string;
  items: DeskItem[];
  desks: Desk[];
  toInbox: boolean;
  /** Fields later parts add to every new thought (Revisit's first visit). */
  extra?: () => Partial<NewDeskItem>;
  onClose(): void;
}) {
  const [text, setText] = useState('');
  const [claim, setClaim] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const box = stripBox();
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);
  const active = desks.find((d) => d.id === thinkingState().active && d.kind === 'thread');
  const asking = kind === 'question' || !passage;

  async function save() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (kind === 'question' || !passage) {
        await capture(book, deskId, newQuestion(book, text, { passage, location: place }));
        say(active ? `Masʾala added to ${threadLabel(active)}. It stays open until a passage answers it.` : 'Masʾala added. It stays open until a passage answers it.');
        onClose();
        return;
      }
      const item = await capture(book, deskId, { ...newThought(passage, book, text, { claim, links, toInbox }), ...extra?.() });
      // Links are kept on both thoughts.
      const others = items.filter((i) => links.includes(i.id));
      if (others.length) await patchItems(others.map((o) => ({ id: o.id, patch: { links: [...(o.links ?? []), item.id] } })));
      say(active ? `Thought saved in ${threadLabel(active)}` : 'Thought saved beside the passage');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="th-composer"
      role="dialog"
      aria-label={asking ? 'New masʾala' : 'New thought'}
      style={{ left: box.left, top: Math.max(box.top + 12, 64), width: box.right - box.left }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="th-composer__top">
        <span className={'th-kind ' + (asking ? 'th-kind--q' : 'th-kind--note')}>{asking ? 'New masʾala' : 'New thought'}</span>
        <span className="th-cite">{passage ? citeOf(passage) : book.title}</span>
      </div>
      {passage && (
        <p className={'th-excerpt' + (passage.ar ? ' th-ar' : '')} dir="auto">
          {short(passage.text, 110)}
        </p>
      )}
      <textarea
        ref={ta}
        className="th-input th-composer__text"
        dir="auto"
        rows={asking ? 3 : 4}
        value={text}
        placeholder={asking ? 'What do you want to know?' : 'What do you make of it?'}
        aria-label={asking ? 'Your masʾala' : 'Your thought'}
        onChange={(e) => setText(e.target.value)}
      />
      {!asking && <>
      <label className="th-check">
        <input type="checkbox" checked={claim} onChange={(e) => setClaim(e.target.checked)} />
        This is my claim <span className="th-ar">دعوى</span>
      </label>
      <div className="th-links">
        {links.map((id) => {
          const t = items.find((i) => i.id === id);
          return (
            <span key={id} className="th-chip th-chip--on">
              <bdi>{short(t ? thoughtText(t) : '', 40)}</bdi>
              <button type="button" className="th-x" aria-label="Unlink" onClick={() => setLinks(links.filter((l) => l !== id))}>
                ×
              </button>
            </span>
          );
        })}
        <ThoughtFinder items={items} exclude={links} onPick={(t) => setLinks([...links, t.id])} />
      </div>
      </>}
      {active && (
        <p className="th-faint th-composer__note">
          Joins the <bdi>{threadLabel(active)}</bdi> thread.
        </p>
      )}
      <div className="th-composer__acts">
        <button type="button" className="sd-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="sd-btn sd-btn--pri" disabled={!text.trim() || busy} onClick={() => void save()}>
          Save <kbd>Ctrl Enter</kbd>
        </button>
      </div>
    </div>
  );
}
