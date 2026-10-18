import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HostProps } from '../features/registry';
import { offsetWithin, rangeAt } from '../quietReader/textOffsets';
import { formatCleanLocation, parseCleanLocation } from '../readerCore/location';
import { paintArguments, paintSupported } from '../readerCore/paint';
import { useChordHotkey } from '../readerChords';
import { usePreferences } from '../state/PreferencesContext';
import { bookDeskId, deleteItem, getDesk, getItem, listItems, patchItems, restoreItems, updateItem } from '../studyDesk/deskStore';
import { currentDeskId } from '../studyDesk/deskMemory';
import { capture, looksArabic, useDeskData } from '../studyDesk/useDesk';
import type { DeskItem } from '../studyDesk/types';
import { argItemsFor, argItemsOf, bookOf, spotOf, type SheetScope } from './bridge';
import { ArgumentSheet, type SheetSize } from './ArgumentSheet';
import { tieTo } from './actions';
import { argState, popUndo, pushUndo, resetArg, setArg } from './store';
import { ROLES, ROLE_BY_ID, numbering, roleForKey, rolesOf, type ArgumentRole } from './roles';
import { OVERLAP_TOAST, overlaps, snapSelection } from './selection';
import { candidates, nothingToAttach, pickerList, pickerTitle } from './targets';
import { useArg } from './store';
import './arguments.css';

interface Pending {
  chapter: number;
  start: number;
  end: number;
  text: string;
  rect: { left: number; top: number; bottom: number; width: number };
}

interface Pick {
  id: string;
  title: string;
  list: (DeskItem | null)[];
}

const sectionOf = (n: Node | null): HTMLElement | null => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('.qr-chapter[data-chapter]') ?? null;
function useArgTie(): string | null {
  return useArg().tie;
}
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * The argument layer over the new reader (docs/features/argument-layer.md, stage 2). Alt+A arms it: select words,
 * press 1 to 8 for the role, Enter takes the suggested target. Each mark is a study desk item (DeskItem.argument), so
 * the margin cards and the sheet (later stages) read the same data.
 */
export function ArgumentsHost({ book }: HostProps) {
  const { prefs } = usePreferences();
  const on = prefs.argumentsEnabled && prefs.studyDeskEnabled;
  const data = useDeskData(book);
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSize, setSheetSize] = useState<SheetSize>('side');
  const [scope, setScope] = useState<SheetScope>('book');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);

  const say = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const mine = useMemo(() => data.items.filter((i) => i.argument && bookOf(i) === book.id), [data.items, book.id]);
  const argItems = useMemo(() => argItemsOf(mine, book.id), [mine, book.id]);
  const byId = useMemo(() => new Map(mine.map((i) => [i.id, i])), [mine]);
  const nums = useMemo(() => numbering(argItems), [argItems]);

  // Share what the margin cards need (MarginLayer draws them; see cardExtras.tsx).
  useEffect(() => {
    if (!on) return resetArg();
    setArg({ book, mine, items: argItems, byId, nums, deskId: currentDeskId(book.id) ?? bookDeskId(book.id) });
  }, [on, book, mine, argItems, byId, nums]);
  useEffect(() => resetArg, []);

  useChordHotkey('KeyA', on, () => {
    setArmed((a) => !a);
    setPending(null);
    setPick(null);
  });

  useChordHotkey('KeyA', on, () => setSheetOpen((o) => !o), true);

  // --- the sheet: the chapter on screen, and what each scope holds ---
  const [tick, setTick] = useState(0);
  const chapter = useMemo(() => {
    if (!sheetOpen) return null;
    for (const el of document.querySelectorAll<HTMLElement>('.qr-chapter[data-chapter]')) if (el.getBoundingClientRect().bottom > 80) return Number(el.dataset.chapter);
    return null;
    // tick: the page moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, tick]);
  const allById = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const sheetItems = useMemo(() => (sheetOpen ? argItemsFor(data.items, scope, book.id, chapter) : []), [sheetOpen, data.items, scope, book.id, chapter]);

  // --- paint the marks with the Custom Highlight API (the text's DOM is never touched) ---
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1200);
    return () => window.clearInterval(id);
  }, [on]);
  useEffect(() => {
    const names = new Map<string, Range[]>();
    const push = (name: string, r: Range | null) => r && names.set(name, [...(names.get(name) ?? []), r]);
    if (on && paintSupported) {
      for (const item of mine) {
        const at = parseCleanLocation(item.source?.location);
        if (!at) continue;
        const section = document.querySelector<HTMLElement>(`.qr-chapter[data-chapter="${at.chapter}"]`);
        const range = section && rangeAt(section, at.start, at.end);
        if (!range) continue;
        const roles = rolesOf({ role: item.argument!.role, for: item.argument!.for });
        push(`${roles[0]}`, range);
        if (roles[1]) push(`underline-${roles[1]}`, range);
      }
    }
    paintArguments(names);
    return () => paintArguments(new Map());
  }, [on, mine, tick]);

  // --- a selection becomes a pending mark ---
  const tieId = useArgTie();
  useEffect(() => {
    if (!on || (!armed && !tieId)) return;
    const read = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const section = sectionOf(r.startContainer);
      if (!section || section !== sectionOf(r.endContainer)) return;
      const text = section.textContent ?? '';
      const snapped = snapSelection(text, offsetWithin(section, r.startContainer, r.startOffset), offsetWithin(section, r.endContainer, r.endOffset));
      if (!snapped) return;
      const chapter = Number(section.dataset.chapter);
      const taken = mine.flatMap((i) => {
        const at = parseCleanLocation(i.source?.location);
        return at && at.chapter === chapter ? [{ start: at.start, end: at.end }] : [];
      });
      if (overlaps(taken, snapped)) {
        say(OVERLAP_TOAST);
        sel.removeAllRanges();
        return;
      }
      const b = r.getBoundingClientRect();
      const tie = argState().tie;
      if (tie) {
        sel.removeAllRanges();
        void tieTo(tie, { chapter, ...snapped, text: text.slice(snapped.start, snapped.end) });
        return;
      }
      setPick(null);
      setPending({ chapter, ...snapped, text: text.slice(snapped.start, snapped.end), rect: { left: b.left, top: b.top, bottom: b.bottom, width: b.width } });
    };
    const onUp = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('.arg-pal, .arg-pick')) return;
      window.setTimeout(read, 0);
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
    };
  }, [on, armed, tieId, mine, say]);

  // --- apply a role ---
  const apply = useCallback(
    async (role: ArgumentRole) => {
      if (!pending) return;
      const p = pending;
      setPending(null);
      window.getSelection()?.removeAllRanges();
      const made = await capture(book, currentDeskId(book.id) ?? bookDeskId(book.id), {
        type: 'quote',
        text: p.text,
        ar: looksArabic(p.text),
        source: { bookId: book.id, bookTitle: book.title, location: formatCleanLocation(p), chapterLabel: `clean:${p.chapter}` },
        fromMargin: true,
        inInbox: false,
        inDocument: false,
        argument: { role, for: null },
      });
      pushUndo(() => deleteItem(made.id));
      const spot = spotOf(made.source!.location!)!;
      const found = candidates(argItems, role, spot, made.id);
      const list = pickerList(role, found).map((x) => (x ? byId.get(x.id) ?? null : null));
      if (found.length) setPick({ id: made.id, title: pickerTitle(role), list });
      else {
        const msg = nothingToAttach(role, found);
        if (msg) say(msg);
      }
    },
    [pending, book, argItems, byId, say]
  );

  const choose = useCallback(
    async (i: number) => {
      if (!pick || pick.list[i] === undefined) return;
      const target = pick.list[i];
      const id = pick.id;
      setPick(null);
      if (!target) return;
      const item = await getItem(id);
      if (!item?.argument) return;
      await updateItem(id, { argument: { ...item.argument, for: target.id } });
    },
    [pick]
  );

  const remove = useCallback(async (id: string) => {
    const item = await getItem(id);
    if (!item) return;
    const dependents = (await listItems()).filter((x) => x.argument?.for === id);
    await patchItems(dependents.map((d) => ({ id: d.id, patch: { argument: { ...d.argument!, for: null } } })));
    await deleteItem(id);
    const desk = await getDesk(item.deskId);
    pushUndo(async () => {
      await restoreItems([item], desk ? [desk] : []);
      await patchItems(dependents.map((d) => ({ id: d.id, patch: { argument: d.argument } })));
    });
    setSelected(null);
  }, []);

  const undo = useCallback(async () => {
    const fn = popUndo();
    if (!fn) return say('Nothing to undo');
    await fn();
  }, [say]);

  // --- keys: 1 to 8, Enter, a number, Esc, Delete, Ctrl+Z ---
  useEffect(() => {
    if (!on || !armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.metaKey) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void undo();
      } else if (pick) {
        if (e.ctrlKey) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          void choose(0);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setPick(null);
        } else if (/^[1-8]$/.test(e.key)) {
          e.preventDefault();
          void choose(Number(e.key) - 1);
        }
      } else if (pending && !e.ctrlKey) {
        const role = roleForKey(e.key);
        if (role) {
          e.preventDefault();
          void apply(role);
        } else if (e.key === 'Escape') {
          setPending(null);
          window.getSelection()?.removeAllRanges();
        }
      } else if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        void remove(selected);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [on, armed, pick, pending, selected, apply, choose, remove, undo]);

  // --- click a mark to select it (Delete removes it) ---
  useEffect(() => {
    if (!on || !armed) return;
    const onClick = (e: MouseEvent) => {
      if (!window.getSelection()?.isCollapsed) return;
      const section = sectionOf(e.target as Node);
      const pos = (document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(e.clientX, e.clientY);
      if (!section || !pos) return setSelected(null);
      const at = offsetWithin(section, pos.offsetNode, pos.offset);
      const hit = mine.find((i) => {
        const l = parseCleanLocation(i.source?.location);
        return l && l.chapter === Number(section.dataset.chapter) && at >= l.start && at < l.end;
      });
      setSelected(hit?.id ?? null);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [on, armed, mine]);

  if (!on) return null;
  const chosen = selected ? byId.get(selected) : null;
  return (
    <>
      {sheetOpen && <ArgumentSheet bookId={book.id} argItems={sheetItems} byId={allById} scope={scope} onScope={setScope} size={sheetSize} onSize={setSheetSize} onClose={() => setSheetOpen(false)} />}
      {armed && (
      <>
      {pending && (
        <div className="arg-pal" role="toolbar" aria-label="Argument role" style={{ left: Math.max(8, pending.rect.left + pending.rect.width / 2 - 250), top: Math.max(8, pending.rect.top - 48) }}>
          {ROLES.map((r) => (
            <button key={r.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void apply(r.id)} title={r.label}>
              <kbd style={{ background: `var(--s-${r.id})` }}>{r.key}</kbd>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {pick && (
        <div className="arg-pick" role="listbox" aria-label={pick.title}>
          <h5>{pick.title}</h5>
          {pick.list.map((x, i) => (
            <button key={x?.id ?? 'none'} type="button" aria-pressed={i === 0} onClick={() => void choose(i)}>
              <b>{i + 1}</b>
              {x ? (
                <>
                  <span className="arg-pick__ar" dir="rtl">{x.text.length > 60 ? `${x.text.slice(0, 59)}…` : x.text}</span>
                  <span>#{nums.get(x.id)}</span>
                </>
              ) : (
                <span>Not a step in a longer argument</span>
              )}
            </button>
          ))}
          <small>Enter takes the first · number picks · Esc leaves it unattached</small>
        </div>
      )}
      <div className="arg-bar" aria-live="polite">
        {toast ?? (chosen ? `#${nums.get(chosen.id)} ${ROLE_BY_ID[chosen.argument!.role].label} selected. Delete removes it.` : 'Argument layer on (Alt+A). Select words, then press 1 to 8.')}
      </div>
      </>
      )}
    </>
  );
}
