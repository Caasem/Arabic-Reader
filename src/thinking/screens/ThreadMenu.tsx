import { useEffect, useRef, useState } from 'react';
import { deleteDeskKeepingUndo, restoreDeletedDesk, setDeskArchived, updateDesk } from '../../studyDesk/deskStore';
import type { Desk } from '../../studyDesk/types';
import { say } from '../say';
import { openScreen, thinkingState } from '../state';
import { isArchived, renamePatch, threadLabel } from '../threads';

/** The thread's menu in the Thread screen's head: rename it (names and guiding question), archive it, or delete it with Undo. */
/** `gathered`: items from other desks that joined the thread (they stay); `made`: items written in the thread itself (they go with it). */
export function ThreadMenu({ thread, gathered, made }: { thread: Desk; gathered: number; made: number }) {
  const [mode, setMode] = useState<'closed' | 'menu' | 'rename' | 'delete'>('closed');
  const ref = useRef<HTMLDivElement>(null);
  const archived = isArchived(thread);
  const open = mode !== 'closed';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMode('closed');
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMode('closed');
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggleArchive = async () => {
    setMode('closed');
    await setDeskArchived(thread.id, !archived);
    say(archived ? `Brought back ${threadLabel(thread)}` : `Archived ${threadLabel(thread)}. It is out of the picker and Today.`, () => setDeskArchived(thread.id, archived));
  };

  const remove = async () => {
    setMode('closed');
    const gone = await deleteDeskKeepingUndo(thread.id);
    if (!gone) return;
    say(`Deleted ${threadLabel(thread)}`, async () => {
      await restoreDeletedDesk(gone);
      if (thinkingState().screen?.kind === 'thread') openScreen({ kind: 'thread', id: thread.id });
    });
  };

  return (
    <div className="sd-export th-menu" ref={ref}>
      <button type="button" className="sd-pill" aria-haspopup="menu" aria-expanded={open} onClick={() => setMode(open ? 'closed' : 'menu')}>
        Manage
      </button>
      {mode === 'menu' && (
        <div className="sd-export__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => setMode('rename')}>
            Rename…
          </button>
          <button type="button" role="menuitem" onClick={() => void toggleArchive()}>
            {archived ? 'Unarchive' : 'Archive'}
          </button>
          <button type="button" role="menuitem" onClick={() => setMode('delete')}>
            Delete…
          </button>
          <p>{archived ? 'Archived: out of the picker and Today.' : 'Archiving hides it from the picker and Today and stops collecting into it.'}</p>
        </div>
      )}
      {mode === 'rename' && <Rename thread={thread} onDone={() => setMode('closed')} />}
      {mode === 'delete' && (
        <div className="th-menu__box" role="alertdialog" aria-label="Delete this thread">
          <p className="th-menu__ask">Delete this thread?</p>
          <p>
            {gathered === 1 ? 'The 1 item it gathered stays on its own desk. ' : gathered ? `The ${gathered} items it gathered stay on their own desks. ` : ''}
            The thread’s document goes{made === 1 ? ', with the 1 note written in it' : made ? `, with the ${made} notes written in it` : ''}. You can undo for a few seconds.
          </p>
          <div className="th-row">
            <button type="button" className="sd-btn sd-btn--pri" onClick={() => void remove()}>
              Delete thread
            </button>
            <button type="button" className="sd-btn" onClick={() => setMode('menu')}>
              Keep
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** English name, Arabic name and guiding question in one place. */
function Rename({ thread, onDone }: { thread: Desk; onDone(): void }) {
  const [en, setEn] = useState(thread.titleAr && thread.title === thread.titleAr ? '' : thread.title);
  const [ar, setAr] = useState(thread.titleAr ?? '');
  const [question, setQuestion] = useState(thread.question ?? '');
  const patch = renamePatch({ en, ar, question });
  const save = () => {
    if (!patch) return;
    void updateDesk(thread.id, patch);
    say('Renamed');
    onDone();
  };
  return (
    <form
      className="th-menu__box"
      aria-label="Rename this thread"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="th-menu__field">
        English name
        <input className="th-input" dir="auto" value={en} placeholder="English name" autoFocus onChange={(e) => setEn(e.target.value)} />
      </label>
      <label className="th-menu__field">
        Arabic name
        <input className="th-input th-ar" dir="rtl" lang="ar" value={ar} placeholder="الاسم" onChange={(e) => setAr(e.target.value)} />
      </label>
      <label className="th-menu__field">
        Guiding question
        <textarea className="th-input" dir="auto" rows={2} value={question} placeholder="What do you want to find out?" onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <div className="th-row">
        <button type="submit" className="sd-btn sd-btn--pri" disabled={!patch}>
          Save
        </button>
        <button type="button" className="sd-btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
