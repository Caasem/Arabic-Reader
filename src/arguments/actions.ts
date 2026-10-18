import { formatCleanLocation } from '../readerCore/location';
import { capture } from '../studyDesk/useDesk';
import { deleteItem, getItem, listItems, patchItems, updateItem } from '../studyDesk/deskStore';
import type { DeskItem } from '../studyDesk/types';
import type { ItemPatch } from '../studyDesk/piles';
import { undoPatches } from '../studyDesk/piles';
import { addImplicit as planImplicit, type ImplicitRole } from './edit';
import { pilePlan } from './piling';
import { argState, pushUndo, setArg } from './store';
import { spotOf } from './bridge';

const claimName = (text: string) => `Notes on “${text.length > 34 ? `${text.slice(0, 33)}…` : text}”`;

/** Applies patches and remembers how to put them back. */
async function patchWithUndo(patches: ItemPatch[]): Promise<void> {
  if (!patches.length) return;
  const before = await listItems();
  await patchItems(patches);
  const back = undoPatches(before, patches);
  pushUndo(() => patchItems(back));
}

/** + Warrant / + Backing / + Exception: the reader's own note, with no words on the page, kept beside its step. */
export async function addImplicitNote(role: ImplicitRole, target: DeskItem, text: string): Promise<void> {
  const { book, deskId } = argState();
  const where = target.source?.location ?? target.pin?.location;
  if (!book || !deskId || !where || !text.trim() || spotOf(where) == null) return;
  // The same rule the pure logic states: a note needs a target; an empty one is ignored.
  if (!planImplicit([{ id: target.id, role: target.argument!.role, for: target.argument!.for, spot: spotOf(where)! }], 'x', role, target.id, text).length) return;
  const made = await capture(book, deskId, {
    type: 'note',
    text: text.trim(),
    ar: /[؀-ۿ]/.test(text),
    source: { bookId: book.id, bookTitle: book.title },
    pin: { bookId: book.id, location: where, side: 'right' },
    fromMargin: true,
    inInbox: false,
    inDocument: false,
    argument: { role, for: target.id, typed: true },
  });
  pushUndo(() => deleteItem(made.id));
  setArg({ add: null });
  // Notes for one claim pile up under it.
  const all = await listItems();
  const byId = new Map(all.map((i) => [i.id, i]));
  const root = byId.get(made.id);
  if (!root) return;
  const claim = rootText(made.id, byId);
  const patches = pilePlan(root, all, byId, claimName(claim));
  if (patches.length) {
    const before = all;
    await patchItems(patches);
    const back = undoPatches(before, patches);
    pushUndo(() => patchItems(back));
  }
}

function rootText(id: string, byId: Map<string, DeskItem>): string {
  const seen = new Set<string>();
  let at = id;
  while (!seen.has(at)) {
    seen.add(at);
    const next = byId.get(at)?.argument?.for;
    if (!next || !byId.has(next)) break;
    at = next;
  }
  return byId.get(at)?.text ?? '';
}

/** To margin: keep the note, role and target; drop the words on the page. The card stays beside where they were. */
export async function toMargin(item: DeskItem): Promise<void> {
  const where = item.source?.location;
  if (!where || !item.source) return;
  const { location: _location, ...source } = item.source;
  await patchWithUndo([{ id: item.id, patch: { source, pin: { bookId: item.source.bookId, location: where, side: item.pin?.side ?? 'right' } } }]);
}

/** Tie to words, step 1: the next selection becomes this note's words. */
export const armTie = (id: string): void => setArg({ tie: id });

/** Tie to words, step 2. A typed note's text moves to its body, so nothing the reader wrote is lost. */
export async function tieTo(id: string, span: { chapter: number; start: number; end: number; text: string }): Promise<void> {
  setArg({ tie: null });
  const item = await getItem(id);
  if (!item?.argument) return;
  const bookId = item.source?.bookId ?? item.pin?.bookId;
  if (!bookId) return;
  const { typed, ...argument } = item.argument;
  await patchWithUndo([
    {
      id,
      patch: {
        text: span.text,
        ar: /[؀-ۿ]/.test(span.text),
        source: { ...item.source, bookId, location: formatCleanLocation(span) },
        pin: undefined,
        argument,
        ...(typed && item.text ? { body: [item.text, item.body].filter(Boolean).join('\n') } : {}),
      },
    },
  ]);
}

export { updateItem };
