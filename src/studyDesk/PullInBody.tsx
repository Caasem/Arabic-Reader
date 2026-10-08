import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { filterCandidates, isImageFile, KIND_LABEL, listPullCandidates, pullIn, pullInImage, type PullCandidate, type PullKind, type PullSpot, type PullTarget } from './pullIn';

interface Props {
  book: BookMeta;
  /** The desk the pulled item goes to. */
  deskId: string;
  /** The place on the open page for margin targets; null when no page is showing (margins are then off). */
  spot: PullSpot | null;
  /** Which margins the page shows. */
  margins: 'both' | 'left' | 'right' | 'off';
  onClose(): void;
  onToast(m: string): void;
}

const TARGET_KEY = 'studyDesk.pullTarget';
const IMAGE = '__image__';
const LIMIT = 80;
const FILTERS: { kind: PullKind | 'all'; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'highlight', label: 'Highlights' },
  { kind: 'word', label: 'Words' },
  { kind: 'item', label: 'Desk items' },
];

function loadTarget(): PullTarget {
  try {
    const v = localStorage.getItem(TARGET_KEY);
    if (v === 'left' || v === 'right' || v === 'inbox') return v;
  } catch {
    // The right margin.
  }
  return 'right';
}

/** Pull in (Alt+U): the dictionary search's input row and result rows over highlights, words and other books' desk items. */
export function PullInBody({ book, deskId, spot, margins, onClose, onToast }: Props) {
  const [all, setAll] = useState<PullCandidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<PullKind | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [chosenTarget, setChosenTarget] = useState<PullTarget>(loadTarget);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const sides: PullTarget[] = !spot || margins === 'off' ? [] : margins === 'both' ? ['left', 'right'] : [margins];
  const target: PullTarget = sides.includes(chosenTarget) ? chosenTarget : chosenTarget !== 'inbox' && sides.length ? sides[sides.length - 1] : 'inbox';

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    let alive = true;
    void listPullCandidates(book).then((c) => alive && setAll(c));
    return () => {
      alive = false;
    };
  }, [book]);

  const list = useMemo(() => {
    const byKind = (all ?? []).filter((c) => kind === 'all' || c.kind === kind);
    return filterCandidates(byKind, query.trim()).slice(0, LIMIT);
  }, [all, kind, query]);

  const ids = [IMAGE, ...list.map((c) => c.key)];
  const active = selected && ids.includes(selected) ? selected : (list[0]?.key ?? IMAGE);

  function chooseTarget(t: PullTarget) {
    setChosenTarget(t);
    try {
      localStorage.setItem(TARGET_KEY, t);
    } catch {
      // Not remembered.
    }
  }

  const placedMessage = (t: PullTarget) => (t === 'inbox' ? 'Added to the inbox and the desk' : `Placed in the ${t} margin`);

  async function take(c: PullCandidate) {
    if (busy.current) return;
    busy.current = true;
    try {
      await pullIn(book, deskId, c, target, spot);
      onToast(placedMessage(target));
      onClose();
    } finally {
      busy.current = false;
    }
  }

  async function takeImage(file: File | undefined) {
    if (!isImageFile(file)) return onToast('That file is not an image');
    await pullInImage(book, deskId, file, target, spot);
    onToast(placedMessage(target));
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const at = ids.indexOf(active);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(ids[Math.min(at + 1, ids.length - 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(ids[Math.max(at - 1, 0)]);
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (active === IMAGE) fileRef.current?.click();
      else {
        const c = list.find((x) => x.key === active);
        if (c) void take(c);
      }
    }
  }

  const targets: { t: PullTarget; label: string }[] = [
    ...(sides.includes('left') ? [{ t: 'left' as const, label: 'Left margin' }] : []),
    ...(sides.includes('right') ? [{ t: 'right' as const, label: 'Right margin' }] : []),
    { t: 'inbox', label: 'Inbox' },
  ];

  return (
    <div className="dsearch__body sd-inbox sd-pull" onKeyDown={onKeyDown}>
      <div className="dsearch__input-row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        <input
          ref={inputRef}
          className="dsearch__input sd-inbox__input"
          dir="auto"
          value={query}
          placeholder="Search highlights, words, other desks"
          aria-label="Search what to pull in"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
      </div>
      <div className="sd-inbox__desk sd-pull__bar">
        <span>Place in</span>
        <span className="sd-seg" role="group" aria-label="Place in">
          {targets.map(({ t, label }) => (
            <button key={t} type="button" aria-pressed={target === t} onClick={() => chooseTarget(t)}>
              {label}
            </button>
          ))}
        </span>
        <span className="sd-seg sd-pull__kinds" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.kind} type="button" aria-pressed={kind === f.kind} onClick={() => (setKind(f.kind), setSelected(null), inputRef.current?.focus())}>
              {f.label}
            </button>
          ))}
        </span>
      </div>
      {!spot && <p className="dsearch__hint sd-pull__note">Margins take things only while a page is showing; this goes to the inbox.</p>}
      <div className="dsearch__results" role="listbox" aria-label="Pull in">
        <div role="option" aria-selected={active === IMAGE} className={'dsearch__entry' + (active === IMAGE ? ' dsearch__entry--active' : '')} onClick={() => fileRef.current?.click()}>
          <div className="sd-inbox__new">
            <span className="dsearch__provider">Image</span>
            <b>Image from a file…</b>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Image file" onChange={(e) => void takeImage(e.target.files?.[0])} />
        {all === null && <p className="dsearch__hint">Loading…</p>}
        {all && !list.length && <p className="dsearch__hint">{query.trim() ? 'Nothing matches.' : 'No highlights, words or other desks yet.'}</p>}
        {list.map((c) => (
          <div
            key={c.key}
            role="option"
            aria-selected={c.key === active}
            className={'dsearch__entry' + (c.key === active ? ' dsearch__entry--active' : '')}
            onMouseEnter={() => setSelected(c.key)}
            onClick={() => void take(c)}
          >
            <div className="dsearch__entry-head">
              <span className={c.ar ? 'dsearch__headword' : 'dsearch__headword sd-latin'} dir="auto" lang={c.ar ? 'ar' : undefined}>
                {c.text.length > 140 ? c.text.slice(0, 140) + '…' : c.text}
              </span>
              <span className="dsearch__meta">{c.from}</span>
              <span className="dsearch__provider">{KIND_LABEL[c.kind]}</span>
            </div>
            {c.detail && (
              <div className="sd-pull__detail" dir="auto">
                {c.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
